-- 将升级前存量手工/派生观测记录的 dims 对象顶层键序统一规范化为字典升序紧凑 JSON
UPDATE observation
SET dims = COALESCE(
  (
    SELECT '{' || group_concat(entry, ',') || '}'
    FROM (
      SELECT json_quote(key) || ':' || CASE
        WHEN type IN ('object', 'array') THEN json(value)
        WHEN type = 'text' THEN json_quote(value)
        WHEN type = 'true' THEN 'true'
        WHEN type = 'false' THEN 'false'
        WHEN type = 'null' THEN 'null'
        ELSE CAST(value AS TEXT)
      END AS entry
      FROM json_each(observation.dims)
      ORDER BY key ASC
      LIMIT -1
    )
  ),
  '{}'
)
WHERE json_valid(dims) = 1 AND json_type(dims) = 'object' AND dims != '{}';
