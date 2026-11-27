-- 活跃候选/已发布税号槽位唯一约束：在数据库层原子阻止并发导入对同一 (dict_version, month, flow, grouping, hs8) 的重复或重叠写入
CREATE TABLE IF NOT EXISTS trade_active_hs8_slot (
  dict_version TEXT NOT NULL,
  month TEXT NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('import', 'export')),
  grouping TEXT NOT NULL CHECK (grouping IN ('product', 'partner', 'regime', 'region')),
  hs8 TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES trade_import_batch(batch_id) ON DELETE CASCADE,
  PRIMARY KEY (dict_version, month, flow, grouping, hs8)
);

CREATE INDEX IF NOT EXISTS idx_trade_active_hs8_slot_batch
  ON trade_active_hs8_slot (batch_id);

-- 回填既有活跃批次（superseded_by IS NULL 且 publish_state IN ('staged', 'published')）的唯一税号槽位
INSERT OR IGNORE INTO trade_active_hs8_slot (dict_version, month, flow, grouping, hs8, scope_key, batch_id)
SELECT b.dict_version, b.month, b.flow, b.grouping, c.hs8, b.scope_key, b.batch_id
FROM trade_import_batch b
JOIN trade_hs_coverage c ON c.batch_id = b.batch_id
WHERE b.superseded_by IS NULL
  AND b.publish_state IN ('staged', 'published');
