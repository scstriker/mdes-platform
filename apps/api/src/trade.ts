import {
  buildMultiYearNarrativeParagraph,
  buildTradeNarrativeSummary,
  buildTradeScopeKey,
  computeConcentration,
  computeYoyPct,
  isPngBytes,
  normalizeTradeOverviewSnapshot,
  parseCustomsCsvBytes,
  parseMultiMonthCustomsCsvBytes,
  parseTradePeriod,
  roundMetric,
  scaledToUsdNumber,
  TRADE_FLOWS,
  TRADE_GROUPINGS,
  validateTradeBulkManifest,
  validateTradeManifest,
  type NormalizedTradeManifest,
  type ParsedCustomsFactRow,
  type TradeAnnualTrendPoint,
  type TradeBatchListItem,
  type TradeBulkImportResponse,
  type TradeCategoryStat,
  type TradeCoverageCell,
  type TradeCoverageCellStatus,
  type TradeCoverageMatrixResponse,
  type TradeCoverageMonthSummary,
  type TradeFlow,
  type TradeGrouping,
  type TradeGroupingTotals,
  type TradeHsItemStat,
  type TradeImportCoverage,
  type TradeImportResponse,
  type TradeOverviewEmpty,
  type TradeOverviewPublished,
  type TradeOverviewResponse,
  type TradePartnerStat,
  type TradePublishResponse,
  type TradeQuantityStat,
  type TradeRegimeStat,
  type TradeRegionStat,
  type TradeSourceBatchRef,
  type TradeTrendPoint,
  type TradeUnitsMeta,
} from "@mdes/shared";
import { AppError } from "./errors";

const CHUNK_SIZE = 500;
const DEFAULT_DICT_VERSION = "202601";
const TRADE_UNITS: TradeUnitsMeta = {
  amount: "USD",
  displayAmount: "100M_USD",
  share: "PCT",
  cr: "PCT",
  hhi: "0_10000",
};

export type TradeFileInput = {
  filename: string;
  bytes: Uint8Array;
};

export type ImportTradeBatchOptions = {
  rawManifest: string | null;
  file: TradeFileInput | null;
  emptyEvidences: TradeFileInput[];
  maxRows: number;
  /** 延迟发布：仅落盘暂存候选批次与覆盖矩阵，等待显式 POST /api/trade/publish 一次性发布 */
  deferPublish?: boolean;
  /** 测试钩子：在候选数据写入成功后、正式发布事务提交前抛出异常（验证 AC-014 发布中断与重试） */
  failBeforePublishCommit?: boolean;
  /** 测试钩子：在首次发布提交前模拟另一 Worker 实例抢先写入同 version_seq，验证 CAS 冲突重读重算 */
  preemptReleaseOnce?: boolean;
  /** 测试钩子：在重叠校验后、原子提交前等待指定毫秒，用于确定性验证并发导入槽位唯一锁 */
  delayBeforeCommitMs?: number;
};

export type ImportTradeBulkOptions = {
  rawManifest: string | null;
  file: TradeFileInput | null;
  emptyEvidences: TradeFileInput[];
  maxRows: number;
  deferPublish?: boolean;
  /** 测试钩子：在提交完第 N 个自然月后模拟中断，验证已提交月份保留且未完成月份可重传补齐 */
  failAfterMonthIndex?: number;
  /** 测试钩子：在超大单月分块写入明细中途抛出失败，验证残缺月份不会被误判为幂等重放 */
  failDuringOversizedMonth?: boolean;
  /** 测试钩子：覆写单次 db.batch 语句上限（默认 200），用于单测验证超大单月两阶段原子写入 */
  maxBatchStmtsOverride?: number;
  /** 测试钩子：在重叠校验后、原子提交前等待指定毫秒，用于确定性验证并发批量导入槽位唯一锁 */
  delayBeforeCommitMs?: number;
};

export type PublishTradeMonthsOptions = {
  /** 测试钩子：在暂存第 N 批快照后抛出异常，验证大批量发布失败不影响可见版本且重试可完整补齐 */
  failAfterStageBatch?: number;
  /** 测试钩子：覆写启用暂存表发布的期间数阈值（默认 30） */
  stageThresholdOverride?: number;
};

const DEFAULT_MAX_STAGING_BATCH_STMTS = 200;
const DEFAULT_PUBLISH_STAGE_THRESHOLD = 30;

const ID_QUERY_CHUNK_SIZE = 200;
const MAX_PUBLISH_CAS_RETRIES = 8;

const dictPublishLocks = new Map<string, Promise<unknown>>();

async function withDictPublishLock<T>(dictVersion: string, fn: () => Promise<T>): Promise<T> {
  const prev = dictPublishLocks.get(dictVersion) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  dictPublishLocks.set(dictVersion, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (dictPublishLocks.get(dictVersion) === chained) {
      dictPublishLocks.delete(dictVersion);
    }
  }
}

function assignEmptyEvidencesToHs8(
  emptyEvidences: TradeFileInput[],
  evidenceSha256s: string[],
  candidateEmptyList: string[],
  allowSingleUmbrella: boolean,
): {
  evidenceCoverageList: Array<{ filename: string; sha256: string; byteLength: number; coveredHs8: string[] }>;
  provenEmptySet: Set<string>;
  emptyEvidenceShaByHs8: Map<string, string>;
} {
  const evidenceCoverageList: Array<{ filename: string; sha256: string; byteLength: number; coveredHs8: string[] }> = [];
  const provenEmptySet = new Set<string>();
  const emptyEvidenceShaByHs8 = new Map<string, string>();

  if (emptyEvidences.length === 0 || candidateEmptyList.length === 0) {
    return { evidenceCoverageList, provenEmptySet, emptyEvidenceShaByHs8 };
  }

  // 单张截图覆盖整批无记录税号（仅限无 CSV 或仅表头空 CSV 的整批空查询）
  if (allowSingleUmbrella && emptyEvidences.length === 1) {
    const sha = evidenceSha256s[0];
    for (const c of candidateEmptyList) {
      provenEmptySet.add(c);
      emptyEvidenceShaByHs8.set(c, sha);
    }
    evidenceCoverageList.push({
      filename: emptyEvidences[0].filename || "empty_evidence_1.png",
      sha256: sha,
      byteLength: emptyEvidences[0].bytes.byteLength,
      coveredHs8: [...candidateEmptyList],
    });
    return { evidenceCoverageList, provenEmptySet, emptyEvidenceShaByHs8 };
  }

  const candidateSet = new Set(candidateEmptyList);
  let nextUnassignedIdx = 0;

  emptyEvidences.forEach((ev, idx) => {
    const sha = evidenceSha256s[idx];
    const namedMatches = (ev.filename.match(/\d{8}/g) ?? []).filter((c) => candidateSet.has(c));
    let covered: string[] = [];
    if (namedMatches.length > 0) {
      covered = [...new Set(namedMatches)];
    } else {
      while (nextUnassignedIdx < candidateEmptyList.length && provenEmptySet.has(candidateEmptyList[nextUnassignedIdx])) {
        nextUnassignedIdx += 1;
      }
      if (nextUnassignedIdx < candidateEmptyList.length) {
        covered = [candidateEmptyList[nextUnassignedIdx]];
        nextUnassignedIdx += 1;
      }
    }
    for (const c of covered) {
      provenEmptySet.add(c);
      if (!emptyEvidenceShaByHs8.has(c)) {
        emptyEvidenceShaByHs8.set(c, sha);
      }
    }
    evidenceCoverageList.push({
      filename: ev.filename || `empty_evidence_${idx + 1}.png`,
      sha256: sha,
      byteLength: ev.bytes.byteLength,
      coveredHs8: covered,
    });
  });

  return { evidenceCoverageList, provenEmptySet, emptyEvidenceShaByHs8 };
}

type DictItemRow = {
  hs8: string;
  hs6: string;
  item_name: string;
  category_id: string;
  category_name: string;
  category_order: number;
  seq_no: number;
  applicable: number;
};

type BatchMetaRow = {
  batch_id: string;
  dict_version: string;
  month: string;
  flow: TradeFlow;
  currency: string;
  grouping: TradeGrouping;
  scope_key: string;
  hs8_json: string;
  empty_hs8_json: string;
  received_hs8_json: string;
  confirmed_empty_hs8_json: string;
  missing_hs8_json: string;
  filename: string;
  source_sha256: string;
  evidence_sha256s_json: string;
  row_count: number;
  publish_state: "ingesting" | "staged" | "published";
  superseded_by: string | null;
};

type FactDbRow = {
  batch_id: string;
  month: string;
  flow: TradeFlow;
  grouping: TradeGrouping;
  hs8: string;
  item_name: string;
  group_code: string;
  group_name: string;
  usd_scaled_str: string;
  qty1: number | null;
  unit1: string | null;
  qty2: number | null;
  unit2: string | null;
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const INSERT_COVERAGE_CHUNK = `
  INSERT INTO trade_hs_coverage (batch_id, dict_version, month, flow, grouping, hs8, status, evidence_sha256)
  SELECT
    ?1,
    ?2,
    ?3,
    ?4,
    ?5,
    json_extract(value, '$.hs8'),
    json_extract(value, '$.status'),
    json_extract(value, '$.evidenceSha256')
  FROM json_each(?6)
`;

const INSERT_ACTIVE_HS8_SLOTS = `
  INSERT INTO trade_active_hs8_slot (dict_version, month, flow, grouping, hs8, scope_key, batch_id)
  SELECT ?1, ?2, ?3, ?4, value, ?5, ?6
  FROM json_each(?7)
`;

function isTradeActiveSlotConflict(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return (
    msg.includes("UNIQUE constraint failed: trade_active_hs8_slot") ||
    (msg.includes("PRIMARY KEY constraint failed") && msg.includes("trade_active_hs8_slot"))
  );
}

async function findConflictingSlotBatch(
  db: D1Database,
  params: { dictVersion: string; month: string; flow: TradeFlow; grouping: TradeGrouping; hs8: readonly string[] },
): Promise<{ batch_id: string; scope_key: string; hs8_json: string } | null> {
  return db
    .prepare(
      `SELECT b.batch_id, b.scope_key, b.hs8_json
       FROM trade_active_hs8_slot s
       JOIN trade_import_batch b ON b.batch_id = s.batch_id
       WHERE s.dict_version = ?1
         AND s.month = ?2
         AND s.flow = ?3
         AND s.grouping = ?4
         AND s.hs8 IN (SELECT value FROM json_each(?5))
       LIMIT 1`,
    )
    .bind(params.dictVersion, params.month, params.flow, params.grouping, JSON.stringify(params.hs8))
    .first<{ batch_id: string; scope_key: string; hs8_json: string }>();
}

async function findCompleteReplayBatch(
  db: D1Database,
  params: {
    scopeKey: string;
    sourceSha256: string;
    emptyHs8Json: string;
    confirmedEmptyHs8Json: string;
    missingHs8Json: string;
    evidenceJson: string;
  },
): Promise<BatchMetaRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM trade_import_batch
       WHERE scope_key = ?1
         AND source_sha256 = ?2
         AND empty_hs8_json = ?3
         AND confirmed_empty_hs8_json = ?4
         AND missing_hs8_json = ?5
         AND evidence_sha256s_json = ?6
         AND publish_state IN ('staged', 'published')
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`,
    )
    .bind(
      params.scopeKey,
      params.sourceSha256,
      params.emptyHs8Json,
      params.confirmedEmptyHs8Json,
      params.missingHs8Json,
      params.evidenceJson,
    )
    .first<BatchMetaRow>();
  if (!row) return null;
  return (await isBatchFactsComplete(db, row)) ? row : null;
}

const INSERT_FACT_CHUNK = `
  INSERT INTO trade_fact (batch_id, dict_version, month, flow, grouping, hs8, item_name, group_code, group_name, usd_scaled, usd_raw, qty1, unit1, qty2, unit2)
  SELECT
    ?1,
    ?2,
    ?3,
    ?4,
    ?5,
    json_extract(value, '$.hs8'),
    json_extract(value, '$.itemName'),
    json_extract(value, '$.groupCode'),
    json_extract(value, '$.groupName'),
    CAST(json_extract(value, '$.usdScaled') AS INTEGER),
    json_extract(value, '$.usdRaw'),
    json_extract(value, '$.qty1'),
    json_extract(value, '$.unit1'),
    json_extract(value, '$.qty2'),
    json_extract(value, '$.unit2')
  FROM json_each(?6)
`;

const INSERT_DERIVED_OBS_CHUNK = `
  INSERT INTO observation (indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, object_ref, created_at)
  SELECT
    json_extract(value, '$.indicator_id'),
    json_extract(value, '$.period'),
    json_extract(value, '$.geo'),
    json_extract(value, '$.dims'),
    json_extract(value, '$.value_num'),
    json_extract(value, '$.value_text'),
    json_extract(value, '$.unit'),
    ?1,
    json_extract(value, '$.object_ref'),
    ?2
  FROM json_each(?3)
`;

const INSERT_RECON_CHUNK = `
  INSERT INTO trade_reconciliation_log (
    dict_version, month, flow, hs8, grouping, product_usd_scaled, group_usd_scaled, diff_usd_scaled, status, checked_at
  )
  SELECT
    ?1,
    json_extract(value, '$.month'),
    json_extract(value, '$.flow'),
    json_extract(value, '$.hs8'),
    json_extract(value, '$.grouping'),
    CAST(json_extract(value, '$.prodScaled') AS INTEGER),
    CAST(json_extract(value, '$.grpScaled') AS INTEGER),
    CAST(json_extract(value, '$.diffScaled') AS INTEGER),
    json_extract(value, '$.status'),
    ?2
  FROM json_each(?3)
  WHERE 1 = 1
  ON CONFLICT(dict_version, month, flow, hs8, grouping) DO UPDATE SET
    product_usd_scaled = excluded.product_usd_scaled,
    group_usd_scaled = excluded.group_usd_scaled,
    diff_usd_scaled = excluded.diff_usd_scaled,
    status = excluded.status,
    checked_at = excluded.checked_at
`;

const INSERT_STAGED_OBS_CHUNK = `
  INSERT INTO trade_publish_staged_observation (
    staging_id, seq, indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, object_ref, created_at
  )
  SELECT
    ?1,
    CAST(json_extract(value, '$.seq') AS INTEGER),
    json_extract(value, '$.indicator_id'),
    json_extract(value, '$.period'),
    json_extract(value, '$.geo'),
    json_extract(value, '$.dims'),
    json_extract(value, '$.value_num'),
    json_extract(value, '$.value_text'),
    json_extract(value, '$.unit'),
    ?2,
    json_extract(value, '$.object_ref'),
    ?3
  FROM json_each(?4)
`;

async function isBatchFactsComplete(db: D1Database, batch: BatchMetaRow): Promise<boolean> {
  if (batch.publish_state !== "staged" && batch.publish_state !== "published") {
    return false;
  }
  const expectedHs8Count = (JSON.parse(batch.hs8_json) as string[]).length;
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM trade_fact WHERE batch_id = ?1) AS fact_cnt,
         (SELECT COUNT(*) FROM trade_hs_coverage WHERE batch_id = ?1) AS cov_cnt`,
    )
    .bind(batch.batch_id)
    .first<{ fact_cnt: number; cov_cnt: number }>();
  return Number(counts?.fact_cnt ?? -1) === batch.row_count && Number(counts?.cov_cnt ?? -1) === expectedHs8Count;
}

type MonthStagingCommitPlan = {
  batchId: string;
  initIngestingStmts: D1PreparedStatement[];
  detailStmts: D1PreparedStatement[];
  finalizeStmts: D1PreparedStatement[];
  allAtomicStmts: D1PreparedStatement[];
};

async function commitStagedMonthBatch(
  db: D1Database,
  plan: MonthStagingCommitPlan,
  opts?: { maxBatchStmts?: number; failDuringOversizedMonth?: boolean },
): Promise<void> {
  const maxStmts = opts?.maxBatchStmts ?? DEFAULT_MAX_STAGING_BATCH_STMTS;
  if (plan.allAtomicStmts.length <= maxStmts) {
    await db.batch(plan.allAtomicStmts);
    return;
  }

  // 超大单月（超过单次 db.batch 语句上限）：先以 ingesting 状态隔离写入明细，全部落盘后再原子转正为 staged
  await db.batch(plan.initIngestingStmts);
  const chunkLimit = Math.max(1, maxStmts - 10);
  try {
    for (let i = 0; i < plan.detailStmts.length; i += chunkLimit) {
      await db.batch(plan.detailStmts.slice(i, i + chunkLimit));
      if (opts?.failDuringOversizedMonth && i === 0) {
        throw new Error("simulated failure during oversized month detail staging");
      }
    }
    await db.batch(plan.finalizeStmts);
  } catch (err) {
    await db
      .prepare("DELETE FROM import_batch WHERE id = ?1")
      .bind(plan.batchId)
      .run()
      .catch(() => {});
    throw err;
  }
}

async function cleanupPublishStaging(db: D1Database, stagingId: string): Promise<void> {
  try {
    await db.batch([
      db.prepare("DELETE FROM trade_publish_staged_observation WHERE staging_id = ?1").bind(stagingId),
      db.prepare("DELETE FROM trade_publish_staged_snapshot WHERE staging_id = ?1").bind(stagingId),
    ]);
  } catch {
    // best-effort cleanup; staging_id is isolated per UUID
  }
}

type DerivedObsPayloadRow = {
  indicator_id: string;
  period: string;
  geo: string;
  dims: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  object_ref: string;
};

