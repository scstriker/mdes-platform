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

export type ImportStatus = "completed" | "completed_with_errors" | "failed";

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
