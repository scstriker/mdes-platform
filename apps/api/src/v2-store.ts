import {
  buildCatalogRecordHref,
  normalizeAliasKey,
  toStatisticListItem,
  V2_HISTORICAL_STATISTIC_VERSIONS,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_ENTITY_RELATIONS,
  V2_SEED_STATISTICS,
  type CatalogKind,
  type CatalogRecord,
  type Statistic,
  type StatisticListItem,
  type UnifiedSearchHit,
} from "@mdes/shared";
import { parseJson } from "./db";

/** D1 单次 batch 语句块上限（每条语句最多绑定 <= 18 个参数，远低于 D1 单语句 100 参数上限） */
const BATCH_STMT_CHUNK = 40;

const sqlLit = (s: string | null | undefined): string =>
  s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;

/**
 * 为 unicode61 FTS5 生成补充检索词元：
 * 保留原始 legacy_aliases 的同时，拆出中英文分界词元与中文二元/一元词组，
 * 使如 "湖北省医疗器械质量监督检验研究院"、"联影医疗"、"20223061141"、"GB 9706.233-2020" 均可走 FTS5 索引命中。
 */
export function buildFtsAliasesText(rawAliases: readonly string[], extraTexts: readonly string[]): string {
  const tokens = new Set<string>();
  for (const a of rawAliases) {
    const trimmed = a.trim();
    if (trimmed) {
      tokens.add(trimmed);
      tokens.add(normalizeAliasKey(trimmed));
    }
  }

  const combined = [...rawAliases, ...extraTexts].join(" ");
  // 拆分中英文/数字交界（例如 "国械注准20223061141" -> "国械注准" + "20223061141"，"5T超导" -> "5T" + "超导"）
  const asciiRuns = combined.match(/[A-Za-z0-9]+/g) ?? [];
  for (const r of asciiRuns) {
    if (r.length >= 2) tokens.add(r.toLowerCase());
  }

  const cjkRuns = combined.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    tokens.add(run);
    for (let i = 0; i < run.length; i++) {
      tokens.add(run[i]!);
      if (i + 1 < run.length) {
        tokens.add(run.slice(i, i + 2));
      }
    }
  }

  return [...tokens].join(" ");
}

function buildTokenFtsClause(seg: string): string {
  if (/^[\u4e00-\u9fff]+$/u.test(seg)) {
    if (seg.length === 1) return `"${seg}"*`;
    const bigrams: string[] = [];
    for (let i = 0; i + 1 < seg.length; i++) {
      bigrams.push(`"${seg.slice(i, i + 2)}"`);
    }
    return `("${seg}"* OR (${bigrams.join(" AND ")}))`;
  }
  const hasCjk = /[\u4e00-\u9fff]/u.test(seg);
  const hasAlnum = /[a-z0-9]/i.test(seg);
  if (hasCjk && hasAlnum) {
    const subParts = seg.match(/[\u4e00-\u9fff]+|[a-z0-9]+/giu) ?? [];
    if (subParts.length > 1) {
      return `("${seg}"* OR (${subParts.map((p) => buildTokenFtsClause(p.toLowerCase())).join(" AND ")}))`;
    }
  }
  return `"${seg}"*`;
}

/**
 * 将自由搜索词安全编译为 FTS5 MATCH 布尔表达式（完全过滤特殊标点，杜绝语法异常）。
 */
export function buildFtsMatchExpression(rawQ: string): string | null {
  const segments = rawQ.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (segments.length === 0) return null;
  return segments.slice(0, 12).map(buildTokenFtsClause).join(" AND ");
}

type FtsEntryInput = {
  entry_id: string;
  entry_group: string;
  href: string;
  title: string;
  subtitle: string;
  code: string;
  tags: string;
  region: string;
  period: string;
  aliases: string;
};

function statisticToFtsEntry(stat: Statistic): FtsEntryInput {
  const listItem = toStatisticListItem(stat, stat.version);
  const regionText = stat.entity_refs.regions?.join(" ") ?? stat.coverage.geographic_scope;
  const entityTokens = Object.values(stat.entity_refs)
    .flatMap((arr) => arr ?? [])
    .join(" ");
  const tagsText = [...stat.topic_tags, listItem.source_org, ...stat.indicator_refs.v3_seqs, ...(stat.indicator_refs.v12_codes ?? [])].join(" ");
  return {
    entry_id: stat.statistic_id,
    entry_group: "statistics",
    href: `/statistics/${encodeURIComponent(stat.statistic_id)}`,
    title: stat.title,
    subtitle: stat.subtitle,
    code: stat.statistic_id,
    tags: tagsText,
    region: regionText,
    period: stat.summary_kpi.period,
    aliases: buildFtsAliasesText([stat.slug, entityTokens], [stat.title, stat.subtitle, stat.insight, listItem.source_org, regionText]),
  };
}