async function commitPublishReleaseAtomically(
  db: D1Database,
  params: {
    dictVersion: string;
    releaseId: string;
    latestMonth: string;
    availablePeriods: string[];
    annualTrend: TradeAnnualTrendPoint[];
    triggerBatchId: string;
    now: string;
    headerStmts: D1PreparedStatement[];
    snapshotsToWrite: Array<{ period: string; payload: TradeOverviewPublished }>;
    derivedObsRows: DerivedObsPayloadRow[];
    failAfterStageBatch?: number;
    stageThresholdOverride?: number;
  },
): Promise<void> {
  const {
    dictVersion,
    releaseId,
    latestMonth,
    availablePeriods,
    annualTrend,
    triggerBatchId,
    now,
    headerStmts,
    snapshotsToWrite,
    derivedObsRows,
    failAfterStageBatch,
    stageThresholdOverride,
  } = params;

  const availablePeriodsJson = JSON.stringify(availablePeriods);
  const annualTrendJson = JSON.stringify(annualTrend);
  const multiYearParagraph = buildMultiYearNarrativeParagraph(annualTrend);
  const stageThreshold = stageThresholdOverride ?? DEFAULT_PUBLISH_STAGE_THRESHOLD;

  const syncUntouchedSnapshotsStmt = db
    .prepare(
      `UPDATE trade_current_snapshot
       SET is_latest_month = CASE WHEN period = ?2 THEN 1 ELSE 0 END,
           available_periods_json = ?3,
           payload_json = CASE
             WHEN release_id != ?1 THEN
               CASE
                 WHEN json_type(payload_json, '$.narrativeSummary') = 'object' THEN
                   json_set(
                     payload_json,
                     '$.availablePeriods', json(?3),
                     '$.annualTrend', json(?4),
                     '$.narrativeSummary.multiYearParagraph', ?5
                   )
                 ELSE
                   json_set(
                     payload_json,
                     '$.availablePeriods', json(?3),
                     '$.annualTrend', json(?4)
                   )
               END
             ELSE payload_json
           END
       WHERE dict_version = ?6`,
    )
    .bind(releaseId, latestMonth, availablePeriodsJson, annualTrendJson, multiYearParagraph, dictVersion);

  if (snapshotsToWrite.length <= stageThreshold && derivedObsRows.length <= CHUNK_SIZE * 20) {
    const publishStmts: D1PreparedStatement[] = [...headerStmts];
    for (const { period, payload } of snapshotsToWrite) {
      const payloadStr = JSON.stringify(payload);
      const batchesStr = JSON.stringify(payload.sourceBatches);
      publishStmts.push(
        db
          .prepare(
            `INSERT INTO trade_period_snapshot (snapshot_id, dict_version, period, release_id, source_batches_json, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          )
          .bind(crypto.randomUUID(), dictVersion, period, releaseId, batchesStr, payloadStr, now),
        db
          .prepare(
            `INSERT INTO trade_current_snapshot (dict_version, period, is_latest_month, release_id, available_periods_json, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(dict_version, period) DO UPDATE SET
               is_latest_month = excluded.is_latest_month,
               release_id = excluded.release_id,
               available_periods_json = excluded.available_periods_json,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at`,
          )
          .bind(
            dictVersion,
            period,
            period === latestMonth ? 1 : 0,
            releaseId,
            availablePeriodsJson,
            payloadStr,
            now,
          ),
        db.prepare("DELETE FROM observation WHERE object_ref = ?1").bind(`trade_snapshot:${dictVersion}:${period}`),
      );
    }
    publishStmts.push(syncUntouchedSnapshotsStmt);
    for (let i = 0; i < derivedObsRows.length; i += CHUNK_SIZE) {
      publishStmts.push(
        db
          .prepare(INSERT_DERIVED_OBS_CHUNK)
          .bind(triggerBatchId, now, JSON.stringify(derivedObsRows.slice(i, i + CHUNK_SIZE))),
      );
    }
    await db.batch(publishStmts);
    return;
  }

  // 大批量发布：先将全部快照与派生观测值分批暂存至隔离暂存表（对读取端完全不可见），再单次原子事务切换可见版本
  const stagingId = releaseId;
  try {
    let stageBatchNo = 0;
    for (let i = 0; i < snapshotsToWrite.length; i += 10) {
      const slice = snapshotsToWrite.slice(i, i + 10);
      const stmts = slice.map(({ period, payload }) =>
        db
          .prepare(
            `INSERT INTO trade_publish_staged_snapshot (
               staging_id, dict_version, period, source_batches_json, payload_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .bind(stagingId, dictVersion, period, JSON.stringify(payload.sourceBatches), JSON.stringify(payload), now),
      );
      await db.batch(stmts);
      stageBatchNo += 1;
      if (failAfterStageBatch !== undefined && stageBatchNo >= failAfterStageBatch) {
        throw new Error(`simulated failure after staging snapshot chunk #${stageBatchNo}`);
      }
    }

    const stagedObsStmts: D1PreparedStatement[] = [];
    for (let i = 0; i < derivedObsRows.length; i += CHUNK_SIZE) {
      const chunk = derivedObsRows.slice(i, i + CHUNK_SIZE).map((r, offset) => ({
        seq: i + offset,
        ...r,
      }));
      stagedObsStmts.push(
        db.prepare(INSERT_STAGED_OBS_CHUNK).bind(stagingId, triggerBatchId, now, JSON.stringify(chunk)),
      );
    }
    for (let i = 0; i < stagedObsStmts.length; i += 50) {
      await db.batch(stagedObsStmts.slice(i, i + 50));
    }

    // 单次原子事务：仅传极小控制参数，由 SQLite 内部完成全量快照、观测值与版本头切换，绝不产生半发布态
    const switchStmts: D1PreparedStatement[] = [
      ...headerStmts,
      db
        .prepare(
          `INSERT INTO trade_period_snapshot (snapshot_id, dict_version, period, release_id, source_batches_json, payload_json, created_at)
           SELECT staging_id || ':' || period, dict_version, period, ?1, source_batches_json, payload_json, created_at
           FROM trade_publish_staged_snapshot
           WHERE staging_id = ?2`,
        )
        .bind(releaseId, stagingId),
      db
        .prepare(
          `INSERT INTO trade_current_snapshot (dict_version, period, is_latest_month, release_id, available_periods_json, payload_json, updated_at)
           SELECT
             dict_version,
             period,
             CASE WHEN period = ?2 THEN 1 ELSE 0 END,
             ?1,
             ?3,
             payload_json,
             created_at
           FROM trade_publish_staged_snapshot
           WHERE staging_id = ?4
           ON CONFLICT(dict_version, period) DO UPDATE SET
             is_latest_month = excluded.is_latest_month,
             release_id = excluded.release_id,
             available_periods_json = excluded.available_periods_json,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
        )
        .bind(releaseId, latestMonth, availablePeriodsJson, stagingId),
      syncUntouchedSnapshotsStmt,
      db
        .prepare(
          `DELETE FROM observation
           WHERE object_ref IN (
             SELECT 'trade_snapshot:' || dict_version || ':' || period
             FROM trade_publish_staged_snapshot
             WHERE staging_id = ?1
           )`,
        )
        .bind(stagingId),
      db
        .prepare(
          `INSERT INTO observation (indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, object_ref, created_at)
           SELECT indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, object_ref, created_at
           FROM trade_publish_staged_observation
           WHERE staging_id = ?1
           ORDER BY seq ASC`,
        )
        .bind(stagingId),
      db.prepare("DELETE FROM trade_publish_staged_observation WHERE staging_id = ?1").bind(stagingId),
      db.prepare("DELETE FROM trade_publish_staged_snapshot WHERE staging_id = ?1").bind(stagingId),
    ];

    await db.batch(switchStmts);
  } catch (err) {
    await cleanupPublishStaging(db, stagingId);
    throw err;
  }
}

async function loadDictForYear(db: D1Database, dictVersion: string, year: number): Promise<DictItemRow[]> {
  const { results } = await db
    .prepare(
      `SELECT
         d.hs8,
         d.hs6,
         d.item_name,
         d.category_id,
         d.category_name,
         d.category_order,
         d.seq_no,
         COALESCE(a.applicable, 1) AS applicable
       FROM trade_hs_dict d
       LEFT JOIN trade_hs_year_applicability a
         ON a.dict_version = d.dict_version AND a.year = ?2 AND a.hs8 = d.hs8
       WHERE d.dict_version = ?1
       ORDER BY d.category_order ASC, d.seq_no ASC, d.hs8 ASC`,
    )
    .bind(dictVersion, year)
    .all<DictItemRow>();
  return results;
}

export async function importTradeBatch(
  db: D1Database,
  options: ImportTradeBatchOptions,
): Promise<TradeImportResponse> {
  if (!options.rawManifest || !options.rawManifest.trim()) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "manifest", reason: "missing manifest" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(options.rawManifest);
  } catch {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "manifest", reason: "invalid JSON" });
  }

  const rawDictVer =
    parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
      ? String((parsedJson as Record<string, unknown>).dictVersion ?? "").trim()
      : "";
  const rawMonth =
    parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
      ? String((parsedJson as Record<string, unknown>).month ?? "").trim()
      : "";
  const prelimYear = /^(\d{4})-/.exec(rawMonth) ? Number(rawMonth.slice(0, 4)) : 2024;

  const { results: dictVersions } = await db
    .prepare("SELECT dict_version FROM trade_dict_meta")
    .all<{ dict_version: string }>();
  const knownDictVersions = new Set(dictVersions.map((d) => d.dict_version));

  const dictRows = rawDictVer ? await loadDictForYear(db, rawDictVer, prelimYear) : [];
  const applicableHs8 = new Set(dictRows.filter((r) => r.applicable === 1).map((r) => r.hs8));

  const manifestCheck = validateTradeManifest(parsedJson, {
    knownDictVersions,
    applicableHs8: knownDictVersions.has(rawDictVer) ? applicableHs8 : undefined,
  });
  if (!manifestCheck.ok) {
    throw new AppError(manifestCheck.error.status, manifestCheck.error.code, manifestCheck.error.params);
  }
  const manifest: NormalizedTradeManifest = manifestCheck.value;

  // 校验官网无记录截图 PNG
  for (const ev of options.emptyEvidences) {
    if (!isPngBytes(ev.bytes)) {
      throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "emptyEvidence_must_be_png" });
    }
  }
  const evidenceSha256s = await Promise.all(options.emptyEvidences.map((ev) => sha256Hex(ev.bytes)));

  if (!options.file && options.emptyEvidences.length === 0) {
    throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "file_or_emptyEvidence_required" });
  }

  let sourceSha256 = "";
  let filename = "";
  let rows: ParsedCustomsFactRow[] = [];
  let coverage: TradeImportCoverage;
  let evidenceCoverageList: Array<{ filename: string; sha256: string; byteLength: number; coveredHs8: string[] }> = [];
  let emptyEvidenceShaByHs8 = new Map<string, string>();

  if (!options.file) {
    // 仅上传 emptyEvidence：emptyHs8 必须与 hs8 完全一致
    if (manifest.emptyHs8.length !== manifest.hs8.length) {
      throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "empty_evidence_only_requires_full_emptyHs8" });
    }
    sourceSha256 = evidenceSha256s[0];
    filename = options.emptyEvidences[0].filename || "empty_evidence.png";
    const assigned = assignEmptyEvidencesToHs8(options.emptyEvidences, evidenceSha256s, manifest.hs8, true);
    evidenceCoverageList = assigned.evidenceCoverageList;
    emptyEvidenceShaByHs8 = assigned.emptyEvidenceShaByHs8;
    coverage = {
      received: [],
      confirmedEmpty: manifest.hs8.filter((c) => assigned.provenEmptySet.has(c)),
      missing: manifest.hs8.filter((c) => !assigned.provenEmptySet.has(c)),
    };
  } else {
    sourceSha256 = await sha256Hex(options.file.bytes);
    filename = options.file.filename || "customs.csv";
    const allowHeaderOnlyEmpty =
      Boolean(manifest.probeVerifiedZero) ||
      (options.emptyEvidences.length > 0 && manifest.emptyHs8.length === manifest.hs8.length);

    const csvParsed = parseCustomsCsvBytes(options.file.bytes, manifest, {
      maxRows: options.maxRows,
      allowHeaderOnlyEmpty,
    });
    if (!csvParsed.ok) {
      throw new AppError(csvParsed.error.status, csvParsed.error.code, csvParsed.error.params);
    }
    rows = csvParsed.rows;

    const receivedSet = new Set(rows.map((r) => r.hs8));
    const candidateEmptyList = manifest.emptyHs8.filter((c) => !receivedSet.has(c));
    const assigned = assignEmptyEvidencesToHs8(
      options.emptyEvidences,
      evidenceSha256s,
      candidateEmptyList,
      allowHeaderOnlyEmpty && rows.length === 0,
    );
    evidenceCoverageList = assigned.evidenceCoverageList;
    emptyEvidenceShaByHs8 = assigned.emptyEvidenceShaByHs8;

    if (manifest.probeVerifiedZero) {
      coverage = {
        received: manifest.hs8.filter((c) => receivedSet.has(c)),
        confirmedEmpty: manifest.hs8.filter((c) => !receivedSet.has(c)),
        missing: [],
      };
    } else {
      coverage = {
        received: manifest.hs8.filter((c) => receivedSet.has(c)),
        confirmedEmpty: manifest.hs8.filter((c) => !receivedSet.has(c) && assigned.provenEmptySet.has(c)),
        missing: manifest.hs8.filter((c) => !receivedSet.has(c) && !assigned.provenEmptySet.has(c)),
      };
    }
  }

  const emptyHs8Json = JSON.stringify(manifest.emptyHs8);
  const confirmedEmptyHs8Json = JSON.stringify(coverage.confirmedEmpty);
  const missingHs8Json = JSON.stringify(coverage.missing);
  const evidenceJson = JSON.stringify(evidenceSha256s);

  const buildReplayResult = async (replayBatch: BatchMetaRow): Promise<TradeImportResponse> => {
    // 若该批次已被后续新修订替代（superseded_by 非空），或已成功发布，或请求显式延迟发布：直接返回原批次
    if (replayBatch.superseded_by !== null || replayBatch.publish_state === "published" || options.deferPublish) {
      const currentSnap = await db
        .prepare("SELECT release_id FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2")
        .bind(manifest.dictVersion, manifest.month)
        .first<{ release_id: string }>();
      return {
        batchId: replayBatch.batch_id,
        sourceSha256: replayBatch.source_sha256,
        evidenceSha256s: JSON.parse(replayBatch.evidence_sha256s_json) as string[],
        rowCount: replayBatch.row_count,
        coverage: {
          received: JSON.parse(replayBatch.received_hs8_json) as string[],
          confirmedEmpty: JSON.parse(replayBatch.confirmed_empty_hs8_json) as string[],
          missing: JSON.parse(replayBatch.missing_hs8_json) as string[],
        },
        status: replayBatch.publish_state === "published" ? "published" : "staged",
        releaseId: currentSnap?.release_id ?? null,
        replayed: true,
      };
    }

    // 该批次是当前最新候选（superseded_by IS NULL 且 publish_state = 'staged'），如上次发布前中断后重试：继续尝试发布
    const pub = await evaluateAndPublishMonth(db, manifest.dictVersion, manifest.month, {
      failBeforePublishCommit: options.failBeforePublishCommit,
      preemptReleaseOnce: options.preemptReleaseOnce,
    });
    return {
      batchId: replayBatch.batch_id,
      sourceSha256: replayBatch.source_sha256,
      evidenceSha256s: JSON.parse(replayBatch.evidence_sha256s_json) as string[],
      rowCount: replayBatch.row_count,
      coverage: {
        received: JSON.parse(replayBatch.received_hs8_json) as string[],
        confirmedEmpty: JSON.parse(replayBatch.confirmed_empty_hs8_json) as string[],
        missing: JSON.parse(replayBatch.missing_hs8_json) as string[],
      },
      status: pub.published ? "published" : "staged",
      releaseId: pub.releaseId,
      replayed: true,
      reconciliationNote: pub.reconciliationNote,
    };
  };

  // 1. 检查相同范围、相同原件、相同实际覆盖（含 confirmedEmpty/missing）与证据的幂等重放
  const existingReplay = await findCompleteReplayBatch(db, {
    scopeKey: manifest.scopeKey,
    sourceSha256,
    emptyHs8Json,
    confirmedEmptyHs8Json,
    missingHs8Json,
    evidenceJson,
  });

  if (existingReplay) {
    return buildReplayResult(existingReplay);
  }

  // 2. 检查与同月、同流向、同分组既有候选或活跃批次的部分范围重叠（HTTP 409）
  const { results: siblingBatches } = await db
    .prepare(
      `SELECT batch_id, scope_key, hs8_json
       FROM trade_import_batch
       WHERE dict_version = ?1 AND month = ?2 AND flow = ?3 AND grouping = ?4
         AND superseded_by IS NULL AND publish_state IN ('staged', 'published')`,
    )
    .bind(manifest.dictVersion, manifest.month, manifest.flow, manifest.grouping)
    .all<{ batch_id: string; scope_key: string; hs8_json: string }>();

  let prevSameScopeBatchId: string | null = null;
  for (const sib of siblingBatches) {
    if (sib.scope_key === manifest.scopeKey) {
      prevSameScopeBatchId = sib.batch_id;
      continue;
    }
    const sibHs8 = JSON.parse(sib.hs8_json) as string[];
    const sibSet = new Set(sibHs8);
    if (manifest.hs8.some((code) => sibSet.has(code))) {
      throw new AppError(409, "TRADE_SCOPE_CONFLICT", {
        existingBatchId: sib.batch_id,
        existingHs8: sibHs8.join(","),
        requestedHs8: manifest.hs8.join(","),
      });
    }
  }

  // 3. 按月原子写入候选批次、税号覆盖记录及月度事实（超大单月自动切换 ingesting->staged 两阶段安全写入）
  const batchId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const detailStmts: D1PreparedStatement[] = [];

  for (const evItem of evidenceCoverageList) {
    detailStmts.push(
      db
        .prepare(
          `INSERT INTO trade_batch_evidence (id, batch_id, filename, sha256, byte_length, covered_hs8_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          crypto.randomUUID(),
          batchId,
          evItem.filename,
          evItem.sha256,
          evItem.byteLength,
          JSON.stringify(evItem.coveredHs8),
          createdAt,
        ),
    );
  }

  const coverageRecords = [
    ...coverage.received.map((hs8) => ({ hs8, status: "received", evidenceSha256: sourceSha256 })),
    ...coverage.confirmedEmpty.map((hs8) => ({
      hs8,
      status: "confirmed_empty",
      evidenceSha256: emptyEvidenceShaByHs8.get(hs8) ?? evidenceSha256s[0] ?? sourceSha256,
    })),
    ...coverage.missing.map((hs8) => ({ hs8, status: "missing", evidenceSha256: null })),
  ];

  for (let i = 0; i < coverageRecords.length; i += CHUNK_SIZE) {
    const chunk = coverageRecords.slice(i, i + CHUNK_SIZE);
    detailStmts.push(
      db
        .prepare(INSERT_COVERAGE_CHUNK)
        .bind(batchId, manifest.dictVersion, manifest.month, manifest.flow, manifest.grouping, JSON.stringify(chunk)),
    );
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE).map((r) => ({
      hs8: r.hs8,
      itemName: r.itemName,
      groupCode: r.groupCode,
      groupName: r.groupName,
      usdScaled: r.usdScaled.toString(),
      usdRaw: r.usdRaw,
      qty1: r.qty1,
      unit1: r.unit1,
      qty2: r.qty2,
      unit2: r.unit2,
    }));
    detailStmts.push(
      db
        .prepare(INSERT_FACT_CHUNK)
        .bind(batchId, manifest.dictVersion, manifest.month, manifest.flow, manifest.grouping, JSON.stringify(chunk)),
    );
  }

  const buildHeaderStmts = (importStatus: "completed" | "ingesting", publishState: "staged" | "ingesting", supersededBy: string | null) => [
    db
      .prepare(
        `INSERT INTO import_batch (id, filename, status, row_ok, row_err, errors_json, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, '[]', ?5)`,
      )
      .bind(batchId, filename, importStatus, rows.length, createdAt),
    db
      .prepare(
        `INSERT INTO trade_import_batch (
           batch_id, dict_version, month, flow, currency, grouping, scope_key,
           hs8_json, empty_hs8_json, received_hs8_json, confirmed_empty_hs8_json, missing_hs8_json,
           filename, source_sha256, evidence_sha256s_json, row_count, publish_state, superseded_by, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
      )
      .bind(
        batchId,
        manifest.dictVersion,
        manifest.month,
        manifest.flow,
        manifest.currency,
        manifest.grouping,
        manifest.scopeKey,
        JSON.stringify(manifest.hs8),
        emptyHs8Json,
        JSON.stringify(coverage.received),
        JSON.stringify(coverage.confirmedEmpty),
        JSON.stringify(coverage.missing),
        filename,
        sourceSha256,
        evidenceJson,
        rows.length,
        publishState,
        supersededBy,
        createdAt,
      ),
  ];

  const supersedeStmts = prevSameScopeBatchId
    ? [
        db.prepare("DELETE FROM trade_active_hs8_slot WHERE batch_id = ?1").bind(prevSameScopeBatchId),
        db
          .prepare("UPDATE trade_import_batch SET superseded_by = ?1 WHERE batch_id = ?2 AND superseded_by IS NULL")
          .bind(batchId, prevSameScopeBatchId),
      ]
    : [];
  const insertSlotStmt = db
    .prepare(INSERT_ACTIVE_HS8_SLOTS)
    .bind(
      manifest.dictVersion,
      manifest.month,
      manifest.flow,
      manifest.grouping,
      manifest.scopeKey,
      batchId,
      JSON.stringify(manifest.hs8),
    );

  if (options.delayBeforeCommitMs && options.delayBeforeCommitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.delayBeforeCommitMs));
  }

  try {
    await commitStagedMonthBatch(db, {
      batchId,
      initIngestingStmts: buildHeaderStmts("ingesting", "ingesting", "__INGESTING__"),
      detailStmts,
      finalizeStmts: [
        ...supersedeStmts,
        insertSlotStmt,
        db.prepare("UPDATE import_batch SET status = 'completed' WHERE id = ?1").bind(batchId),
        db
          .prepare("UPDATE trade_import_batch SET publish_state = 'staged', superseded_by = NULL WHERE batch_id = ?1")
          .bind(batchId),
      ],
      allAtomicStmts: [
        ...buildHeaderStmts("completed", "staged", null),
        ...supersedeStmts,
        insertSlotStmt,
        ...detailStmts,
      ],
    });
  } catch (err) {
    if (isTradeActiveSlotConflict(err)) {
      const concurrentReplay = await findCompleteReplayBatch(db, {
        scopeKey: manifest.scopeKey,
        sourceSha256,
        emptyHs8Json,
        confirmedEmptyHs8Json,
        missingHs8Json,
        evidenceJson,
      });
      if (concurrentReplay && concurrentReplay.superseded_by === null) {
        return buildReplayResult(concurrentReplay);
      }
      const conflict = await findConflictingSlotBatch(db, {
        dictVersion: manifest.dictVersion,
        month: manifest.month,
        flow: manifest.flow,
        grouping: manifest.grouping,
        hs8: manifest.hs8,
      });
      throw new AppError(409, "TRADE_SCOPE_CONFLICT", {
        existingBatchId: conflict?.batch_id ?? "concurrent_active_batch",
        existingHs8: conflict ? (JSON.parse(conflict.hs8_json) as string[]).join(",") : "",
        requestedHs8: manifest.hs8.join(","),
      });
    }
    throw err;
  }

  if (options.deferPublish) {
    const currentSnap = await db
      .prepare("SELECT release_id FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2")
      .bind(manifest.dictVersion, manifest.month)
      .first<{ release_id: string }>();
    return {
      batchId,
      sourceSha256,
      evidenceSha256s,
      rowCount: rows.length,
      coverage,
      status: "staged",
      releaseId: currentSnap?.release_id ?? null,
      replayed: false,
      reconciliationNote: null,
    };
  }

  // 4. 评估当月 2×4 覆盖与全国/分组对账，就绪则生成快照并原子切换版本
  const pub = await evaluateAndPublishMonth(db, manifest.dictVersion, manifest.month, {
    failBeforePublishCommit: options.failBeforePublishCommit,
    preemptReleaseOnce: options.preemptReleaseOnce,
  });

  return {
    batchId,
    sourceSha256,
    evidenceSha256s,
    rowCount: rows.length,
    coverage,
    status: pub.published ? "published" : "staged",
    releaseId: pub.releaseId,
    replayed: false,
    reconciliationNote: pub.reconciliationNote,
  };
}

export async function importTradeBulkBatch(
  db: D1Database,
  options: ImportTradeBulkOptions,
): Promise<TradeBulkImportResponse> {
  if (!options.rawManifest || !options.rawManifest.trim()) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "manifest", reason: "missing manifest" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(options.rawManifest);
  } catch {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "manifest", reason: "invalid JSON" });
  }

  const rawDictVer =
    parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
      ? String((parsedJson as Record<string, unknown>).dictVersion ?? "").trim()
      : "";

  const { results: dictVersions } = await db
    .prepare("SELECT dict_version FROM trade_dict_meta")
    .all<{ dict_version: string }>();
  const knownDictVersions = new Set(dictVersions.map((d) => d.dict_version));

  const { results: rawAllDictRows } = rawDictVer
    ? await db
        .prepare("SELECT hs8 FROM trade_hs_dict WHERE dict_version = ?1")
        .bind(rawDictVer)
        .all<{ hs8: string }>()
    : { results: [] as Array<{ hs8: string }> };
  const dictHs8Set = new Set(rawAllDictRows.map((r) => r.hs8));

  const manifestCheck = validateTradeBulkManifest(parsedJson, {
    knownDictVersions,
    dictHs8Set: knownDictVersions.has(rawDictVer) ? dictHs8Set : undefined,
  });
  if (!manifestCheck.ok) {
    throw new AppError(manifestCheck.error.status, manifestCheck.error.code, manifestCheck.error.params);
  }
  const bulkManifest = manifestCheck.value;
  const deferPublish = options.deferPublish ?? true;

  for (const ev of options.emptyEvidences) {
    if (!isPngBytes(ev.bytes)) {
      throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "emptyEvidence_must_be_png" });
    }
  }
  const evidenceSha256s = await Promise.all(options.emptyEvidences.map((ev) => sha256Hex(ev.bytes)));

  if (!options.file && options.emptyEvidences.length === 0) {
    throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "file_or_emptyEvidence_required" });
  }

  let sourceSha256 = "";
  let filename = "";
  let byMonth = new Map<string, ParsedCustomsFactRow[]>();
  for (const m of bulkManifest.months) {
    byMonth.set(m, []);
  }

  if (!options.file) {
    if (!bulkManifest.probeVerifiedZero && bulkManifest.emptyHs8.length !== bulkManifest.hs8.length) {
      throw new AppError(400, "TRADE_EVIDENCE_INVALID", { reason: "empty_evidence_only_requires_full_emptyHs8" });
    }
    sourceSha256 = evidenceSha256s[0];
    filename = options.emptyEvidences[0].filename || "empty_evidence.png";
  } else {
    sourceSha256 = await sha256Hex(options.file.bytes);
    filename = options.file.filename || "customs_bulk.csv";
    const parsedMulti = parseMultiMonthCustomsCsvBytes(options.file.bytes, bulkManifest, {
      maxRows: Math.max(options.maxRows, 100_000),
      allowHeaderOnlyEmpty: Boolean(bulkManifest.probeVerifiedZero || options.emptyEvidences.length > 0),
    });
    if (!parsedMulti.ok) {
      throw new AppError(parsedMulti.error.status, parsedMulti.error.code, parsedMulti.error.params);
    }
    byMonth = parsedMulti.byMonth;
  }

  const dictByYear = new Map<number, DictItemRow[]>();
  const getYearDict = async (yr: number) => {
    if (!dictByYear.has(yr)) {
      dictByYear.set(yr, await loadDictForYear(db, bulkManifest.dictVersion, yr));
    }
    return dictByYear.get(yr)!;
  };

  const batchIds: string[] = [];
  const activeMonths: string[] = [];
  let totalRowCount = 0;
  const createdAt = new Date().toISOString();
  const evidenceJson = JSON.stringify(evidenceSha256s);
  const monthWorkItems: Array<
    | { kind: "replayed"; batchId: string }
    | {
        kind: "commit";
        month: string;
        scopeKey: string;
        monthHs8: string[];
        emptyHs8Json: string;
        confirmedEmptyHs8Json: string;
        missingHs8Json: string;
        plan: MonthStagingCommitPlan;
      }
  > = [];

  for (const month of bulkManifest.months) {
    const year = Number(month.slice(0, 4));
    const yDict = await getYearDict(year);
    const yearApplicableSet = new Set(yDict.filter((d) => d.applicable === 1).map((d) => d.hs8));
    const monthRows = byMonth.get(month) ?? [];

    for (const r of monthRows) {
      if (!yearApplicableSet.has(r.hs8)) {
        throw new AppError(400, "TRADE_CSV_INVALID", {
          line: r.line,
          field: "hs8",
          reason: `hs8 '${r.hs8}' is marked notApplicable in year ${year}`,
        });
      }
    }

    const monthHs8 = bulkManifest.hs8.filter((c) => yearApplicableSet.has(c));
    if (monthHs8.length === 0) {
      continue;
    }
    activeMonths.push(month);
    totalRowCount += monthRows.length;

    const receivedSet = new Set(monthRows.map((r) => r.hs8));
    let coverage: TradeImportCoverage;
    let evidenceCoverageList: Array<{ filename: string; sha256: string; byteLength: number; coveredHs8: string[] }> = [];
    let emptyEvidenceShaByHs8 = new Map<string, string>();

    if (!options.file) {
      const assigned = assignEmptyEvidencesToHs8(options.emptyEvidences, evidenceSha256s, monthHs8, true);
      evidenceCoverageList = assigned.evidenceCoverageList;
      emptyEvidenceShaByHs8 = assigned.emptyEvidenceShaByHs8;
      coverage = {
        received: [],
        confirmedEmpty: monthHs8.filter((c) => assigned.provenEmptySet.has(c)),
        missing: monthHs8.filter((c) => !assigned.provenEmptySet.has(c)),
      };
    } else if (bulkManifest.probeVerifiedZero === true) {
      coverage = {
        received: monthHs8.filter((c) => receivedSet.has(c)),
        confirmedEmpty: monthHs8.filter((c) => !receivedSet.has(c)),
        missing: [],
      };
    } else {
      const candidateEmpty = bulkManifest.emptyHs8.filter((c) => yearApplicableSet.has(c) && !receivedSet.has(c));
      const assigned = assignEmptyEvidencesToHs8(
        options.emptyEvidences,
        evidenceSha256s,
        candidateEmpty,
        options.emptyEvidences.length > 0 && monthRows.length === 0,
      );
      evidenceCoverageList = assigned.evidenceCoverageList;
      emptyEvidenceShaByHs8 = assigned.emptyEvidenceShaByHs8;
      coverage = {
        received: monthHs8.filter((c) => receivedSet.has(c)),
        confirmedEmpty: monthHs8.filter((c) => !receivedSet.has(c) && assigned.provenEmptySet.has(c)),
        missing: monthHs8.filter((c) => !receivedSet.has(c) && !assigned.provenEmptySet.has(c)),
      };
    }

    const scopeKey = buildTradeScopeKey({
      dictVersion: bulkManifest.dictVersion,
      month,
      flow: bulkManifest.flow,
      currency: "USD",
      grouping: bulkManifest.grouping,
      hs8: monthHs8,
    });
    const monthEmptyHs8 = coverage.confirmedEmpty;
    const emptyHs8Json = JSON.stringify(monthEmptyHs8);
    const confirmedEmptyHs8Json = JSON.stringify(coverage.confirmedEmpty);
    const missingHs8Json = JSON.stringify(coverage.missing);

    const existingReplay = await findCompleteReplayBatch(db, {
      scopeKey,
      sourceSha256,
      emptyHs8Json,
      confirmedEmptyHs8Json,
      missingHs8Json,
      evidenceJson,
    });

    if (existingReplay) {
      monthWorkItems.push({ kind: "replayed", batchId: existingReplay.batch_id });
      continue;
    }

    const { results: siblingBatches } = await db
      .prepare(
        `SELECT batch_id, scope_key, hs8_json
         FROM trade_import_batch
         WHERE dict_version = ?1 AND month = ?2 AND flow = ?3 AND grouping = ?4
           AND superseded_by IS NULL AND publish_state IN ('staged', 'published')`,
      )
      .bind(bulkManifest.dictVersion, month, bulkManifest.flow, bulkManifest.grouping)
      .all<{ batch_id: string; scope_key: string; hs8_json: string }>();

    let prevSameScopeBatchId: string | null = null;
    for (const sib of siblingBatches) {
      if (sib.scope_key === scopeKey) {
        prevSameScopeBatchId = sib.batch_id;
        continue;
      }
      const sibHs8 = JSON.parse(sib.hs8_json) as string[];
      const sibSet = new Set(sibHs8);
      if (monthHs8.some((code) => sibSet.has(code))) {
        throw new AppError(409, "TRADE_SCOPE_CONFLICT", {
          existingBatchId: sib.batch_id,
          existingHs8: sibHs8.join(","),
          requestedHs8: monthHs8.join(","),
        });
      }
    }

    const batchId = crypto.randomUUID();

    const detailStmts: D1PreparedStatement[] = [];
    for (const evItem of evidenceCoverageList) {
      detailStmts.push(
        db
          .prepare(
            `INSERT INTO trade_batch_evidence (id, batch_id, filename, sha256, byte_length, covered_hs8_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          )
          .bind(
            crypto.randomUUID(),
            batchId,
            evItem.filename,
            evItem.sha256,
            evItem.byteLength,
            JSON.stringify(evItem.coveredHs8),
            createdAt,
          ),
      );
    }

    const coverageRecords = [
      ...coverage.received.map((hs8) => ({ hs8, status: "received", evidenceSha256: sourceSha256 })),
      ...coverage.confirmedEmpty.map((hs8) => ({
        hs8,
        status: "confirmed_empty",
        evidenceSha256: emptyEvidenceShaByHs8.get(hs8) ?? evidenceSha256s[0] ?? sourceSha256,
      })),
      ...coverage.missing.map((hs8) => ({ hs8, status: "missing", evidenceSha256: null })),
    ];
    for (let i = 0; i < coverageRecords.length; i += CHUNK_SIZE) {
      detailStmts.push(
        db
          .prepare(INSERT_COVERAGE_CHUNK)
          .bind(
            batchId,
            bulkManifest.dictVersion,
            month,
            bulkManifest.flow,
            bulkManifest.grouping,
            JSON.stringify(coverageRecords.slice(i, i + CHUNK_SIZE)),
          ),
      );
    }

    for (let i = 0; i < monthRows.length; i += CHUNK_SIZE) {
      const chunk = monthRows.slice(i, i + CHUNK_SIZE).map((r) => ({
        hs8: r.hs8,
        itemName: r.itemName,
        groupCode: r.groupCode,
        groupName: r.groupName,
        usdScaled: r.usdScaled.toString(),
        usdRaw: r.usdRaw,
        qty1: r.qty1,
        unit1: r.unit1,
        qty2: r.qty2,
        unit2: r.unit2,
      }));
      detailStmts.push(
        db
          .prepare(INSERT_FACT_CHUNK)
          .bind(batchId, bulkManifest.dictVersion, month, bulkManifest.flow, bulkManifest.grouping, JSON.stringify(chunk)),
      );
    }

    const buildHeaderStmts = (importStatus: "completed" | "ingesting", publishState: "staged" | "ingesting", supersededBy: string | null) => [
      db
        .prepare(
          `INSERT INTO import_batch (id, filename, status, row_ok, row_err, errors_json, created_at)
           VALUES (?1, ?2, ?3, ?4, 0, '[]', ?5)`,
        )
        .bind(batchId, filename, importStatus, monthRows.length, createdAt),
      db
        .prepare(
          `INSERT INTO trade_import_batch (
             batch_id, dict_version, month, flow, currency, grouping, scope_key,
             hs8_json, empty_hs8_json, received_hs8_json, confirmed_empty_hs8_json, missing_hs8_json,
             filename, source_sha256, evidence_sha256s_json, row_count, publish_state, superseded_by, created_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
        )
        .bind(
          batchId,
          bulkManifest.dictVersion,
          month,
          bulkManifest.flow,
          "USD",
          bulkManifest.grouping,
          scopeKey,
          JSON.stringify(monthHs8),
          emptyHs8Json,
          JSON.stringify(coverage.received),
          confirmedEmptyHs8Json,
          missingHs8Json,
          filename,
          sourceSha256,
          evidenceJson,
          monthRows.length,
          publishState,
          supersededBy,
          createdAt,
        ),
    ];

    const supersedeStmts = prevSameScopeBatchId
      ? [
          db.prepare("DELETE FROM trade_active_hs8_slot WHERE batch_id = ?1").bind(prevSameScopeBatchId),
          db
            .prepare("UPDATE trade_import_batch SET superseded_by = ?1 WHERE batch_id = ?2 AND superseded_by IS NULL")
            .bind(batchId, prevSameScopeBatchId),
        ]
      : [];
    const insertSlotStmt = db
      .prepare(INSERT_ACTIVE_HS8_SLOTS)
      .bind(
        bulkManifest.dictVersion,
        month,
        bulkManifest.flow,
        bulkManifest.grouping,
        scopeKey,
        batchId,
        JSON.stringify(monthHs8),
      );

    monthWorkItems.push({
      kind: "commit",
      month,
      scopeKey,
      monthHs8,
      emptyHs8Json,
      confirmedEmptyHs8Json,
      missingHs8Json,
      plan: {
        batchId,
        initIngestingStmts: buildHeaderStmts("ingesting", "ingesting", "__INGESTING__"),
        detailStmts,
        finalizeStmts: [
          ...supersedeStmts,
          insertSlotStmt,
          db.prepare("UPDATE import_batch SET status = 'completed' WHERE id = ?1").bind(batchId),
          db
            .prepare("UPDATE trade_import_batch SET publish_state = 'staged', superseded_by = NULL WHERE batch_id = ?1")
            .bind(batchId),
        ],
        allAtomicStmts: [
          ...buildHeaderStmts("completed", "staged", null),
          ...supersedeStmts,
          insertSlotStmt,
          ...detailStmts,
        ],
      },
    });
  }

  if (options.delayBeforeCommitMs && options.delayBeforeCommitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.delayBeforeCommitMs));
  }

  // 按月独立原子提交：确保单月批次头、槽位锁与全部事实明细同成同败，并发重叠在数据库主键层原子拦截
  let committedMonths = 0;
  for (const item of monthWorkItems) {
    if (item.kind === "replayed") {
      batchIds.push(item.batchId);
      continue;
    }
    try {
      await commitStagedMonthBatch(db, item.plan, {
        maxBatchStmts: options.maxBatchStmtsOverride,
        failDuringOversizedMonth: options.failDuringOversizedMonth,
      });
      batchIds.push(item.plan.batchId);
      committedMonths += 1;
    } catch (err) {
      if (isTradeActiveSlotConflict(err)) {
        const concurrentReplay = await findCompleteReplayBatch(db, {
          scopeKey: item.scopeKey,
          sourceSha256,
          emptyHs8Json: item.emptyHs8Json,
          confirmedEmptyHs8Json: item.confirmedEmptyHs8Json,
          missingHs8Json: item.missingHs8Json,
          evidenceJson,
        });
        if (concurrentReplay && concurrentReplay.superseded_by === null) {
          batchIds.push(concurrentReplay.batch_id);
          continue;
        }
        const conflict = await findConflictingSlotBatch(db, {
          dictVersion: bulkManifest.dictVersion,
          month: item.month,
          flow: bulkManifest.flow,
          grouping: bulkManifest.grouping,
          hs8: item.monthHs8,
        });
        throw new AppError(409, "TRADE_SCOPE_CONFLICT", {
          existingBatchId: conflict?.batch_id ?? "concurrent_active_batch",
          existingHs8: conflict ? (JSON.parse(conflict.hs8_json) as string[]).join(",") : "",
          requestedHs8: item.monthHs8.join(","),
        });
      }
      throw err;
    }
    if (options.failAfterMonthIndex !== undefined && committedMonths >= options.failAfterMonthIndex) {
      throw new Error(`simulated failure after committing bulk month #${committedMonths}`);
    }
  }

  if (deferPublish) {
    return {
      dictVersion: bulkManifest.dictVersion,
      months: activeMonths,
      monthCount: activeMonths.length,
      batchIds,
      sourceSha256,
      evidenceSha256s,
      totalRowCount,
      status: "staged",
      releaseId: null,
      publishedMonths: [],
      reconciliationNotes: {},
    };
  }

  const pub = await publishAllReadyTradeMonths(db, bulkManifest.dictVersion);
  let allBatchesPublished = false;
  if (batchIds.length > 0) {
    const batchStates = await queryBatchesByIds(db, batchIds);
    allBatchesPublished = batchIds.every((id) => batchStates.get(id)?.publish_state === "published");
  }
  return {
    dictVersion: bulkManifest.dictVersion,
    months: activeMonths,
    monthCount: activeMonths.length,
    batchIds,
    sourceSha256,
    evidenceSha256s,
    totalRowCount,
    status: allBatchesPublished ? "published" : "staged",
    releaseId: allBatchesPublished ? pub.releaseId : null,
    publishedMonths: pub.publishedMonths,
    reconciliationNotes: pub.reconciliationNotes,
  };
}

export async function publishAllReadyTradeMonths(
  db: D1Database,
  rawDictVersion?: string | null,
  opts?: PublishTradeMonthsOptions,
): Promise<TradePublishResponse> {
  const dictVersion = rawDictVersion?.trim() || DEFAULT_DICT_VERSION;
  const dictMeta = await db
    .prepare("SELECT dict_version FROM trade_dict_meta WHERE dict_version = ?1")
    .bind(dictVersion)
    .first<{ dict_version: string }>();
  if (!dictMeta) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "dictVersion", reason: `unknown dictVersion: ${dictVersion}` });
  }

  return withDictPublishLock(dictVersion, async () => {
    for (let attempt = 0; attempt < MAX_PUBLISH_CAS_RETRIES; attempt++) {
      try {
        return await attemptPublishAllReadyOnce(db, dictVersion, opts);
      } catch (err) {
        if (isTradeReleaseCasConflict(err) && attempt + 1 < MAX_PUBLISH_CAS_RETRIES) {
          continue;
        }
        throw err;
      }
    }
    throw new AppError(500, "INTERNAL_ERROR");
  });
}

