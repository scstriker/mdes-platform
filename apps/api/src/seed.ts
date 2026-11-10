/**
 * 灌入簇与 99 个指标（幂等，可重复执行）。
 *
 * 由 data/indicators_seed.json 生成 SQL，再交给 wrangler 执行：
 *   npm run seed                      本地 D1（wrangler dev 用的那份）
 *   npm run seed -- --persist-to dir  指定本地数据目录（e2e 用）
 *   npm run seed -- --remote          线上 D1
 * seedStatements() 也供集成测试直接使用。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inferSourceKind } from "./inferSourceKind";

type SeedFile = {
  clusters: { code: string; name: string }[];
  indicators: {
    id: string;
    cluster_code: string;
    name: string;
    business_value: string;
    definition: string;
    source: string;
    collect_method: string;
    update_freq: string;
    usage: string;
    automation: string;
    note: string;
    phase: string;
    phase_scope: string;
  }[];
};

const here = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(here, "..");
export const SEED_PATH = resolve(API_ROOT, "../../data/indicators_seed.json");
export const DATABASE_NAME = "mdes";

/** SQLite 字符串字面量：单引号写两遍（SQLite 不认反斜杠转义） */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function seedStatements(seedPath = SEED_PATH): string[] {
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;
  const statements = ["INSERT OR IGNORE INTO subsystem (id, name) VALUES ('med', '医疗装备')"];
  for (const c of seed.clusters) {
    statements.push(
      `INSERT INTO indicator_cluster (code, name, subsystem_id) VALUES (${lit(c.code)}, ${lit(c.name)}, 'med') ` +
        "ON CONFLICT(code) DO UPDATE SET name = excluded.name",
    );
  }
  for (const i of seed.indicators) {
    const spec = JSON.stringify({
      business_value: i.business_value,
      definition: i.definition,
      source: i.source,
      collect_method: i.collect_method,
      usage: i.usage,
      automation: i.automation,
      note: i.note,
    });
    statements.push(
      "INSERT INTO indicator (id, cluster_code, name, phase, update_freq, source_kind, phase_scope, spec_json) VALUES (" +
        [i.id, i.cluster_code, i.name, i.phase, i.update_freq, inferSourceKind(i.source, i.collect_method), i.phase_scope, spec]
          .map(lit)
          .join(", ") +
        ") ON CONFLICT(id) DO UPDATE SET cluster_code = excluded.cluster_code, name = excluded.name, phase = excluded.phase, " +
        "update_freq = excluded.update_freq, source_kind = excluded.source_kind, phase_scope = excluded.phase_scope, spec_json = excluded.spec_json",
    );
  }
  return statements;
}

function main() {
  const args = process.argv.slice(2);
  const file = resolve(API_ROOT, ".wrangler/seed.sql");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, seedStatements().map((s) => `${s};`).join("\n") + "\n");
  const target = args.includes("--remote") || args.includes("--local") ? [] : ["--local"];
  execFileSync("npx", ["wrangler", "d1", "execute", DATABASE_NAME, ...target, ...args, "--file", file], {
    cwd: API_ROOT,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
