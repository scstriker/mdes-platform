import type { Hono } from "hono";
import {
  tokenizeQuery,
  type GlobalSearchResult,
  type IndicatorListItem,
  type ObservationSearchHit,
} from "@mdes/shared";
import { parseJson } from "../db";
import { intParam, textParam } from "../errors";
import type { AppEnv } from "../env";
import { bindIfNeeded, buildObservationWhere } from "./observations";

export const SEARCH_LIMIT_DEFAULT = 12;
export const SEARCH_LIMIT_MAX = 50;

const INDICATOR_HAYSTACK_SQL =
  "lower(i.id || ' ' || i.name || ' ' || i.cluster_code || ' ' || coalesce(json_extract(i.spec_json, '$.definition'), '') || ' ' || coalesce(json_extract(i.spec_json, '$.source'), ''))";

export function searchRoutes(app: Hono<AppEnv>) {
  /**
   * 全站动态数据库统一检索接口：
   * 同时检索已入库的实时观测值（observation 关联 indicator）与底层工程指标元数据，
   * 观测值匹配规则与 GET /api/observations?q=... 完全同源，确保结果总数严格一致。
   */
  app.get("/api/search", async (c) => {
    const rawQ = textParam(c.req.query("q")) ?? "";
    const tokens = tokenizeQuery(rawQ);
    const limit = intParam(c.req.query("limit"), SEARCH_LIMIT_DEFAULT, {
      min: 1,
      max: SEARCH_LIMIT_MAX,
    });

    if (tokens.length === 0) {
      const empty: GlobalSearchResult = {
        query: "",
        observations: { items: [], total: 0 },
        indicators: { items: [], total: 0 },
      };
      return c.json(empty);
    }

    const db = c.get("db");
    const obsQuery = buildObservationWhere({ q: rawQ });

    const indClauses = tokens.map(() => `instr(${INDICATOR_HAYSTACK_SQL}, ?) > 0`);
    const indWhere = `where ${indClauses.join(" and ")}`;

    const obsItemsStmt = db
      .prepare(
        `select cast(o.id as text) as id, o.indicator_id,
                coalesce(i.name, o.indicator_id) as indicator_name,
                coalesce(i.cluster_code, '') as cluster_code,
                o.period, o.geo, o.dims, o.value_num, o.value_text, o.unit, o.batch_id, o.created_at
         ${obsQuery.fromSql} ${obsQuery.whereSql}
         order by o.period desc, o.id desc
         limit ?`,
      )
      .bind(...obsQuery.bindings, limit);

    const obsCountStmt = bindIfNeeded(
      db.prepare(`select count(*) as total ${obsQuery.fromSql} ${obsQuery.whereSql}`),
      obsQuery.bindings,
    );

    const indItemsStmt = db
      .prepare(
        `select i.id, i.cluster_code, i.name, i.phase, i.update_freq, i.source_kind, i.phase_scope,
                nullif(json_extract(i.spec_json, '$.automation'), '') as automation,
                coalesce(o.obs_count, 0) as obs_count,
                o.latest_period
         from indicator i
         left join (
           select indicator_id, count(*) as obs_count, max(period) as latest_period
           from observation
           group by indicator_id
         ) o on o.indicator_id = i.id
         ${indWhere}
         order by coalesce(o.obs_count, 0) desc, i.id asc
         limit ?`,
      )
      .bind(...tokens, limit);

    const indCountStmt = db
      .prepare(`select count(*) as total from indicator i ${indWhere}`)
      .bind(...tokens);

    const [obsRows, obsCount, indRows, indCount] = await db.batch<Record<string, unknown>>([
      obsItemsStmt,
      obsCountStmt,
      indItemsStmt,
      indCountStmt,
    ]);

    const body: GlobalSearchResult = {
      query: rawQ,
      observations: {
        items: obsRows.results.map((r) => ({
          ...r,
          dims: parseJson(r.dims, {}),
        })) as ObservationSearchHit[],
        total: Number(obsCount.results[0]?.total ?? 0),
      },
      indicators: {
        items: indRows.results as unknown as IndicatorListItem[],
        total: Number(indCount.results[0]?.total ?? 0),
      },
    };
    return c.json(body);
  });
}