async function attemptPublishAllReadyOnce(
  db: D1Database,
  dictVersion: string,
  opts?: PublishTradeMonthsOptions,
): Promise<TradePublishResponse> {
  const prevRelease = await db
    .prepare(
      `SELECT release_id, COALESCE(version_seq, 0) AS version_seq, published_months_json, available_periods_json
       FROM trade_release
       WHERE dict_version = ?1
       ORDER BY version_seq DESC, rowid DESC
       LIMIT 1`,
    )
    .bind(dictVersion)
    .first<{
      release_id: string;
      version_seq: number;
      published_months_json: string;
      available_periods_json: string;
    }>();

  const { results: activeScopeRows } = await db
    .prepare("SELECT * FROM trade_active_scope WHERE dict_version = ?1")
    .bind(dictVersion)
    .all<{ scope_key: string; month: string; flow: TradeFlow; grouping: TradeGrouping; batch_id: string }>();

  const prevActiveByMonth = new Map<string, string[]>();
  for (const r of activeScopeRows) {
    const arr = prevActiveByMonth.get(r.month) ?? [];
    arr.push(r.batch_id);
    prevActiveByMonth.set(r.month, arr);
  }

  const { results: allCandidates } = await db
    .prepare(
      `SELECT * FROM trade_import_batch
       WHERE dict_version = ?1 AND superseded_by IS NULL AND publish_state IN ('staged', 'published')
       ORDER BY month ASC, flow ASC, grouping ASC, scope_key ASC`,
    )
    .bind(dictVersion)
    .all<BatchMetaRow>();

  const candidatesByMonth = new Map<string, BatchMetaRow[]>();
  for (const b of allCandidates) {
    const arr = candidatesByMonth.get(b.month) ?? [];
    arr.push(b);
    candidatesByMonth.set(b.month, arr);
  }

  const dictCache = new Map<number, DictItemRow[]>();
  const getDict = async (y: number) => {
    if (!dictCache.has(y)) {
      dictCache.set(y, await loadDictForYear(db, dictVersion, y));
    }
    return dictCache.get(y)!;
  };

  const activeBatchesByMonth = new Map<string, string[]>(prevActiveByMonth);
  const monthsToReconcile: Array<{ month: string; applicableSet: Set<string>; batches: BatchMetaRow[] }> = [];
  const preReconDuplicateNotes: Record<string, string> = {};

  for (const [month, batches] of [...candidatesByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const year = Number(month.slice(0, 4));
    const dictItems = await getDict(year);
    const applicableSet = new Set(dictItems.filter((d) => d.applicable === 1).map((d) => d.hs8));
    if (applicableSet.size === 0) continue;

    let complete = true;
    const duplicateConflicts: string[] = [];
    for (const flow of TRADE_FLOWS) {
      for (const grouping of TRADE_GROUPINGS) {
        const covered = new Set<string>();
        const matching = batches.filter((b) => b.flow === flow && b.grouping === grouping);
        for (const b of matching) {
          const missing = JSON.parse(b.missing_hs8_json) as string[];
          if (missing.length > 0) {
            complete = false;
            break;
          }
          for (const c of JSON.parse(b.received_hs8_json) as string[]) {
            if (covered.has(c)) duplicateConflicts.push(`${flow}/${grouping}/${c}`);
            covered.add(c);
          }
          for (const c of JSON.parse(b.confirmed_empty_hs8_json) as string[]) {
            if (covered.has(c)) duplicateConflicts.push(`${flow}/${grouping}/${c}`);
            covered.add(c);
          }
        }
        if (!complete) break;
        for (const reqHs8 of applicableSet) {
          if (!covered.has(reqHs8)) {
            complete = false;
            break;
          }
        }
        if (!complete) break;
      }
      if (!complete) break;
    }
    if (duplicateConflicts.length > 0) {
      preReconDuplicateNotes[month] = `duplicate_active_hs8_coverage: ${[...new Set(duplicateConflicts)].join(", ")}`;
      continue;
    }
    if (!complete) continue;

    const candIdsSorted = batches.map((b) => b.batch_id).sort();
    const prevIdsSorted = [...(prevActiveByMonth.get(month) ?? [])].sort();
    const isUnchanged =
      candIdsSorted.length === prevIdsSorted.length && candIdsSorted.every((id, idx) => id === prevIdsSorted[idx]);
    if (isUnchanged) {
      continue;
    }

    monthsToReconcile.push({ month, applicableSet, batches });
  }

  const reconciliationNotes: Record<string, string> = { ...preReconDuplicateNotes };
  const newlyPublishedMonths: string[] = [];
  const newlyPublishedBatches: BatchMetaRow[] = [];
  const reconPayloadRows: Array<{
    month: string;
    flow: TradeFlow;
    hs8: string;
    grouping: TradeGrouping;
    prodScaled: string;
    grpScaled: string;
    diffScaled: string;
    status: string;
  }> = [];

  if (monthsToReconcile.length > 0) {
    const reconcileBatchIds = monthsToReconcile.flatMap((m) => m.batches.map((b) => b.batch_id));
    const comboSumsByMonth = await queryFactComboSumsByBatchIds(db, reconcileBatchIds);

    for (const { month, applicableSet, batches } of monthsToReconcile) {
      const sumByCombo = comboSumsByMonth.get(month) ?? new Map<string, bigint>();

      const discrepancies: string[] = [];
      for (const flow of TRADE_FLOWS) {
        for (const hs8 of applicableSet) {
          const prodVal = sumByCombo.get(`${flow}|product|${hs8}`) ?? 0n;
          for (const g of ["partner", "regime", "region"] as const) {
            const grpVal = sumByCombo.get(`${flow}|${g}|${hs8}`) ?? 0n;
            const diff = grpVal - prodVal;
            if (diff !== 0n) {
              discrepancies.push(`${flow}/${g}/${hs8}: diff=${scaledToUsdNumber(diff)}`);
            }
            reconPayloadRows.push({
              month,
              flow,
              hs8,
              grouping: g,
              prodScaled: prodVal.toString(),
              grpScaled: grpVal.toString(),
              diffScaled: diff.toString(),
              status: diff === 0n ? "matched" : "pending_review",
            });
          }
        }
      }

      if (discrepancies.length > 0) {
        reconciliationNotes[month] = discrepancies.join("; ");
      } else {
        newlyPublishedMonths.push(month);
        for (const b of batches) newlyPublishedBatches.push(b);
        activeBatchesByMonth.set(
          month,
          batches.map((b) => b.batch_id),
        );
      }
    }
  }

  const now = new Date().toISOString();
  if (reconPayloadRows.length > 0) {
    const reconStmts: D1PreparedStatement[] = [];
    for (let i = 0; i < reconPayloadRows.length; i += CHUNK_SIZE) {
      reconStmts.push(
        db.prepare(INSERT_RECON_CHUNK).bind(dictVersion, now, JSON.stringify(reconPayloadRows.slice(i, i + CHUNK_SIZE))),
      );
    }
    for (let i = 0; i < reconStmts.length; i += 100) {
      await db.batch(reconStmts.slice(i, i + 100));
    }
  }

  const publishedMonths = [...activeBatchesByMonth.keys()].sort();
  const publishedMonthSet = new Set(publishedMonths);
  const availablePeriods = computeAllAvailablePeriods(publishedMonthSet);

  if (newlyPublishedMonths.length === 0) {
    return {
      dictVersion,
      published: false,
      releaseId: prevRelease?.release_id ?? null,
      newlyPublishedMonths: [],
      publishedMonths,
      availablePeriods,
      reconciliationNotes,
    };
  }

  const nextVersionSeq = (prevRelease?.version_seq ?? 0) + 1;
  const latestMonth = publishedMonths[publishedMonths.length - 1];
  const releaseId = crypto.randomUUID();
  const triggerBatchId = newlyPublishedBatches[newlyPublishedBatches.length - 1]!.batch_id;

  const targetPeriodsSet = new Set<string>();
  for (const m of newlyPublishedMonths) {
    for (const p of computeAffectedPeriods(m, publishedMonthSet, availablePeriods)) {
      targetPeriodsSet.add(p);
    }
  }
  const targetPeriods = [...targetPeriodsSet].sort();

  const { annualTrend, snapshotsToWrite, derivedObsRows } = await buildSnapshotsForTargetPeriods(db, {
    dictVersion,
    releaseId,
    availablePeriods,
    publishedMonths,
    publishedMonthSet,
    activeBatchesByMonth,
    targetPeriods,
    dictCache,
    getDict,
  });

  const headerStmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO trade_release (release_id, dict_version, prev_release_id, version_seq, published_months_json, available_periods_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        releaseId,
        dictVersion,
        prevRelease?.release_id ?? null,
        nextVersionSeq,
        JSON.stringify(publishedMonths),
        JSON.stringify(availablePeriods),
        now,
      ),
    db
      .prepare("DELETE FROM trade_active_scope WHERE dict_version = ?1 AND month IN (SELECT value FROM json_each(?2))")
      .bind(dictVersion, JSON.stringify(newlyPublishedMonths)),
  ];

  for (let i = 0; i < newlyPublishedBatches.length; i += ID_QUERY_CHUNK_SIZE) {
    const scopeChunk = newlyPublishedBatches.slice(i, i + ID_QUERY_CHUNK_SIZE).map((b) => ({
      scopeKey: b.scope_key,
      month: b.month,
      flow: b.flow,
      grouping: b.grouping,
      batchId: b.batch_id,
    }));
    const idChunk = scopeChunk.map((s) => s.batchId);
    headerStmts.push(
      db
        .prepare(
          `INSERT INTO trade_active_scope (scope_key, dict_version, month, flow, grouping, batch_id, release_id, updated_at)
           SELECT
             json_extract(value, '$.scopeKey'),
             ?1,
             json_extract(value, '$.month'),
             json_extract(value, '$.flow'),
             json_extract(value, '$.grouping'),
             json_extract(value, '$.batchId'),
             ?2,
             ?3
           FROM json_each(?4)`,
        )
        .bind(dictVersion, releaseId, now, JSON.stringify(scopeChunk)),
      db
        .prepare(
          "UPDATE trade_import_batch SET publish_state = 'published' WHERE batch_id IN (SELECT value FROM json_each(?1))",
        )
        .bind(JSON.stringify(idChunk)),
    );
  }

  await commitPublishReleaseAtomically(db, {
    dictVersion,
    releaseId,
    latestMonth,
    availablePeriods,
    annualTrend,
    triggerBatchId,
    now,
    headerStmts,
    snapshotsToWrite,
    derivedObsRows,
    failAfterStageBatch: opts?.failAfterStageBatch,
    stageThresholdOverride: opts?.stageThresholdOverride,
  });

  return {
    dictVersion,
    published: true,
    releaseId,
    newlyPublishedMonths,
    publishedMonths,
    availablePeriods,
    reconciliationNotes,
  };
}

