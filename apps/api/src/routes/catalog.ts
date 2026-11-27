import type { Hono } from "hono";
import {
  detectCatalogAliasCorrection,
  normalizeAliasKey,
  tokenizeQuery,
  type CatalogDetailResponse,
  type CatalogPage,
} from "@mdes/shared";
import type { AppEnv } from "../env";
import { AppError, intParam, textParam } from "../errors";
import {
  ensureV2SeededOnce,
  mapCatalogRecordRow,
  mapStatisticDefRow,
  type CatalogRecordRow,
  type StatisticDefRow,
} from "../v2-store";

const CATALOG_LIMIT_DEFAULT = 50;
const CATALOG_LIMIT_MAX = 200;

const CATALOG_HAYSTACK_SQL =
  "lower(r.id || ' ' || r.slug || ' ' || r.title || ' ' || r.subtitle || ' ' || coalesce(r.code, '') || ' ' || coalesce(r.region, '') || ' ' || coalesce(r.period, '') || ' ' || coalesce(r.category, '') || ' ' || coalesce(r.subkind, '') || ' ' || r.tags_json || ' ' || r.legacy_aliases_json || ' ' || r.summary_fields_json || ' ' || r.source_title)";

export function catalogRoutes(app: Hono<AppEnv>) {
  app.get("/api/catalog", async (c) => {
    const db = c.get("db");
    await ensureV2SeededOnce(db);

    const kind = textParam(c.req.query("kind"));
    const rawQ = textParam(c.req.query("q"));
    const region = textParam(c.req.query("region"));
    const period = textParam(c.req.query("period"));
    const category = textParam(c.req.query("category"));
    const subkind = textParam(c.req.query("subkind"));
    const tag = textParam(c.req.query("tag"));
    const limit = intParam(c.req.query("limit"), CATALOG_LIMIT_DEFAULT, { min: 1, max: CATALOG_LIMIT_MAX });
    const offset = intParam(c.req.query("offset"), 0, { min: 0 });

    const clauses: string[] = [];
    const bindings: unknown[] = [];

    if (kind) {
      clauses.push("r.kind = ?");
      bindings.push(kind);
    }
    if (region) {
      clauses.push("r.region = ?");
      bindings.push(region);
    }
    if (period) {
      clauses.push("(r.period = ? OR r.period LIKE ? || '%')");
      bindings.push(period, period);
    }
    if (category) {
      clauses.push("r.category = ?");
      bindings.push(category);
    }
    if (subkind) {
      clauses.push("r.subkind = ?");
      bindings.push(subkind);
    }
    if (tag) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(r.tags_json) WHERE lower(CAST(value AS TEXT)) = lower(?))");
      bindings.push(tag);
    }

    if (rawQ) {
      const tokens = tokenizeQuery(rawQ);
      const normQ = normalizeAliasKey(rawQ);

      const tokenAndSql =
        tokens.length > 0
          ? `(${tokens.map(() => `instr(${CATALOG_HAYSTACK_SQL}, ?) > 0`).join(" AND ")})`
          : "0";

      const aliasOrCodeSql = `(
        replace(replace(lower(coalesce(r.code, '')), ' ', ''), '　', '') = ?
        OR EXISTS (
          SELECT 1 FROM json_each(r.legacy_aliases_json)
          WHERE replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '') = ?
             OR (
               length(replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '')) >= 6
               AND instr(?, replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '')) > 0
             )
        )
      )`;

      clauses.push(`(${tokenAndSql} OR ${aliasOrCodeSql})`);
      bindings.push(...tokens, normQ, normQ, normQ);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const pageStmt = db
      .prepare(
        `SELECT *
         FROM catalog_record r
         ${whereSql}
         ORDER BY r.period DESC, r.updated_at DESC, r.id ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, limit, offset);

    const countStmt =
      bindings.length > 0
        ? db.prepare(`SELECT COUNT(*) AS total FROM catalog_record r ${whereSql}`).bind(...bindings)
        : db.prepare("SELECT COUNT(*) AS total FROM catalog_record r");

    const stmts: D1PreparedStatement[] = [pageStmt, countStmt];

    if (rawQ) {
      const normQ = normalizeAliasKey(rawQ);
      const aliasKindClause = kind ? "AND r.kind = ?2" : "";
      const aliasStmt = db.prepare(
        `SELECT *
         FROM catalog_record r
         WHERE EXISTS (
           SELECT 1 FROM json_each(r.legacy_aliases_json)
           WHERE replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '') = ?1
              OR (
                length(replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '')) >= 6
                AND instr(?1, replace(replace(lower(CAST(value AS TEXT)), ' ', ''), '　', '')) > 0
              )
         )
         ${aliasKindClause}
         LIMIT 5`,
      );
      stmts.push(kind ? aliasStmt.bind(normQ, kind) : aliasStmt.bind(normQ));
    }

    const batchRes = await db.batch<Record<string, unknown>>(stmts);
    const items = (batchRes[0].results as unknown as CatalogRecordRow[]).map(mapCatalogRecordRow);
    const total = Number(batchRes[1].results[0]?.total ?? 0);

    let aliasCorrection: CatalogPage["alias_correction"] = null;
    if (rawQ) {
      const aliasCandidates = batchRes[2]
        ? (batchRes[2].results as unknown as CatalogRecordRow[]).map(mapCatalogRecordRow)
        : items;
      aliasCorrection = detectCatalogAliasCorrection(rawQ, aliasCandidates.length > 0 ? aliasCandidates : items);
    }

    const body: CatalogPage = {
      items,
      total,
      limit,
      offset,
      alias_correction: aliasCorrection,
    };
    return c.json(body);
  });

  app.get("/api/catalog/:kind/:slug", async (c) => {
    const db = c.get("db");
    await ensureV2SeededOnce(db);

    const kind = decodeURIComponent(c.req.param("kind"));
    const slugOrIdOrCode = decodeURIComponent(c.req.param("slug"));
    const normKey = normalizeAliasKey(slugOrIdOrCode);

    const targetCte = `
      WITH target AS (
        SELECT *
        FROM catalog_record
        WHERE kind = ?1
          AND (
            slug = ?2
            OR id = ?2
            OR code = ?2
            OR replace(replace(lower(coalesce(code, '')), ' ', ''), '　', '') = ?3
          )
        LIMIT 1
      )
    `;

    const recordStmt = db
      .prepare(`${targetCte} SELECT * FROM target`)
      .bind(kind, slugOrIdOrCode, normKey);

    const relatedRecordsStmt = db
      .prepare(
        `${targetCte},
         rel_ids AS (
           SELECT er.to_id AS peer_id FROM entity_relation er JOIN target t ON er.from_id = t.id
           UNION
           SELECT er.from_id AS peer_id FROM entity_relation er JOIN target t ON er.to_id = t.id
         )
         SELECT c.*
         FROM catalog_record c
         JOIN rel_ids r ON c.id = r.peer_id
         ORDER BY c.kind ASC, c.id ASC`,
      )
      .bind(kind, slugOrIdOrCode, normKey);

    const relatedStatsStmt = db
      .prepare(
        `${targetCte},
         cited AS (
           SELECT CAST(j.value AS TEXT) AS stat_id
           FROM target t,
                json_each(
                  CASE
                    WHEN json_type(t.detail_json, '$.cited_statistics') = 'array'
                      THEN json_extract(t.detail_json, '$.cited_statistics')
                    ELSE '[]'
                  END
                ) j
           UNION
           SELECT CAST(json_extract(p.value, '$.statistic_id') AS TEXT) AS stat_id
           FROM target t,
                json_each(
                  CASE
                    WHEN json_type(t.detail_json, '$.chapters') = 'array'
                      THEN json_extract(t.detail_json, '$.chapters')
                    ELSE '[]'
                  END
                ) ch,
                json_each(
                  CASE
                    WHEN json_type(ch.value, '$.pinned_statistics') = 'array'
                      THEN json_extract(ch.value, '$.pinned_statistics')
                    ELSE '[]'
                  END
                ) p
         )
         SELECT DISTINCT s.*
         FROM statistic_def s, target t
         WHERE s.statistic_id IN (SELECT stat_id FROM cited)
            OR EXISTS (
              SELECT 1
              FROM json_each(s.entity_refs_json) grp, json_each(grp.value) item
              WHERE CAST(item.value AS TEXT) IN (t.slug, t.id, coalesce(t.code, ''), coalesce(t.category, ''))
            )
         ORDER BY s.published_at DESC, s.statistic_id ASC`,
      )
      .bind(kind, slugOrIdOrCode, normKey);

    // 单次 db.batch 原子读取目标实体、双向关联实体与关联统计卡片
    const [recRes, relRecRes, relStatRes] = await db.batch<Record<string, unknown>>([
      recordStmt,
      relatedRecordsStmt,
      relatedStatsStmt,
    ]);

    const rawRow = recRes.results[0] as unknown as CatalogRecordRow | undefined;
    if (!rawRow) {
      throw new AppError(404, "NOT_FOUND", { resource: "catalog_record", id: `${kind}/${slugOrIdOrCode}` });
    }

    const body: CatalogDetailResponse = {
      record: mapCatalogRecordRow(rawRow),
      related_records: (relRecRes.results as unknown as CatalogRecordRow[]).map(mapCatalogRecordRow),
      related_statistics: (relStatRes.results as unknown as StatisticDefRow[]).map(mapStatisticDefRow),
    };
    return c.json(body);
  });
}
