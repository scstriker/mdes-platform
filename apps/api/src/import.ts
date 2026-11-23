import {
  canonicalizeDimsJson,
  canonicalizeDimsObject,
  parseObservationCsv,
  type CsvObservationRow,
  type CsvWriteMode,
  type ImportResult,
  type ImportStatus,
  type RowError,
} from "@mdes/shared";
import { AppError } from "./errors";

export const IMPORT_CHUNK_SIZE = 500;

type ImportOptions = {
  filename: string;
  csvText: string;
  maxRows: number;
  mode?: CsvWriteMode;
  /** 每块行数：一块是一条 insert … select from json_each(?)，只绑定 3 个参数 */
  chunkSize?: number;
  /** 测试钩子：追加到批量语句末尾，用来模拟中途失败、验证整体回滚 */
  extraStatements?: (db: D1Database) => D1PreparedStatement[];
};

const DELETE_BY_IDS_CHUNK = `
  delete from observation
  where object_ref is null
    and id in (select CAST(value AS INTEGER) from json_each(?1))`;

const DELETE_UPSERT_CHUNK = `
  delete from observation
  where object_ref is null
    and rowid in (
      select o.rowid
      from json_each(?1) as j
      join observation o
        on o.indicator_id = json_extract(j.value, '$.indicator_id')
       and o.period = json_extract(j.value, '$.period')
       and o.geo = json_extract(j.value, '$.geo')
      where o.object_ref is null
        and json(o.dims) = json(json_extract(j.value, '$.dims'))
    )`;

/** 一块观测值的 insert：整块作为一个 JSON 参数传入，不受 D1 每条语句 100 个参数的限制 */
const INSERT_CHUNK = `
  insert into observation (indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, created_at)
  select
    json_extract(value, '$.indicator_id'),
    json_extract(value, '$.period'),
    json_extract(value, '$.geo'),
    json_extract(value, '$.dims'),
    json_extract(value, '$.value_num'),
    json_extract(value, '$.value_text'),
    json_extract(value, '$.unit'),
    ?1,
    ?2
  from json_each(?3)`;

function observationNaturalKey(indicatorId: string, period: string, geo: string, dims: Record<string, unknown>): string {
  return `${indicatorId}\u0000${period}\u0000${geo}\u0000${canonicalizeDimsJson(dims)}`;
}

function deduplicateRowsForUpsert(rows: CsvObservationRow[]): CsvObservationRow[] {
  const byKey = new Map<string, CsvObservationRow>();
  for (const r of rows) {
    byKey.set(observationNaturalKey(r.indicator_id, r.period, r.geo, r.dims), r);
  }
  return [...byKey.values()];
}

/**
 * 查找库中与本批 upsert 自然键等价的存量手工记录 ID：
 * 通过递归 canonicalizeDimsJson 在应用层比对，兼容升级前未按字典序排列、含嵌套逆序键、空白或 1.0 浮点字面量的历史 JSON。
 */
async function findMatchingLegacyObservationIds(
  db: D1Database,
  effectiveRows: readonly CsvObservationRow[],
  chunkSize = 200,
): Promise<number[]> {
  if (effectiveRows.length === 0) return [];
  const targetKeys = new Set<string>();
  const tripleMap = new Map<string, { indicator_id: string; period: string; geo: string }>();

  for (const r of effectiveRows) {
    targetKeys.add(observationNaturalKey(r.indicator_id, r.period, r.geo, r.dims));
    const tripleKey = `${r.indicator_id}\u0000${r.period}\u0000${r.geo}`;
    if (!tripleMap.has(tripleKey)) {
      tripleMap.set(tripleKey, { indicator_id: r.indicator_id, period: r.period, geo: r.geo });
    }
  }

  const triples = [...tripleMap.values()];
  const matchedIds = new Set<number>();

  for (let i = 0; i < triples.length; i += chunkSize) {
    const slice = triples.slice(i, i + chunkSize);
    const { results } = await db
      .prepare(
        `select distinct o.id, o.indicator_id, o.period, o.geo, o.dims
         from json_each(?1) as j
         join observation o
           on o.indicator_id = json_extract(j.value, '$.indicator_id')
          and o.period = json_extract(j.value, '$.period')
          and o.geo = json_extract(j.value, '$.geo')
         where o.object_ref is null`,
      )
      .bind(JSON.stringify(slice))
      .all<{ id: number; indicator_id: string; period: string; geo: string; dims: string }>();

    for (const row of results) {
      let parsedDims: Record<string, unknown> = {};
      try {
        const raw = JSON.parse(row.dims) as unknown;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          parsedDims = raw as Record<string, unknown>;
        } else {
          continue;
        }
      } catch {
        continue;
      }
      if (targetKeys.has(observationNaturalKey(row.indicator_id, row.period, row.geo, parsedDims))) {
        matchedIds.add(row.id);
      }
    }
  }

  return [...matchedIds];
}