async function queryBatchesByIds(db: D1Database, batchIds: readonly string[]): Promise<Map<string, BatchMetaRow>> {
  const out = new Map<string, BatchMetaRow>();
  for (let i = 0; i < batchIds.length; i += ID_QUERY_CHUNK_SIZE) {
    const slice = batchIds.slice(i, i + ID_QUERY_CHUNK_SIZE);
    const { results } = await db
      .prepare("SELECT * FROM trade_import_batch WHERE batch_id IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify(slice))
      .all<BatchMetaRow>();
    for (const r of results) out.set(r.batch_id, r);
  }
  return out;
}

const FACT_BATCH_QUERY_CHUNK = 24;
const FACT_PAGE_ROW_LIMIT = 25_000;

async function queryFactComboSumsByBatchIds(
  db: D1Database,
  batchIds: readonly string[],
): Promise<Map<string, Map<string, bigint>>> {
  const byMonth = new Map<string, Map<string, bigint>>();
  for (let i = 0; i < batchIds.length; i += 64) {
    const slice = batchIds.slice(i, i + 64);
    const { results } = await db
      .prepare(
        `SELECT month, flow, grouping, hs8, CAST(SUM(usd_scaled) AS TEXT) AS sum_scaled_str
         FROM trade_fact
         WHERE batch_id IN (SELECT value FROM json_each(?1))
         GROUP BY month, flow, grouping, hs8`,
      )
      .bind(JSON.stringify(slice))
      .all<{ month: string; flow: TradeFlow; grouping: TradeGrouping; hs8: string; sum_scaled_str: string }>();
    for (let k = 0; k < results.length; k++) {
      const r = results[k]!;
      let mMap = byMonth.get(r.month);
      if (!mMap) {
        mMap = new Map<string, bigint>();
        byMonth.set(r.month, mMap);
      }
      const key = `${r.flow}|${r.grouping}|${r.hs8}`;
      mMap.set(key, (mMap.get(key) ?? 0n) + BigInt(r.sum_scaled_str));
    }
  }
  return byMonth;
}

type ProductMonthSumRow = {
  month: string;
  flow: TradeFlow;
  hs8: string;
  sum_scaled_str: string;
};

async function queryAnnualProductSumsByBatchIds(
  db: D1Database,
  productBatchIds: readonly string[],
): Promise<Map<string, ProductMonthSumRow[]>> {
  const byMonth = new Map<string, ProductMonthSumRow[]>();
  for (let i = 0; i < productBatchIds.length; i += 64) {
    const slice = productBatchIds.slice(i, i + 64);
    const { results } = await db
      .prepare(
        `SELECT month, flow, hs8, CAST(SUM(usd_scaled) AS TEXT) AS sum_scaled_str
         FROM trade_fact
         WHERE batch_id IN (SELECT value FROM json_each(?1))
           AND grouping = 'product'
         GROUP BY month, flow, hs8`,
      )
      .bind(JSON.stringify(slice))
      .all<ProductMonthSumRow>();
    for (let k = 0; k < results.length; k++) {
      const r = results[k]!;
      let list = byMonth.get(r.month);
      if (!list) {
        list = [];
        byMonth.set(r.month, list);
      }
      list.push(r);
    }
  }
  return byMonth;
}

async function queryFactsByBatchIdsFiltered(
  db: D1Database,
  batchIds: readonly string[],
  mode: "all" | "product" | "detail",
): Promise<FactDbRow[]> {
  const out: FactDbRow[] = [];
  const groupingClause =
    mode === "product"
      ? "AND grouping = 'product'"
      : mode === "detail"
        ? "AND grouping != 'product'"
        : "";
  for (let i = 0; i < batchIds.length; i += FACT_BATCH_QUERY_CHUNK) {
    const slice = batchIds.slice(i, i + FACT_BATCH_QUERY_CHUNK);
    const sliceJson = JSON.stringify(slice);
    let offset = 0;
    while (true) {
      const { results } = await db
        .prepare(
          `SELECT batch_id, month, flow, grouping, hs8, item_name, group_code, group_name,
                  CAST(usd_scaled AS TEXT) AS usd_scaled_str, qty1, unit1, qty2, unit2
           FROM trade_fact
           WHERE batch_id IN (SELECT value FROM json_each(?1))
             ${groupingClause}
           ORDER BY rowid ASC
           LIMIT ?2 OFFSET ?3`,
        )
        .bind(sliceJson, FACT_PAGE_ROW_LIMIT, offset)
        .all<FactDbRow>();
      for (let k = 0; k < results.length; k++) {
        out.push(results[k]!);
      }
      if (results.length < FACT_PAGE_ROW_LIMIT) {
        break;
      }
      offset += FACT_PAGE_ROW_LIMIT;
    }
  }
  return out;
}

/**
 * 内存受控的多期间快照构造器：
 * 1) 跨年趋势 annualTrend 在 D1 中仅按 grouping='product' 聚合 (month, flow, hs8)，绝不拉取非目标年份明细；
 * 2) 受影响期间按自然年分片构建：每年仅加载该年及上年 product 行与该年目标月份的 partner/regime/region 明细，
 *    完成当年快照后立即释放明细引用，避免单月修订或 5 年大批量发布时全量明细同时驻留堆内存。
 */
async function buildSnapshotsForTargetPeriods(
  db: D1Database,
  ctx: {
    dictVersion: string;
    releaseId: string;
    availablePeriods: string[];
    publishedMonths: string[];
    publishedMonthSet: ReadonlySet<string>;
    activeBatchesByMonth: ReadonlyMap<string, string[]>;
    targetPeriods: string[];
    dictCache: Map<number, DictItemRow[]>;
    getDict: (year: number) => Promise<DictItemRow[]>;
  },
): Promise<{
  annualTrend: TradeAnnualTrendPoint[];
  snapshotsToWrite: Array<{ period: string; payload: TradeOverviewPublished }>;
  derivedObsRows: DerivedObsPayloadRow[];
}> {
  const allPublishedBatchIds: string[] = [];
  for (const m of ctx.publishedMonths) {
    for (const bid of ctx.activeBatchesByMonth.get(m) ?? []) {
      allPublishedBatchIds.push(bid);
    }
  }
  const batchMetaMap = await queryBatchesByIds(db, allPublishedBatchIds);

  const productBatchIdsByMonth = new Map<string, string[]>();
  const detailBatchIdsByMonth = new Map<string, string[]>();
  const allProductBatchIds: string[] = [];
  for (const m of ctx.publishedMonths) {
    const pIds: string[] = [];
    const dIds: string[] = [];
    for (const bid of ctx.activeBatchesByMonth.get(m) ?? []) {
      const meta = batchMetaMap.get(bid);
      if (meta?.grouping === "product") {
        pIds.push(bid);
        allProductBatchIds.push(bid);
      } else {
        dIds.push(bid);
      }
    }
    productBatchIdsByMonth.set(m, pIds);
    detailBatchIdsByMonth.set(m, dIds);
  }

  for (const m of ctx.publishedMonths) {
    const yr = Number(m.slice(0, 4));
    await ctx.getDict(yr);
    await ctx.getDict(yr - 1);
  }

  const productSumsByMonth = await queryAnnualProductSumsByBatchIds(db, allProductBatchIds);
  const annualTrend = buildAnnualTrend({
    publishedMonthSet: ctx.publishedMonthSet,
    productSumsByMonth,
    dictByYear: ctx.dictCache,
  });

  const periodsByYear = new Map<number, string[]>();
  for (const tp of ctx.targetPeriods) {
    const parsed = parseTradePeriod(tp)!;
    const list = periodsByYear.get(parsed.year) ?? [];
    list.push(tp);
    periodsByYear.set(parsed.year, list);
  }

  const snapshotsToWrite: Array<{ period: string; payload: TradeOverviewPublished }> = [];
  const derivedObsRows: DerivedObsPayloadRow[] = [];

  for (const [year, yearPeriods] of [...periodsByYear.entries()].sort((a, b) => a[0] - b[0])) {
    const yearDetailMonths = new Set<string>();
    const yearProductMonths = new Set<string>();

    for (const tp of yearPeriods) {
      const parsed = parseTradePeriod(tp)!;
      for (const m of parsed.months) {
        yearDetailMonths.add(m);
        yearProductMonths.add(m);
      }
      const prior = parseTradePeriod(parsed.priorPeriod)!;
      if (prior.months.every((m) => ctx.publishedMonthSet.has(m))) {
        for (const m of prior.months) yearProductMonths.add(m);
      }
    }
    for (let mm = 1; mm <= 12; mm++) {
      const mStr = `${year}-${String(mm).padStart(2, "0")}`;
      if (ctx.publishedMonthSet.has(mStr)) {
        yearProductMonths.add(mStr);
        const priorMStr = `${year - 1}-${String(mm).padStart(2, "0")}`;
        if (ctx.publishedMonthSet.has(priorMStr)) yearProductMonths.add(priorMStr);
      }
    }

    const yearProductBatchIds: string[] = [];
    for (const m of yearProductMonths) {
      for (const bid of productBatchIdsByMonth.get(m) ?? []) {
        yearProductBatchIds.push(bid);
      }
    }
    const yearDetailBatchIds: string[] = [];
    for (const m of yearDetailMonths) {
      for (const bid of detailBatchIdsByMonth.get(m) ?? []) {
        yearDetailBatchIds.push(bid);
      }
    }

    const productRows = await queryFactsByBatchIdsFiltered(db, yearProductBatchIds, "product");
    const productFactsByMonth = new Map<string, FactDbRow[]>();
    for (let i = 0; i < productRows.length; i++) {
      const f = productRows[i]!;
      let list = productFactsByMonth.get(f.month);
      if (!list) {
        list = [];
        productFactsByMonth.set(f.month, list);
      }
      list.push(f);
    }

    const detailRows = await queryFactsByBatchIdsFiltered(db, yearDetailBatchIds, "detail");
    const detailFactsByMonth = new Map<string, FactDbRow[]>();
    for (let i = 0; i < detailRows.length; i++) {
      const f = detailRows[i]!;
      let list = detailFactsByMonth.get(f.month);
      if (!list) {
        list = [];
        detailFactsByMonth.set(f.month, list);
      }
      list.push(f);
    }

    const yDict = await ctx.getDict(year);
    const prevYDict = await ctx.getDict(year - 1);
    for (const tp of yearPeriods) {
      const payload = buildPeriodSnapshot({
        dictVersion: ctx.dictVersion,
        period: tp,
        releaseId: ctx.releaseId,
        availablePeriods: ctx.availablePeriods,
        annualTrend,
        publishedMonthSet: ctx.publishedMonthSet,
        activeBatchesByMonth: ctx.activeBatchesByMonth,
        batchMetaMap,
        productFactsByMonth,
        detailFactsByMonth,
        yearDict: yDict,
        priorYearDict: prevYDict,
      });
      snapshotsToWrite.push({ period: tp, payload });
      for (const obsRow of buildDerivedObservations(payload)) {
        derivedObsRows.push(obsRow);
      }
    }

    detailFactsByMonth.clear();
    productFactsByMonth.clear();
  }

  return { annualTrend, snapshotsToWrite, derivedObsRows };
}

function isTradeReleaseCasConflict(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return (
    msg.includes("UNIQUE constraint failed: trade_release") ||
    msg.includes("trade_release_dict_seq_uq")
  );
}

async function evaluateAndPublishMonth(
  db: D1Database,
  dictVersion: string,
  month: string,
  opts?: { failBeforePublishCommit?: boolean; preemptReleaseOnce?: boolean },
): Promise<{ published: boolean; releaseId: string | null; reconciliationNote: string | null }> {
  return withDictPublishLock(dictVersion, async () => {
    let didPreempt = false;
    for (let attempt = 0; attempt < MAX_PUBLISH_CAS_RETRIES; attempt++) {
      try {
        return await attemptPublishMonthOnce(db, dictVersion, month, {
          failBeforePublishCommit: opts?.failBeforePublishCommit,
          injectPreemptNow: Boolean(opts?.preemptReleaseOnce && !didPreempt),
          onPreemptInjected: () => {
            didPreempt = true;
          },
        });
      } catch (err) {
        if (isTradeReleaseCasConflict(err) && attempt + 1 < MAX_PUBLISH_CAS_RETRIES) {
          continue;
        }
        throw err;
      }
    }
    throw new AppError(500, "INTERNAL_ERROR");
  });
}

async function attemptPublishMonthOnce(
  db: D1Database,
  dictVersion: string,
  month: string,
  opts?: {
    failBeforePublishCommit?: boolean;
    injectPreemptNow?: boolean;
    onPreemptInjected?: () => void;
  },
): Promise<{ published: boolean; releaseId: string | null; reconciliationNote: string | null }> {
  const year = Number(month.slice(0, 4));
  const dictItems = await loadDictForYear(db, dictVersion, year);
  const applicableSet = new Set(dictItems.filter((d) => d.applicable === 1).map((d) => d.hs8));

  const currentMonthSnap = await db
    .prepare("SELECT release_id FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2")
    .bind(dictVersion, month)
    .first<{ release_id: string }>();

  if (applicableSet.size === 0) {
    return { published: false, releaseId: currentMonthSnap?.release_id ?? null, reconciliationNote: null };
  }

  const { results: candidateBatches } = await db
    .prepare(
      `SELECT * FROM trade_import_batch
       WHERE dict_version = ?1 AND month = ?2 AND superseded_by IS NULL AND publish_state IN ('staged', 'published')
       ORDER BY flow ASC, grouping ASC, scope_key ASC`,
    )
    .bind(dictVersion, month)
    .all<BatchMetaRow>();

  // 核查 2 个流向 × 4 个分组均无缺采、无重复重叠覆盖且完整覆盖全部适用 HS8
  const duplicateConflicts: string[] = [];
  for (const flow of TRADE_FLOWS) {
    for (const grouping of TRADE_GROUPINGS) {
      const covered = new Set<string>();
      const matching = candidateBatches.filter((b) => b.flow === flow && b.grouping === grouping);
      for (const b of matching) {
        const missing = JSON.parse(b.missing_hs8_json) as string[];
        if (missing.length > 0) {
          return { published: false, releaseId: currentMonthSnap?.release_id ?? null, reconciliationNote: null };
        }
        for (const c of JSON.parse(b.received_hs8_json) as string[]) {
          if (covered.has(c)) duplicateConflicts.push(`${flow}/${grouping}/${c}`);
          covered.add(c);
        }
        for (const c of JSON.parse(b.confirmed_empty_hs8_json) as string[]) {
          if (covered.has(c)) duplicateConflicts.push(`${flow}/${grouping}/${c}`);
          covered.add(c);
        }
      }
      if (duplicateConflicts.length > 0) {
        return {
          published: false,
          releaseId: currentMonthSnap?.release_id ?? null,
          reconciliationNote: `duplicate_active_hs8_coverage: ${[...new Set(duplicateConflicts)].join(", ")}`,
        };
      }
      for (const reqHs8 of applicableSet) {
        if (!covered.has(reqHs8)) {
          return { published: false, releaseId: currentMonthSnap?.release_id ?? null, reconciliationNote: null };
        }
      }
    }
  }

  // 在 D1 中按 (month, flow, grouping, hs8) SQL 聚合对账，避免全量拉取当月明细进 Worker 堆内存
  const candidateIds = candidateBatches.map((b) => b.batch_id);
  const comboSumsByMonth = await queryFactComboSumsByBatchIds(db, candidateIds);
  const sumByCombo = comboSumsByMonth.get(month) ?? new Map<string, bigint>();

  const now = new Date().toISOString();
  const reconStmts: D1PreparedStatement[] = [];
  const discrepancies: string[] = [];

  for (const flow of TRADE_FLOWS) {
    for (const hs8 of applicableSet) {
      const prodVal = sumByCombo.get(`${flow}|product|${hs8}`) ?? 0n;
      for (const g of ["partner", "regime", "region"] as const) {
        const grpVal = sumByCombo.get(`${flow}|${g}|${hs8}`) ?? 0n;
        const diff = grpVal - prodVal;
        const status = diff === 0n ? "matched" : "pending_review";
        if (diff !== 0n) {
          discrepancies.push(`${flow}/${g}/${hs8}: diff=${scaledToUsdNumber(diff)}`);
        }
        reconStmts.push(
          db
            .prepare(
              `INSERT INTO trade_reconciliation_log (
                 dict_version, month, flow, hs8, grouping, product_usd_scaled, group_usd_scaled, diff_usd_scaled, status, checked_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, CAST(?6 AS INTEGER), CAST(?7 AS INTEGER), CAST(?8 AS INTEGER), ?9, ?10)
               ON CONFLICT(dict_version, month, flow, hs8, grouping) DO UPDATE SET
                 product_usd_scaled = excluded.product_usd_scaled,
                 group_usd_scaled = excluded.group_usd_scaled,
                 diff_usd_scaled = excluded.diff_usd_scaled,
                 status = excluded.status,
                 checked_at = excluded.checked_at`,
            )
            .bind(dictVersion, month, flow, hs8, g, prodVal.toString(), grpVal.toString(), diff.toString(), status, now),
        );
      }
    }
  }

  if (discrepancies.length > 0) {
    await db.batch(reconStmts);
    return {
      published: false,
      releaseId: currentMonthSnap?.release_id ?? null,
      reconciliationNote: discrepancies.join("; "),
    };
  }

  if (opts?.failBeforePublishCommit) {
    throw new Error("simulated failure before trade publication commit");
  }

  // 汇总所有已发布月份 + 当前就绪月份，读取当前字典最新 version_seq 作为 CAS 前提
  const prevRelease = await db
    .prepare(
      `SELECT release_id, COALESCE(version_seq, 0) AS version_seq, published_months_json, available_periods_json
       FROM trade_release
       WHERE dict_version = ?1
       ORDER BY version_seq DESC, rowid DESC
       LIMIT 1`,
    )
    .bind(dictVersion)
    .first<{
      release_id: string;
      version_seq: number;
      published_months_json: string;
      available_periods_json: string;
    }>();
  const nextVersionSeq = (prevRelease?.version_seq ?? 0) + 1;

  const { results: activeScopeRows } = await db
    .prepare("SELECT * FROM trade_active_scope WHERE dict_version = ?1")
    .bind(dictVersion)
    .all<{ scope_key: string; month: string; flow: TradeFlow; grouping: TradeGrouping; batch_id: string }>();

  const activeBatchesByMonth = new Map<string, string[]>();
  for (const r of activeScopeRows) {
    if (r.month === month) continue;
    const arr = activeBatchesByMonth.get(r.month) ?? [];
    arr.push(r.batch_id);
    activeBatchesByMonth.set(r.month, arr);
  }
  activeBatchesByMonth.set(month, candidateIds);

  const publishedMonths = [...activeBatchesByMonth.keys()].sort();
  const publishedMonthSet = new Set(publishedMonths);
  const availablePeriods = computeAllAvailablePeriods(publishedMonthSet);
  const latestMonth = publishedMonths[publishedMonths.length - 1];

  const targetPeriods = computeAffectedPeriods(month, publishedMonthSet, availablePeriods);
  const releaseId = crypto.randomUUID();
  const triggerBatchId = candidateBatches[candidateBatches.length - 1]?.batch_id ?? candidateIds[0];

  const dictCache = new Map<number, DictItemRow[]>();
  const getDict = async (y: number) => {
    if (!dictCache.has(y)) {
      dictCache.set(y, await loadDictForYear(db, dictVersion, y));
    }
    return dictCache.get(y)!;
  };

  const { annualTrend, snapshotsToWrite, derivedObsRows } = await buildSnapshotsForTargetPeriods(db, {
    dictVersion,
    releaseId,
    availablePeriods,
    publishedMonths,
    publishedMonthSet,
    activeBatchesByMonth,
    targetPeriods,
    dictCache,
    getDict,
  });

  // 测试钩子：模拟跨 Worker 实例在快照计算完毕后、事务提交前抢先提交了同 version_seq
  if (opts?.injectPreemptNow) {
    opts.onPreemptInjected?.();
    await db
      .prepare(
        `INSERT INTO trade_release (release_id, dict_version, prev_release_id, version_seq, published_months_json, available_periods_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        crypto.randomUUID(),
        dictVersion,
        prevRelease?.release_id ?? null,
        nextVersionSeq,
        prevRelease?.published_months_json ?? "[]",
        prevRelease?.available_periods_json ?? "[]",
        now,
      )
      .run();
  }

  // 组装发布头语句（首条 trade_release 利用 UNIQUE(dict_version, version_seq) 做 CAS 乐观锁保护）
  const headerStmts: D1PreparedStatement[] = [
    ...reconStmts,
    db
      .prepare(
        `INSERT INTO trade_release (release_id, dict_version, prev_release_id, version_seq, published_months_json, available_periods_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        releaseId,
        dictVersion,
        prevRelease?.release_id ?? null,
        nextVersionSeq,
        JSON.stringify(publishedMonths),
        JSON.stringify(availablePeriods),
        now,
      ),
    db
      .prepare("DELETE FROM trade_active_scope WHERE dict_version = ?1 AND month = ?2")
      .bind(dictVersion, month),
  ];

  for (let i = 0; i < candidateBatches.length; i += ID_QUERY_CHUNK_SIZE) {
    const scopeChunk = candidateBatches.slice(i, i + ID_QUERY_CHUNK_SIZE).map((b) => ({
      scopeKey: b.scope_key,
      flow: b.flow,
      grouping: b.grouping,
      batchId: b.batch_id,
    }));
    const idChunk = scopeChunk.map((s) => s.batchId);
    headerStmts.push(
      db
        .prepare(
          `INSERT INTO trade_active_scope (scope_key, dict_version, month, flow, grouping, batch_id, release_id, updated_at)
           SELECT
             json_extract(value, '$.scopeKey'),
             ?1,
             ?2,
             json_extract(value, '$.flow'),
             json_extract(value, '$.grouping'),
             json_extract(value, '$.batchId'),
             ?3,
             ?4
           FROM json_each(?5)`,
        )
        .bind(dictVersion, month, releaseId, now, JSON.stringify(scopeChunk)),
      db
        .prepare(
          "UPDATE trade_import_batch SET publish_state = 'published' WHERE batch_id IN (SELECT value FROM json_each(?1))",
        )
        .bind(JSON.stringify(idChunk)),
    );
  }

  await commitPublishReleaseAtomically(db, {
    dictVersion,
    releaseId,
    latestMonth,
    availablePeriods,
    annualTrend,
    triggerBatchId,
    now,
    headerStmts,
    snapshotsToWrite,
    derivedObsRows,
  });

  return { published: true, releaseId, reconciliationNote: null };
}

function computeAllAvailablePeriods(publishedMonthSet: ReadonlySet<string>): string[] {
  const years = new Set<number>();
  for (const m of publishedMonthSet) years.add(Number(m.slice(0, 4)));
  const out: string[] = [];
  for (const y of [...years].sort((a, b) => a - b)) {
    for (let mm = 1; mm <= 12; mm++) {
      const mStr = `${y}-${String(mm).padStart(2, "0")}`;
      if (publishedMonthSet.has(mStr)) out.push(mStr);
    }
    for (let q = 1; q <= 4; q++) {
      const qStr = `${y}-Q${q}`;
      if (parseTradePeriod(qStr)!.months.every((m) => publishedMonthSet.has(m))) out.push(qStr);
    }
    for (let mm = 1; mm <= 12; mm++) {
      const ytdStr = `${y}-YTD-${String(mm).padStart(2, "0")}`;
      if (parseTradePeriod(ytdStr)!.months.every((m) => publishedMonthSet.has(m))) out.push(ytdStr);
    }
    if (parseTradePeriod(String(y))!.months.every((m) => publishedMonthSet.has(m))) {
      out.push(String(y));
    }
  }
  return out;
}

function snapshotReferencesMonth(
  period: string,
  targetMonth: string,
  publishedMonthSet: ReadonlySet<string>,
): boolean {
  const parsed = parseTradePeriod(period);
  if (!parsed) return false;
  if (parsed.months.includes(targetMonth)) return true;

  const priorParsed = parseTradePeriod(parsed.priorPeriod);
  if (
    priorParsed &&
    priorParsed.months.every((m) => publishedMonthSet.has(m)) &&
    priorParsed.months.includes(targetMonth)
  ) {
    return true;
  }

  const trendMonths =
    parsed.kind === "month"
      ? Array.from({ length: Number(parsed.period.slice(5, 7)) }, (_, i) =>
          `${parsed.year}-${String(i + 1).padStart(2, "0")}`,
        ).filter((m) => publishedMonthSet.has(m))
      : parsed.months;

  if (trendMonths.includes(targetMonth)) return true;

  for (const tm of trendMonths) {
    const priorTrendMonth = `${Number(tm.slice(0, 4)) - 1}-${tm.slice(5, 7)}`;
    if (priorTrendMonth === targetMonth && publishedMonthSet.has(priorTrendMonth)) {
      return true;
    }
  }

  return false;
}

function computeAffectedPeriods(
  changedMonth: string,
  publishedMonthSet: ReadonlySet<string>,
  availablePeriods = computeAllAvailablePeriods(publishedMonthSet),
): string[] {
  const candidates = new Set<string>([changedMonth]);
  for (const p of availablePeriods) {
    if (snapshotReferencesMonth(p, changedMonth, publishedMonthSet)) {
      candidates.add(p);
    }
  }
  return [...candidates].sort();
}

type QtyAccumulator = {
  hasValue: boolean;
  hasMissing: boolean;
  mixed: boolean;
  unit: string | null;
  sum: number;
};

function createQtyAcc(): QtyAccumulator {
  return { hasValue: false, hasMissing: false, mixed: false, unit: null, sum: 0 };
}

function addQty(acc: QtyAccumulator, val: number | null, unit: string | null) {
  if (val === null) {
    acc.hasMissing = true;
    return;
  }
  const normUnit = unit?.trim() ?? "";
  if (!normUnit) {
    acc.hasMissing = true;
  }
  if (!acc.hasValue) {
    acc.hasValue = true;
    acc.unit = normUnit || null;
    acc.sum = val;
    return;
  }
  if ((acc.unit ?? "") !== normUnit) {
    acc.mixed = true;
    return;
  }
  acc.sum += val;
}

function finalizeQty(acc: QtyAccumulator): TradeQuantityStat {
  if (!acc.hasValue) return { value: null, unit: null };
  if (acc.mixed) return { value: null, unit: "MIXED" };
  if (acc.hasMissing) return { value: null, unit: acc.unit };
  return { value: roundMetric(acc.sum, 4), unit: acc.unit };
}

function computeSameUnitQtyYoyPct(
  curr: TradeQuantityStat,
  prior: TradeQuantityStat | undefined,
  opts?: { currHasMissing?: boolean; priorHasMissing?: boolean },
): number | null {
  if (opts?.currHasMissing || opts?.priorHasMissing) return null;
  if (!prior || curr.value === null || prior.value === null || prior.value <= 0) return null;
  if (!curr.unit || !prior.unit || curr.unit === "MIXED" || prior.unit === "MIXED" || curr.unit !== prior.unit) {
    return null;
  }
  return roundMetric(((curr.value - prior.value) / prior.value) * 100, 4);
}

function buildAnnualTrend(opts: {
  publishedMonthSet: ReadonlySet<string>;
  productSumsByMonth: ReadonlyMap<string, ProductMonthSumRow[]>;
  dictByYear: ReadonlyMap<number, DictItemRow[]>;
}): TradeAnnualTrendPoint[] {
  const years = [...new Set([...opts.publishedMonthSet].map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b);
  const out: TradeAnnualTrendPoint[] = [];

  for (const yr of years) {
    const yrMonths: string[] = [];
    for (let mm = 1; mm <= 12; mm++) {
      const mStr = `${yr}-${String(mm).padStart(2, "0")}`;
      if (opts.publishedMonthSet.has(mStr)) yrMonths.push(mStr);
    }
    if (yrMonths.length === 0) continue;

    const isFullYear = yrMonths.length === 12;
    const isContiguousFromJan = yrMonths.every((m, idx) => Number(m.slice(5, 7)) === idx + 1);
    const periodLabel = isFullYear
      ? String(yr)
      : isContiguousFromJan
        ? `${yr}-YTD-${String(yrMonths.length).padStart(2, "0")}`
        : yrMonths.length === 1
          ? yrMonths[0]
          : `${yr} (${yrMonths.length}M)`;

    const yrDict = opts.dictByYear.get(yr) ?? [];
    const prevYrDict = opts.dictByYear.get(yr - 1) ?? [];
    const yrApplicableSet = new Set(yrDict.filter((d) => d.applicable === 1).map((d) => d.hs8));
    const prevApplicableSet = new Set(prevYrDict.filter((d) => d.applicable === 1).map((d) => d.hs8));
    const compSet = new Set([...yrApplicableSet].filter((c) => prevApplicableSet.has(c)));

    let impScaled = 0n;
    let expScaled = 0n;
    let compImpScaled = 0n;
    let compExpScaled = 0n;

    for (const m of yrMonths) {
      for (const f of opts.productSumsByMonth.get(m) ?? []) {
        if (!yrApplicableSet.has(f.hs8)) continue;
        const val = BigInt(f.sum_scaled_str);
        if (f.flow === "import") {
          impScaled += val;
          if (compSet.has(f.hs8)) compImpScaled += val;
        } else {
          expScaled += val;
          if (compSet.has(f.hs8)) compExpScaled += val;
        }
      }
    }

    const priorMonths = yrMonths.map((m) => `${yr - 1}-${m.slice(5, 7)}`);
    let pImpScaled: bigint | null = null;
    let pExpScaled: bigint | null = null;
    if (priorMonths.every((pm) => opts.publishedMonthSet.has(pm)) && compSet.size > 0) {
      pImpScaled = 0n;
      pExpScaled = 0n;
      for (const pm of priorMonths) {
        for (const pf of opts.productSumsByMonth.get(pm) ?? []) {
          if (!compSet.has(pf.hs8)) continue;
          const val = BigInt(pf.sum_scaled_str);
          if (pf.flow === "import") pImpScaled += val;
          else pExpScaled += val;
        }
      }
    }

    const totScaled = impScaled + expScaled;
    const compTotScaled = compImpScaled + compExpScaled;
    const pTotScaled = pImpScaled !== null && pExpScaled !== null ? pImpScaled + pExpScaled : null;

    out.push({
      period: periodLabel,
      year: yr,
      coveredMonths: yrMonths.length,
      importUsd: scaledToUsdNumber(impScaled),
      exportUsd: scaledToUsdNumber(expScaled),
      totalUsd: scaledToUsdNumber(totScaled),
      balanceUsd: scaledToUsdNumber(expScaled - impScaled),
      importYoyPct: computeYoyPct(compImpScaled, pImpScaled),
      exportYoyPct: computeYoyPct(compExpScaled, pExpScaled),
      totalYoyPct: computeYoyPct(compTotScaled, pTotScaled),
      isPartial: !isFullYear,
    });
  }

  return out;
}

function buildPeriodSnapshot(ctx: {
  dictVersion: string;
  period: string;
  releaseId: string;
  availablePeriods: string[];
  annualTrend: TradeAnnualTrendPoint[];
  publishedMonthSet: ReadonlySet<string>;
  activeBatchesByMonth: ReadonlyMap<string, string[]>;
  batchMetaMap: ReadonlyMap<string, BatchMetaRow>;
  productFactsByMonth: ReadonlyMap<string, FactDbRow[]>;
  detailFactsByMonth: ReadonlyMap<string, FactDbRow[]>;
  yearDict: DictItemRow[];
  priorYearDict: DictItemRow[];
}): TradeOverviewPublished {
  const parsed = parseTradePeriod(ctx.period)!;
  const applicableItems = ctx.yearDict.filter((d) => d.applicable === 1);
  const notApplicableCount = ctx.yearDict.filter((d) => d.applicable !== 1).length;
  const hsMetaMap = new Map(applicableItems.map((d) => [d.hs8, d]));

  const priorApplicableSet = new Set(ctx.priorYearDict.filter((d) => d.applicable === 1).map((d) => d.hs8));
  const comparableHs8Set = new Set(applicableItems.map((d) => d.hs8).filter((c) => priorApplicableSet.has(c)));

  const sourceBatches: TradeSourceBatchRef[] = [];
  for (const m of parsed.months) {
    const bids = ctx.activeBatchesByMonth.get(m) ?? [];
    for (const bid of bids) {
      const b = ctx.batchMetaMap.get(bid);
      if (!b) continue;
      sourceBatches.push({
        batchId: b.batch_id,
        month: b.month,
        flow: b.flow,
        grouping: b.grouping,
        filename: b.filename,
        sourceSha256: b.source_sha256,
        evidenceSha256s: JSON.parse(b.evidence_sha256s_json) as string[],
        rowCount: b.row_count,
      });
    }
  }
  sourceBatches.sort((a, b) =>
    `${a.month}|${a.flow}|${a.grouping}|${a.batchId}`.localeCompare(`${b.month}|${b.flow}|${b.grouping}|${b.batchId}`),
  );

  // 按 HS8 聚合全国金额、双数量及伙伴分布
  const hsProductImp = new Map<string, bigint>();
  const hsProductExp = new Map<string, bigint>();
  const hsQty = new Map<string, { imp1: QtyAccumulator; imp2: QtyAccumulator; exp1: QtyAccumulator; exp2: QtyAccumulator }>();
  for (const item of applicableItems) {
    hsQty.set(item.hs8, {
      imp1: createQtyAcc(),
      imp2: createQtyAcc(),
      exp1: createQtyAcc(),
      exp2: createQtyAcc(),
    });
  }

  const partnerMap = new Map<
    string,
    { name: string; imp: bigint; exp: bigint; byCat: Map<string, bigint> }
  >();
  const hsPartnerImp = new Map<string, Map<string, { name: string; usd: bigint }>>();
  const hsPartnerExp = new Map<string, Map<string, { name: string; usd: bigint }>>();
  const catPartnerImp = new Map<string, Map<string, { name: string; usd: bigint }>>();
  const catPartnerExp = new Map<string, Map<string, { name: string; usd: bigint }>>();

  const regimeMap = new Map<string, { name: string; imp: bigint; exp: bigint }>();
  const regionMap = new Map<string, { name: string; imp: bigint; exp: bigint }>();

  for (const m of parsed.months) {
    for (const f of ctx.productFactsByMonth.get(m) ?? []) {
      const meta = hsMetaMap.get(f.hs8);
      if (!meta || f.grouping !== "product") continue;
      const val = BigInt(f.usd_scaled_str);
      const q = hsQty.get(f.hs8)!;
      if (f.flow === "import") {
        hsProductImp.set(f.hs8, (hsProductImp.get(f.hs8) ?? 0n) + val);
        addQty(q.imp1, f.qty1, f.unit1);
        addQty(q.imp2, f.qty2, f.unit2);
      } else {
        hsProductExp.set(f.hs8, (hsProductExp.get(f.hs8) ?? 0n) + val);
        addQty(q.exp1, f.qty1, f.unit1);
        addQty(q.exp2, f.qty2, f.unit2);
      }
    }

    for (const f of ctx.detailFactsByMonth.get(m) ?? []) {
      const meta = hsMetaMap.get(f.hs8);
      if (!meta) continue;
      const val = BigInt(f.usd_scaled_str);

      if (f.grouping === "partner") {
        let pEntry = partnerMap.get(f.group_code);
        if (!pEntry) {
          pEntry = { name: f.group_name, imp: 0n, exp: 0n, byCat: new Map() };
          partnerMap.set(f.group_code, pEntry);
        }
        pEntry.name = f.group_name || pEntry.name;
        if (f.flow === "import") pEntry.imp += val;
        else pEntry.exp += val;
        pEntry.byCat.set(meta.category_name, (pEntry.byCat.get(meta.category_name) ?? 0n) + val);

        const hsTarget = f.flow === "import" ? hsPartnerImp : hsPartnerExp;
        let hp = hsTarget.get(f.hs8);
        if (!hp) {
          hp = new Map();
          hsTarget.set(f.hs8, hp);
        }
        const prevHp = hp.get(f.group_code);
        hp.set(f.group_code, { name: f.group_name, usd: (prevHp?.usd ?? 0n) + val });

        const catTarget = f.flow === "import" ? catPartnerImp : catPartnerExp;
        let cp = catTarget.get(meta.category_id);
        if (!cp) {
          cp = new Map();
          catTarget.set(meta.category_id, cp);
        }
        const prevCp = cp.get(f.group_code);
        cp.set(f.group_code, { name: f.group_name, usd: (prevCp?.usd ?? 0n) + val });
      } else if (f.grouping === "regime") {
        const prev = regimeMap.get(f.group_code) ?? { name: f.group_name, imp: 0n, exp: 0n };
        prev.name = f.group_name || prev.name;
        if (f.flow === "import") prev.imp += val;
        else prev.exp += val;
        regimeMap.set(f.group_code, prev);
      } else if (f.grouping === "region") {
        const prev = regionMap.get(f.group_code) ?? { name: f.group_name, imp: 0n, exp: 0n };
        prev.name = f.group_name || prev.name;
        if (f.flow === "import") prev.imp += val;
        else prev.exp += val;
        regionMap.set(f.group_code, prev);
      }
    }
  }

  let totalImpScaled = 0n;
  let totalExpScaled = 0n;
  let compCurrImpScaled = 0n;
  let compCurrExpScaled = 0n;
  for (const item of applicableItems) {
    const imp = hsProductImp.get(item.hs8) ?? 0n;
    const exp = hsProductExp.get(item.hs8) ?? 0n;
    totalImpScaled += imp;
    totalExpScaled += exp;
    if (comparableHs8Set.has(item.hs8)) {
      compCurrImpScaled += imp;
      compCurrExpScaled += exp;
    }
  }
  const totalBalanceScaled = totalExpScaled - totalImpScaled;

  // 计算上年同口径同期基期
  const priorParsed = parseTradePeriod(parsed.priorPeriod)!;
  const hasFullPrior = priorParsed.months.every((m) => ctx.publishedMonthSet.has(m));
  let priorCompImpScaled: bigint | null = null;
  let priorCompExpScaled: bigint | null = null;
  const priorCatImp = new Map<string, bigint>();
  const priorCatExp = new Map<string, bigint>();
  const priorHsImp = new Map<string, bigint>();
  const priorHsExp = new Map<string, bigint>();
  const priorHsQty = new Map<string, { imp1: QtyAccumulator; exp1: QtyAccumulator }>();
  let priorTotalImpAllComparableOrDict = 0n;
  let priorTotalExpAllComparableOrDict = 0n;

  if (hasFullPrior) {
    const priorAllApplicableSet = new Set(ctx.priorYearDict.filter((d) => d.applicable === 1).map((d) => d.hs8));
    for (const pm of priorParsed.months) {
      for (const f of ctx.productFactsByMonth.get(pm) ?? []) {
        if (f.grouping !== "product") continue;
        const val = BigInt(f.usd_scaled_str);
        if (priorAllApplicableSet.has(f.hs8)) {
          if (f.flow === "import") priorTotalImpAllComparableOrDict += val;
          else priorTotalExpAllComparableOrDict += val;
        }
        if (!comparableHs8Set.has(f.hs8)) continue;
        const meta = hsMetaMap.get(f.hs8);
        if (!meta) continue;
        if (priorCompImpScaled === null) priorCompImpScaled = 0n;
        if (priorCompExpScaled === null) priorCompExpScaled = 0n;
        let pq = priorHsQty.get(f.hs8);
        if (!pq) {
          pq = { imp1: createQtyAcc(), exp1: createQtyAcc() };
          priorHsQty.set(f.hs8, pq);
        }
        if (f.flow === "import") {
          priorCompImpScaled += val;
          priorCatImp.set(meta.category_id, (priorCatImp.get(meta.category_id) ?? 0n) + val);
          priorHsImp.set(f.hs8, (priorHsImp.get(f.hs8) ?? 0n) + val);
          addQty(pq.imp1, f.qty1, f.unit1);
        } else {
          priorCompExpScaled += val;
          priorCatExp.set(meta.category_id, (priorCatExp.get(meta.category_id) ?? 0n) + val);
          priorHsExp.set(f.hs8, (priorHsExp.get(f.hs8) ?? 0n) + val);
          addQty(pq.exp1, f.qty1, f.unit1);
        }
      }
    }
    if (comparableHs8Set.size > 0) {
      priorCompImpScaled ??= 0n;
      priorCompExpScaled ??= 0n;
    }
  }

  let partnerImpTotalScaled = 0n;
  let partnerExpTotalScaled = 0n;
  for (const v of partnerMap.values()) {
    partnerImpTotalScaled += v.imp;
    partnerExpTotalScaled += v.exp;
  }
  let regimeImpTotalScaled = 0n;
  let regimeExpTotalScaled = 0n;
  for (const v of regimeMap.values()) {
    regimeImpTotalScaled += v.imp;
    regimeExpTotalScaled += v.exp;
  }
  let regionImpTotalScaled = 0n;
  let regionExpTotalScaled = 0n;
  for (const v of regionMap.values()) {
    regionImpTotalScaled += v.imp;
    regionExpTotalScaled += v.exp;
  }

  const basketImpPartners = [...partnerMap.entries()].map(([partnerCode, v]) => ({
    partnerCode,
    usdScaled: v.imp,
  }));
  const basketExpPartners = [...partnerMap.entries()].map(([partnerCode, v]) => ({
    partnerCode,
    usdScaled: v.exp,
  }));

  const concentration = {
    import: computeConcentration(basketImpPartners, totalImpScaled),
    export: computeConcentration(basketExpPartners, totalExpScaled),
  };

  const topPartnerNames = (m: Map<string, { name: string; usd: bigint }> | undefined): string[] => {
    if (!m) return [];
    return [...m.entries()]
      .filter(([, v]) => v.usd > 0n)
      .sort((a, b) => (b[1].usd !== a[1].usd ? (b[1].usd > a[1].usd ? 1 : -1) : a[0].localeCompare(b[0])))
      .slice(0, 3)
      .map(([, v]) => v.name);
  };

  // 汇总 11 个一级类别（或隔离库当前适用类别）
  const catGroups = new Map<string, DictItemRow[]>();
  for (const item of applicableItems) {
    const arr = catGroups.get(item.category_id) ?? [];
    arr.push(item);
    catGroups.set(item.category_id, arr);
  }

  const categories: TradeCategoryStat[] = [];
  for (const [categoryId, items] of catGroups.entries()) {
    const first = items[0];
    let cImp = 0n;
    let cExp = 0n;
    let cCompImp = 0n;
    let cCompExp = 0n;
    for (const it of items) {
      const imp = hsProductImp.get(it.hs8) ?? 0n;
      const exp = hsProductExp.get(it.hs8) ?? 0n;
      cImp += imp;
      cExp += exp;
      if (comparableHs8Set.has(it.hs8)) {
        cCompImp += imp;
        cCompExp += exp;
      }
    }
    const hsPrefixes = [...new Set(items.map((i) => i.hs6.slice(0, 4)))].sort();
    const hsRange = items.length === 1 ? items[0].hs8 : hsPrefixes.join(" / ");

    const cImpMap = catPartnerImp.get(categoryId);
    const cExpMap = catPartnerExp.get(categoryId);

    categories.push({
      categoryId,
      category: first.category_name,
      order: first.category_order,
      hs8Count: items.length,
      hsRange,
      importUsd: scaledToUsdNumber(cImp),
      exportUsd: scaledToUsdNumber(cExp),
      balanceUsd: scaledToUsdNumber(cExp - cImp),
      importYoyPct: hasFullPrior ? computeYoyPct(cCompImp, priorCatImp.get(categoryId) ?? 0n) : null,
      exportYoyPct: hasFullPrior ? computeYoyPct(cCompExp, priorCatExp.get(categoryId) ?? 0n) : null,
      importConcentration: computeConcentration(
        cImpMap ? [...cImpMap.entries()].map(([partnerCode, v]) => ({ partnerCode, usdScaled: v.usd })) : [],
        cImp,
      ),
      exportConcentration: computeConcentration(
        cExpMap ? [...cExpMap.entries()].map(([partnerCode, v]) => ({ partnerCode, usdScaled: v.usd })) : [],
        cExp,
      ),
      topImportPartners: topPartnerNames(cImpMap),
      topExportPartners: topPartnerNames(cExpMap),
    });
  }

  const partners: TradePartnerStat[] = [...partnerMap.entries()]
    .filter(([, v]) => v.imp > 0n || v.exp > 0n)
    .sort((a, b) => {
      const sumA = a[1].imp + a[1].exp;
      const sumB = b[1].imp + b[1].exp;
      if (sumB !== sumA) return sumB > sumA ? 1 : -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([partnerCode, v]) => {
      let topCategory = applicableItems[0]?.category_name ?? "";
      let bestCatVal = -1n;
      for (const [catName, catVal] of v.byCat.entries()) {
        if (catVal > bestCatVal) {
          bestCatVal = catVal;
          topCategory = catName;
        }
      }
      return {
        partnerCode,
        partnerName: v.name,
        importUsd: scaledToUsdNumber(v.imp),
        exportUsd: scaledToUsdNumber(v.exp),
        balanceUsd: scaledToUsdNumber(v.exp - v.imp),
        importSharePct: totalImpScaled > 0n ? roundMetric((Number(v.imp) / Number(totalImpScaled)) * 100, 4) : null,
        exportSharePct: totalExpScaled > 0n ? roundMetric((Number(v.exp) / Number(totalExpScaled)) * 100, 4) : null,
        topCategory,
      };
    });

  const regimes: TradeRegimeStat[] = [...regimeMap.entries()]
    .filter(([, v]) => v.imp > 0n || v.exp > 0n)
    .sort((a, b) => {
      const sumA = a[1].imp + a[1].exp;
      const sumB = b[1].imp + b[1].exp;
      return sumB !== sumA ? (sumB > sumA ? 1 : -1) : a[0].localeCompare(b[0]);
    })
    .map(([regimeCode, v]) => ({
      regimeCode,
      regimeName: v.name,
      importUsd: scaledToUsdNumber(v.imp),
      exportUsd: scaledToUsdNumber(v.exp),
      importSharePct: totalImpScaled > 0n ? roundMetric((Number(v.imp) / Number(totalImpScaled)) * 100, 4) : null,
      exportSharePct: totalExpScaled > 0n ? roundMetric((Number(v.exp) / Number(totalExpScaled)) * 100, 4) : null,
    }));

  const regions: TradeRegionStat[] = [...regionMap.entries()]
    .filter(([, v]) => v.imp > 0n || v.exp > 0n)
    .sort((a, b) => {
      const sumA = a[1].imp + a[1].exp;
      const sumB = b[1].imp + b[1].exp;
      return sumB !== sumA ? (sumB > sumA ? 1 : -1) : a[0].localeCompare(b[0]);
    })
    .map(([regionCode, v]) => ({
      regionCode,
      regionName: v.name,
      importUsd: scaledToUsdNumber(v.imp),
      exportUsd: scaledToUsdNumber(v.exp),
      importSharePct: totalImpScaled > 0n ? roundMetric((Number(v.imp) / Number(totalImpScaled)) * 100, 4) : null,
      exportSharePct: totalExpScaled > 0n ? roundMetric((Number(v.exp) / Number(totalExpScaled)) * 100, 4) : null,
    }));

  const hsItems: TradeHsItemStat[] = applicableItems.map((item) => {
    const imp = hsProductImp.get(item.hs8) ?? 0n;
    const exp = hsProductExp.get(item.hs8) ?? 0n;
    const q = hsQty.get(item.hs8)!;
    const hImpMap = hsPartnerImp.get(item.hs8);
    const hExpMap = hsPartnerExp.get(item.hs8);
    const isComparable = hasFullPrior && comparableHs8Set.has(item.hs8);
    const currImpQty1 = finalizeQty(q.imp1);
    const currExpQty1 = finalizeQty(q.exp1);
    const pq = priorHsQty.get(item.hs8);
    const priorImpQty1 = pq ? finalizeQty(pq.imp1) : undefined;
    const priorExpQty1 = pq ? finalizeQty(pq.exp1) : undefined;
    return {
      hs8: item.hs8,
      hs6: item.hs6,
      itemName: item.item_name,
      category: item.category_name,
      importUsd: scaledToUsdNumber(imp),
      exportUsd: scaledToUsdNumber(exp),
      balanceUsd: scaledToUsdNumber(exp - imp),
      importYoyPct: isComparable ? computeYoyPct(imp, priorHsImp.get(item.hs8) ?? 0n) : null,
      exportYoyPct: isComparable ? computeYoyPct(exp, priorHsExp.get(item.hs8) ?? 0n) : null,
      importQty1: currImpQty1,
      importQty2: finalizeQty(q.imp2),
      importQty1YoyPct: isComparable
        ? computeSameUnitQtyYoyPct(currImpQty1, priorImpQty1, {
            currHasMissing: q.imp1.hasMissing,
            priorHasMissing: pq?.imp1.hasMissing,
          })
        : null,
      exportQty1: currExpQty1,
      exportQty2: finalizeQty(q.exp2),
      exportQty1YoyPct: isComparable
        ? computeSameUnitQtyYoyPct(currExpQty1, priorExpQty1, {
            currHasMissing: q.exp1.hasMissing,
            priorHasMissing: pq?.exp1.hasMissing,
          })
        : null,
      importConcentration: computeConcentration(
        hImpMap ? [...hImpMap.entries()].map(([partnerCode, v]) => ({ partnerCode, usdScaled: v.usd })) : [],
        imp,
      ),
      exportConcentration: computeConcentration(
        hExpMap ? [...hExpMap.entries()].map(([partnerCode, v]) => ({ partnerCode, usdScaled: v.usd })) : [],
        exp,
      ),
      topImportPartners: topPartnerNames(hImpMap),
      topExportPartners: topPartnerNames(hExpMap),
    };
  });

  // 生成趋势序列（月度走势）
  const trendMonths =
    parsed.kind === "month"
      ? Array.from({ length: Number(parsed.period.slice(5, 7)) }, (_, i) =>
          `${parsed.year}-${String(i + 1).padStart(2, "0")}`,
        ).filter((m) => ctx.publishedMonthSet.has(m))
      : parsed.months;

  const trend: TradeTrendPoint[] = trendMonths.map((tm) => {
    let mImp = 0n;
    let mExp = 0n;
    let mCompImp = 0n;
    let mCompExp = 0n;
    for (const f of ctx.productFactsByMonth.get(tm) ?? []) {
      if (f.grouping !== "product" || !hsMetaMap.has(f.hs8)) continue;
      const val = BigInt(f.usd_scaled_str);
      if (f.flow === "import") {
        mImp += val;
        if (comparableHs8Set.has(f.hs8)) mCompImp += val;
      } else {
        mExp += val;
        if (comparableHs8Set.has(f.hs8)) mCompExp += val;
      }
    }
    const priorMonth = `${Number(tm.slice(0, 4)) - 1}-${tm.slice(5, 7)}`;
    let pImp: bigint | null = null;
    let pExp: bigint | null = null;
    if (ctx.publishedMonthSet.has(priorMonth) && comparableHs8Set.size > 0) {
      pImp = 0n;
      pExp = 0n;
      for (const pf of ctx.productFactsByMonth.get(priorMonth) ?? []) {
        if (pf.grouping !== "product" || !comparableHs8Set.has(pf.hs8)) continue;
        const val = BigInt(pf.usd_scaled_str);
        if (pf.flow === "import") pImp += val;
        else pExp += val;
      }
    }
    return {
      period: tm,
      importUsd: scaledToUsdNumber(mImp),
      exportUsd: scaledToUsdNumber(mExp),
      balanceUsd: scaledToUsdNumber(mExp - mImp),
      importYoyPct: computeYoyPct(mCompImp, pImp),
      exportYoyPct: computeYoyPct(mCompExp, pExp),
      isPartial: false,
    };
  });

  const groupingTotals: TradeGroupingTotals = {
    product: {
      importUsd: scaledToUsdNumber(totalImpScaled),
      exportUsd: scaledToUsdNumber(totalExpScaled),
    },
    partner: {
      importUsd: scaledToUsdNumber(partnerImpTotalScaled),
      exportUsd: scaledToUsdNumber(partnerExpTotalScaled),
      count: partners.length,
    },
    regime: {
      importUsd: scaledToUsdNumber(regimeImpTotalScaled),
      exportUsd: scaledToUsdNumber(regimeExpTotalScaled),
      count: regimes.length,
    },
    region: {
      importUsd: scaledToUsdNumber(regionImpTotalScaled),
      exportUsd: scaledToUsdNumber(regionExpTotalScaled),
      count: regions.length,
    },
  };

  const totalScaled = totalImpScaled + totalExpScaled;
  const compCurrTotalScaled = compCurrImpScaled + compCurrExpScaled;
  const priorCompTotalScaled =
    priorCompImpScaled !== null && priorCompExpScaled !== null ? priorCompImpScaled + priorCompExpScaled : null;

  const totals: TradeOverviewPublished["totals"] = {
    importUsd: scaledToUsdNumber(totalImpScaled),
    exportUsd: scaledToUsdNumber(totalExpScaled),
    totalUsd: scaledToUsdNumber(totalScaled),
    balanceUsd: scaledToUsdNumber(totalBalanceScaled),
    importYoyPct: hasFullPrior ? computeYoyPct(compCurrImpScaled, priorCompImpScaled) : null,
    exportYoyPct: hasFullPrior ? computeYoyPct(compCurrExpScaled, priorCompExpScaled) : null,
    totalYoyPct: hasFullPrior ? computeYoyPct(compCurrTotalScaled, priorCompTotalScaled) : null,
  };

  const priorBalanceScaled = hasFullPrior
    ? priorTotalExpAllComparableOrDict - priorTotalImpAllComparableOrDict
    : null;

  const narrativeSummary = buildTradeNarrativeSummary({
    period: ctx.period,
    totals,
    hasFullPrior,
    priorBalanceScaled,
    totalBalanceScaled,
    annualTrend: ctx.annualTrend,
    categories,
    partners,
    regions,
    regimes,
    concentration,
  });

  return {
    status: "published",
    period: ctx.period,
    source: "china_customs",
    dictVersion: ctx.dictVersion,
    releaseId: ctx.releaseId,
    units: TRADE_UNITS,
    availablePeriods: ctx.availablePeriods,
    coverage: {
      months: parsed.months,
      expectedMonths: parsed.months.length,
      coveredMonths: parsed.months.length,
      applicableHs8Count: applicableItems.length,
      coveredHs8Count: applicableItems.length,
      notApplicableHs8Count: notApplicableCount,
    },
    sourceBatches,
    totals,
    groupingTotals,
    concentration,
    trend,
    annualTrend: ctx.annualTrend,
    narrativeSummary,
    categories,
    partners,
    regimes,
    regions,
    hsItems,
  };
}

function buildDerivedObservations(snap: TradeOverviewPublished) {
  const objectRef = `trade_snapshot:${snap.dictVersion}:${snap.period}`;
  const toYiUsd = (usd: number) => roundMetric(usd / 100_000_000, 6);
  const baseDims = {
    source: snap.source,
    dictVersion: snap.dictVersion,
    releaseId: snap.releaseId,
  };

  const out: Array<{
    indicator_id: string;
    period: string;
    geo: string;
    dims: string;
    value_num: number | null;
    value_text: string | null;
    unit: string;
    object_ref: string;
  }> = [
    {
      indicator_id: "TRD-001",
      period: snap.period,
      geo: "CN",
      dims: JSON.stringify({ ...baseDims, trade_type: "import", raw_usd: snap.totals.importUsd }),
      value_num: toYiUsd(snap.totals.importUsd),
      value_text: null,
      unit: "亿美元",
      object_ref: objectRef,
    },
    {
      indicator_id: "TRD-002",
      period: snap.period,
      geo: "CN",
      dims: JSON.stringify({
        ...baseDims,
        trade_type: "export",
        raw_usd: snap.totals.exportUsd,
        balance_usd: snap.totals.balanceUsd,
      }),
      value_num: toYiUsd(snap.totals.exportUsd),
      value_text: null,
      unit: "亿美元",
      object_ref: objectRef,
    },
    {
      indicator_id: "TRD-006",
      period: snap.period,
      geo: "CN",
      dims: JSON.stringify({
        ...baseDims,
        trade_type: "import",
        metric: "CR3",
        cr1: snap.concentration.import.cr1,
        cr3: snap.concentration.import.cr3,
        cr5: snap.concentration.import.cr5,
        hhi: snap.concentration.import.hhi,
      }),
      value_num: snap.concentration.import.cr3,
      value_text: snap.concentration.import.cr3 === null ? "暂无数据" : null,
      unit: "%",
      object_ref: objectRef,
    },
    {
      indicator_id: "TRD-007",
      period: snap.period,
      geo: "CN",
      dims: JSON.stringify({
        ...baseDims,
        trade_type: "export",
        metric: "CR3",
        cr1: snap.concentration.export.cr1,
        cr3: snap.concentration.export.cr3,
        cr5: snap.concentration.export.cr5,
        hhi: snap.concentration.export.hhi,
      }),
      value_num: snap.concentration.export.cr3,
      value_text: snap.concentration.export.cr3 === null ? "暂无数据" : null,
      unit: "%",
      object_ref: objectRef,
    },
  ];

  for (const p of snap.partners.slice(0, 12)) {
    if (p.importUsd > 0) {
      out.push({
        indicator_id: "TRD-005",
        period: snap.period,
        geo: "CN",
        dims: JSON.stringify({
          ...baseDims,
          trade_type: "import",
          partner: p.partnerCode,
          partner_name: p.partnerName,
          share_pct: p.importSharePct,
          raw_usd: p.importUsd,
        }),
        value_num: toYiUsd(p.importUsd),
        value_text: p.partnerName,
        unit: "亿美元",
        object_ref: objectRef,
      });
    }
    if (p.exportUsd > 0) {
      out.push({
        indicator_id: "TRD-005",
        period: snap.period,
        geo: "CN",
        dims: JSON.stringify({
          ...baseDims,
          trade_type: "export",
          partner: p.partnerCode,
          partner_name: p.partnerName,
          share_pct: p.exportSharePct,
          raw_usd: p.exportUsd,
        }),
        value_num: toYiUsd(p.exportUsd),
        value_text: p.partnerName,
        unit: "亿美元",
        object_ref: objectRef,
      });
    }
  }

  return out;
}

export async function getTradeOverview(
  db: D1Database,
  params: { period?: string | null; dictVersion?: string | null; releaseId?: string | null },
): Promise<TradeOverviewResponse> {
  const dictVersion = params.dictVersion?.trim() || DEFAULT_DICT_VERSION;
  const releaseId = params.releaseId?.trim() || null;

  if (releaseId) {
    let targetPeriod: string;
    if (params.period != null && params.period.trim() !== "") {
      const parsed = parseTradePeriod(params.period);
      if (!parsed) {
        throw new AppError(400, "TRADE_PERIOD_INVALID", { period: params.period });
      }
      targetPeriod = parsed.period;
    } else {
      const relRow = await db
        .prepare("SELECT published_months_json FROM trade_release WHERE dict_version = ?1 AND release_id = ?2")
        .bind(dictVersion, releaseId)
        .first<{ published_months_json: string }>();
      const pubMonths = relRow ? (JSON.parse(relRow.published_months_json) as string[]) : [];
      const latest = pubMonths[pubMonths.length - 1];
      if (!latest) {
        throw new AppError(404, "NOT_FOUND", {
          resource: "trade_snapshot",
          id: releaseId,
          period: "",
          releaseId,
        });
      }
      targetPeriod = latest;
    }

    const snapRow = await db
      .prepare(
        `SELECT payload_json
         FROM trade_period_snapshot
         WHERE dict_version = ?1 AND period = ?2 AND release_id = ?3`,
      )
      .bind(dictVersion, targetPeriod, releaseId)
      .first<{ payload_json: string }>();

    if (!snapRow) {
      throw new AppError(404, "NOT_FOUND", {
        resource: "trade_snapshot",
        id: `${targetPeriod}@${releaseId}`,
        period: targetPeriod,
        releaseId,
      });
    }
    const payload = JSON.parse(snapRow.payload_json) as TradeOverviewPublished;
    return normalizeTradeOverviewSnapshot(payload);
  }

  if (params.period != null && params.period.trim() !== "") {
    const parsed = parseTradePeriod(params.period);
    if (!parsed) {
      throw new AppError(400, "TRADE_PERIOD_INVALID", { period: params.period });
    }
    const row = await db
      .prepare(
        "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
      )
      .bind(dictVersion, parsed.period)
      .first<{ payload_json: string; available_periods_json: string }>();

    if (!row) {
      throw new AppError(404, "NOT_FOUND", { resource: "trade_period", id: parsed.period });
    }
    const payload = JSON.parse(row.payload_json) as TradeOverviewPublished;
    payload.availablePeriods = JSON.parse(row.available_periods_json) as string[];
    return normalizeTradeOverviewSnapshot(payload);
  }

  // 未指定期间：通过部分唯一索引定位最新已发布月份快照
  const latestRow = await db
    .prepare(
      `SELECT payload_json, available_periods_json
       FROM trade_current_snapshot
       WHERE dict_version = ?1 AND is_latest_month = 1
       LIMIT 1`,
    )
    .bind(dictVersion)
    .first<{ payload_json: string; available_periods_json: string }>();

  if (!latestRow) {
    const empty: TradeOverviewEmpty = {
      status: "empty",
      period: null,
      source: "china_customs",
      dictVersion,
      releaseId: null,
      units: TRADE_UNITS,
      availablePeriods: [],
      coverage: null,
      sourceBatches: [],
      totals: null,
      groupingTotals: null,
      concentration: null,
      trend: [],
      annualTrend: [],
      narrativeSummary: null,
      categories: [],
      partners: [],
      regimes: [],
      regions: [],
      hsItems: [],
    };
    return empty;
  }

  const payload = JSON.parse(latestRow.payload_json) as TradeOverviewPublished;
  payload.availablePeriods = JSON.parse(latestRow.available_periods_json) as string[];
  return normalizeTradeOverviewSnapshot(payload);
}

export async function getTradePeriodsMeta(db: D1Database, rawDictVersion?: string | null) {
  const dictVersion = rawDictVersion?.trim() || DEFAULT_DICT_VERSION;
  const latestRelease = await db
    .prepare(
      `SELECT release_id, published_months_json, available_periods_json, created_at
       FROM trade_release
       WHERE dict_version = ?1
       ORDER BY version_seq DESC, rowid DESC
       LIMIT 1`,
    )
    .bind(dictVersion)
    .first<{
      release_id: string;
      published_months_json: string;
      available_periods_json: string;
      created_at: string;
    }>();

  if (!latestRelease) {
    return {
      dictVersion,
      releaseId: null,
      publishedMonths: [] as string[],
      availablePeriods: [] as string[],
    };
  }
  return {
    dictVersion,
    releaseId: latestRelease.release_id,
    publishedMonths: JSON.parse(latestRelease.published_months_json) as string[],
    availablePeriods: JSON.parse(latestRelease.available_periods_json) as string[],
  };
}

export async function listTradeBatches(
  db: D1Database,
  filters: {
    dictVersion?: string | null;
    month?: string | null;
    flow?: string | null;
    grouping?: string | null;
    batchIds?: readonly string[];
  },
): Promise<{ items: TradeBatchListItem[] }> {
  const dictVersion = filters.dictVersion?.trim() || DEFAULT_DICT_VERSION;

  const mapRow = (r: BatchMetaRow & { created_at: string }): TradeBatchListItem => ({
    batchId: r.batch_id,
    dictVersion: r.dict_version,
    month: r.month,
    flow: r.flow,
    currency: r.currency,
    grouping: r.grouping,
    filename: r.filename,
    sourceSha256: r.source_sha256,
    evidenceSha256s: JSON.parse(r.evidence_sha256s_json) as string[],
    rowCount: r.row_count,
    publishState: r.publish_state === "published" ? "published" : "staged",
    supersededBy: r.superseded_by,
    coverage: {
      received: JSON.parse(r.received_hs8_json) as string[],
      confirmedEmpty: JSON.parse(r.confirmed_empty_hs8_json) as string[],
      missing: JSON.parse(r.missing_hs8_json) as string[],
    },
    createdAt: r.created_at,
  });

  if (filters.batchIds && filters.batchIds.length > 0) {
    const uniqueIds = [...new Set(filters.batchIds.map((id) => id.trim()).filter(Boolean))];
    const matched: Array<BatchMetaRow & { created_at: string }> = [];
    for (let i = 0; i < uniqueIds.length; i += ID_QUERY_CHUNK_SIZE) {
      const slice = uniqueIds.slice(i, i + ID_QUERY_CHUNK_SIZE);
      const { results } = await db
        .prepare(
          `SELECT *
           FROM trade_import_batch
           WHERE dict_version = ?1
             AND batch_id IN (SELECT value FROM json_each(?2))`,
        )
        .bind(dictVersion, JSON.stringify(slice))
        .all<BatchMetaRow & { created_at: string }>();
      matched.push(...results);
    }
    return { items: matched.map(mapRow) };
  }

  const clauses = ["dict_version = ?1", "publish_state IN ('staged', 'published')"];
  const params: unknown[] = [dictVersion];

  if (filters.month?.trim()) {
    params.push(filters.month.trim());
    clauses.push(`month = ?${params.length}`);
  }
  if (filters.flow?.trim()) {
    params.push(filters.flow.trim());
    clauses.push(`flow = ?${params.length}`);
  }
  if (filters.grouping?.trim()) {
    params.push(filters.grouping.trim());
    clauses.push(`grouping = ?${params.length}`);
  }

  const sql = `
    SELECT *
    FROM trade_import_batch
    WHERE ${clauses.join(" AND ")}
    ORDER BY created_at DESC, rowid DESC
    LIMIT 100
  `;
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<BatchMetaRow & { created_at: string }>();

  return {
    items: results.map(mapRow),
  };
}

function expandMonthsInclusive(fromMonth: string, toMonth: string): string[] | null {
  const m1 = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(fromMonth);
  const m2 = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(toMonth);
  if (!m1 || !m2) return null;
  const startTotal = Number(m1[1]) * 12 + (Number(m1[2]) - 1);
  const endTotal = Number(m2[1]) * 12 + (Number(m2[2]) - 1);
  if (startTotal > endTotal || endTotal - startTotal > 240) return null;
  const out: string[] = [];
  for (let t = startTotal; t <= endTotal; t++) {
    const y = Math.floor(t / 12);
    const m = (t % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export async function getTradeCoverageMatrix(
  db: D1Database,
  params: {
    dictVersion?: string | null;
    year?: string | null;
    fromMonth?: string | null;
    toMonth?: string | null;
    month?: string | null;
    hs8?: string | null;
  },
): Promise<TradeCoverageMatrixResponse> {
  const dictVersion = params.dictVersion?.trim() || DEFAULT_DICT_VERSION;

  const meta = await db
    .prepare("SELECT dict_version, source_sha256, hs8_count, hs6_count, category_count FROM trade_dict_meta WHERE dict_version = ?1")
    .bind(dictVersion)
    .first<{
      dict_version: string;
      source_sha256: string;
      hs8_count: number;
      hs6_count: number;
      category_count: number;
    }>();

  if (!meta) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "dictVersion", reason: `unknown dictVersion: ${dictVersion}` });
  }

  let fromMonth = params.fromMonth?.trim() || "2024-01";
  let toMonth = params.toMonth?.trim() || "2024-12";
  if (params.year?.trim()) {
    const yStr = params.year.trim();
    if (!/^\d{4}$/.test(yStr)) {
      throw new AppError(400, "TRADE_PERIOD_INVALID", { period: yStr });
    }
    fromMonth = `${yStr}-01`;
    toMonth = `${yStr}-12`;
  } else if (params.month?.trim() && !params.fromMonth?.trim() && !params.toMonth?.trim()) {
    fromMonth = params.month.trim();
    toMonth = params.month.trim();
  }

  const months = expandMonthsInclusive(fromMonth, toMonth);
  if (!months) {
    throw new AppError(400, "TRADE_PERIOD_INVALID", { period: `${fromMonth}..${toMonth}` });
  }

  const filterMonth = params.month?.trim() || null;
  if (filterMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filterMonth)) {
    throw new AppError(400, "TRADE_PERIOD_INVALID", { period: filterMonth });
  }
  const filterHs8 = params.hs8?.trim() || null;
  if (filterHs8 && !/^\d{8}$/.test(filterHs8)) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "hs8", reason: `invalid hs8: ${filterHs8}` });
  }

  const { results: dictItems } = await db
    .prepare("SELECT hs8 FROM trade_hs_dict WHERE dict_version = ?1 ORDER BY category_order ASC, seq_no ASC, hs8 ASC")
    .bind(dictVersion)
    .all<{ hs8: string }>();
  const allHs8 = dictItems.map((d) => d.hs8);

  const minYear = Number(fromMonth.slice(0, 4));
  const maxYear = Number(toMonth.slice(0, 4));

  const { results: appRows } = await db
    .prepare(
      `SELECT year, hs8, applicable, basis_note
       FROM trade_hs_year_applicability
       WHERE dict_version = ?1 AND year >= ?2 AND year <= ?3`,
    )
    .bind(dictVersion, minYear, maxYear)
    .all<{ year: number; hs8: string; applicable: number; basis_note: string }>();

  const appMap = new Map<string, { applicable: number; note: string | null }>();
  for (const r of appRows) {
    appMap.set(`${r.year}|${r.hs8}`, { applicable: r.applicable, note: r.basis_note || null });
  }

  const { results: pubRows } = await db
    .prepare(
      `SELECT period
       FROM trade_current_snapshot
       WHERE dict_version = ?1 AND period >= ?2 AND period <= ?3`,
    )
    .bind(dictVersion, fromMonth, toMonth)
    .all<{ period: string }>();
  const publishedSet = new Set(pubRows.map((p) => p.period));

  const { results: covRows } = await db
    .prepare(
      `SELECT
         c.month,
         c.flow,
         c.grouping,
         c.hs8,
         c.status,
         c.batch_id,
         c.evidence_sha256,
         b.source_sha256
       FROM trade_import_batch b
       JOIN trade_hs_coverage c
         ON c.batch_id = b.batch_id
       WHERE b.dict_version = ?1
         AND b.month >= ?2
         AND b.month <= ?3
         AND b.superseded_by IS NULL
         AND b.publish_state IN ('staged', 'published')`,
    )
    .bind(dictVersion, fromMonth, toMonth)
    .all<{
      month: string;
      flow: TradeFlow;
      grouping: TradeGrouping;
      hs8: string;
      status: "received" | "confirmed_empty" | "missing";
      batch_id: string;
      evidence_sha256: string | null;
      source_sha256: string;
    }>();

  const covMap = new Map<
    string,
    {
      status: "received" | "confirmedEmpty" | "missing";
      batchId: string;
      sourceSha256: string;
      evidenceSha256: string | null;
    }
  >();
  for (const r of covRows) {
    covMap.set(`${r.month}|${r.flow}|${r.grouping}|${r.hs8}`, {
      status: r.status === "confirmed_empty" ? "confirmedEmpty" : r.status,
      batchId: r.batch_id,
      sourceSha256: r.source_sha256,
      evidenceSha256: r.evidence_sha256,
    });
  }

  const includeCells = Boolean(filterHs8 || filterMonth);
  const cells: TradeCoverageCell[] = [];
  const monthSummaries: TradeCoverageMonthSummary[] = [];

  let totalCells = 0;
  let totalReceived = 0;
  let totalConfirmedEmpty = 0;
  let totalMissing = 0;
  let totalNotApplicable = 0;
  let publishableMonths = 0;
  let publishedMonths = 0;

  for (const month of months) {
    const year = Number(month.slice(0, 4));
    let mApplicableHs8 = 0;
    let mNotApplicableHs8 = 0;
    for (const hs8 of allHs8) {
      const app = appMap.get(`${year}|${hs8}`);
      if (app && app.applicable === 0) mNotApplicableHs8 += 1;
      else mApplicableHs8 += 1;
    }

    let mReceived = 0;
    let mConfirmedEmpty = 0;
    let mMissing = 0;
    let mNotApplicable = 0;

    for (const flow of TRADE_FLOWS) {
      for (const grouping of TRADE_GROUPINGS) {
        for (const hs8 of allHs8) {
          const app = appMap.get(`${year}|${hs8}`);
          let status: TradeCoverageCellStatus;
          let batchId: string | null = null;
          let sourceSha256: string | null = null;
          let evidenceSha256: string | null = null;
          let basis: string | null = null;

          if (app && app.applicable === 0) {
            status = "notApplicable";
            basis = app.note ?? "当年税则不适用";
            mNotApplicable += 1;
          } else {
            const c = covMap.get(`${month}|${flow}|${grouping}|${hs8}`);
            if (c && c.status === "received") {
              status = "received";
              batchId = c.batchId;
              sourceSha256 = c.sourceSha256;
              mReceived += 1;
            } else if (c && c.status === "confirmedEmpty") {
              status = "confirmedEmpty";
              batchId = c.batchId;
              sourceSha256 = c.sourceSha256;
              evidenceSha256 = c.evidenceSha256 ?? c.sourceSha256;
              mConfirmedEmpty += 1;
            } else {
              status = "missing";
              mMissing += 1;
            }
          }

          if (includeCells && (!filterMonth || filterMonth === month) && (!filterHs8 || filterHs8 === hs8)) {
            cells.push({
              month,
              flow,
              grouping,
              hs8,
              status,
              batchId,
              sourceSha256,
              evidenceSha256,
              basis,
            });
          }
        }
      }
    }

    const mTotal = allHs8.length * TRADE_FLOWS.length * TRADE_GROUPINGS.length;
    const isPublishable = mApplicableHs8 > 0 && mMissing === 0;
    const isPublished = publishedSet.has(month);

    if (isPublishable) publishableMonths += 1;
    if (isPublished) publishedMonths += 1;

    totalCells += mTotal;
    totalReceived += mReceived;
    totalConfirmedEmpty += mConfirmedEmpty;
    totalMissing += mMissing;
    totalNotApplicable += mNotApplicable;

    monthSummaries.push({
      month,
      applicableHs8Count: mApplicableHs8,
      notApplicableHs8Count: mNotApplicableHs8,
      totalCells: mTotal,
      received: mReceived,
      confirmedEmpty: mConfirmedEmpty,
      missing: mMissing,
      notApplicable: mNotApplicable,
      isPublishable,
      isPublished,
    });
  }

  return {
    dictVersion: meta.dict_version,
    dictSha256: meta.source_sha256,
    hs8Count: meta.hs8_count,
    hs6Count: meta.hs6_count,
    categoryCount: meta.category_count,
    fromMonth,
    toMonth,
    monthCount: months.length,
    summary: {
      totalCells,
      received: totalReceived,
      confirmedEmpty: totalConfirmedEmpty,
      missing: totalMissing,
      notApplicable: totalNotApplicable,
      publishableMonths,
      publishedMonths,
    },
    months: monthSummaries,
    ...(includeCells ? { cells } : {}),
  };
}
