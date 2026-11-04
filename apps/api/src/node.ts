import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSql } from "./db";

const databaseUrl =
  process.env.DATABASE_URL || "postgres://mdes:mdes@127.0.0.1:5433/mdes";
const embeddingDims = Number(process.env.EMBEDDING_DIMS || 1536);
const importMaxRows = Number(process.env.IMPORT_MAX_ROWS || 5000);
const port = Number(process.env.PORT || 8787);

const sql = createSql(databaseUrl);

const app = createApp(async (c, next) => {
  c.set("sql", sql);
  c.set("embeddingDims", embeddingDims);
  c.set("importMaxRows", importMaxRows);
  await next();
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`MDES API listening on http://127.0.0.1:${port}`);
});
