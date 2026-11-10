-- MDES 数据库（Cloudflare D1 / SQLite），见 docs/DATA_MODEL.md 与 docs/decisions/ADR-003-cloudflare-d1.md。
-- JSON 字段存 TEXT（json_valid 约束），用 json_extract / json_each 读取；时间存 ISO 8601 文本。
-- 本轮不含向量：document_chunk 不带 embedding 列，二期知识库另行选型。

CREATE TABLE IF NOT EXISTS subsystem (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indicator_cluster (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subsystem_id TEXT NOT NULL DEFAULT 'med' REFERENCES subsystem(id)
);

CREATE TABLE IF NOT EXISTS indicator (
  id TEXT PRIMARY KEY,
  cluster_code TEXT NOT NULL REFERENCES indicator_cluster(code),
  name TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'later',
  update_freq TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'unknown',
  phase_scope TEXT NOT NULL DEFAULT '',
  spec_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(spec_json))
);

CREATE TABLE IF NOT EXISTS import_batch (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  row_ok INTEGER NOT NULL DEFAULT 0,
  row_err INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS import_batch_created_idx ON import_batch (created_at);

CREATE TABLE IF NOT EXISTS observation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id TEXT NOT NULL REFERENCES indicator(id),
  period TEXT NOT NULL,
  geo TEXT NOT NULL DEFAULT 'CN',
  dims TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dims)),
  value_num REAL,
  value_text TEXT,
  unit TEXT NOT NULL DEFAULT '',
  batch_id TEXT REFERENCES import_batch(id),
  object_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS observation_indicator_period_idx ON observation (indicator_id, period);
CREATE INDEX IF NOT EXISTS observation_batch_idx ON observation (batch_id);

-- 预留：所级底座对象
CREATE TABLE IF NOT EXISTS entity_enterprise (
  uscc TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  attrs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs))
);

CREATE TABLE IF NOT EXISTS entity_product (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_code TEXT,
  attrs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs))
);

CREATE TABLE IF NOT EXISTS entity_license (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  attrs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs))
);

-- 预留：知识库（本轮不存向量）
CREATE TABLE IF NOT EXISTS document (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_uri TEXT,
  meta TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS document_chunk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta))
);

-- 预留：Agent 运行记录
CREATE TABLE IF NOT EXISTS agent_run (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input_json)),
  output_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(output_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tool_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES agent_run(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(args_json)),
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO subsystem (id, name) VALUES ('med', '医疗装备');
