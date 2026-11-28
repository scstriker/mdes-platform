import type { Hono } from "hono";
import {
   adaptTradeSnapshotToStatistics,
  matchesQuery,
  normalizeTradeOverviewSnapshot,
  parseTradePeriod,
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
import { DEFAULT_DICT_VERSION } from "../trade";
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

async function loadAdaptedTradeStatistics(
  db: D1Database,
  dictVersion = DEFAULT_DICT_VERSION,
): Promise<Statistic[]> {
  const row = await db
    .prepare(
      `SELECT payload_json, available_periods_json
       FROM trade_current_snapshot
       WHERE dict_version = ?1 AND is_latest_month = 1
       LIMIT 1`,
    )
    .bind(dictVersion)
    .first<{ payload_json: string; available_periods_json: string }>();
  if (!row) return [];
  const snap = JSON.parse(row.payload_json) as TradeOverviewPublished;
  snap.availablePeriods = JSON.parse(row.available_periods_json) as string[];
  return adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot(snap));
}

async function loadHistoricalAdaptedTradeStatistics(
  db: D1Database,
  requestedVersion: string,
  dictVersion = DEFAULT_DICT_VERSION,
): Promise<Statistic[]> {
  const trimmed = requestedVersion.trim();
  if (!trimmed) return [];

  let targetPeriod: string | null = null;
  let releaseToken = trimmed;

  const dotIdx = trimmed.lastIndexOf(".");
  if (dotIdx > 0) {
    const candidatePeriod = trimmed.slice(0, dotIdx);
    const candidateRelease = trimmed.slice(dotIdx + 1);
    if (parseTradePeriod(candidatePeriod) && /^[0-9a-zA-Z_-]{8,}$/.test(candidateRelease)) {
      targetPeriod = candidatePeriod;
      releaseToken = candidateRelease;
    }
  }

  const relRow = await db
    .prepare(
      `SELECT release_id, published_months_json, available_periods_json
       FROM trade_release
       WHERE dict_version = ?1
         AND (release_id = ?2 OR release_id LIKE ?3)
       ORDER BY version_seq DESC, rowid DESC
       LIMIT 1`,
    )
    .bind(dictVersion, releaseToken, `${releaseToken}%`)
    .first<{ release_id: string; published_months_json: string; available_periods_json: string }>();

  if (!relRow) return [];

  if (!targetPeriod) {
    const months = (JSON.parse(relRow.published_months_json) as string[]).slice().sort();
    targetPeriod = months.at(-1) ?? null;
  }
  if (!targetPeriod) return [];

  // 走 UNIQUE(dict_version, period, release_id) 精确索引（rows_read === 1）
  const snapRow = await db
    .prepare(
      `SELECT payload_json
       FROM trade_period_snapshot
       WHERE dict_version = ?1 AND period = ?2 AND release_id = ?3`,
    )
    .bind(dictVersion, targetPeriod, relRow.release_id)
    .first<{ payload_json: string }>();

  if (!snapRow) return [];
  const snap = JSON.parse(snapRow.payload_json) as TradeOverviewPublished;
  snap.availablePeriods = JSON.parse(relRow.available_periods_json) as string[];
  return adaptTradeSnapshotToStatistics(normalizeTradeOverviewSnapshot(snap));
}