export function buildImportStatements(
  db: D1Database,
  batch: { id: string; filename: string; status: ImportStatus; createdAt: string },
  rows: CsvObservationRow[],
  errors: RowError[],
  chunkSize = IMPORT_CHUNK_SIZE,
  mode: CsvWriteMode = "append",
  matchedLegacyIds: readonly number[] = [],
): D1PreparedStatement[] {
  const effectiveRows = mode === "upsert" ? deduplicateRowsForUpsert(rows) : rows;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `insert into import_batch (id, filename, status, row_ok, row_err, errors_json, created_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(batch.id, batch.filename, batch.status, effectiveRows.length, errors.length, JSON.stringify(errors), batch.createdAt),
  ];

  if (mode === "upsert" && effectiveRows.length > 0) {
    for (let i = 0; i < matchedLegacyIds.length; i += chunkSize) {
      const idSlice = matchedLegacyIds.slice(i, i + chunkSize);
      statements.push(db.prepare(DELETE_BY_IDS_CHUNK).bind(JSON.stringify(idSlice)));
    }
    for (let i = 0; i < effectiveRows.length; i += chunkSize) {
      const keyChunk = effectiveRows.slice(i, i + chunkSize).map((r) => ({
        indicator_id: r.indicator_id,
        period: r.period,
        geo: r.geo,
        dims: canonicalizeDimsObject(r.dims),
      }));
      statements.push(db.prepare(DELETE_UPSERT_CHUNK).bind(JSON.stringify(keyChunk)));
    }
  }

  for (let i = 0; i < effectiveRows.length; i += chunkSize) {
    const chunk = effectiveRows.slice(i, i + chunkSize).map(({ line: _line, ...r }) => {
      void _line;
      return {
        ...r,
        dims: canonicalizeDimsObject(r.dims),
      };
    });
    statements.push(db.prepare(INSERT_CHUNK).bind(batch.id, batch.createdAt, JSON.stringify(chunk)));
  }
  return statements;
}

/**
 * CSV 导入（ADR-002「补充改动」，ADR-003 改用 D1）：
 * - 先用共享解析器校验（含指标编号），文件级错误抛 400，不建批次；
 * - 批次与全部观测值放进同一个 db.batch() 里写入：D1 把一次 batch 当作一个事务，
 *   中途任何一条失败都整体回滚，不会留下半批数据，也不会出现「批次已完成、数据只写了一半」；
 * - mode = "upsert" 时在同一事务内按 (indicator_id, period, geo, 规范化 dims) 融合替换既有手工导入记录；
 * - 所有行都校验失败时仍记录一个 failed 批次，返回 200，导入历史里看得到。
 */
export async function importObservations(db: D1Database, options: ImportOptions): Promise<ImportResult> {
  const { results: known } = await db.prepare("select id from indicator").all<{ id: string }>();
  const parsed = parseObservationCsv(options.csvText, {
    maxRows: options.maxRows,
    knownIndicatorIds: new Set(known.map((r) => r.id)),
  });
  if (!parsed.ok) throw new AppError(400, parsed.fileError.code, parsed.fileError.params);

  const mode: CsvWriteMode = options.mode === "upsert" ? "upsert" : "append";
  const effectiveRows = mode === "upsert" ? deduplicateRowsForUpsert(parsed.rows) : parsed.rows;
  const matchedLegacyIds =
    mode === "upsert" ? await findMatchingLegacyObservationIds(db, effectiveRows, options.chunkSize) : [];
  const { errors } = parsed;
  const status: ImportStatus = effectiveRows.length === 0 ? "failed" : errors.length > 0 ? "completed_with_errors" : "completed";
  const batch = { id: crypto.randomUUID(), filename: options.filename, status, createdAt: new Date().toISOString() };
  const statements = buildImportStatements(db, batch, effectiveRows, errors, options.chunkSize, mode, matchedLegacyIds);
  await db.batch([...statements, ...(options.extraStatements?.(db) ?? [])]);

  return { batch_id: batch.id, status, row_ok: effectiveRows.length, row_err: errors.length, errors };
}
