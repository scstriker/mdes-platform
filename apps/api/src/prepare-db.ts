/**
 * 准备一个独立的库给测试用：不存在就创建，执行 001_init.sql 并灌入 99 个指标，可选清空观测值与批次。
 * API 集成测试（mdes_test）与端到端测试（mdes_e2e）共用；不会碰开发库。
 *
 * 命令行：tsx src/prepare-db.ts <连接串> [--reset]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createSql, type Sql } from "./db";
import { seedIndicators } from "./seed";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, "../sql/001_init.sql");

/** 连不上 Postgres 时抛错；调用方决定跳过还是失败 */
export async function prepareDatabase(url: string, { reset = false } = {}): Promise<Sql> {
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) await admin.unsafe(`create database "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await admin.end({ timeout: 1 });
  }

  const sql = createSql(url);
  await sql.unsafe(readFileSync(SCHEMA, "utf8"));
  await seedIndicators(sql, { log: () => {} });
  if (reset) await resetData(sql);
  return sql;
}

export async function resetData(sql: Sql) {
  await sql`truncate observation, import_batch restart identity cascade`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  if (!url) {
    console.error("用法：tsx src/prepare-db.ts <连接串> [--reset]");
    process.exit(2);
  }
  prepareDatabase(url, { reset: process.argv.includes("--reset") })
    .then(async (sql) => {
      await sql.end({ timeout: 2 });
      console.log(`数据库已就绪：${new URL(url).pathname.slice(1)}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