function catalogToFtsEntry(rec: CatalogRecord): FtsEntryInput {
  const tagsText = [...rec.tags, rec.source_title, rec.category ?? "", rec.subkind ?? ""].filter(Boolean).join(" ");
  const summaryValues = rec.summary_fields.map((f) => `${f.label} ${f.value}`).join(" ");
  return {
    entry_id: rec.id,
    entry_group: rec.kind,
    href: buildCatalogRecordHref(rec),
    title: rec.title,
    subtitle: rec.subtitle,
    code: rec.code ?? rec.id,
    tags: tagsText,
    region: rec.region ?? "",
    period: rec.period ?? "",
    aliases: buildFtsAliasesText(
      [...(rec.legacy_aliases ?? []), rec.slug, rec.code ?? ""],
      [rec.title, rec.subtitle, tagsText, rec.region ?? "", summaryValues],
    ),
  };
}

const UPSERT_STATISTIC_DEF_SQL = `
  INSERT INTO statistic_def (
    statistic_id, slug, title, subtitle, insight, template_type,
    topic_tags_json, v3_seqs_json, entity_refs_json, summary_kpi_json,
    source_org, has_forecast, has_methodology_break,
    latest_version, latest_hash, published_at, updated_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
  ON CONFLICT(statistic_id) DO UPDATE SET
    slug = excluded.slug,
    title = excluded.title,
    subtitle = excluded.subtitle,
    insight = excluded.insight,
    template_type = excluded.template_type,
    topic_tags_json = excluded.topic_tags_json,
    v3_seqs_json = excluded.v3_seqs_json,
    entity_refs_json = excluded.entity_refs_json,
    summary_kpi_json = excluded.summary_kpi_json,
    source_org = excluded.source_org,
    has_forecast = excluded.has_forecast,
    has_methodology_break = excluded.has_methodology_break,
    latest_version = excluded.latest_version,
    latest_hash = excluded.latest_hash,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at
`;

const INSERT_STATISTIC_VERSION_SQL = `
  INSERT INTO statistic_version (statistic_id, version, content_hash, published_at, payload_json)
  VALUES (?1, ?2, ?3, ?4, ?5)
  ON CONFLICT(statistic_id, version) DO NOTHING
`;

const INSERT_SEARCH_FTS_SQL = `
  INSERT INTO search_fts (entry_id, entry_group, href, title, subtitle, code, tags, region, period, aliases)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
`;

/**
 * 生成幂等 SQL 语句数组（供 wrangler d1 execute 离线脚本与测试 harness 共用）。
 */
