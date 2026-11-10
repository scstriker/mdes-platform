import type { Hono } from "hono";
import type { Indicator, IndicatorListItem } from "@mdes/shared";
import { parseJson } from "../db";
import { AppError, textParam } from "../errors";
import type { AppEnv } from "../env";

const LIST_COLUMNS = `
  i.id, i.cluster_code, i.name, i.phase, i.update_freq, i.source_kind, i.phase_scope,
  nullif(json_extract(i.spec_json, '$.automation'), '') as automation`;

export function indicatorRoutes(app: Hono<AppEnv>) {
  /**
   * 指标列表。一次 LEFT JOIN 聚合出每个指标的观测值条数与最近期间；
   * automation 取自 spec_json，供目录筛选。列表不带 spec_json 长文，详情接口才有。
   */
  app.get("/api/indicators", async (c) => {
    const phase = textParam(c.req.query("phase"));
    const cluster = textParam(c.req.query("cluster"));
    const { results } = await c
      .get("db")
      .prepare(
        `select ${LIST_COLUMNS},
           coalesce(o.obs_count, 0) as obs_count,
           o.latest_period
         from indicator i
         left join (
           select indicator_id, count(*) as obs_count, max(period) as latest_period
           from observation
           group by indicator_id
         ) o on o.indicator_id = i.id
         where (?1 is null or i.phase = ?1)
           and (?2 is null or i.cluster_code = ?2)
         order by i.id`,
      )
      .bind(phase, cluster)
      .all<IndicatorListItem>();
    return c.json({ items: results });
  });

  app.get("/api/indicators/:id", async (c) => {
    const id = c.req.param("id");
    const row = await c
      .get("db")
      .prepare(
        `select ${LIST_COLUMNS}, i.spec_json,
           (select count(*) from observation o where o.indicator_id = i.id) as obs_count,
           (select max(period) from observation o where o.indicator_id = i.id) as latest_period
         from indicator i
         where i.id = ?1`,
      )
      .bind(id)
      .first<Omit<Indicator, "spec_json"> & { spec_json: string }>();
    if (!row) throw new AppError(404, "NOT_FOUND", { resource: "indicator", id });
    const indicator: Indicator = { ...row, spec_json: parseJson(row.spec_json, {}) };
    return c.json(indicator);
  });
}