async function listAdaptedTradeStatisticVersions(
  db: D1Database,
  latestAdapted: Statistic,
  dictVersion = DEFAULT_DICT_VERSION,
): Promise<StatisticVersionEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT release_id, published_months_json, created_at
       FROM trade_release
       WHERE dict_version = ?1
       ORDER BY version_seq DESC, rowid DESC`,
    )
    .bind(dictVersion)
    .all<{ release_id: string; published_months_json: string; created_at: string }>();

  const seen = new Set<string>();
  const entries: StatisticVersionEntry[] = [];

  for (const r of results) {
    const months = (JSON.parse(r.published_months_json) as string[]).slice().sort();
    const latestMonth = months.at(-1);
    if (!latestMonth) continue;
    const version = `${latestMonth}.${r.release_id.slice(0, 8)}`;
    if (seen.has(version)) continue;
    seen.add(version);
    entries.push({
      version,
      content_hash: version === latestAdapted.version ? latestAdapted.content_hash : `trd-annual-${r.release_id}`,
      published_at: version === latestAdapted.version ? latestAdapted.published_at : r.created_at,
    });
  }

  if (!seen.has(latestAdapted.version)) {
    entries.unshift({
      version: latestAdapted.version,
      content_hash: latestAdapted.content_hash,
      published_at: latestAdapted.published_at,
    });
  }
  return entries;
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

    const tradeSnapStmt = db
      .prepare(
        `SELECT payload_json, available_periods_json
         FROM trade_current_snapshot
         WHERE dict_version = ?1 AND is_latest_month = 1
         LIMIT 1`,
      )
      .bind(DEFAULT_DICT_VERSION);
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
        const items = await listAdaptedTradeStatisticVersions(db, adapted);
        const body: StatisticVersionsResponse = {
          statistic_id: adapted.statistic_id,
          latest_version: adapted.version,
          items,
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
      const latestAdapted = (await loadAdaptedTradeStatistics(db)).find((s) => s.statistic_id === id || s.slug === id);
      let targetAdapted: Statistic | undefined =
        !requestedVersion || (latestAdapted && requestedVersion === latestAdapted.version)
          ? latestAdapted
          : undefined;

      if (requestedVersion && !targetAdapted) {
        const histList = await loadHistoricalAdaptedTradeStatistics(db, requestedVersion);
        targetAdapted = histList.find((s) => s.statistic_id === id || s.slug === id);
        if (!targetAdapted) {
          if (!latestAdapted) {
            throw new AppError(404, "NOT_FOUND", { resource: "statistic", id });
          }
          throw new AppError(404, "NOT_FOUND", {
            resource: "statistic_version",
            id,
            version: requestedVersion,
          });
        }
      }

      if (!targetAdapted) {
        throw new AppError(404, "NOT_FOUND", { resource: "statistic", id });
      }

      const latestVer = latestAdapted?.version ?? targetAdapted.version;
      const isHistoricalTrade = targetAdapted.version !== latestVer;
      const etag = `"${targetAdapted.content_hash}"`;
      const cacheControl = requestedVersion ? "public, max-age=31536000, immutable" : "public, max-age=60";
      if (matchesIfNoneMatch(c.req.header("if-none-match"), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
      }
      if (rawMode) {
        return new Response(JSON.stringify(targetAdapted), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ETag: etag,
            "Cache-Control": cacheControl,
          },
        });
      }
      let related: StatisticListItem[] = [];
      if (targetAdapted.related_statistic_ids.length > 0) {
        const { results } = await db
          .prepare("SELECT * FROM statistic_def WHERE statistic_id IN (SELECT value FROM json_each(?1))")
          .bind(JSON.stringify(targetAdapted.related_statistic_ids))
          .all<StatisticDefRow>();
        related = results.map(mapStatisticDefRow);
      }
      const detail: StatisticDetailResponse = {
        statistic: targetAdapted,
        latest_version: latestVer,
        is_historical_version: isHistoricalTrade,
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
    // 通过 SQLite json_extract 仅提取轻量 related_statistic_ids，Worker JS 层不执行 JSON.parse(payload_json)
    const verRow = await db
      .prepare(
        `SELECT version, content_hash, published_at, payload_json,
                json_extract(payload_json, '$.related_statistic_ids') AS related_ids_json
         FROM statistic_version
         WHERE statistic_id = ?1 AND version = ?2`,
      )
      .bind(def.statistic_id, targetVersion)
      .first<{
        version: string;
        content_hash: string;
        published_at: string;
        payload_json: string;
        related_ids_json: string | null;
      }>();

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

    // 纯快照直出模式：直接返回底层 payload_json 原文
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

    const relatedIds: string[] = verRow.related_ids_json ? (JSON.parse(verRow.related_ids_json) as string[]) : [];
    let related: StatisticListItem[] = [];
    if (relatedIds.length > 0) {
      const { results } = await db
        .prepare("SELECT * FROM statistic_def WHERE statistic_id IN (SELECT value FROM json_each(?1))")
        .bind(JSON.stringify(relatedIds))
        .all<StatisticDefRow>();
      const byId = new Map(results.map((r) => [r.statistic_id, mapStatisticDefRow(r)]));
      related = relatedIds
        .map((rid) => byId.get(rid))
        .filter((x): x is StatisticListItem => Boolean(x));
    }

    // 默认详情读路径同样免除对 payload_json（含大型列式 dataset）的 JSON.parse / JSON.stringify，直接零拷贝拼装外层信封
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