export function seedV2Statements(): string[] {
  const out: string[] = [];
  const ftsEntries: FtsEntryInput[] = [];

  for (const stat of V2_SEED_STATISTICS) {
    const item = toStatisticListItem(stat, stat.version);
    const payloadStr = JSON.stringify(stat);
    out.push(
      `INSERT INTO statistic_def (statistic_id, slug, title, subtitle, insight, template_type, topic_tags_json, v3_seqs_json, entity_refs_json, summary_kpi_json, source_org, has_forecast, has_methodology_break, latest_version, latest_hash, published_at, updated_at) VALUES (` +
        [
          sqlLit(stat.statistic_id),
          sqlLit(stat.slug),
          sqlLit(stat.title),
          sqlLit(stat.subtitle),
          sqlLit(stat.insight),
          sqlLit(stat.template_type),
          sqlLit(JSON.stringify(stat.topic_tags)),
          sqlLit(JSON.stringify(stat.indicator_refs.v3_seqs)),
          sqlLit(JSON.stringify(stat.entity_refs)),
          sqlLit(JSON.stringify(stat.summary_kpi)),
          sqlLit(item.source_org),
          item.has_forecast ? "1" : "0",
          item.has_methodology_break ? "1" : "0",
          sqlLit(stat.version),
          sqlLit(stat.content_hash),
          sqlLit(stat.published_at),
          sqlLit(stat.published_at),
        ].join(", ") +
        `) ON CONFLICT(statistic_id) DO UPDATE SET slug = excluded.slug, title = excluded.title, subtitle = excluded.subtitle, insight = excluded.insight, template_type = excluded.template_type, topic_tags_json = excluded.topic_tags_json, v3_seqs_json = excluded.v3_seqs_json, entity_refs_json = excluded.entity_refs_json, summary_kpi_json = excluded.summary_kpi_json, source_org = excluded.source_org, has_forecast = excluded.has_forecast, has_methodology_break = excluded.has_methodology_break, latest_version = excluded.latest_version, latest_hash = excluded.latest_hash, published_at = excluded.published_at, updated_at = excluded.updated_at`,
    );
    out.push(
      `INSERT INTO statistic_version (statistic_id, version, content_hash, published_at, payload_json) VALUES (` +
        [sqlLit(stat.statistic_id), sqlLit(stat.version), sqlLit(stat.content_hash), sqlLit(stat.published_at), sqlLit(payloadStr)].join(", ") +
        `) ON CONFLICT(statistic_id, version) DO NOTHING`,
    );
    ftsEntries.push(statisticToFtsEntry(stat));
  }

  for (const hist of V2_HISTORICAL_STATISTIC_VERSIONS) {
    out.push(
      `INSERT INTO statistic_version (statistic_id, version, content_hash, published_at, payload_json) VALUES (` +
        [sqlLit(hist.statistic_id), sqlLit(hist.version), sqlLit(hist.content_hash), sqlLit(hist.published_at), sqlLit(JSON.stringify(hist))].join(", ") +
        `) ON CONFLICT(statistic_id, version) DO NOTHING`,
    );
  }

  for (const rec of V2_SEED_CATALOG_RECORDS) {
    out.push(
      `INSERT INTO catalog_record (id, kind, slug, title, subtitle, code, region, period, category, subkind, tags_json, legacy_aliases_json, summary_fields_json, detail_json, source_title, source_page, source_url, updated_at) VALUES (` +
        [
          sqlLit(rec.id),
          sqlLit(rec.kind),
          sqlLit(rec.slug),
          sqlLit(rec.title),
          sqlLit(rec.subtitle),
          sqlLit(rec.code ?? null),
          sqlLit(rec.region ?? null),
          sqlLit(rec.period ?? null),
          sqlLit(rec.category ?? null),
          sqlLit(rec.subkind ?? null),
          sqlLit(JSON.stringify(rec.tags)),
          sqlLit(JSON.stringify(rec.legacy_aliases ?? [])),
          sqlLit(JSON.stringify(rec.summary_fields)),
          sqlLit(JSON.stringify(rec.detail)),
          sqlLit(rec.source_title),
          sqlLit(rec.source_page ?? null),
          sqlLit(rec.source_url ?? null),
          sqlLit(rec.updated_at),
        ].join(", ") +
        `) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, slug = excluded.slug, title = excluded.title, subtitle = excluded.subtitle, code = excluded.code, region = excluded.region, period = excluded.period, category = excluded.category, subkind = excluded.subkind, tags_json = excluded.tags_json, legacy_aliases_json = excluded.legacy_aliases_json, summary_fields_json = excluded.summary_fields_json, detail_json = excluded.detail_json, source_title = excluded.source_title, source_page = excluded.source_page, source_url = excluded.source_url, updated_at = excluded.updated_at`,
    );
    ftsEntries.push(catalogToFtsEntry(rec));
  }

  for (const rel of V2_SEED_ENTITY_RELATIONS) {
    out.push(
      `INSERT INTO entity_relation (from_id, to_id, rel_type, note) VALUES (${sqlLit(rel.from_id)}, ${sqlLit(rel.to_id)}, ${sqlLit(rel.rel_type)}, ${sqlLit(rel.note ?? null)}) ON CONFLICT(from_id, to_id, rel_type) DO UPDATE SET note = excluded.note`,
    );
  }

  const allEntryIds = ftsEntries.map((e) => sqlLit(e.entry_id)).join(", ");
  out.push(`DELETE FROM search_fts WHERE entry_id IN (${allEntryIds})`);
  for (const e of ftsEntries) {
    out.push(
      `INSERT INTO search_fts (entry_id, entry_group, href, title, subtitle, code, tags, region, period, aliases) VALUES (` +
        [
          sqlLit(e.entry_id),
          sqlLit(e.entry_group),
          sqlLit(e.href),
          sqlLit(e.title),
          sqlLit(e.subtitle),
          sqlLit(e.code),
          sqlLit(e.tags),
          sqlLit(e.region),
          sqlLit(e.period),
          sqlLit(e.aliases),
        ].join(", ") +
        `)`,
    );
  }

  return out;
}

