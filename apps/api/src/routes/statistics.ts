import type { Hono } from "hono";
import {
  adaptTradeSnapshotToStatistics,
  matchesQuery,
  normalizeTradeOverviewSnapshot,
  tokenizeQuery,
  toStatisticListItem,
  type Statistic,
  type StatisticDetailResponse,
  type StatisticListItem,
  type StatisticListPage,
  type StatisticVersionEntry,
  type StatisticVersionsResponse,
  type TradeOverviewPublished,
} from "@mdes/shared";
import type { AppEnv } from "../env";
import { AppError, intParam, textParam } from "../errors";
import {
  ensureV2SeededOnce,
  mapStatisticDefRow,
  publishStatisticVersion,
  type StatisticDefRow,
} from "../v2-store";
import { requireTradeWriteAccess } from "./trade";

const STAT_LIMIT_DEFAULT = 50;
const STAT_LIMIT_MAX = 200;

function parseOptionalBool(raw: string | undefined): boolean | null {
  if (raw === undefined || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

function statisticItemMatchesFilters(
  item: StatisticListItem,
  filters: {
    tokens: string[];
    topic: string | null;
    v3Seq: string | null;
    entity: string | null;
    hasForecast: boolean | null;
    hasBreak: boolean | null;
  },
): boolean {
  if (filters.topic && !item.topic_tags.some((t) => t.toLowerCase() === filters.topic!.toLowerCase())) {
    return false;
  }
  if (filters.v3Seq) {
    const padded = /^\d+$/.test(filters.v3Seq) ? filters.v3Seq.padStart(2, "0") : filters.v3Seq;
    if (
      !item.v3_seqs.some(
        (s) => s.toLowerCase() === filters.v3Seq!.toLowerCase() || s.toLowerCase() === padded.toLowerCase(),
      )
    ) {
      return false;
    }
  }
  if (filters.entity) {
    const target = filters.entity.toLowerCase();
    const allEntities = Object.values(item.entity_refs).flatMap((arr) => arr ?? []);
    if (!allEntities.some((e) => e.toLowerCase() === target)) {
      return false;
    }
  }
  if (filters.hasForecast !== null && item.has_forecast !== filters.hasForecast) {
    return false;
  }
  if (filters.hasBreak !== null && item.has_methodology_break !== filters.hasBreak) {
    return false;
  }
  if (filters.tokens.length > 0) {
    const haystack = [
      item.statistic_id,
      item.slug,
      item.title,
      item.subtitle,
      item.insight,
      item.source_org,
      item.topic_tags.join(" "),
      item.v3_seqs.join(" "),
      JSON.stringify(item.entity_refs),
    ].join(" ");
    if (!matchesQuery(haystack, filters.tokens)) {
      return false;
    }
  }
  return true;
}

async function loadAdaptedTradeStatistics(db: D1Database): Promise<Statistic[]> {
  const row = await db
    .prepare(
      `SELECT payload_json, available_periods_json
       FROM trade_current_snapshot
       WHERE dict_version = '202601' AND is_latest_month = 1
       LIMIT 1`,
    )
    .first<{ payload_json: string; available_periods_json: string }>();
  if (!row) return [];
  const snap = JSON.parse(row.payload_json) as TradeOverviewPublished;
  snap.availablePeriods = JSON.parse(row.available_periods_json) as string[];
  return adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot(snap));
}

function matchesIfNoneMatch(headerVal: string | undefined, etag: string): boolean {
  if (!headerVal) return false;
  return headerVal
    .split(",")
    .map((s) => s.trim())
    .some((candidate) => candidate === "*" || candidate === etag || candidate === `W/${etag}`);
}

export function statisticsRoutes(app: Hono<AppEnv>) {
  app.post("/api/statistics/publish", async (c) => {
    requireTradeWriteAccess(c);
    const db = c.get("db");
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new AppError(400, "REQUIRED_FIELD_MISSING", { field: "body" });
    }
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      throw new AppError(400, "REQUIRED_FIELD_MISSING", { field: "statistic" });
    }
    const candidate =
      "statistic" in rawBody &&
      (rawBody as { statistic?: unknown }).statistic &&
      typeof (rawBody as { statistic?: unknown }).statistic === "object"
        ? ((rawBody as { statistic: Statistic }).statistic)
        : (rawBody as Statistic);

    for (const field of ["statistic_id", "slug", "version", "title", "dataset"] as const) {
      const val = (candidate as Record<string, unknown>)[field];
      if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
        throw new AppError(400, "REQUIRED_FIELD_MISSING", { field });
      }
    }

    const result = await publishStatisticVersion(db, candidate);
    return c.json({ ok: true, ...result });
  });

  app.get("/api/statistics", async (c) => {
    const db = c.get("db");
    await ensureV2SeededOnce(db);

    const rawQ = textParam(c.req.query("q"));
    const tokens = tokenizeQuery(rawQ);
    const topic = textParam(c.req.query("topic"));
    const v3Seq = textParam(c.req.query("v3_seq"));
    const entity = textParam(c.req.query("entity"));
    const hasForecast = parseOptionalBool(c.req.query("has_forecast"));
    const hasBreak = parseOptionalBool(c.req.query("has_break"));
    const limit = intParam(c.req.query("limit"), STAT_LIMIT_DEFAULT, { min: 1, max: STAT_LIMIT_MAX });
    const offset = intParam(c.req.query("offset"), 0, { min: 0 });

    const clauses: string[] = [];
    const bindings: unknown[] = [];

    for (const tk of tokens) {
      clauses.push(
        `instr(lower(s.statistic_id || ' ' || s.slug || ' ' || s.title || ' ' || s.subtitle || ' ' || s.insight || ' ' || s.source_org || ' ' || s.topic_tags_json || ' ' || s.v3_seqs_json || ' ' || s.entity_refs_json), ?) > 0`,
      );
      bindings.push(tk);
    }
    if (topic) {
      clauses.push(`EXISTS (SELECT 1 FROM json_each(s.topic_tags_json) WHERE lower(CAST(value AS TEXT)) = lower(?))`);
      bindings.push(topic);
    }
    if (v3Seq) {
      const padded = /^\d+$/.test(v3Seq) ? v3Seq.padStart(2, "0") : v3Seq;
      clauses.push(
        `EXISTS (SELECT 1 FROM json_each(s.v3_seqs_json) WHERE lower(CAST(value AS TEXT)) IN (lower(?), lower(?)))`,
      );
      bindings.push(v3Seq, padded);
    }
    if (entity) {
      clauses.push(
        `EXISTS (SELECT 1 FROM json_each(s.entity_refs_json) grp, json_each(grp.value) item WHERE lower(CAST(item.value AS TEXT)) = lower(?))`,
      );
      bindings.push(entity);
    }
    if (hasForecast !== null) {
      clauses.push("s.has_forecast = ?");
      bindings.push(hasForecast ? 1 : 0);
    }
    if (hasBreak !== null) {
      clauses.push("s.has_methodology_break = ?");
      bindings.push(hasBreak ? 1 : 0);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const defStmt =
      bindings.length > 0
        ? db
            .prepare(`SELECT * FROM statistic_def s ${whereSql} ORDER BY s.published_at DESC, s.statistic_id ASC`)
            .bind(...bindings)
        : db.prepare(`SELECT * FROM statistic_def s ORDER BY s.published_at DESC, s.statistic_id ASC`);

    const tradeSnapStmt = db.prepare(
      `SELECT payload_json, available_periods_json
       FROM trade_current_snapshot
       WHERE dict_version = '202601' AND is_latest_month = 1
       LIMIT 1`,
    );
    const shadowedIdsStmt = db.prepare("SELECT statistic_id, slug FROM statistic_def");

    const [defRes, tradeRes, shadowedRes] = await db.batch<Record<string, unknown>>([
      defStmt,
      tradeSnapStmt,
      shadowedIdsStmt,
    ]);

    const items = (defRes.results as unknown as StatisticDefRow[]).map(mapStatisticDefRow);
    const shadowedIds = new Set(
      (shadowedRes.results as Array<{ statistic_id: string; slug: string }>).flatMap((r) => [r.statistic_id, r.slug]),
    );

    const tradeRow = tradeRes.results[0] as { payload_json: string; available_periods_json: string } | undefined;
    if (tradeRow) {
      const snap = JSON.parse(tradeRow.payload_json) as TradeOverviewPublished;
      snap.availablePeriods = JSON.parse(tradeRow.available_periods_json) as string[];
      for (const adapted of adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot(snap))) {
        if (shadowedIds.has(adapted.statistic_id) || shadowedIds.has(adapted.slug)) continue;
        const listItem = toStatisticListItem(adapted, adapted.version);
        if (statisticItemMatchesFilters(listItem, { tokens, topic, v3Seq, entity, hasForecast, hasBreak })) {
          items.push(listItem);
        }
      }
      items.sort(
        (a, b) => b.published_at.localeCompare(a.published_at) || a.statistic_id.localeCompare(b.statistic_id),
      );
    }

    const page: StatisticListPage = {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    };
    return c.json(page);
  });

  app.get("/api/statistics/:id/versions", async (c) => {
    const db = c.get("db");
    await ensureV2SeededOnce(db);
    const id = decodeURIComponent(c.req.param("id"));

    const def = await db
      .prepare(
        `SELECT statistic_id, latest_version
         FROM statistic_def
         WHERE statistic_id = ?1 OR slug = ?1
         LIMIT 1`,
      )
      .bind(id)
      .first<{ statistic_id: string; latest_version: string }>();

    if (!def) {
      const adapted = (await loadAdaptedTradeStatistics(db)).find((s) => s.statistic_id === id || s.slug === id);
      if (adapted) {
        const body: StatisticVersionsResponse = {
          statistic_id: adapted.statistic_id,
          latest_version: adapted.version,
          items: [
            {
              version: adapted.version,
              content_hash: adapted.content_hash,
              published_at: adapted.published_at,
            },
          ],
        };
        return c.json(body);
      }
      throw new AppError(404, "NOT_FOUND", { resource: "statistic", id });
    }

    const { results } = await db
      .prepare(
        `SELECT version, content_hash, published_at
         FROM statistic_version
         WHERE statistic_id = ?1
         ORDER BY published_at DESC, version DESC`,
      )
      .bind(def.statistic_id)
      .all<StatisticVersionEntry>();

    const body: StatisticVersionsResponse = {
      statistic_id: def.statistic_id,
      latest_version: def.latest_version,
      items: results,
    };
    return c.json(body);
  });

  app.get("/api/statistics/:id", async (c) => {
    const db = c.get("db");
    await ensureV2SeededOnce(db);
    const id = decodeURIComponent(c.req.param("id"));
    const requestedVersion = textParam(c.req.query("v")) ?? textParam(c.req.query("version"));
    const rawMode =
      c.req.query("raw") === "1" ||
      c.req.query("raw") === "true" ||
      (c.req.header("accept") ?? "").includes("application/vnd.mdes.statistic.raw+json");

    const def = await db
      .prepare(
        `SELECT statistic_id, slug, latest_version, latest_hash
         FROM statistic_def
         WHERE statistic_id = ?1 OR slug = ?1
         LIMIT 1`,
      )
      .bind(id)
      .first<{ statistic_id: string; slug: string; latest_version: string; latest_hash: string }>();

    if (!def) {
      const adapted = (await loadAdaptedTradeStatistics(db)).find((s) => s.statistic_id === id || s.slug === id);
      if (!adapted) {
        throw new AppError(404, "NOT_FOUND", { resource: "statistic", id });
      }
      if (requestedVersion && requestedVersion !== adapted.version) {
        throw new AppError(404, "NOT_FOUND", {
          resource: "statistic_version",
          id,
          version: requestedVersion,
        });
      }
      const etag = `"${adapted.content_hash}"`;
      const cacheControl = requestedVersion ? "public, max-age=31536000, immutable" : "public, max-age=60";
      if (matchesIfNoneMatch(c.req.header("if-none-match"), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
      }
      if (rawMode) {
        return new Response(JSON.stringify(adapted), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ETag: etag,
            "Cache-Control": cacheControl,
          },
        });
      }
      let related: StatisticListItem[] = [];
      if (adapted.related_statistic_ids.length > 0) {
        const { results } = await db
          .prepare("SELECT * FROM statistic_def WHERE statistic_id IN (SELECT value FROM json_each(?1))")
          .bind(JSON.stringify(adapted.related_statistic_ids))
          .all<StatisticDefRow>();
        related = results.map(mapStatisticDefRow);
      }
      const detail: StatisticDetailResponse = {
        statistic: adapted,
        latest_version: adapted.version,
        is_historical_version: false,
        related,
      };
      return new Response(JSON.stringify(detail), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    const targetVersion = requestedVersion ?? def.latest_version;

    // Plane 2 精确主键命中：PRIMARY KEY (statistic_id, version)，rows_read === 1
    const verRow = await db
      .prepare(
        `SELECT version, content_hash, published_at, payload_json
         FROM statistic_version
         WHERE statistic_id = ?1 AND version = ?2`,
      )
      .bind(def.statistic_id, targetVersion)
      .first<{ version: string; content_hash: string; published_at: string; payload_json: string }>();

    if (!verRow) {
      throw new AppError(404, "NOT_FOUND", {
        resource: "statistic_version",
        id,
        version: targetVersion,
      });
    }

    const etag = `"${verRow.content_hash}"`;
    const cacheControl = requestedVersion ? "public, max-age=31536000, immutable" : "public, max-age=60";

    if (matchesIfNoneMatch(c.req.header("if-none-match"), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    // 零解析直出模式：不执行 JSON.parse / JSON.stringify，直接以底层快照文本构造 HTTP 响应
    if (rawMode) {
      return new Response(verRow.payload_json, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    const statistic = JSON.parse(verRow.payload_json) as Statistic;
    let related: StatisticListItem[] = [];
    if (statistic.related_statistic_ids.length > 0) {
      const { results } = await db
        .prepare("SELECT * FROM statistic_def WHERE statistic_id IN (SELECT value FROM json_each(?1))")
        .bind(JSON.stringify(statistic.related_statistic_ids))
        .all<StatisticDefRow>();
      const byId = new Map(results.map((r) => [r.statistic_id, mapStatisticDefRow(r)]));
      related = statistic.related_statistic_ids
        .map((rid) => byId.get(rid))
        .filter((x): x is StatisticListItem => Boolean(x));
    }

    const isHistorical = verRow.version !== def.latest_version;
    const rawEnvelope = `{"statistic":${verRow.payload_json},"latest_version":${JSON.stringify(def.latest_version)},"is_historical_version":${isHistorical},"related":${JSON.stringify(related)}}`;

    return new Response(rawEnvelope, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "Cache-Control": cacheControl,
      },
    });
  });
}
