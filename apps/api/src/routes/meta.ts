import type { Hono } from "hono";
import { errorBody } from "@mdes/shared";
import { checkHealth } from "../db";
import type { AppEnv } from "../env";

export function metaRoutes(app: Hono<AppEnv>) {
  /** 健康检查：数据库不可用时返回 503，并附带统一错误体 */
  app.get("/api/health", async (c) => {
    try {
      const h = await checkHealth(c.get("db"));
      return c.json({ ok: true, ...h });
    } catch (err) {
      console.error(err);
      return c.json({ ok: false, db: "error", ...errorBody("INTERNAL_ERROR") }, 503);
    }
  });

  app.get("/api/clusters", async (c) => {
    const { results } = await c.get("db").prepare("select code, name, subsystem_id from indicator_cluster order by code").all();
    return c.json({ items: results });
  });
}
