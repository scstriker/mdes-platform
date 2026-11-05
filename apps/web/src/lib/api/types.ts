/**
 * API 数据类型。阶段 2 新建 packages/shared 后迁过去，前后端共用。
 * 标注「阶段 2」的字段由 ADR-002「API 改动」新增，旧接口可能不返回。
 */

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
  /** 阶段 2：观测值条数 */
  obs_count?: number;
  /** 阶段 2：最近期间 */
  latest_period?: string | null;
  /** 阶段 2：采集方式，取自 spec_json */
  automation?: string | null;
};

export type Indicator = IndicatorListItem & { spec_json?: Record<string, unknown> };

export type Observation = {
  id: number | string;
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
  period?: string;
  /** 阶段 2 */
  geo?: string;
  batch_id?: string;
  period_from?: string;
  period_to?: string;
  limit?: number;
  offset?: number;
};

export type ObservationPage = {
  items: Observation[];
  /** 阶段 2：符合条件的总条数 */
  total?: number;
};

export type ImportStatus = "pending" | "completed" | "failed" | "completed_with_errors";

export type ImportRowError = { line: number; code?: string; params?: Record<string, string | number>; message?: string };

export type ImportResult = {
  batch_id: string | null;
  status: ImportStatus;
  row_ok: number;
  row_err: number;
  errors: ImportRowError[];
};

export type ImportBatch = {
  id: string;
  filename: string;
  status: ImportStatus;
  row_ok: number;
  row_err: number;
  errors_json: ImportRowError[];
  created_at: string;
};

export type Health = { ok: boolean; db: string; vector: boolean; embedding_dims?: number };

/** 阶段 2：GET /api/stats */
export type Stats = {
  indicators: { total: number; phase1: number; phase1_with_data: number };
  observations: { total: number; latest_period: string | null };
  clusters: {
    code: string;
    name: string;
    phase1: number;
    phase1_with_data: number;
    later: number;
    observations: number;
  }[];
  latest_batch: ImportBatch | null;
};
