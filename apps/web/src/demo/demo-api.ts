/**
 * 演示版（npm run build:demo）的浏览器内 API：不连后端，在内存里实现与真实 API 相同的接口与错误体，
 * 让页面可以完整交互。预置数据：99 个指标（data/indicators_seed.json）+ README 样例 + 虚构演示数据 + V2 标准统计与实体目录。
 * 导入用 @mdes/shared 的同一套解析器；数据只在内存里，刷新页面即重置。
 */
import {
  adaptTradeSnapshotToStatistics,
  buildCatalogRecordHref,
  canonicalizeDimsJson,
  detectCatalogAliasCorrection,
  errorBody,
  matchesQuery,
  normalizeAliasKey,
  normalizeTradeOverviewSnapshot,
  observationMatchesQuery,
  parseObservationCsv,
  parseTradePeriod,
  tokenizeQuery,
  toStatisticListItem,
  V2_HISTORICAL_STATISTIC_VERSIONS,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_ENTITY_RELATIONS,
  V2_SEED_STATISTICS,
  type CatalogDetailResponse,
  type CatalogPage,
  type CatalogRecord,
  type ClusterStats,
  type ErrorCode,
  type ErrorParams,
  type GlobalSearchResult,
  type ImportBatch,
  type ImportResult,
  type ImportStatus,
  type Indicator,
  type Observation,
  type Phase,
  type Statistic,
  type StatisticDetailResponse,
  type StatisticListItem,
  type StatisticListPage,
  type StatisticVersionEntry,
  type StatisticVersionsResponse,
  type Stats,
  type TradeOverviewEmpty,
  type TradeOverviewPublished,
  type UnifiedSearchHit,
} from "@mdes/shared";
import seed from "../../../../data/indicators_seed.json";
import sampleCsv from "../../../../data/samples/trd_sample.csv?raw";
import { makeDemoCsv } from "../../../../scripts/make-demo-csv.mjs";
import { inferSourceKind } from "../../../api/src/inferSourceKind";

type SeedIndicator = (typeof seed.indicators)[number];

const LATENCY_MS = 180;
const OBSERVATION_LIMIT_MAX = 500;

const clusters = seed.clusters
  .map((c) => ({ code: c.code, name: c.name, subsystem_id: "med" }))
  .sort((a, b) => a.code.localeCompare(b.code));

