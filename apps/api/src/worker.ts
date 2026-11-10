import { createApp } from "./app";

/** Cloudflare Worker 入口：D1 绑定来自 wrangler.toml 的 d1_databases（binding = "DB"） */
const app = createApp(async (c, next) => {
  c.set("db", c.env.DB);
  c.set("importMaxRows", Number(c.env.IMPORT_MAX_ROWS || 5000));
  await next();
});

export default app;
