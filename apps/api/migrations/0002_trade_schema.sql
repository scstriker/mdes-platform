-- 中国海关医疗器械进出口一期数据模型（见 docs/DATA_MODEL.md、docs/贸易后端功能设计.md、docs/decisions/ADR-004-trade-publication.md）

CREATE TABLE IF NOT EXISTS trade_dict_meta (
  dict_version TEXT PRIMARY KEY,
  source_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  hs8_count INTEGER NOT NULL,
  hs6_count INTEGER NOT NULL,
  category_count INTEGER NOT NULL,
  scope_mode TEXT NOT NULL DEFAULT 'full',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS trade_hs_dict (
  dict_version TEXT NOT NULL REFERENCES trade_dict_meta(dict_version) ON DELETE CASCADE,
  hs8 TEXT NOT NULL,
  hs6 TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  category_order INTEGER NOT NULL,
  seq_no INTEGER NOT NULL,
  PRIMARY KEY (dict_version, hs8)
);

CREATE INDEX IF NOT EXISTS trade_hs_dict_hs6_idx ON trade_hs_dict (dict_version, hs6);
CREATE INDEX IF NOT EXISTS trade_hs_dict_cat_idx ON trade_hs_dict (dict_version, category_order, seq_no);

CREATE TABLE IF NOT EXISTS trade_hs_year_applicability (
  dict_version TEXT NOT NULL REFERENCES trade_dict_meta(dict_version) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  hs8 TEXT NOT NULL,
  applicable INTEGER NOT NULL DEFAULT 1,
  basis_note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (dict_version, year, hs8)
);

CREATE TABLE IF NOT EXISTS trade_import_batch (
  batch_id TEXT PRIMARY KEY REFERENCES import_batch(id) ON DELETE CASCADE,
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL,
  currency TEXT NOT NULL,
  grouping TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hs8_json)),
  empty_hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(empty_hs8_json)),
  received_hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(received_hs8_json)),
  confirmed_empty_hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(confirmed_empty_hs8_json)),
  missing_hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_hs8_json)),
  filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  evidence_sha256s_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_sha256s_json)),
  row_count INTEGER NOT NULL DEFAULT 0,
  publish_state TEXT NOT NULL DEFAULT 'staged',
  superseded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trade_import_batch_replay_idx ON trade_import_batch (scope_key, source_sha256);
CREATE INDEX IF NOT EXISTS trade_import_batch_month_idx ON trade_import_batch (dict_version, month, flow, grouping, superseded_by);

CREATE TABLE IF NOT EXISTS trade_hs_coverage (
  batch_id TEXT NOT NULL REFERENCES trade_import_batch(batch_id) ON DELETE CASCADE,
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL,
  grouping TEXT NOT NULL,
  hs8 TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_sha256 TEXT,
  PRIMARY KEY (batch_id, hs8)
);

CREATE INDEX IF NOT EXISTS trade_hs_coverage_lookup_idx ON trade_hs_coverage (dict_version, month, flow, grouping, hs8);

CREATE TABLE IF NOT EXISTS trade_fact (
  batch_id TEXT NOT NULL REFERENCES trade_import_batch(batch_id) ON DELETE CASCADE,
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL,
  grouping TEXT NOT NULL,
  hs8 TEXT NOT NULL,
  item_name TEXT NOT NULL,
  group_code TEXT NOT NULL,
  group_name TEXT NOT NULL,
  usd_scaled INTEGER NOT NULL,
  usd_raw TEXT NOT NULL,
  qty1 REAL,
  unit1 TEXT,
  qty2 REAL,
  unit2 TEXT,
  PRIMARY KEY (batch_id, hs8, group_code)
);

CREATE INDEX IF NOT EXISTS trade_fact_month_idx ON trade_fact (dict_version, month, flow, grouping);

CREATE TABLE IF NOT EXISTS trade_active_scope (
  scope_key TEXT PRIMARY KEY,
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL,
  grouping TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES trade_import_batch(batch_id) ON DELETE CASCADE,
  release_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS trade_active_scope_month_idx ON trade_active_scope (dict_version, month);

CREATE TABLE IF NOT EXISTS trade_reconciliation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL,
  hs8 TEXT NOT NULL,
  grouping TEXT NOT NULL,
  product_usd_scaled INTEGER NOT NULL,
  group_usd_scaled INTEGER NOT NULL,
  diff_usd_scaled INTEGER NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE (dict_version, month, flow, hs8, grouping)
);

CREATE TABLE IF NOT EXISTS trade_release (
  release_id TEXT PRIMARY KEY,
  dict_version TEXT NOT NULL,
  prev_release_id TEXT,
  published_months_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(published_months_json)),
  available_periods_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(available_periods_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS trade_release_dict_created_idx ON trade_release (dict_version, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_period_snapshot (
  snapshot_id TEXT PRIMARY KEY,
  dict_version TEXT NOT NULL,
  period TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES trade_release(release_id) ON DELETE CASCADE,
  source_batches_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_batches_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  UNIQUE (dict_version, period, release_id)
);

CREATE INDEX IF NOT EXISTS trade_period_snapshot_lookup_idx ON trade_period_snapshot (dict_version, period, release_id);

CREATE TABLE IF NOT EXISTS trade_current_snapshot (
  dict_version TEXT NOT NULL,
  period TEXT NOT NULL,
  is_latest_month INTEGER NOT NULL DEFAULT 0,
  release_id TEXT NOT NULL REFERENCES trade_release(release_id) ON DELETE CASCADE,
  available_periods_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(available_periods_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dict_version, period)
);

CREATE INDEX IF NOT EXISTS trade_current_snapshot_latest_idx
  ON trade_current_snapshot (dict_version, is_latest_month)
  WHERE is_latest_month = 1;
