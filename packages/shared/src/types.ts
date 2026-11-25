/** 接口数据类型，前后端共用。字段名与数据库列一致（见 docs/DATA_MODEL.md、docs/API.md）。 */
import type { RowError } from "./errors";

export type Phase = "phase1" | "later";

export type Cluster = { code: string; name: string; subsystem_id: string };

export type IndicatorListItem = {
  id: string;
  cluster_code: string;
  name: string;
  phase: Phase;
  update_freq: string;
  source_kind: string;
  phase_scope: string;
  /** 观测值条数 */
  obs_count: number;
  /** 最近期间；没有观测值时为 null */
  latest_period: string | null;
  /** 采集方式（spec_json.automation），如「全自动」「人工整理」 */
  automation: string | null;
};

export type Indicator = IndicatorListItem & { spec_json: Record<string, unknown> };

export type Observation = {
  /** bigserial，按字符串返回 */
  id: string;
  indicator_id: string;
  period: string;
  geo: string;
  dims: Record<string, unknown>;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  batch_id: string | null;
  created_at: string;
};

export type ObservationQuery = {
  indicator_id?: string;
  /** 精确匹配 */
  period?: string;
  /** 起始期间（含），按字符串比较 */
  period_from?: string;
  /** 截止期间（含）；以它为前缀的子期间也算在内，如 2024 含 2024-12 */
  period_to?: string;
  geo?: string;
  batch_id?: string;
  /** 关键词多词项检索（跨指标编号/名称、期间、地域、维度、数值文本与批次） */
  q?: string;
  /** 默认 100，最大 500 */
  limit?: number;
  /** 默认 0 */
  offset?: number;
};

export type ObservationPage = {
  items: Observation[];
  /** 符合筛选条件的总条数（不受 limit / offset 影响） */
  total: number;
  limit: number;
  offset: number;
};

export type ObservationSearchHit = Observation & {
  indicator_name: string;
  cluster_code: string;
};

/** GET /api/search 全站动态数据库检索返回体 */
export type GlobalSearchResult = {
  query: string;
  observations: {
    items: ObservationSearchHit[];
    total: number;
  };
  indicators: {
    items: IndicatorListItem[];
    total: number;
  };
};

export type ImportStatus = "completed" | "completed_with_errors" | "failed";
export type CsvWriteMode = "upsert" | "append";

export type ImportResult = {
  batch_id: string;
  status: ImportStatus;
  row_ok: number;
  row_err: number;
  errors: RowError[];
};

export type ImportBatchSummary = {
  id: string;
  filename: string;
  status: ImportStatus;
  row_ok: number;
  row_err: number;
  created_at: string;
};

export type ImportBatch = ImportBatchSummary & { errors_json: RowError[] };

/** GET /api/health；数据库不可用时 ok 为 false，并附带 error（统一错误体） */
export type Health = { ok: boolean; db: "ok" | "error" };

export type ClusterStats = {
  code: string;
  name: string;
  phase1: number;
  phase1_with_data: number;
  later: number;
  observations: number;
};

/** GET /api/stats */
export type Stats = {
  indicators: { total: number; phase1: number; phase1_with_data: number };
  observations: { total: number; latest_period: string | null };
  clusters: ClusterStats[];
  latest_batch: ImportBatchSummary | null;
};

import type { ConcentrationMetrics, TradeFlow, TradeGrouping, TradePublishStatus } from "./trade";

export type TradeImportCoverage = {
  received: string[];
  confirmedEmpty: string[];
  missing: string[];
};

export type TradeImportResponse = {
  batchId: string;
  sourceSha256: string;
  evidenceSha256s: string[];
  rowCount: number;
  coverage: TradeImportCoverage;
  status: TradePublishStatus;
  releaseId: string | null;
  replayed: boolean;
  reconciliationNote?: string | null;
};

export type TradeBulkImportResponse = {
  dictVersion: string;
  months: string[];
  monthCount: number;
  batchIds: string[];
  sourceSha256: string;
  evidenceSha256s: string[];
  totalRowCount: number;
  status: TradePublishStatus;
  releaseId: string | null;
  publishedMonths: string[];
  reconciliationNotes: Record<string, string>;
};

export type TradePublishResponse = {
  dictVersion: string;
  published: boolean;
  releaseId: string | null;
  newlyPublishedMonths: string[];
  publishedMonths: string[];
  availablePeriods: string[];
  reconciliationNotes: Record<string, string>;
};

export type TradeSourceBatchRef = {
  batchId: string;
  month: string;
  flow: TradeFlow;
  grouping: TradeGrouping;
  filename: string;
  sourceSha256: string;
  evidenceSha256s: string[];
  rowCount: number;
};

export type TradeQuantityStat = {
  value: number | null;
  unit: string | null;
};

export type TradeTotals = {
  importUsd: number;
  exportUsd: number;
  balanceUsd: number;
  importYoyPct: number | null;
  exportYoyPct: number | null;
};

export type TradeTrendPoint = {
  period: string;
  importUsd: number;
  exportUsd: number;
  balanceUsd: number;
  importYoyPct: number | null;
  exportYoyPct: number | null;
  isPartial: boolean;
};

