-- 为贸易发布版本表增加单调递增版本序号与唯一索引，实现跨实例并发发布乐观锁（CAS）防覆盖
ALTER TABLE trade_release ADD COLUMN version_seq INTEGER;

WITH ordered AS (
  SELECT release_id,
         ROW_NUMBER() OVER (PARTITION BY dict_version ORDER BY created_at ASC, rowid ASC) AS seq
  FROM trade_release
)
UPDATE trade_release
SET version_seq = (SELECT seq FROM ordered WHERE ordered.release_id = trade_release.release_id)
WHERE version_seq IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trade_release_dict_seq_uq ON trade_release (dict_version, version_seq);
