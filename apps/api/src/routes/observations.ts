import type { Hono } from "hono";
import type { Observation, ObservationPage } from "@mdes/shared";
import { parseJson } from "../db";
import { intParam, textParam } from "../errors";
import type { AppEnv } from "../env";

export const OBSERVATION_LIMIT_DEFAULT = 100;
export const OBSERVATION_LIMIT_MAX = 500;

/** ?1 indicator_id ?2 period ?3 period_from ?4 period_to ?5 geo ?6 batch_id */
const WHERE = `
  where (?1 is null or indicator_id = ?1)
    and (?2 is null or period = ?2)
    and (?3 is null or period >= ?3)
    and (?4 is null or substr(period, 1, length(?4)) <= ?4)
    and (?5 is null or geo = ?5)
    and (?6 is null or batch_id = ?6)`;

export function observationRoutes(app: Hono<AppEnv>) {
  /**
   * 观测值查询：indicator_id、period（精确）、period_from / period_to（含，按字符串比较，
   * period_to 同时包含以它为前缀的子期间）、geo、batch_id；limit / offset 分页，返回 total。
   * 参数非法时回落到默认值或查不到数据，不报错。
   */
  app.get("/api/observations", async (c) => {
    const db = c.get("db");
    const q = (name: string) => textParam(c.req.query(name));
    const filters = [q("indicator_id"), q("period"), q("period_from"), q("period_to"), q("geo"), q("batch_id")];
    const limit = intParam(c.req.query("limit"), OBSERVATION_LIMIT_DEFAULT, { min: 1, max: OBSERVATION_LIMIT_MAX });
    const offset = intParam(c.req.query("offset"), 0, { min: 0 });

    const [page, count] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `select cast(id as text) as id, indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, created_at
           from observation ${WHERE}
           order by period desc, id desc
           limit ?7 offset ?8`,
        )
        .bind(...filters, limit, offset),
      db.prepare(`select count(*) as total from observation ${WHERE}`).bind(...filters),
    ]);
    const items = page.results.map((r) => ({ ...r, dims: parseJson(r.dims, {}) })) as Observation[];
    const total = Number(count.results[0]?.total ?? 0);
    const body: ObservationPage = { items, total, limit, offset };
    return c.json(body);
  });
}
