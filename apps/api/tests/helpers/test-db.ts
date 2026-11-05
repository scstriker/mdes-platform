import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createApp } from "../../src/app";
import { createSql, type Sql } from "../../src/db";
import { seedIndicators } from "../../src/seed";

/** 集成测试用独立的库，不碰开发库；默认与 docker-compose 的 pgvector 同一实例 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://mdes:mdes@127.0.0.1:5433/mdes_test";

/**
 * 准备测试库：不存在就创建，执行 001_init.sql 并灌入 99 个指标。
 * 连不上 Postgres 时返回 null，调用方跳过集成测试（npm run dev:db 起库后再跑）。
 */
export async function prepareTestDatabase(): Promise<Sql | null> {
  const target = new URL(TEST_DATABASE_URL);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) await admin.unsafe(`create database "${dbName.replace(/"/g, '""')}"`);
  } catch (err) {
    console.warn(`[集成测试已跳过] 无法连接 ${adminUrl.host}：${(err as Error).message}`);
    return null;
  } finally {
    await admin.end({ timeout: 1 });
  }

  const sql = createSql(TEST_DATABASE_URL);
  const schema = readFileSync(path.resolve(__dirname, "../../sql/001_init.sql"), "utf8");
  await sql.unsafe(schema);
  await seedIndicators(sql, { log: () => {} });
  return sql;
}

export async function resetData(sql: Sql) {
  await sql`truncate observation, import_batch restart identity cascade`;
}

export function makeApp(sql: Sql, { importMaxRows = 5000 } = {}) {
  return createApp(async (c, next) => {
    c.set("sql", sql);
    c.set("embeddingDims", 1536);
    c.set("importMaxRows", importMaxRows);
    await next();
  });
}

export function csvUpload(csv: string, filename = "upload.csv"): RequestInit {
  const form = new FormData();
  form.append("file", new File([csv], filename, { type: "text/csv" }));
  return { method: "POST", body: form };
}

export const SAMPLE_CSV = readFileSync(path.resolve(__dirname, "../../../../data/samples/trd_sample.csv"), "utf8");
