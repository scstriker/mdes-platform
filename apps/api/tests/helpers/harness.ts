import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { seedStatements } from "../../src/seed";

/**
 * 在 Miniflare（workerd + 本地 D1，与线上同一套 SQLite 行为）里跑真实的 Worker。
 * 每个 harness 一个全新的库；请求经 dispatchFetch 发给 Worker。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(here, "../..");
export const SAMPLE_CSV = readFileSync(path.resolve(API_ROOT, "../../data/samples/trd_sample.csv"), "utf8");

let bundlePromise: Promise<string> | null = null;
function bundle() {
  bundlePromise ??= (async () => {
    // 打包结果放在项目目录里（.wrangler/ 已忽略）：workerd 不允许模块路径用 .. 跳出启动目录
    const dir = path.join(API_ROOT, ".wrangler/test");
    mkdirSync(dir, { recursive: true });
    const outfile = path.join(dir, `harness-${process.pid}.mjs`);
    await build({
      entryPoints: [path.join(here, "harness-worker.ts")],
      bundle: true,
      format: "esm",
      platform: "browser",
      conditions: ["workerd", "worker", "browser"],
      target: "es2022",
      outfile,
      logLevel: "silent",
    });
    return outfile;
  })();
  return bundlePromise;
}

/** 迁移文件按语句拆开（去掉注释行；本项目的迁移里分号只出现在语句末尾） */
export function migrationStatements(): string[] {
  const text = readFileSync(path.join(API_ROOT, "migrations/0001_init.sql"), "utf8");
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean);
}

let seq = 0;

export async function startHarness({ maxRows = 5000, withDb = true, migrate = true, seed = true } = {}) {
  const mf = new Miniflare({
    cf: false,
    modules: true,
    scriptPath: await bundle(),
    compatibilityDate: "2026-07-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: withDb ? { DB: `mdes-test-${process.pid}-${++seq}` } : undefined,
    bindings: { IMPORT_MAX_ROWS: String(maxRows) },
  });
  await mf.ready;

  const request = async (p: string, init?: RequestInit) => {
    let next = init;
    if (init?.body instanceof FormData) {
      // Miniflare 自带的 undici 不认 Node 的 FormData：先用 Node 的 Request 编码成 multipart 字节
      const encoded = new Request("http://localhost", { method: init.method ?? "POST", body: init.body });
      next = {
        ...init,
        body: await encoded.arrayBuffer(),
        headers: { ...(init.headers as Record<string, string>), "content-type": encoded.headers.get("content-type")! },
      };
    }
    const res = await mf.dispatchFetch(`http://localhost${p}`, next as never);
    return res as unknown as Response;
  };
  const post = (p: string, body: unknown) =>
    request(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const sql = async (statements: string[]) => {
    const res = await post("/__test/sql", { statements });
    if (!res.ok) throw new Error(`SQL 执行失败：${await res.text()}`);
  };
  const query = async <T = Record<string, unknown>>(q: string) => (await (await post("/__test/query", { sql: q })).json()) as T[];

  if (withDb && migrate) await sql(migrationStatements());
  if (withDb && seed) await sql(seedStatements());

  return {
    request,
    post,
    sql,
    query,
    reset: () => sql(["delete from observation", "delete from import_batch", "delete from document_chunk", "delete from document"]),
    dispose: () => mf.dispose(),
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;

export function csvUpload(csv: string, filename = "upload.csv"): RequestInit {
  const form = new FormData();
  form.append("file", new File([csv], filename, { type: "text/csv" }));
  return { method: "POST", body: form };
}
