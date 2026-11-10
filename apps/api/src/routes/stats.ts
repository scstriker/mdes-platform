import type { Hono } from "hono";
import type { ClusterStats, ImportBatchSummary, Stats } from "@mdes/shared";
import type { AppEnv } from "../env";

export function statsRoutes(app: Hono<AppEnv>) {
  /** 概览页统计：指标总数 / 一期 / 一期已入库，观测值总数与数据截止期间，各簇分布，最近一次导入 */
  app.get("/api/stats", async (c) => {
    const db = c.get("db");
    const [indicators, observations, clusters, latest] = await db.batch<Record<string, unknown>>([
      db.prepare(
        `select
           count(*) as total,
           count(*) filter (where i.phase = 'phase1') as phase1,
           count(*) filter (
             where i.phase = 'phase1' and exists (select 1 from observation o where o.indicator_id = i.id)
           ) as phase1_with_data
         from indicator i`,
      ),
      db.prepare("select count(*) as total, max(period) as latest_period from observation"),
      db.prepare(
        `select
           c.code, c.name,
           count(i.id) filter (where i.phase = 'phase1') as phase1,
           count(i.id) filter (where i.phase = 'phase1' and coalesce(o.n, 0) > 0) as phase1_with_data,
           count(i.id) filter (where i.phase <> 'phase1') as later,
           coalesce(sum(o.n), 0) as observations
         from indicator_cluster c
         left join indicator i on i.cluster_code = c.code
         left join (select indicator_id, count(*) as n from observation group by indicator_id) o
           on o.indicator_id = i.id
         group by c.code, c.name
         order by c.code`,
      ),
      db.prepare(
        `select id, filename, status, row_ok, row_err, created_at
         from import_batch
         order by created_at desc, rowid desc
         limit 1`,
      ),
    ]);
    const stats: Stats = {
      indicators: indicators.results[0] as Stats["indicators"],
      observations: observations.results[0] as Stats["observations"],
      clusters: clusters.results as ClusterStats[],
      latest_batch: (latest.results[0] as ImportBatchSummary | undefined) ?? null,
    };
    return c.json(stats);
  });
}
