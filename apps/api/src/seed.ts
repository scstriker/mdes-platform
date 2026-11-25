/**
 * 灌入簇、99 个指标及 202601 医疗器械海关 HS 字典（幂等，可重复执行）。
 *
 * 由 data/indicators_seed.json 与 data/hs_dict_202601.csv 生成 SQL，再交给 wrangler 执行：
 *   npm run seed                      本地 D1（wrangler dev 用的那份）
 *   npm run seed -- --persist-to dir  指定本地数据目录（e2e 用）
 *   npm run seed -- --remote          线上 D1
 * seedStatements() 与 seedTradeDictStatements() 也供集成测试直接使用。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvRecords } from "@mdes/shared";
import { inferSourceKind } from "./inferSourceKind";

/** Windows 上 execFileSync("npx") 会 ENOENT（npx.cmd）；直接跑本地 wrangler 入口 */
function wranglerEntry(): string {
  const require = createRequire(import.meta.url);
  return resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
}

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
export const HS_DICT_PATH = resolve(API_ROOT, "../../data/hs_dict_202601.csv");
export const DATABASE_NAME = "mdes";

/** SQLite 字符串字面量：单引号写两遍（SQLite 不认反斜杠转义） */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function seedTradeDictStatements(dictPath = HS_DICT_PATH, dictVersion = "202601"): string[] {
  if (!existsSync(dictPath)) return [];
  const rawBytes = readFileSync(dictPath);
  const sha256 = createHash("sha256").update(rawBytes).digest("hex");
  const text = rawBytes.toString("utf8").replace(/^\uFEFF/, "");
  const records = parseCsvRecords(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (records.length <= 1) return [];

  const dataRows = records.slice(1);
  const categoryOrderMap = new Map<string, { id: string; order: number }>();
  const hs8Set = new Set<string>();
  const hs6Set = new Set<string>();

  const parsedItems = dataRows.map((cols, idx) => {
    const seqNo = Number(cols[0]?.trim() || idx + 1);
    const categoryName = (cols[1] ?? "").trim();
    const itemName = (cols[2] ?? "").trim();
    const hs8 = (cols[3] ?? "").trim();
    const hs6 = (cols[4] ?? "").trim();

    if (!categoryOrderMap.has(categoryName)) {
      const nextOrder = categoryOrderMap.size + 1;
      categoryOrderMap.set(categoryName, {
        id: `cat-${String(nextOrder).padStart(2, "0")}`,
        order: nextOrder,
      });
    }
    hs8Set.add(hs8);
    hs6Set.add(hs6);
    const catMeta = categoryOrderMap.get(categoryName)!;
    return { seqNo, categoryName, categoryId: catMeta.id, categoryOrder: catMeta.order, itemName, hs8, hs6 };
  });

  const statements: string[] = [
    `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode) VALUES (` +
      `${lit(dictVersion)}, '医疗器械HS编码最终版_202601_164项.csv', ${lit(sha256)}, ${hs8Set.size}, ${hs6Set.size}, ${categoryOrderMap.size}, 'full') ` +
      `ON CONFLICT(dict_version) DO UPDATE SET source_sha256 = excluded.source_sha256, hs8_count = excluded.hs8_count, ` +
      `hs6_count = excluded.hs6_count, category_count = excluded.category_count, scope_mode = excluded.scope_mode`,
  ];

  for (const item of parsedItems) {
    statements.push(
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES (` +
        `${lit(dictVersion)}, ${lit(item.hs8)}, ${lit(item.hs6)}, ${lit(item.itemName)}, ${lit(item.categoryId)}, ${lit(item.categoryName)}, ${item.categoryOrder}, ${item.seqNo}) ` +
        `ON CONFLICT(dict_version, hs8) DO UPDATE SET hs6 = excluded.hs6, item_name = excluded.item_name, ` +
        `category_id = excluded.category_id, category_name = excluded.category_name, category_order = excluded.category_order, seq_no = excluded.seq_no`,
    );
  }
  if (dictVersion === "202601" && hs8Set.has("90189080")) {
    statements.push(
      `INSERT INTO trade_hs_year_applicability (dict_version, year, hs8, applicable, basis_note) VALUES (` +
        `'202601', 2022, '90189080', 0, '2022年版中华人民共和国进出口税则尚未单列手术机器人子目（2023年自90189099析出增列）'` +
        `) ON CONFLICT(dict_version, year, hs8) DO UPDATE SET applicable = excluded.applicable, basis_note = excluded.basis_note`,
    );
  }
  return statements;
}

export function seedStatements(seedPath = SEED_PATH, dictPath = HS_DICT_PATH): string[] {
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
  statements.push(...seedTradeDictStatements(dictPath));
  return statements;
}

function main() {
  const args = process.argv.slice(2);
  const file = resolve(API_ROOT, ".wrangler/seed.sql");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, seedStatements().map((s) => `${s};`).join("\n") + "\n");
  const target = args.includes("--remote") || args.includes("--local") ? [] : ["--local"];
  execFileSync(
    process.execPath,
    [wranglerEntry(), "d1", "execute", DATABASE_NAME, ...target, ...args, "--file", file],
    {
      cwd: API_ROOT,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
