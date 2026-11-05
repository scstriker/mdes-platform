import type { Hono } from "hono";
import type { Indicator, IndicatorListItem } from "@mdes/shared";
import { AppError, textParam } from "../errors";
import type { AppEnv } from "../env";

export function indicatorRoutes(app: Hono<AppEnv>) {
  /**
   * 指标列表。一次 LEFT JOIN 聚合出每个指标的观测值条数与最近期间；
   * automation 取自 spec_json，供目录筛选。列表不带 spec_json 长文，详情接口才有。
   */
  app.get("/api/indicators", async (c) => {
    const sql = c.get("sql");
    const phase = textParam(c.req.query("phase"));
    const cluster = textParam(c.req.query("cluster"));
    const items = await sql<IndicatorListItem[]>`
      select
        i.id, i.cluster_code, i.name, i.phase, i.update_freq, i.source_kind, i.phase_scope,
        nullif(i.spec_json->>'automation', '') as automation,
        coalesce(o.obs_count, 0)::int as obs_count,
        o.latest_period
      from indicator i
      left join (
        select indicator_id, count(*)::int as obs_count, max(period) as latest_period
        from observation
        group by indicator_id
      ) o on o.indicator_id = i.id
      where (${phase}::text is null or i.phase = ${phase})
        and (${cluster}::text is null or i.cluster_code = ${cluster})
      order by i.id
    `;
    return c.json({ items });
  });

  app.get("/api/indicators/:id", async (c) => {
    const sql = c.get("sql");
    const id = c.req.param("id");
    const [row] = await sql<Indicator[]>`
      select
        i.id, i.cluster_code, i.name, i.phase, i.update_freq, i.source_kind, i.phase_scope, i.spec_json,
        nullif(i.spec_json->>'automation', '') as automation,
        (select count(*)::int from observation o where o.indicator_id = i.id) as obs_count,
        (select max(period) from observation o where o.indicator_id = i.id) as latest_period
      from indicator i
      where i.id = ${id}
    `;
    if (!row) throw new AppError(404, "NOT_FOUND", { resource: "indicator", id });
    return c.json(row);
  });
}
