import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../../src/app";
import type { Sql } from "../../src/db";
import { prepareDatabase, resetData } from "../../src/prepare-db";

/** 集成测试用独立的库，不碰开发库；默认与 docker-compose 的 pgvector 同一实例 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://mdes:mdes@127.0.0.1:5433/mdes_test";

/** 准备测试库；连不上 Postgres 时返回 null，调用方跳过集成测试（npm run dev:db 起库后再跑） */
export async function prepareTestDatabase(): Promise<Sql | null> {
  try {
    return await prepareDatabase(TEST_DATABASE_URL);
  } catch (err) {
    console.warn(`[集成测试已跳过] 无法连接 ${new URL(TEST_DATABASE_URL).host}：${(err as Error).message}`);
    return null;
  }
}

export { resetData };

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
