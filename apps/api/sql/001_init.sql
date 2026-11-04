CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS subsystem (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indicator_cluster (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subsystem_id TEXT NOT NULL REFERENCES subsystem(id) DEFAULT 'med'
);

CREATE TABLE IF NOT EXISTS indicator (
  id TEXT PRIMARY KEY,
  cluster_code TEXT NOT NULL REFERENCES indicator_cluster(code),
  name TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'later',
  update_freq TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'unknown',
  phase_scope TEXT NOT NULL DEFAULT '',
  spec_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS import_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  row_ok INT NOT NULL DEFAULT 0,
  row_err INT NOT NULL DEFAULT 0,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observation (
  id BIGSERIAL PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicator(id),
  period TEXT NOT NULL,
  geo TEXT NOT NULL DEFAULT 'CN',
  dims JSONB NOT NULL DEFAULT '{}'::jsonb,
  value_num DOUBLE PRECISION,
  value_text TEXT,
  unit TEXT NOT NULL DEFAULT '',
  batch_id UUID REFERENCES import_batch(id),
  object_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS observation_indicator_period_idx
  ON observation (indicator_id, period);
CREATE INDEX IF NOT EXISTS observation_dims_gin ON observation USING GIN (dims);

CREATE TABLE IF NOT EXISTS entity_enterprise (
  uscc TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS entity_product (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_code TEXT,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS entity_license (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_uri TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunk (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS agent_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_call_log (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID REFERENCES agent_run(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO subsystem (id, name) VALUES ('med', '医疗装备')
ON CONFLICT (id) DO NOTHING;