export type TradeCategoryStat = {
  categoryId: string;
  category: string;
  order: number;
  hs8Count: number;
  hsRange: string;
  importUsd: number;
  exportUsd: number;
  balanceUsd: number;
  importYoyPct: number | null;
  exportYoyPct: number | null;
  importConcentration: ConcentrationMetrics;
  exportConcentration: ConcentrationMetrics;
  topImportPartners: string[];
  topExportPartners: string[];
};

export type TradePartnerStat = {
  partnerCode: string;
  partnerName: string;
  importUsd: number;
  exportUsd: number;
  balanceUsd: number;
  importSharePct: number | null;
  exportSharePct: number | null;
  topCategory: string;
};

export type TradeRegimeStat = {
  regimeCode: string;
  regimeName: string;
  importUsd: number;
  exportUsd: number;
  importSharePct: number | null;
  exportSharePct: number | null;
};

export type TradeRegionStat = {
  regionCode: string;
  regionName: string;
  importUsd: number;
  exportUsd: number;
  importSharePct: number | null;
  exportSharePct: number | null;
};

export type TradeHsItemStat = {
  hs8: string;
  hs6: string;
  itemName: string;
  category: string;
  importUsd: number;
  exportUsd: number;
  balanceUsd: number;
  importYoyPct: number | null;
  exportYoyPct: number | null;
  importQty1: TradeQuantityStat;
  importQty2: TradeQuantityStat;
  exportQty1: TradeQuantityStat;
  exportQty2: TradeQuantityStat;
  importConcentration: ConcentrationMetrics;
  exportConcentration: ConcentrationMetrics;
  topImportPartners: string[];
  topExportPartners: string[];
};

export type TradeUnitsMeta = {
  amount: "USD";
  displayAmount: "100M_USD";
  share: "PCT";
  cr: "PCT";
  hhi: "0_10000";
};

export type TradeGroupingTotals = {
  product: { importUsd: number; exportUsd: number };
  partner: { importUsd: number; exportUsd: number; count: number };
  regime: { importUsd: number; exportUsd: number; count: number };
  region: { importUsd: number; exportUsd: number; count: number };
};

export type TradeBatchListItem = {
  batchId: string;
  dictVersion: string;
  month: string;
  flow: TradeFlow;
  currency: string;
  grouping: TradeGrouping;
  filename: string;
  sourceSha256: string;
  evidenceSha256s: string[];
  rowCount: number;
  publishState: TradePublishStatus;
  supersededBy: string | null;
  coverage: TradeImportCoverage;
  createdAt: string;
};

export type TradeOverviewEmpty = {
  status: "empty";
  period: null;
  source: "china_customs";
  dictVersion: string;
  releaseId: null;
  units: TradeUnitsMeta;
  availablePeriods: string[];
  coverage: null;
  sourceBatches: [];
  totals: null;
  groupingTotals: null;
  concentration: null;
  trend: [];
  categories: [];
  partners: [];
  regimes: [];
  regions: [];
  hsItems: [];
};

export type TradeOverviewPublished = {
  status: "published";
  period: string;
  source: "china_customs";
  dictVersion: string;
  releaseId: string;
  units: TradeUnitsMeta;
  availablePeriods: string[];
  coverage: {
    months: string[];
    expectedMonths: number;
    coveredMonths: number;
    applicableHs8Count: number;
    coveredHs8Count: number;
    notApplicableHs8Count: number;
  };
  sourceBatches: TradeSourceBatchRef[];
  totals: TradeTotals;
  groupingTotals: TradeGroupingTotals;
  concentration: {
    import: ConcentrationMetrics;
    export: ConcentrationMetrics;
  };
  trend: TradeTrendPoint[];
  categories: TradeCategoryStat[];
  partners: TradePartnerStat[];
  regimes: TradeRegimeStat[];
  regions: TradeRegionStat[];
  hsItems: TradeHsItemStat[];
};

export type TradeOverviewResponse = TradeOverviewEmpty | TradeOverviewPublished;

export type TradeCoverageCellStatus = "received" | "confirmedEmpty" | "missing" | "notApplicable";

export type TradeCoverageCell = {
  month: string;
  flow: TradeFlow;
  grouping: TradeGrouping;
  hs8: string;
  status: TradeCoverageCellStatus;
  batchId: string | null;
  sourceSha256: string | null;
  evidenceSha256: string | null;
  basis: string | null;
};

export type TradeCoverageMonthSummary = {
  month: string;
  applicableHs8Count: number;
  notApplicableHs8Count: number;
  totalCells: number;
  received: number;
  confirmedEmpty: number;
  missing: number;
  notApplicable: number;
  isPublishable: boolean;
  isPublished: boolean;
};

export type TradeCoverageMatrixResponse = {
  dictVersion: string;
  dictSha256: string;
  hs8Count: number;
  hs6Count: number;
  categoryCount: number;
  fromMonth: string;
  toMonth: string;
  monthCount: number;
  summary: {
    totalCells: number;
    received: number;
    confirmedEmpty: number;
    missing: number;
    notApplicable: number;
    publishableMonths: number;
    publishedMonths: number;
  };
  months: TradeCoverageMonthSummary[];
  cells?: TradeCoverageCell[];
};
