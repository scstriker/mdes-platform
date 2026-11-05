import { errorBody } from "@mdes/shared";
import { createApp } from "./app";
import { createSql } from "./db";

export type Env = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  EMBEDDING_DIMS?: string;
  IMPORT_MAX_ROWS?: string;
};

const app = createApp(async (c, next) => {
  const env = c.env as Env;
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL || "";
  if (!connectionString) {
    return c.json(errorBody("INTERNAL_ERROR", {}, "DATABASE_URL or HYPERDRIVE binding required"), 500);
  }
  const sql = createSql(connectionString, 1);
  c.set("sql", sql);
  c.set("embeddingDims", Number(env.EMBEDDING_DIMS || 1536));
  c.set("importMaxRows", Number(env.IMPORT_MAX_ROWS || 5000));
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(sql.end({ timeout: 2 }));
  }
});

export default app;