const indicators: Indicator[] = seed.indicators
  .map((i: SeedIndicator) => ({
    id: i.id,
    cluster_code: i.cluster_code,
    name: i.name,
    phase: i.phase as Phase,
    update_freq: i.update_freq,
    source_kind: inferSourceKind(i.source, i.collect_method),
    phase_scope: i.phase_scope,
    obs_count: 0,
    latest_period: null,
    automation: i.automation || null,
    spec_json: {
      business_value: i.business_value,
      definition: i.definition,
      source: i.source,
      collect_method: i.collect_method,
      usage: i.usage,
      automation: i.automation,
      note: i.note,
    },
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const knownIds = new Set(indicators.map((i) => i.id));
const indicatorById = new Map(indicators.map((i) => [i.id, i]));
const observations: Observation[] = [];
const batches: ImportBatch[] = [];
let nextObservationId = 1;
let clock = Date.parse("2026-11-05T02:00:00Z");

// ==================== V2 内存版双平面存储 ====================

const latestStatById = new Map<string, Statistic>();
const statIdBySlug = new Map<string, string>();
const statVersionsById = new Map<string, Map<string, Statistic>>();

for (const stat of V2_SEED_STATISTICS) {
  latestStatById.set(stat.statistic_id, stat);
  statIdBySlug.set(stat.slug, stat.statistic_id);
  const vMap = new Map<string, Statistic>();
  vMap.set(stat.version, stat);
  statVersionsById.set(stat.statistic_id, vMap);
}

for (const hist of V2_HISTORICAL_STATISTIC_VERSIONS) {
  let vMap = statVersionsById.get(hist.statistic_id);
  if (!vMap) {
    vMap = new Map<string, Statistic>();
    statVersionsById.set(hist.statistic_id, vMap);
  }
  if (!vMap.has(hist.version)) {
    vMap.set(hist.version, hist);
  }
}

const catalogRecords: CatalogRecord[] = [...V2_SEED_CATALOG_RECORDS];

const DEMO_DICT_VERSION = "202601";

type DemoTradeReleaseEntry = {
  releaseId: string;
  dictVersion: string;
  publishedMonths: string[];
  availablePeriods: string[];
  createdAt: string;
};

function makeDemoTradeSnapshot(opts: {
  period: string;
  releaseId: string;
  availablePeriods: string[];
  months: string[];
  totals: TradeOverviewPublished["totals"];
  annualTrend: TradeOverviewPublished["annualTrend"];
  headline: string;
  multiYearParagraph: string;
}): TradeOverviewPublished {
  return {
    status: "published",
    period: opts.period,
    source: "china_customs",
    dictVersion: DEMO_DICT_VERSION,
    releaseId: opts.releaseId,
    units: {
      amount: "USD",
      displayAmount: "100M_USD",
      share: "PCT",
      cr: "PCT",
      hhi: "0_10000",
    },
    availablePeriods: opts.availablePeriods,
    coverage: {
      months: opts.months,
      expectedMonths: opts.months.length,
      coveredMonths: opts.months.length,
      applicableHs8Count: 164,
      coveredHs8Count: 164,
      notApplicableHs8Count: 0,
    },
    sourceBatches: [],
    totals: opts.totals,
    groupingTotals: {
      product: { importUsd: opts.totals.importUsd, exportUsd: opts.totals.exportUsd },
      partner: { importUsd: opts.totals.importUsd, exportUsd: opts.totals.exportUsd, count: 180 },
      regime: { importUsd: opts.totals.importUsd, exportUsd: opts.totals.exportUsd, count: 16 },
      region: { importUsd: opts.totals.importUsd, exportUsd: opts.totals.exportUsd, count: 31 },
    },
    concentration: {
      import: { cr1: 28.4, cr3: 63.2, cr5: 76.5, hhi: 1780, partnerCount: 142 },
      export: { cr1: 24.1, cr3: 42.8, cr5: 53.6, hhi: 980, partnerCount: 196 },
    },
    trend: [],
    annualTrend: opts.annualTrend,
    narrativeSummary: {
      headline: opts.headline,
      scaleParagraph: opts.headline,
      multiYearParagraph: opts.multiYearParagraph,
      structureParagraph: "医用诊断装备与高值耗材构成双边进出口主力品类。",
      concentrationAlert: "高端影像关键部件进口来源维持较高集中度。",
    },
    categories: [],
    partners: [],
    regimes: [],
    regions: [],
    hsItems: [],
  };
}

const DEMO_ANNUAL_2022_2025: TradeOverviewPublished["annualTrend"] = [
  {
    period: "2022",
    year: 2022,
    coveredMonths: 12,
    importUsd: 54_180_000_000,
    exportUsd: 71_620_000_000,
    totalUsd: 125_800_000_000,
    balanceUsd: 17_440_000_000,
    importYoyPct: null,
    exportYoyPct: null,
    totalYoyPct: null,
    isPartial: false,
  },
  {
    period: "2023",
    year: 2023,
    coveredMonths: 12,
    importUsd: 52_460_000_000,
    exportUsd: 68_940_000_000,
    totalUsd: 121_400_000_000,
    balanceUsd: 16_480_000_000,
    importYoyPct: -3.17,
    exportYoyPct: -3.74,
    totalYoyPct: -3.5,
    isPartial: false,
  },
  {
    period: "2024",
    year: 2024,
    coveredMonths: 12,
    importUsd: 49_820_000_000,
    exportUsd: 70_850_000_000,
    totalUsd: 120_670_000_000,
    balanceUsd: 21_030_000_000,
    importYoyPct: -5.03,
    exportYoyPct: 2.77,
    totalYoyPct: -0.6,
    isPartial: false,
  },
  {
    period: "2025",
    year: 2025,
    coveredMonths: 12,
    importUsd: 48_950_000_000,
    exportUsd: 73_420_000_000,
    totalUsd: 122_370_000_000,
    balanceUsd: 24_470_000_000,
    importYoyPct: -1.75,
    exportYoyPct: 3.63,
    totalYoyPct: 1.41,
    isPartial: false,
  },
];

const DEMO_TRADE_RELEASE_HIST_ID = "11111111-2222-3333-4444-555555555555";
const DEMO_TRADE_RELEASE_LATEST_ID = "20bd2985-105c-4927-982a-cbd68a71562b";

const demoTradeReleases: DemoTradeReleaseEntry[] = [
  {
    releaseId: DEMO_TRADE_RELEASE_LATEST_ID,
    dictVersion: DEMO_DICT_VERSION,
    publishedMonths: ["2025-12", "2026-10"],
    availablePeriods: ["2022", "2023", "2024", "2025", "2026-YTD-10", "2026-10"],
    createdAt: "2026-11-26T12:00:00Z",
  },
  {
    releaseId: DEMO_TRADE_RELEASE_HIST_ID,
    dictVersion: DEMO_DICT_VERSION,
    publishedMonths: ["2025-12"],
    availablePeriods: ["2022", "2023", "2024", "2025", "2025-12"],
    createdAt: "2026-02-15T08:00:00Z",
  },
];

const demoTradeSnapshotHist2025 = makeDemoTradeSnapshot({
  period: "2025-12",
  releaseId: DEMO_TRADE_RELEASE_HIST_ID,
  availablePeriods: ["2022", "2023", "2024", "2025", "2025-12"],
  months: ["2025-12"],
  totals: {
    importUsd: 48_950_000_000,
    exportUsd: 73_420_000_000,
    totalUsd: 122_370_000_000,
    balanceUsd: 24_470_000_000,
    importYoyPct: -1.75,
    exportYoyPct: 3.63,
    totalYoyPct: 1.41,
  },
  annualTrend: DEMO_ANNUAL_2022_2025,
  headline: "2025 年中国医疗器械海关进出口总额 1,223.70 亿美元，贸易顺差扩大至 244.70 亿美元。",
  multiYearParagraph: "2022–2025 年中国医疗器械出口稳步回升，贸易顺差由 174.40 亿美元扩大至 244.70 亿美元。",
});

const demoTradeSnapshotLatest = makeDemoTradeSnapshot({
  period: "2026-10",
  releaseId: DEMO_TRADE_RELEASE_LATEST_ID,
  availablePeriods: ["2022", "2023", "2024", "2025", "2026-YTD-10", "2026-10"],
  months: ["2026-10"],
  totals: {
    importUsd: 41_229_739_608,
    exportUsd: 48_029_554_383,
    totalUsd: 89_259_293_991,
    balanceUsd: 6_799_814_775,
    importYoyPct: -1.12,
    exportYoyPct: 5.48,
    totalYoyPct: 2.34,
  },
  annualTrend: [
    ...DEMO_ANNUAL_2022_2025,
    {
      period: "2026-YTD-10",
      year: 2026,
      coveredMonths: 10,
      importUsd: 41_229_739_608,
      exportUsd: 48_029_554_383,
      totalUsd: 89_259_293_991,
      balanceUsd: 6_799_814_775,
      importYoyPct: -1.12,
      exportYoyPct: 5.48,
      totalYoyPct: 2.34,
      isPartial: true,
    },
  ],
  headline: "2026 年 1–10 月中国医疗器械进出口累计 892.59 亿美元，同窗口同比增长 2.34%。",
  multiYearParagraph:
    "2022–2025 完整年度及 2026 年前 10 个月，中国医疗器械出口保持韧性增长，高端影像与诊断装备国产替代带动贸易顺差持续走阔。",
});

const demoTradePeriodSnapshots = new Map<string, TradeOverviewPublished>([
  [`${DEMO_DICT_VERSION}|2025-12|${DEMO_TRADE_RELEASE_HIST_ID}`, demoTradeSnapshotHist2025],
  [`${DEMO_DICT_VERSION}|2025|${DEMO_TRADE_RELEASE_HIST_ID}`, { ...demoTradeSnapshotHist2025, period: "2025" }],
  [`${DEMO_DICT_VERSION}|2026-10|${DEMO_TRADE_RELEASE_LATEST_ID}`, demoTradeSnapshotLatest],
  [`${DEMO_DICT_VERSION}|2024|${DEMO_TRADE_RELEASE_LATEST_ID}`, { ...demoTradeSnapshotLatest, period: "2024" }],
]);

function loadDemoAdaptedTradeStatistics(dictVersion = DEMO_DICT_VERSION): Statistic[] {
  if (dictVersion !== DEMO_DICT_VERSION) return [];
  return adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot({ ...demoTradeSnapshotLatest }));
}

function loadDemoHistoricalAdaptedTradeStatistics(
  requestedVersion: string,
  dictVersion = DEMO_DICT_VERSION,
): Statistic[] {
  const trimmed = requestedVersion.trim();
  if (!trimmed || dictVersion !== DEMO_DICT_VERSION) return [];

  let targetPeriod: string | null = null;
  let releaseToken = trimmed;
  const dotIdx = trimmed.lastIndexOf(".");
  if (dotIdx > 0) {
    const candidatePeriod = trimmed.slice(0, dotIdx);
    const candidateRelease = trimmed.slice(dotIdx + 1);
    if (parseTradePeriod(candidatePeriod) && /^[0-9a-zA-Z_-]{8,}$/.test(candidateRelease)) {
      targetPeriod = candidatePeriod;
      releaseToken = candidateRelease;
    }
  }

  const rel = demoTradeReleases.find(
    (r) => r.dictVersion === dictVersion && (r.releaseId === releaseToken || r.releaseId.startsWith(releaseToken)),
  );
  if (!rel) return [];

  if (!targetPeriod) {
    targetPeriod = [...rel.publishedMonths].sort().at(-1) ?? null;
  }
  if (!targetPeriod) return [];

  const snap = demoTradePeriodSnapshots.get(`${dictVersion}|${targetPeriod}|${rel.releaseId}`);
  if (!snap) return [];
  return adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot({ ...snap, availablePeriods: rel.availablePeriods }));
}

function listDemoAdaptedTradeStatisticVersions(
  latestAdapted: Statistic,
  dictVersion = DEMO_DICT_VERSION,
): StatisticVersionEntry[] {
  const seen = new Set<string>();
  const entries: StatisticVersionEntry[] = [];
  for (const rel of demoTradeReleases) {
    if (rel.dictVersion !== dictVersion) continue;
    const latestMonth = [...rel.publishedMonths].sort().at(-1);
    if (!latestMonth) continue;
    const version = `${latestMonth}.${rel.releaseId.slice(0, 8)}`;
    if (seen.has(version)) continue;
    seen.add(version);
    entries.push({
      version,
      content_hash: version === latestAdapted.version ? latestAdapted.content_hash : `trd-annual-${rel.releaseId}`,
      published_at: version === latestAdapted.version ? latestAdapted.published_at : rel.createdAt,
    });
  }
  if (!seen.has(latestAdapted.version)) {
    entries.unshift({
      version: latestAdapted.version,
      content_hash: latestAdapted.content_hash,
      published_at: latestAdapted.published_at,
    });
  }
  return entries;
}

function resolveDemoStatId(idOrSlug: string): string | null {
  if (latestStatById.has(idOrSlug)) return idOrSlug;
  return statIdBySlug.get(idOrSlug) ?? null;
}

function parseOptionalBool(raw: string | null): boolean | null {
  if (!raw || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

function catalogMatchesQuery(rec: CatalogRecord, rawQ: string): boolean {
  const tokens = tokenizeQuery(rawQ);
  const normQ = normalizeAliasKey(rawQ);
  const haystack = [
    rec.id,
    rec.slug,
    rec.title,
    rec.subtitle,
    rec.code ?? "",
    rec.region ?? "",
    rec.period ?? "",
    rec.category ?? "",
    rec.subkind ?? "",
    rec.tags.join(" "),
    (rec.legacy_aliases ?? []).join(" "),
    rec.summary_fields.map((f) => `${f.label} ${f.value}`).join(" "),
    rec.source_title,
  ].join(" ");

  if (tokens.length > 0 && matchesQuery(haystack, tokens)) return true;
  if (rec.code && normalizeAliasKey(rec.code) === normQ) return true;
  for (const alias of rec.legacy_aliases ?? []) {
    const normAlias = normalizeAliasKey(alias);
    if (normAlias === normQ || (normAlias.length >= 6 && normQ.includes(normAlias))) {
      return true;
    }
  }
  return false;
}

function searchDemoV2Hits(rawQ: string, limit: number): UnifiedSearchHit[] {
  const trimmed = rawQ.trim();
  const normQ = normalizeAliasKey(trimmed);
  const tokens = tokenizeQuery(trimmed);
  if (!normQ) return [];

  const scored: Array<{ priority: number; hit: UnifiedSearchHit }> = [];

  for (const rec of catalogRecords) {
    let priority = 0;
    let aliasNote: string | undefined;
    const codeNorm = rec.code ? normalizeAliasKey(rec.code) : "";

    if (codeNorm && codeNorm === normQ) {
      priority = 100;
    } else if (rec.id.toLowerCase() === trimmed.toLowerCase() || rec.slug.toLowerCase() === trimmed.toLowerCase()) {
      priority = 95;
    } else if (rec.title.toLowerCase() === trimmed.toLowerCase()) {
      priority = 95;
    }

    for (const alias of rec.legacy_aliases ?? []) {
      const normAlias = normalizeAliasKey(alias);
      if (normAlias && (normAlias === normQ || (normAlias.length >= 6 && normQ.includes(normAlias))) && codeNorm !== normQ) {
        priority = Math.max(priority, 98);
        aliasNote =
          typeof rec.detail?.correction_notice === "string" && rec.detail.correction_notice.trim()
            ? rec.detail.correction_notice.trim()
            : `现行规范条目为 ${rec.code ?? rec.title}（匹配旧别名：${alias}）`;
      }
    }

    if (priority === 0 && catalogMatchesQuery(rec, trimmed)) {
      priority = rec.title.toLowerCase().includes(trimmed.toLowerCase()) ? 70 : 50;
    }

    if (priority > 0) {
      scored.push({
        priority,
        hit: {
          id: rec.id,
          group: rec.kind,
          title: rec.title,
          subtitle: rec.subtitle,
          ...(rec.code ? { code: rec.code } : {}),
          ...(rec.region ? { region: rec.region } : {}),
          ...(rec.period ? { period: rec.period } : {}),
          href: buildCatalogRecordHref(rec),
          source_label: rec.source_title,
          ...(aliasNote ? { alias_note: aliasNote } : {}),
        },
      });
    }
  }

  const demoStatsForSearch = [
    ...latestStatById.values(),
    ...loadDemoAdaptedTradeStatistics().filter(
      (s) => !latestStatById.has(s.statistic_id) && !statIdBySlug.has(s.slug),
    ),
  ];

  for (const stat of demoStatsForSearch) {
    const item = toStatisticListItem(stat, stat.version);
    let priority = 0;
    if (
      stat.statistic_id.toLowerCase() === trimmed.toLowerCase() ||
      stat.slug.toLowerCase() === trimmed.toLowerCase() ||
      stat.title.toLowerCase() === trimmed.toLowerCase()
    ) {
      priority = 96;
    } else {
      const haystack = [
        stat.statistic_id,
        stat.slug,
        stat.title,
        stat.subtitle,
        stat.insight,
        item.source_org,
        stat.topic_tags.join(" "),
        JSON.stringify(stat.entity_refs),
      ].join(" ");
      if (tokens.length > 0 && matchesQuery(haystack, tokens)) {
        priority = stat.title.toLowerCase().includes(trimmed.toLowerCase()) ? 65 : 45;
      }
    }
    if (priority > 0) {
      scored.push({
        priority,
        hit: {
          id: stat.statistic_id,
          group: "statistics",
          title: stat.title,
          subtitle: stat.subtitle,
          code: stat.statistic_id,
          ...(stat.entity_refs.regions?.[0] ? { region: stat.entity_refs.regions[0] } : {}),
          ...(stat.summary_kpi.period ? { period: stat.summary_kpi.period } : {}),
          href: `/statistics/${encodeURIComponent(stat.statistic_id)}`,
          source_label: item.source_org,
        },
      });
    }
  }

  scored.sort((a, b) => b.priority - a.priority || a.hit.id.localeCompare(b.hit.id));
  return scored.slice(0, limit).map((s) => s.hit);
}

function importText(
  filename: string,
  textData: string,
  mode: "upsert" | "append" = "append",
): ImportResult | { fileError: { code: ErrorCode; params: ErrorParams } } {
  const parsed = parseObservationCsv(textData, { maxRows: 5000, knownIndicatorIds: knownIds });
  if (!parsed.ok) return { fileError: { code: parsed.fileError.code, params: parsed.fileError.params as ErrorParams } };
  const { errors } = parsed;
  const rows =
    mode === "upsert"
      ? [
          ...new Map(
            parsed.rows.map((r) => [
              `${r.indicator_id}\u0000${r.period}\u0000${r.geo}\u0000${canonicalizeDimsJson(r.dims)}`,
              r,
            ]),
          ).values(),
        ]
      : parsed.rows;
  const status: ImportStatus = rows.length === 0 ? "failed" : errors.length ? "completed_with_errors" : "completed";
  clock = Math.max(clock + 60_000, Date.now());
  const created_at = new Date(clock).toISOString();
  const id = crypto.randomUUID();
  batches.push({ id, filename, status, row_ok: rows.length, row_err: errors.length, errors_json: errors, created_at });

  if (mode === "upsert") {
    const incomingKeys = new Set(
      rows.map((r) => `${r.indicator_id}\u0000${r.period}\u0000${r.geo}\u0000${canonicalizeDimsJson(r.dims)}`),
    );
    for (let idx = observations.length - 1; idx >= 0; idx--) {
      const o = observations[idx];
      const k = `${o.indicator_id}\u0000${o.period}\u0000${o.geo}\u0000${canonicalizeDimsJson(o.dims)}`;
      if (incomingKeys.has(k)) {
        observations.splice(idx, 1);
      }
    }
  }

  for (const r of rows) {
    observations.push({
      id: String(nextObservationId++),
      indicator_id: r.indicator_id,
      period: r.period,
      geo: r.geo,
      dims: r.dims,
      value_num: r.value_num,
      value_text: r.value_text,
      unit: r.unit,
      batch_id: id,
      created_at,
    });
  }
  return { batch_id: id, status, row_ok: rows.length, row_err: errors.length, errors };
}

importText("trd_sample.csv", sampleCsv);
importText("trd_demo.csv", makeDemoCsv());

function withStats(i: Indicator): Indicator {
  const own = observations.filter((o) => o.indicator_id === i.id);
  return {
    ...i,
    obs_count: own.length,
    latest_period: own.reduce<string | null>((m, o) => (m === null || o.period > m ? o.period : m), null),
  };
}

const json = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
const fail = (status: number, code: ErrorCode, params: ErrorParams = {}) => json(errorBody(code, params), status);

const text = (q: URLSearchParams, k: string) => q.get(k)?.trim() || null;
function int(raw: string | null, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? Math.min(n, max) : fallback;
}

async function handle(
  method: string,
  url: URL,
  body: BodyInit | null | undefined,
  reqHeaders: Headers,
): Promise<Response> {
  const path = url.pathname;
  const q = url.searchParams;

  if (method === "GET" && path === "/api/health") return json({ ok: true, db: "ok" });
  if (method === "GET" && path === "/api/clusters") return json({ items: clusters });

  if (method === "GET" && path === "/api/indicators") {
    const phase = text(q, "phase");
    const cluster = text(q, "cluster");
    const items = indicators
      .filter((i) => (!phase || i.phase === phase) && (!cluster || i.cluster_code === cluster))
      .map((i) => {
        const { spec_json: _spec, ...rest } = withStats(i);
        void _spec;
        return rest;
      });
    return json({ items });
  }

  const detail = path.match(/^\/api\/indicators\/([^/]+)$/);
  if (method === "GET" && detail) {
    const id = decodeURIComponent(detail[1]);
    const found = indicators.find((i) => i.id === id);
    return found ? json(withStats(found)) : fail(404, "NOT_FOUND", { resource: "indicator", id });
  }

  if (method === "GET" && path === "/api/observations") {
    const f = Object.fromEntries(
      ["indicator_id", "period", "period_from", "period_to", "geo", "batch_id", "q"].map((k) => [k, text(q, k)]),
    );
    const limit = int(q.get("limit"), 100, 1, OBSERVATION_LIMIT_MAX);
    const offset = int(q.get("offset"), 0, 0);
    const matched = observations
      .filter(
        (o) =>
          (!f.indicator_id || o.indicator_id === f.indicator_id) &&
          (!f.period || o.period === f.period) &&
          (!f.period_from || o.period >= f.period_from) &&
          (!f.period_to || o.period.slice(0, f.period_to.length) <= f.period_to) &&
          (!f.geo || o.geo === f.geo) &&
          (!f.batch_id || o.batch_id === f.batch_id) &&
          observationMatchesQuery(o, indicatorById.get(o.indicator_id)?.name ?? "", f.q),
      )
      .sort((a, b) => b.period.localeCompare(a.period) || Number(b.id) - Number(a.id));
    return json({ items: matched.slice(offset, offset + limit), total: matched.length, limit, offset });
  }

  // ==================== V2 Statistics API ====================

  if (method === "POST" && path === "/api/statistics/publish") {
    if (typeof body !== "string") return fail(400, "REQUIRED_FIELD_MISSING", { field: "body" });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return fail(400, "REQUIRED_FIELD_MISSING", { field: "body" });
    }
    const stat = (parsed.statistic && typeof parsed.statistic === "object" ? parsed.statistic : parsed) as Statistic;
    if (!stat.statistic_id || !stat.slug || !stat.version || !stat.title || !stat.dataset) {
      return fail(400, "REQUIRED_FIELD_MISSING", { field: "statistic_id" });
    }
    const normalized: Statistic = {
      ...stat,
      published_at: stat.published_at || new Date().toISOString(),
      content_hash: stat.content_hash || `sha256-demo-${stat.statistic_id}-${stat.version}`,
    };
    let vMap = statVersionsById.get(normalized.statistic_id);
    if (!vMap) {
      vMap = new Map<string, Statistic>();
      statVersionsById.set(normalized.statistic_id, vMap);
    }
    const replayed = vMap.has(normalized.version);
    if (!replayed) {
      vMap.set(normalized.version, normalized);
      latestStatById.set(normalized.statistic_id, normalized);
      statIdBySlug.set(normalized.slug, normalized.statistic_id);
    }
    const latestVer = latestStatById.get(normalized.statistic_id)?.version ?? normalized.version;
    return json({
      ok: true,
      statistic_id: normalized.statistic_id,
      version: normalized.version,
      latest_version: latestVer,
      content_hash: (vMap.get(normalized.version) ?? normalized).content_hash,
      replayed,
    });
  }

  if (method === "GET" && path === "/api/statistics") {
    const rawQ = text(q, "q");
    const tokens = tokenizeQuery(rawQ);
    const topic = text(q, "topic");
    const v3Seq = text(q, "v3_seq");
    const entity = text(q, "entity");
    const hasForecast = parseOptionalBool(q.get("has_forecast"));
    const hasBreak = parseOptionalBool(q.get("has_break"));
    const limit = int(q.get("limit"), 50, 1, 200);
    const offset = int(q.get("offset"), 0, 0);

    const paddedV3 = v3Seq && /^\d+$/.test(v3Seq) ? v3Seq.padStart(2, "0") : v3Seq;
    const mergedStats: Statistic[] = [
      ...latestStatById.values(),
      ...loadDemoAdaptedTradeStatistics().filter(
        (s) => !latestStatById.has(s.statistic_id) && !statIdBySlug.has(s.slug),
      ),
    ];
    const allItems = mergedStats
      .map((s) => toStatisticListItem(s, s.version))
      .filter((item) => {
        if (topic && !item.topic_tags.some((t) => t.toLowerCase() === topic.toLowerCase())) return false;
        if (
          v3Seq &&
          !item.v3_seqs.some(
            (s) => s.toLowerCase() === v3Seq.toLowerCase() || (paddedV3 && s.toLowerCase() === paddedV3.toLowerCase()),
          )
        ) {
          return false;
        }
        if (entity) {
          const refs = Object.values(item.entity_refs).flatMap((arr) => arr ?? []);
          if (!refs.some((r) => r.toLowerCase() === entity.toLowerCase())) return false;
        }
        if (hasForecast !== null && item.has_forecast !== hasForecast) return false;
        if (hasBreak !== null && item.has_methodology_break !== hasBreak) return false;
        if (tokens.length > 0) {
          const hay = [
            item.statistic_id,
            item.slug,
            item.title,
            item.subtitle,
            item.insight,
            item.source_org,
            item.topic_tags.join(" "),
            item.v3_seqs.join(" "),
            JSON.stringify(item.entity_refs),
          ].join(" ");
          if (!matchesQuery(hay, tokens)) return false;
        }
        return true;
      })
      .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.statistic_id.localeCompare(b.statistic_id));

    const page: StatisticListPage = {
      items: allItems.slice(offset, offset + limit),
      total: allItems.length,
      limit,
      offset,
    };
    return json(page);
  }

  const statVersionsMatch = path.match(/^\/api\/statistics\/([^/]+)\/versions$/);
  if (method === "GET" && statVersionsMatch) {
    const rawId = decodeURIComponent(statVersionsMatch[1]!);
    const statId = resolveDemoStatId(rawId);
    if (!statId) {
      const adapted = loadDemoAdaptedTradeStatistics().find((s) => s.statistic_id === rawId || s.slug === rawId);
      if (adapted) {
        const resp: StatisticVersionsResponse = {
          statistic_id: adapted.statistic_id,
          latest_version: adapted.version,
          items: listDemoAdaptedTradeStatisticVersions(adapted),
        };
        return json(resp);
      }
      return fail(404, "NOT_FOUND", { resource: "statistic", id: rawId });
    }
    const latest = latestStatById.get(statId)!;
    const vMap = statVersionsById.get(statId) ?? new Map<string, Statistic>();
    const items = [...vMap.values()]
      .map((v) => ({ version: v.version, content_hash: v.content_hash, published_at: v.published_at }))
      .sort((a, b) => b.published_at.localeCompare(a.published_at) || b.version.localeCompare(a.version));
    const resp: StatisticVersionsResponse = {
      statistic_id: statId,
      latest_version: latest.version,
      items,
    };
    return json(resp);
  }

  const statDetailMatch = path.match(/^\/api\/statistics\/([^/]+)$/);
  if (method === "GET" && statDetailMatch) {
    const rawId = decodeURIComponent(statDetailMatch[1]!);
    const requestedVersion = text(q, "v") ?? text(q, "version");
    const statId = resolveDemoStatId(rawId);

    if (!statId) {
      const latestAdapted = loadDemoAdaptedTradeStatistics().find((s) => s.statistic_id === rawId || s.slug === rawId);
      let targetAdapted: Statistic | undefined =
        !requestedVersion || (latestAdapted && requestedVersion === latestAdapted.version)
          ? latestAdapted
          : undefined;

      if (requestedVersion && !targetAdapted) {
        const histList = loadDemoHistoricalAdaptedTradeStatistics(requestedVersion);
        targetAdapted = histList.find((s) => s.statistic_id === rawId || s.slug === rawId);
        if (!targetAdapted) {
          if (!latestAdapted) return fail(404, "NOT_FOUND", { resource: "statistic", id: rawId });
          return fail(404, "NOT_FOUND", { resource: "statistic_version", id: rawId, version: requestedVersion });
        }
      }

      if (!targetAdapted) return fail(404, "NOT_FOUND", { resource: "statistic", id: rawId });

      const latestVer = latestAdapted?.version ?? targetAdapted.version;
      const etag = `"${targetAdapted.content_hash}"`;
      const cacheControl = requestedVersion ? "public, max-age=31536000, immutable" : "public, max-age=60";
      const inm = reqHeaders.get("if-none-match");
      if (inm && inm.split(",").map((s) => s.trim()).includes(etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
      }
      if (q.get("raw") === "1" || q.get("raw") === "true") {
        return json(targetAdapted, 200, { ETag: etag, "Cache-Control": cacheControl });
      }
      const related: StatisticListItem[] = targetAdapted.related_statistic_ids
        .map((rid) => latestStatById.get(rid))
        .filter((s): s is Statistic => Boolean(s))
        .map((s) => toStatisticListItem(s, s.version));

      const detailBody: StatisticDetailResponse = {
        statistic: targetAdapted,
        latest_version: latestVer,
        is_historical_version: targetAdapted.version !== latestVer,
        related,
      };
      return json(detailBody, 200, { ETag: etag, "Cache-Control": cacheControl });
    }

    const latest = latestStatById.get(statId)!;
    const targetVersion = requestedVersion ?? latest.version;
    const found = statVersionsById.get(statId)?.get(targetVersion);
    if (!found) {
      return fail(404, "NOT_FOUND", { resource: "statistic_version", id: rawId, version: targetVersion });
    }

    const etag = `"${found.content_hash}"`;
    const cacheControl = requestedVersion ? "public, max-age=31536000, immutable" : "public, max-age=60";
    const inm = reqHeaders.get("if-none-match");
    if (inm && inm.split(",").map((s) => s.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
    }

    if (q.get("raw") === "1" || q.get("raw") === "true") {
      return json(found, 200, { ETag: etag, "Cache-Control": cacheControl });
    }

    const related: StatisticListItem[] = found.related_statistic_ids
      .map((rid) => latestStatById.get(rid))
      .filter((s): s is Statistic => Boolean(s))
      .map((s) => toStatisticListItem(s, s.version));

    const detailBody: StatisticDetailResponse = {
      statistic: found,
      latest_version: latest.version,
      is_historical_version: found.version !== latest.version,
      related,
    };
    return json(detailBody, 200, { ETag: etag, "Cache-Control": cacheControl });
  }

  // ==================== V2 Catalog API ====================

  if (method === "GET" && path === "/api/catalog") {
    const kind = text(q, "kind");
    const rawQ = text(q, "q");
    const region = text(q, "region");
    const period = text(q, "period");
    const category = text(q, "category");
    const subkind = text(q, "subkind");
    const tag = text(q, "tag");
    const limit = int(q.get("limit"), 50, 1, 200);
    const offset = int(q.get("offset"), 0, 0);

    const matched = catalogRecords
      .filter((r) => {
        if (kind && r.kind !== kind) return false;
        if (region && r.region !== region) return false;
        if (period && !(r.period === period || (r.period ?? "").startsWith(period))) return false;
        if (category && r.category !== category) return false;
        if (subkind && r.subkind !== subkind) return false;
        if (tag && !r.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
        if (rawQ && !catalogMatchesQuery(r, rawQ)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (b.period ?? "").localeCompare(a.period ?? "") ||
          b.updated_at.localeCompare(a.updated_at) ||
          a.id.localeCompare(b.id),
      );

    const aliasCandidates = rawQ
      ? catalogRecords.filter((r) => !kind || r.kind === kind)
      : [];
    const aliasCorrection = rawQ ? detectCatalogAliasCorrection(rawQ, matched.length > 0 ? matched : aliasCandidates) : null;

    const page: CatalogPage = {
      items: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
      alias_correction: aliasCorrection,
    };
    return json(page);
  }

  const catalogDetailMatch = path.match(/^\/api\/catalog\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && catalogDetailMatch) {
    const kind = decodeURIComponent(catalogDetailMatch[1]!);
    const key = decodeURIComponent(catalogDetailMatch[2]!);
    const normKey = normalizeAliasKey(key);

    const record = catalogRecords.find(
      (r) =>
        r.kind === kind &&
        (r.slug === key || r.id === key || r.code === key || (r.code ? normalizeAliasKey(r.code) === normKey : false)),
    );
    if (!record) {
      return fail(404, "NOT_FOUND", { resource: "catalog_record", id: `${kind}/${key}` });
    }

    const peerIds = new Set<string>();
    for (const rel of V2_SEED_ENTITY_RELATIONS) {
      if (rel.from_id === record.id) peerIds.add(rel.to_id);
      if (rel.to_id === record.id) peerIds.add(rel.from_id);
    }
    const relatedRecords = catalogRecords
      .filter((c) => peerIds.has(c.id))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

    const citedIds = new Set<string>();
    const rawCited = record.detail?.cited_statistics;
    if (Array.isArray(rawCited)) {
      for (const sid of rawCited) {
        if (typeof sid === "string") citedIds.add(sid);
      }
    }
    const rawChapters = record.detail?.chapters;
    if (Array.isArray(rawChapters)) {
      for (const ch of rawChapters) {
        const pinned = (ch as { pinned_statistics?: Array<{ statistic_id?: string }> })?.pinned_statistics;
        if (Array.isArray(pinned)) {
          for (const p of pinned) {
            if (p?.statistic_id) citedIds.add(p.statistic_id);
          }
        }
      }
    }

    const matchKeys = new Set([record.slug, record.id, record.code ?? "", record.category ?? ""].filter(Boolean));
    const relatedStats = [...latestStatById.values()]
      .filter((s) => {
        if (citedIds.has(s.statistic_id)) return true;
        const refs = Object.values(s.entity_refs).flatMap((arr) => arr ?? []);
        return refs.some((ref) => matchKeys.has(ref));
      })
      .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.statistic_id.localeCompare(b.statistic_id))
      .map((s) => toStatisticListItem(s, s.version));

    const resp: CatalogDetailResponse = {
      record,
      related_records: relatedRecords,
      related_statistics: relatedStats,
    };
    return json(resp);
  }

  if (method === "GET" && path === "/api/search") {
    const rawQ = text(q, "q") ?? "";
    const tokens = tokenizeQuery(rawQ);
    const limit = int(q.get("limit"), 12, 1, 50);
    if (tokens.length === 0) {
      const empty: GlobalSearchResult = {
        query: "",
        observations: { items: [], total: 0 },
        indicators: { items: [], total: 0 },
        v2_hits: [],
      };
      return json(empty);
    }
    const matchedObs = observations
      .filter((o) => observationMatchesQuery(o, indicatorById.get(o.indicator_id)?.name ?? "", rawQ))
      .sort((a, b) => b.period.localeCompare(a.period) || Number(b.id) - Number(a.id))
      .map((o) => {
        const ind = indicatorById.get(o.indicator_id);
        return {
          ...o,
          indicator_name: ind?.name ?? o.indicator_id,
          cluster_code: ind?.cluster_code ?? "",
        };
      });
    const matchedInds = indicators
      .filter((i) => {
        const def = String(i.spec_json.definition ?? "");
        const src = String(i.spec_json.source ?? "");
        return matchesQuery(`${i.id} ${i.name} ${i.cluster_code} ${def} ${src}`, tokens);
      })
      .map((i) => {
        const { spec_json: _spec, ...rest } = withStats(i);
        void _spec;
        return rest;
      })
      .sort((a, b) => b.obs_count - a.obs_count || a.id.localeCompare(b.id));

    const searchBody: GlobalSearchResult = {
      query: rawQ,
      observations: { items: matchedObs.slice(0, limit), total: matchedObs.length },
      indicators: { items: matchedInds.slice(0, limit), total: matchedInds.length },
      v2_hits: searchDemoV2Hits(rawQ, limit),
    };
    return json(searchBody);
  }

  if (method === "POST" && path === "/api/import/csv") {
    if (body instanceof FormData) {
      const file = body.get("file");
      const rawMode = body.get("mode");
      const mode = rawMode === "upsert" ? "upsert" : "append";
      if (!file || typeof file === "string") return fail(400, "FILE_REQUIRED");
      const result = importText(file.name || "upload.csv", await file.text(), mode);
      return "fileError" in result ? fail(400, result.fileError.code, result.fileError.params) : json(result);
    }
    if (typeof body === "string") {
      try {
        const parsedBody = JSON.parse(body) as { filename?: string; csvText?: string; mode?: string };
        if (typeof parsedBody.csvText !== "string") return fail(400, "FILE_REQUIRED");
        const mode = parsedBody.mode === "upsert" ? "upsert" : "append";
        const result = importText(parsedBody.filename || "upload.csv", parsedBody.csvText, mode);
        return "fileError" in result ? fail(400, result.fileError.code, result.fileError.params) : json(result);
      } catch {
        return fail(400, "FILE_REQUIRED");
      }
    }
    return fail(400, "FILE_REQUIRED");
  }

  if (method === "GET" && path === "/api/import/batches") {
    return json({ items: [...batches].reverse().slice(0, 50) });
  }

  if (method === "GET" && path === "/api/trade/overview") {
    const reqPeriod = text(q, "period");
    const dictVersion = text(q, "dictVersion") ?? "202601";
    const releaseId = text(q, "releaseId");
    if (reqPeriod && !parseTradePeriod(reqPeriod)) {
      return fail(400, "TRADE_PERIOD_INVALID", { period: reqPeriod });
    }
    if (releaseId) {
      const rel = demoTradeReleases.find((r) => r.dictVersion === dictVersion && r.releaseId === releaseId);
      const pid = reqPeriod ?? (rel ? ([...rel.publishedMonths].sort().at(-1) ?? "") : "");
      const pinnedSnap = pid ? demoTradePeriodSnapshots.get(`${dictVersion}|${pid}|${releaseId}`) : undefined;
      if (pinnedSnap) {
        return json(normalizeTradeOverviewSnapshot({ ...pinnedSnap }));
      }
      return fail(404, "NOT_FOUND", {
        resource: "trade_snapshot",
        id: pid ? `${pid}@${releaseId}` : releaseId,
        period: pid,
        releaseId,
      });
    }
    if (reqPeriod) {
      return fail(404, "NOT_FOUND", { resource: "trade_period", id: reqPeriod });
    }
    const empty: TradeOverviewEmpty = {
      status: "empty",
      period: null,
      source: "china_customs",
      dictVersion,
      releaseId: null,
      units: { amount: "USD", displayAmount: "100M_USD", share: "PCT", cr: "PCT", hhi: "0_10000" },
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
    return json(empty);
  }

  if (method === "GET" && path === "/api/trade/periods") {
    return json({
      dictVersion: text(q, "dictVersion") ?? "202601",
      releaseId: null,
      publishedMonths: [],
      availablePeriods: [],
    });
  }

  if (method === "GET" && path === "/api/trade/batches") {
    return json({ items: [] });
  }

  if (method === "GET" && path === "/api/trade/coverage") {
    const year = url.searchParams.get("year") ?? "2024";
    return json({
      dictVersion: url.searchParams.get("dictVersion") ?? "202601",
      dictSha256: "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b",
      hs8Count: 164,
      hs6Count: 117,
      categoryCount: 11,
      fromMonth: `${year}-01`,
      toMonth: `${year}-12`,
      monthCount: 12,
      summary: {
        totalCells: 15_744,
        received: 0,
        confirmedEmpty: 0,
        missing: 15_744,
        notApplicable: 0,
        publishableMonths: 0,
        publishedMonths: 0,
      },
      months: [],
    });
  }

  if (method === "GET" && path === "/api/stats") {
    const withData = new Set(observations.map((o) => o.indicator_id));
    const phase1 = indicators.filter((i) => i.phase === "phase1");
    const latest = batches.at(-1);
    const clusterStats: ClusterStats[] = clusters.map((c) => {
      const own = indicators.filter((i) => i.cluster_code === c.code);
      return {
        code: c.code,
        name: c.name,
        phase1: own.filter((i) => i.phase === "phase1").length,
        phase1_with_data: own.filter((i) => i.phase === "phase1" && withData.has(i.id)).length,
        later: own.filter((i) => i.phase !== "phase1").length,
        observations: observations.filter((o) => own.some((i) => i.id === o.indicator_id)).length,
      };
    });
    const stats: Stats = {
      indicators: {
        total: indicators.length,
        phase1: phase1.length,
        phase1_with_data: phase1.filter((i) => withData.has(i.id)).length,
      },
      observations: {
        total: observations.length,
        latest_period: observations.reduce<string | null>((m, o) => (m === null || o.period > m ? o.period : m), null),
      },
      clusters: clusterStats,
      latest_batch: latest
        ? { id: latest.id, filename: latest.filename, status: latest.status, row_ok: latest.row_ok, row_err: latest.row_err, created_at: latest.created_at }
        : null,
    };
    return json(stats);
  }

  return fail(404, "NOT_FOUND", { resource: "route", id: `${method} ${path}` });
}

/** 与 fetch 同签名；请求在内存里处理，带一点延迟以便看到加载状态 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://demo.local");
  const reqHeaders = new Headers(init?.headers);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, LATENCY_MS);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
  return handle((init?.method ?? "GET").toUpperCase(), url, init?.body, reqHeaders);
}
