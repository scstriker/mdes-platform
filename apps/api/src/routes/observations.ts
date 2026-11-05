import type { Hono } from "hono";
import type { Observation, ObservationPage } from "@mdes/shared";
import { intParam, textParam } from "../errors";
import type { AppEnv } from "../env";

export const OBSERVATION_LIMIT_DEFAULT = 100;
export const OBSERVATION_LIMIT_MAX = 500;

export function observationRoutes(app: Hono<AppEnv>) {
  /**
   * 观测值查询：indicator_id、period（精确）、period_from / period_to（含，按字符串比较，
   * period_to 同时包含以它为前缀的子期间）、geo、batch_id；limit / offset 分页，返回 total。
   * 参数非法时回落到默认值或查不到数据，不报错。
   */
  app.get("/api/observations", async (c) => {
    const sql = c.get("sql");
    const q = (name: string) => textParam(c.req.query(name));
    const indicatorId = q("indicator_id");
    const period = q("period");
    const periodFrom = q("period_from");
    const periodTo = q("period_to");
    const geo = q("geo");
    const batchId = q("batch_id");
    const limit = intParam(c.req.query("limit"), OBSERVATION_LIMIT_DEFAULT, { min: 1, max: OBSERVATION_LIMIT_MAX });
    const offset = intParam(c.req.query("offset"), 0, { min: 0 });

    const where = sql`
      where (${indicatorId}::text is null or indicator_id = ${indicatorId})
        and (${period}::text is null or period = ${period})
        and (${periodFrom}::text is null or period >= ${periodFrom})
        and (${periodTo}::text is null or left(period, length(${periodTo})) <= ${periodTo})
        and (${geo}::text is null or geo = ${geo})
        and (${batchId}::text is null or batch_id::text = ${batchId})
    `;
    const items = await sql<Observation[]>`
      select id::text as id, indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, created_at
      from observation
      ${where}
      order by period desc, id desc
      limit ${limit} offset ${offset}
    `;
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from observation ${where}`;
    const page: ObservationPage = { items, total, limit, offset };
    return c.json(page);
  });
}
