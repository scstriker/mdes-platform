-- MDES V2 双平面统计成果、一等公民目录实体、关系图谱与全文检索模型（0010）
-- 1. 向后兼容扩展 observation 观测性质、预测冻结时点与修订标识列
ALTER TABLE observation ADD COLUMN value_type TEXT NOT NULL DEFAULT 'actual';

ALTER TABLE observation ADD COLUMN forecast_as_of TEXT;

ALTER TABLE observation ADD COLUMN revision_id TEXT;

-- 2. Plane 1：单项统计元数据与目录筛选头（statistic_def）
CREATE TABLE IF NOT EXISTS statistic_def (
  statistic_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  insight TEXT NOT NULL,
  template_type TEXT NOT NULL,
  topic_tags_json TEXT NOT NULL CHECK(json_valid(topic_tags_json)),
  v3_seqs_json TEXT NOT NULL CHECK(json_valid(v3_seqs_json)),
  entity_refs_json TEXT NOT NULL CHECK(json_valid(entity_refs_json)),
  summary_kpi_json TEXT NOT NULL CHECK(json_valid(summary_kpi_json)),
  source_org TEXT NOT NULL,
  has_forecast INTEGER NOT NULL DEFAULT 0,
  has_methodology_break INTEGER NOT NULL DEFAULT 0,
  latest_version TEXT NOT NULL,
  latest_hash TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS statistic_def_published_idx ON statistic_def (published_at DESC);

-- 3. Plane 1：一等公民实体目录（型号、注册证/审评、企业、机构、政策、标准、来源、招采、技术路线、报告）
CREATE TABLE IF NOT EXISTS catalog_record (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  code TEXT,
  region TEXT,
  period TEXT,
  category TEXT,
  subkind TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
  legacy_aliases_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(legacy_aliases_json)),
  summary_fields_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(summary_fields_json)),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  source_title TEXT NOT NULL DEFAULT '',
  source_page TEXT,
  source_url TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(kind, slug)
);

CREATE INDEX IF NOT EXISTS catalog_record_kind_region_period_idx ON catalog_record (kind, region, period);

CREATE INDEX IF NOT EXISTS catalog_record_code_idx ON catalog_record (code);

-- 4. Plane 1：实体交叉关系边（注册证覆盖型号、制造商、适用标准、公开招采、技术路线）
CREATE TABLE IF NOT EXISTS entity_relation (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (from_id, to_id, rel_type)
);

CREATE INDEX IF NOT EXISTS entity_relation_to_idx ON entity_relation (to_id);

-- 5. Plane 1：全站跨实体 FTS5 倒排检索表
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  entry_id UNINDEXED,
  entry_group UNINDEXED,
  href UNINDEXED,
  title,
  subtitle,
  code,
  tags,
  region,
  period,
  aliases,
  tokenize='unicode61'
);

-- 6. Plane 2：不可变单项统计版本快照表（零解析直出 + ?v= 历史版本永久锁定）
CREATE TABLE IF NOT EXISTS statistic_version (
  statistic_id TEXT NOT NULL REFERENCES statistic_def(statistic_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  published_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  PRIMARY KEY (statistic_id, version)
);