/**
 * 幂等灌入 V2 统计定义、不可变历史快照、目录实体、关系边及 FTS5 全文索引。
 * 采用 json_each 批量表值展开：每条语句仅绑定 1 个 JSON 参数（远低于 D1 单语句 100 参数上限），单次 db.batch 原子落盘。
 */
export async function seedV2PortalData(db: D1Database): Promise<void> {
  const ftsEntries: FtsEntryInput[] = [];

  const statDefPayload = V2_SEED_STATISTICS.map((stat) => {
    const item = toStatisticListItem(stat, stat.version);
    ftsEntries.push(statisticToFtsEntry(stat));
    return {
      statistic_id: stat.statistic_id,
      slug: stat.slug,
      title: stat.title,
      subtitle: stat.subtitle,
      insight: stat.insight,
      template_type: stat.template_type,
      topic_tags_json: JSON.stringify(stat.topic_tags),
      v3_seqs_json: JSON.stringify(stat.indicator_refs.v3_seqs),
      entity_refs_json: JSON.stringify(stat.entity_refs),
      summary_kpi_json: JSON.stringify(stat.summary_kpi),
      source_org: item.source_org,
      has_forecast: item.has_forecast ? 1 : 0,
      has_methodology_break: item.has_methodology_break ? 1 : 0,
      latest_version: stat.version,
      latest_hash: stat.content_hash,
      published_at: stat.published_at,
      updated_at: stat.published_at,
    };
  });

  const statVersionsPayload = [...V2_SEED_STATISTICS, ...V2_HISTORICAL_STATISTIC_VERSIONS].map((stat) => ({
    statistic_id: stat.statistic_id,
    version: stat.version,
    content_hash: stat.content_hash,
    published_at: stat.published_at,
    payload_json: JSON.stringify(stat),
  }));

  const catalogPayload = V2_SEED_CATALOG_RECORDS.map((rec) => {
    ftsEntries.push(catalogToFtsEntry(rec));
    return {
      id: rec.id,
      kind: rec.kind,
      slug: rec.slug,
      title: rec.title,
      subtitle: rec.subtitle,
      code: rec.code ?? null,
      region: rec.region ?? null,
      period: rec.period ?? null,
      category: rec.category ?? null,
      subkind: rec.subkind ?? null,
      tags_json: JSON.stringify(rec.tags),
      legacy_aliases_json: JSON.stringify(rec.legacy_aliases ?? []),
      summary_fields_json: JSON.stringify(rec.summary_fields),
      detail_json: JSON.stringify(rec.detail),
      source_title: rec.source_title,
      source_page: rec.source_page ?? null,
      source_url: rec.source_url ?? null,
      updated_at: rec.updated_at,
    };
  });

  const relationsPayload = V2_SEED_ENTITY_RELATIONS.map((rel) => ({
    from_id: rel.from_id,
    to_id: rel.to_id,
    rel_type: rel.rel_type,
    note: rel.note ?? null,
  }));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO statistic_def (
           statistic_id, slug, title, subtitle, insight, template_type,
           topic_tags_json, v3_seqs_json, entity_refs_json, summary_kpi_json,
           source_org, has_forecast, has_methodology_break,
           latest_version, latest_hash, published_at, updated_at
         )
         SELECT
           json_extract(value, '$.statistic_id'),
           json_extract(value, '$.slug'),
           json_extract(value, '$.title'),
           json_extract(value, '$.subtitle'),
           json_extract(value, '$.insight'),
           json_extract(value, '$.template_type'),
           json_extract(value, '$.topic_tags_json'),
           json_extract(value, '$.v3_seqs_json'),
           json_extract(value, '$.entity_refs_json'),
           json_extract(value, '$.summary_kpi_json'),
           json_extract(value, '$.source_org'),
           CAST(json_extract(value, '$.has_forecast') AS INTEGER),
           CAST(json_extract(value, '$.has_methodology_break') AS INTEGER),
           json_extract(value, '$.latest_version'),
           json_extract(value, '$.latest_hash'),
           json_extract(value, '$.published_at'),
           json_extract(value, '$.updated_at')
         FROM json_each(?1)
         WHERE 1 = 1
         ON CONFLICT(statistic_id) DO UPDATE SET
           slug = excluded.slug,
           title = excluded.title,
           subtitle = excluded.subtitle,
           insight = excluded.insight,
           template_type = excluded.template_type,
           topic_tags_json = excluded.topic_tags_json,
           v3_seqs_json = excluded.v3_seqs_json,
           entity_refs_json = excluded.entity_refs_json,
           summary_kpi_json = excluded.summary_kpi_json,
           source_org = excluded.source_org,
           has_forecast = excluded.has_forecast,
           has_methodology_break = excluded.has_methodology_break,
           latest_version = excluded.latest_version,
           latest_hash = excluded.latest_hash,
           published_at = excluded.published_at,
           updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(statDefPayload)),
    db
      .prepare(
        `INSERT INTO statistic_version (statistic_id, version, content_hash, published_at, payload_json)
         SELECT
           json_extract(value, '$.statistic_id'),
           json_extract(value, '$.version'),
           json_extract(value, '$.content_hash'),
           json_extract(value, '$.published_at'),
           json_extract(value, '$.payload_json')
         FROM json_each(?1)
         WHERE 1 = 1
         ON CONFLICT(statistic_id, version) DO NOTHING`,
      )
      .bind(JSON.stringify(statVersionsPayload)),
    db
      .prepare(
        `INSERT INTO catalog_record (
           id, kind, slug, title, subtitle, code, region, period, category, subkind,
           tags_json, legacy_aliases_json, summary_fields_json, detail_json,
           source_title, source_page, source_url, updated_at
         )
         SELECT
           json_extract(value, '$.id'),
           json_extract(value, '$.kind'),
           json_extract(value, '$.slug'),
           json_extract(value, '$.title'),
           json_extract(value, '$.subtitle'),
           json_extract(value, '$.code'),
           json_extract(value, '$.region'),
           json_extract(value, '$.period'),
           json_extract(value, '$.category'),
           json_extract(value, '$.subkind'),
           json_extract(value, '$.tags_json'),
           json_extract(value, '$.legacy_aliases_json'),
           json_extract(value, '$.summary_fields_json'),
           json_extract(value, '$.detail_json'),
           json_extract(value, '$.source_title'),
           json_extract(value, '$.source_page'),
           json_extract(value, '$.source_url'),
           json_extract(value, '$.updated_at')
         FROM json_each(?1)
         WHERE 1 = 1
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           slug = excluded.slug,
           title = excluded.title,
           subtitle = excluded.subtitle,
           code = excluded.code,
           region = excluded.region,
           period = excluded.period,
           category = excluded.category,
           subkind = excluded.subkind,
           tags_json = excluded.tags_json,
           legacy_aliases_json = excluded.legacy_aliases_json,
           summary_fields_json = excluded.summary_fields_json,
           detail_json = excluded.detail_json,
           source_title = excluded.source_title,
           source_page = excluded.source_page,
           source_url = excluded.source_url,
           updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(catalogPayload)),
    db
      .prepare(
        `INSERT INTO entity_relation (from_id, to_id, rel_type, note)
         SELECT
           json_extract(value, '$.from_id'),
           json_extract(value, '$.to_id'),
           json_extract(value, '$.rel_type'),
           json_extract(value, '$.note')
         FROM json_each(?1)
         WHERE 1 = 1
         ON CONFLICT(from_id, to_id, rel_type) DO UPDATE SET note = excluded.note`,
      )
      .bind(JSON.stringify(relationsPayload)),
    db
      .prepare("DELETE FROM search_fts WHERE entry_id IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify(ftsEntries.map((e) => e.entry_id))),
    db
      .prepare(
        `INSERT INTO search_fts (entry_id, entry_group, href, title, subtitle, code, tags, region, period, aliases)
         SELECT
           json_extract(value, '$.entry_id'),
           json_extract(value, '$.entry_group'),
           json_extract(value, '$.href'),
           json_extract(value, '$.title'),
           json_extract(value, '$.subtitle'),
           json_extract(value, '$.code'),
           json_extract(value, '$.tags'),
           json_extract(value, '$.region'),
           json_extract(value, '$.period'),
           json_extract(value, '$.aliases')
         FROM json_each(?1)`,
      )
      .bind(JSON.stringify(ftsEntries)),
  ];

  for (let i = 0; i < statements.length; i += BATCH_STMT_CHUNK) {
    await db.batch(statements.slice(i, i + BATCH_STMT_CHUNK));
  }
}

const seededDbs = new WeakMap<object, Promise<void>>();

/**
 * 轻量级懒初始化守卫：按 D1 实例缓存，若 statistic_def 为空则自动灌入 V2 种子数据。
 */
export async function ensureV2SeededOnce(db: D1Database): Promise<void> {
  if (!db || typeof db !== "object") {
    throw new Error("D1 database binding unavailable");
  }
  const key = db as unknown as object;
  let pending = seededDbs.get(key);
  if (!pending) {
    pending = (async () => {
      const row = await db.prepare("SELECT 1 AS ok FROM statistic_def LIMIT 1").first<{ ok: number }>();
      if (!row) {
        await seedV2PortalData(db);
      }
    })().catch((err) => {
      seededDbs.delete(key);
      throw err;
    });
    seededDbs.set(key, pending);
  }
  await pending;
}

async function sha256TextHex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 发布单项统计的新不可变版本：
 * - 更新 statistic_def 的 latest_version / latest_hash 及目录头元数据；
 * - 在 statistic_version 中插入新版本快照，已有历史版本记录永不覆写；
 * - 同步刷新 search_fts 词条。
 */
export async function publishStatisticVersion(
  db: D1Database,
  input: Statistic,
): Promise<{
  statistic_id: string;
  version: string;
  latest_version: string;
  content_hash: string;
  replayed: boolean;
}> {
  await ensureV2SeededOnce(db);

  const now = new Date().toISOString();
  const publishedAt = input.published_at?.trim() || now;
  const prelimPayload = JSON.stringify({ ...input, published_at: publishedAt });
  const contentHash = input.content_hash?.trim() || `sha256-${(await sha256TextHex(prelimPayload)).slice(0, 24)}`;
  const stat: Statistic = {
    ...input,
    published_at: publishedAt,
    content_hash: contentHash,
  };
  const payloadJson = JSON.stringify(stat);

  const existingVer = await db
    .prepare("SELECT content_hash FROM statistic_version WHERE statistic_id = ?1 AND version = ?2")
    .bind(stat.statistic_id, stat.version)
    .first<{ content_hash: string }>();

  if (existingVer) {
    const defRow = await db
      .prepare("SELECT latest_version FROM statistic_def WHERE statistic_id = ?1")
      .bind(stat.statistic_id)
      .first<{ latest_version: string }>();
    return {
      statistic_id: stat.statistic_id,
      version: stat.version,
      latest_version: defRow?.latest_version ?? stat.version,
      content_hash: existingVer.content_hash,
      replayed: true,
    };
  }

  const item = toStatisticListItem(stat, stat.version);
  const fts = statisticToFtsEntry(stat);

  await db.batch([
    db
      .prepare(UPSERT_STATISTIC_DEF_SQL)
      .bind(
        stat.statistic_id,
        stat.slug,
        stat.title,
        stat.subtitle,
        stat.insight,
        stat.template_type,
        JSON.stringify(stat.topic_tags),
        JSON.stringify(stat.indicator_refs.v3_seqs),
        JSON.stringify(stat.entity_refs),
        JSON.stringify(stat.summary_kpi),
        item.source_org,
        item.has_forecast ? 1 : 0,
        item.has_methodology_break ? 1 : 0,
        stat.version,
        stat.content_hash,
        stat.published_at,
        now,
      ),
    db
      .prepare(INSERT_STATISTIC_VERSION_SQL)
      .bind(stat.statistic_id, stat.version, stat.content_hash, stat.published_at, payloadJson),
    db.prepare("DELETE FROM search_fts WHERE entry_id = ?1").bind(stat.statistic_id),
    db
      .prepare(INSERT_SEARCH_FTS_SQL)
      .bind(
        fts.entry_id,
        fts.entry_group,
        fts.href,
        fts.title,
        fts.subtitle,
        fts.code,
        fts.tags,
        fts.region,
        fts.period,
        fts.aliases,
      ),
  ]);

  return {
    statistic_id: stat.statistic_id,
    version: stat.version,
    latest_version: stat.version,
    content_hash: stat.content_hash,
    replayed: false,
  };
}

export type StatisticDefRow = {
  statistic_id: string;
  slug: string;
  title: string;
  subtitle: string;
  insight: string;
  template_type: StatisticListItem["template_type"];
  topic_tags_json: string;
  v3_seqs_json: string;
  entity_refs_json: string;
  summary_kpi_json: string;
  source_org: string;
  has_forecast: number;
  has_methodology_break: number;
  latest_version: string;
  latest_hash: string;
  published_at: string;
  updated_at: string;
};

export function mapStatisticDefRow(row: StatisticDefRow): StatisticListItem {
  return {
    statistic_id: row.statistic_id,
    slug: row.slug,
    version: row.latest_version,
    latest_version: row.latest_version,
    content_hash: row.latest_hash,
    published_at: row.published_at,
    title: row.title,
    subtitle: row.subtitle,
    insight: row.insight,
    template_type: row.template_type,
    topic_tags: parseJson<string[]>(row.topic_tags_json, []),
    v3_seqs: parseJson<string[]>(row.v3_seqs_json, []),
    entity_refs: parseJson<Statistic["entity_refs"]>(row.entity_refs_json, {}),
    summary_kpi: parseJson<Statistic["summary_kpi"]>(row.summary_kpi_json, {
      headline_value: "",
      unit: "",
      period: "",
    }),
    source_org: row.source_org,
    has_forecast: Boolean(row.has_forecast),
    has_methodology_break: Boolean(row.has_methodology_break),
  };
}

export type CatalogRecordRow = {
  id: string;
  kind: CatalogKind;
  slug: string;
  title: string;
  subtitle: string;
  code: string | null;
  region: string | null;
  period: string | null;
  category: string | null;
  subkind: string | null;
  tags_json: string;
  legacy_aliases_json: string;
  summary_fields_json: string;
  detail_json: string;
  source_title: string;
  source_page: string | null;
  source_url: string | null;
  updated_at: string;
};

export function mapCatalogRecordRow(row: CatalogRecordRow): CatalogRecord {
  const aliases = parseJson<string[]>(row.legacy_aliases_json, []);
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    ...(row.code ? { code: row.code } : {}),
    ...(row.region ? { region: row.region } : {}),
    ...(row.period ? { period: row.period } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.subkind ? { subkind: row.subkind } : {}),
    tags: parseJson<string[]>(row.tags_json, []),
    ...(aliases.length > 0 ? { legacy_aliases: aliases } : {}),
    summary_fields: parseJson<CatalogRecord["summary_fields"]>(row.summary_fields_json, []),
    detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    source_title: row.source_title,
    ...(row.source_page ? { source_page: row.source_page } : {}),
    ...(row.source_url ? { source_url: row.source_url } : {}),
    updated_at: row.updated_at,
  };
}

function buildAliasNote(
  rawQ: string,
  code: string | null | undefined,
  title: string,
  legacyAliases: readonly string[],
  detail: Record<string, unknown>,
): string | undefined {
  const normQ = normalizeAliasKey(rawQ);
  if (!normQ) return undefined;
  const canonicalNorm = code ? normalizeAliasKey(code) : "";
  if (canonicalNorm && normQ === canonicalNorm) return undefined;

  for (const alias of legacyAliases) {
    const normAlias = normalizeAliasKey(alias);
    if (normAlias && (normQ === normAlias || (normAlias.length >= 6 && normQ.includes(normAlias)))) {
      if (typeof detail.correction_notice === "string" && detail.correction_notice.trim()) {
        return detail.correction_notice.trim();
      }
      return `现行规范条目为 ${code ?? title}（匹配旧别名：${alias}）`;
    }
  }
  return undefined;
}

/**
 * 构造 V2 全站检索的预编译语句组（与 /api/search 主查询合并到同一 db.batch 执行）：
 * - 优先精确匹配 code / slug / id / legacy_aliases；
 * - 同时经 search_fts FTS5 倒排索引按 BM25 相关性召回。
 */
export function prepareV2SearchStatements(db: D1Database, rawQ: string, limit: number): {
  stmts: D1PreparedStatement[];
  parseResults: (batchResults: D1Result<Record<string, unknown>>[]) => UnifiedSearchHit[];
} {
  const trimmed = rawQ.trim();
  const normQ = normalizeAliasKey(trimmed);
  const lowerTrimmed = trimmed.toLowerCase();
  const ftsExpr = buildFtsMatchExpression(trimmed);

  if (!normQ) {
    return { stmts: [], parseResults: () => [] };
  }

  const exactCatalogStmt = db
    .prepare(
      `SELECT id, kind, slug, title, subtitle, code, region, period, legacy_aliases_json, detail_json, source_title
       FROM catalog_record
       WHERE replace(replace(lower(coalesce(code, '')), ' ', ''), '　', '') = ?1
          OR lower(id) = ?2
          OR lower(slug) = ?2
          OR lower(title) = ?2
          OR EXISTS (
            SELECT 1 FROM json_each(legacy_aliases_json)
            WHERE replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '') = ?1
          )
       LIMIT ?3`,
    )
    .bind(normQ, lowerTrimmed, limit);

  const exactStatStmt = db
    .prepare(
      `SELECT statistic_id, slug, title, subtitle, entity_refs_json, summary_kpi_json, source_org
       FROM statistic_def
       WHERE lower(statistic_id) = ?1 OR lower(slug) = ?1 OR lower(title) = ?1
       LIMIT 5`,
    )
    .bind(lowerTrimmed);

  const stmts: D1PreparedStatement[] = [exactCatalogStmt, exactStatStmt];

  if (ftsExpr) {
    stmts.push(
      db
        .prepare(
          `SELECT f.entry_id, f.entry_group, f.href, f.title, f.subtitle, f.code, f.region, f.period,
                  coalesce(s.source_org, c.source_title, '') AS source_label,
                  coalesce(c.legacy_aliases_json, '[]') AS legacy_aliases_json,
                  coalesce(c.detail_json, '{}') AS detail_json,
                  bm25(search_fts, 0.0, 0.0, 0.0, 10.0, 4.0, 15.0, 5.0, 2.0, 2.0, 6.0) AS score
           FROM search_fts f
           LEFT JOIN statistic_def s ON f.entry_group = 'statistics' AND s.statistic_id = f.entry_id
           LEFT JOIN catalog_record c ON f.entry_group != 'statistics' AND c.id = f.entry_id
           WHERE search_fts MATCH ?1
           ORDER BY score ASC
           LIMIT ?2`,
        )
        .bind(ftsExpr, limit),
    );
  }

  return {
    stmts,
    parseResults: (batchResults) => {
      const seen = new Set<string>();
      const hits: UnifiedSearchHit[] = [];

      const exactCatalogRows = (batchResults[0]?.results ?? []) as Array<{
        id: string;
        kind: CatalogKind;
        slug: string;
        title: string;
        subtitle: string;
        code: string | null;
        region: string | null;
        period: string | null;
        legacy_aliases_json: string;
        detail_json: string;
        source_title: string;
      }>;

      for (const r of exactCatalogRows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const aliases = parseJson<string[]>(r.legacy_aliases_json, []);
        const detail = parseJson<Record<string, unknown>>(r.detail_json, {});
        const aliasNote = buildAliasNote(trimmed, r.code, r.title, aliases, detail);
        hits.push({
          id: r.id,
          group: r.kind,
          title: r.title,
          subtitle: r.subtitle,
          ...(r.code ? { code: r.code } : {}),
          ...(r.region ? { region: r.region } : {}),
          ...(r.period ? { period: r.period } : {}),
          href: buildCatalogRecordHref({ kind: r.kind, slug: r.slug, code: r.code ?? undefined, title: r.title }),
          source_label: r.source_title,
          ...(aliasNote ? { alias_note: aliasNote } : {}),
        });
      }

      const exactStatRows = (batchResults[1]?.results ?? []) as Array<{
        statistic_id: string;
        slug: string;
        title: string;
        subtitle: string;
        entity_refs_json: string;
        summary_kpi_json: string;
        source_org: string;
      }>;

      for (const s of exactStatRows) {
        if (seen.has(s.statistic_id)) continue;
        seen.add(s.statistic_id);
        const entityRefs = parseJson<Statistic["entity_refs"]>(s.entity_refs_json, {});
        const kpi = parseJson<Statistic["summary_kpi"]>(s.summary_kpi_json, {
          headline_value: "",
          unit: "",
          period: "",
        });
        hits.push({
          id: s.statistic_id,
          group: "statistics",
          title: s.title,
          subtitle: s.subtitle,
          code: s.statistic_id,
          ...(entityRefs.regions?.[0] ? { region: entityRefs.regions[0] } : {}),
          ...(kpi.period ? { period: kpi.period } : {}),
          href: `/statistics/${encodeURIComponent(s.statistic_id)}`,
          source_label: s.source_org,
        });
      }

      if (ftsExpr && batchResults[2]) {
        const ftsRows = batchResults[2].results as Array<{
          entry_id: string;
          entry_group: "statistics" | CatalogKind;
          href: string;
          title: string;
          subtitle: string;
          code: string;
          region: string;
          period: string;
          source_label: string;
          legacy_aliases_json: string;
          detail_json: string;
        }>;
        for (const f of ftsRows) {
          if (seen.has(f.entry_id)) continue;
          seen.add(f.entry_id);
          const aliases = parseJson<string[]>(f.legacy_aliases_json, []);
          const detail = parseJson<Record<string, unknown>>(f.detail_json, {});
          const aliasNote = buildAliasNote(trimmed, f.code, f.title, aliases, detail);
          hits.push({
            id: f.entry_id,
            group: f.entry_group,
            title: f.title,
            subtitle: f.subtitle,
            ...(f.code ? { code: f.code } : {}),
            ...(f.region ? { region: f.region } : {}),
            ...(f.period ? { period: f.period } : {}),
            href: f.href,
            source_label: f.source_label,
            ...(aliasNote ? { alias_note: aliasNote } : {}),
          });
        }
      }

      return hits.slice(0, limit);
    },
  };
}
