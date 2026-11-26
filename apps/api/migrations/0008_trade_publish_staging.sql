-- 大批量发布暂存表：先分批落盘完整快照与派生观测值，再在单次原子事务内切换可见版本并同步全库跨年趋势
CREATE TABLE IF NOT EXISTS trade_publish_staged_snapshot (
  staging_id TEXT NOT NULL,
  dict_version TEXT NOT NULL,
  period TEXT NOT NULL,
  source_batches_json TEXT NOT NULL CHECK (json_valid(source_batches_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (staging_id, period)
);

CREATE TABLE IF NOT EXISTS trade_publish_staged_observation (
  staging_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  indicator_id TEXT NOT NULL,
  period TEXT NOT NULL,
  geo TEXT NOT NULL,
  dims TEXT NOT NULL CHECK (json_valid(dims)),
  value_num REAL,
  value_text TEXT,
  unit TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  object_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (staging_id, seq)
);
