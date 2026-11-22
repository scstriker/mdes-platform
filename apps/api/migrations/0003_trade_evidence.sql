-- 贸易批次空结果证据归档表（见 docs/API.md「POST /api/trade/import」与 docs/海关原件采集规程.md）

CREATE TABLE IF NOT EXISTS trade_batch_evidence (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES trade_import_batch(batch_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  covered_hs8_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(covered_hs8_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trade_batch_evidence_batch_idx ON trade_batch_evidence (batch_id);
