#!/usr/bin/env node
/**
 * AC-016 (Step 3) 门户热点接口响应耗时 P95、EXPLAIN QUERY PLAN 与 D1 rows_read 实测基线脚本
 *
 * 用法（在 mdes-platform/ 目录下执行）：
 *   node scripts/measure-trade-p95.mjs
 *   node scripts/measure-trade-p95.mjs --out <jsonPath>
 *
 * 严格遵循：
 * - docs/贸易业务验收用例.md（AC-016 第 3 步：预热 5 次 + 串行 50 次，升序第 48 个值 sorted[47] 为 P95；
 *   记录 EXPLAIN QUERY PLAN 与 D1 rows_read、表名与索引名；增加历史年度事实后以原期间、同版快照复测）
 * - docs/ACCEPTANCE.md（AC-016：无全表扫描月度贸易明细 trade_fact）
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as miniflarePkg from "miniflare";
import {
  DICT_VERSION,
  TRADE_FLOWS,
  TRADE_GROUPINGS,
  loadAndVerifyHsDict202601,
} from "./trade-collection-manifest.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = path.resolve(SCRIPT_DIR, "..");
const API_ROOT = path.resolve(PLATFORM_ROOT, "apps/api");
const DICT_PATH = path.resolve(PLATFORM_ROOT, "data/hs_dict_202601.csv");
const SEED_JSON_PATH = path.resolve(PLATFORM_ROOT, "data/indicators_seed.json");

function parseArgs(argv) {
  const opts = {
    warmup: 5,
    samples: 50,
    outPath: null,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--out" && argv[i + 1]) {
      opts.outPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--warmup" && argv[i + 1]) {
      opts.warmup = Number(argv[++i]);
    } else if (arg === "--samples" && argv[i + 1]) {
      opts.samples = Number(argv[++i]);
    } else if (arg === "--quiet") {
      opts.quiet = true;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  if (!Number.isInteger(opts.warmup) || opts.warmup < 0) {
    throw new Error(`--warmup 必须是非负整数: ${opts.warmup}`);
  }
  if (!Number.isInteger(opts.samples) || opts.samples < 1) {
    throw new Error(`--samples 必须是正整数: ${opts.samples}`);
  }
  return opts;
}

function logProgress(quiet, msg) {
  if (!quiet) {
    process.stderr.write(`[measure-trade-p95] ${msg}\n`);
  }
}

function roundMs(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** 按文件名顺序读取 apps/api/migrations/*.sql 并拆分为 SQL 语句 */
function loadMigrationStatements() {
  const migDir = path.join(API_ROOT, "migrations");
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  const out = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(migDir, file), "utf8");
    const stmts = text
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*\n/)
      .map((s) => s.trim().replace(/;$/, ""))
      .filter(Boolean);
    out.push(...stmts);
  }
  return { files, statements: out };
}

/** 内存打包 apps/api/src/seed.ts 并调用真实 seedStatements()，零磁盘临时文件 */
async function loadSeedStatements() {
  const seedEntry = path.join(API_ROOT, "src/seed.ts");
  const seedBundle = await build({
    entryPoints: [seedEntry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
    define: {
      "import.meta.url": JSON.stringify(pathToFileURL(seedEntry).href),
    },
    logLevel: "silent",
  });
  const b64 = Buffer.from(seedBundle.outputFiles[0].text, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${b64}`);
  return mod.seedStatements(SEED_JSON_PATH, DICT_PATH);
}

/** 内存打包 harness-worker.ts 并启动本地 Miniflare D1 实例 */
async function bootMiniflareHarness() {
  const workerEntry = path.join(API_ROOT, "tests/helpers/harness-worker.ts");
  const bundled = await build({
    entryPoints: [workerEntry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    logLevel: "silent",
  });
  const scriptCode = bundled.outputFiles[0].text;

  const v4Config = {
    cf: false,
    modules: true,
    script: scriptCode,
    compatibilityDate: "2026-07-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `mdes-p95-${process.pid}-${Date.now()}` },
    bindings: { IMPORT_MAX_ROWS: "5000" },
  };
  const mfOpts =
    typeof miniflarePkg.convertV4MiniflareOptions === "function"
      ? miniflarePkg.convertV4MiniflareOptions(v4Config)
      : v4Config;

  const mf = new miniflarePkg.Miniflare(mfOpts);
  await mf.ready;

  const request = async (urlPath, init) => {
    let next = init;
    if (init?.body instanceof FormData) {
      const encoded = new Request("http://localhost", {
        method: init.method ?? "POST",
        body: init.body,
      });
      next = {
        ...init,
        body: await encoded.arrayBuffer(),
        headers: {
          ...(init.headers ?? {}),
          "content-type": encoded.headers.get("content-type"),
        },
      };
    }
    return mf.dispatchFetch(`http://localhost${urlPath}`, next);
  };

  const postJson = (urlPath, body) =>
    request(urlPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const execSql = async (statements) => {
    const CHUNK = 200;
    for (let i = 0; i < statements.length; i += CHUNK) {
      const res = await postJson("/__test/sql", {
        statements: statements.slice(i, i + CHUNK),
      });
      if (!res.ok) {
        throw new Error(`SQL 批量执行失败 (${res.status}): ${await res.text()}`);
      }
    }
  };

  const queryWithMeta = async (sql, params = []) => {
    const res = await postJson("/__test/query-meta", { sql, params });
    if (!res.ok) {
      throw new Error(`/__test/query-meta 失败 (${res.status}): ${await res.text()}`);
    }
    return res.json();
  };

  const { files: migrationFiles, statements: migStmts } = loadMigrationStatements();
  await execSql(migStmts);
  const seedStmts = await loadSeedStatements();
  await execSql(seedStmts);

  return {
    request,
    postJson,
    execSql,
    queryWithMeta,
    migrationFiles,
    migrationStatementCount: migStmts.length,
    seedStatementCount: seedStmts.length,
    dispose: () => mf.dispose(),
  };
}

/**
 * 为指定年份的 164 个 HS8 编码生成确定性月度美元整数与双数量：
 * - 2024 年 90181100 精确对齐 AC-013 金标准（进口 20,375,226 美元 / 出口 89,723,246 美元）
 * - 其余编码生成确定性正整数，确保 164 码 × 12 月 × 双流向 × 四分组全部产生真实明细行
 */
function buildDeterministicYearPlan(dictEntries, year) {
  const ECG_IMP_2024 = [
    1_650_000, 1_420_000, 1_780_000, 1_690_000, 1_710_000, 1_830_000,
    1_760_000, 1_680_000, 1_740_000, 1_620_000, 1_795_000, 1_700_226,
  ];
  const ECG_EXP_2024 = [
    7_200_000, 6_450_000, 7_680_000, 7_410_000, 7_520_000, 7_890_000,
    7_610_000, 7_340_000, 7_720_000, 7_490_000, 7_810_000, 7_603_246,
  ];

  const yearFactor = year === 2024 ? 100 : 92;
  const byMonth = new Map();

  for (let mIdx = 0; mIdx < 12; mIdx++) {
    const month = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
    const items = dictEntries.map((entry) => {
      let impUsd;
      let expUsd;
      if (year === 2024 && entry.hs8 === "90181100") {
        impUsd = ECG_IMP_2024[mIdx];
        expUsd = ECG_EXP_2024[mIdx];
      } else {
        impUsd = Math.floor(((entry.seq * 18_500 + (mIdx + 1) * 2_300) * yearFactor) / 100);
        expUsd = Math.floor(((entry.seq * 22_400 + (mIdx + 1) * 3_100) * yearFactor) / 100);
      }
      const impQty1 = Math.max(10, Math.floor(impUsd / 120));
      const impQty2 = Math.max(5, Math.floor(impUsd / 450));
      const expQty1 = Math.max(10, Math.floor(expUsd / 95));
      const expQty2 = Math.max(5, Math.floor(expUsd / 380));
      return {
        hs8: entry.hs8,
        name: entry.name,
        impUsd,
        expUsd,
        impQty1,
        impQty2,
        expQty1,
        expQty2,
      };
    });
    byMonth.set(month, items);
  }
  return byMonth;
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 为单个 (month, flow, grouping) 构造覆盖全部 164 个 HS8 的海关美元 CSV */
function buildFull164CsvText(monthItems, flow, grouping) {
  const lines = [];
  if (grouping === "product") {
    lines.push("商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of monthItems) {
      const usd = flow === "import" ? it.impUsd : it.expUsd;
      const q1 = flow === "import" ? it.impQty1 : it.expQty1;
      const q2 = flow === "import" ? it.impQty2 : it.expQty2;
      lines.push(
        `${it.hs8},${csvEscape(it.name)},${q1},台,${q2},千克,${usd}`,
      );
    }
    return lines.join("\r\n") + "\r\n";
  }

  if (grouping === "partner") {
    lines.push("商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of monthItems) {
      const usd = flow === "import" ? it.impUsd : it.expUsd;
      const q1 = flow === "import" ? it.impQty1 : it.expQty1;
      const q2 = flow === "import" ? it.impQty2 : it.expQty2;
      const u1 = Math.floor(usd * 0.5);
      const u2 = Math.floor(usd * 0.3);
      const u3 = usd - u1 - u2;
      const p1Q1 = Math.floor(q1 * 0.5);
      const p2Q1 = Math.floor(q1 * 0.3);
      const p3Q1 = q1 - p1Q1 - p2Q1;
      const p1Q2 = Math.floor(q2 * 0.5);
      const p2Q2 = Math.floor(q2 * 0.3);
      const p3Q2 = q2 - p1Q2 - p2Q2;
      lines.push(`${it.hs8},${csvEscape(it.name)},502,美国,${p1Q1},台,${p1Q2},千克,${u1}`);
      lines.push(`${it.hs8},${csvEscape(it.name)},304,德国,${p2Q1},台,${p2Q2},千克,${u2}`);
      lines.push(`${it.hs8},${csvEscape(it.name)},116,日本,${p3Q1},台,${p3Q2},千克,${u3}`);
    }
    return lines.join("\r\n") + "\r\n";
  }

  if (grouping === "regime") {
    lines.push("商品编码,商品名称,贸易方式编码,贸易方式名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of monthItems) {
      const usd = flow === "import" ? it.impUsd : it.expUsd;
      const q1 = flow === "import" ? it.impQty1 : it.expQty1;
      const q2 = flow === "import" ? it.impQty2 : it.expQty2;
      const u1 = Math.floor(usd * 0.7);
      const u2 = usd - u1;
      const r1Q1 = Math.floor(q1 * 0.7);
      const r2Q1 = q1 - r1Q1;
      const r1Q2 = Math.floor(q2 * 0.7);
      const r2Q2 = q2 - r1Q2;
      lines.push(`${it.hs8},${csvEscape(it.name)},10,一般贸易,${r1Q1},台,${r1Q2},千克,${u1}`);
      lines.push(`${it.hs8},${csvEscape(it.name)},14,进料加工贸易,${r2Q1},台,${r2Q2},千克,${u2}`);
    }
    return lines.join("\r\n") + "\r\n";
  }

  lines.push("商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
  for (const it of monthItems) {
    const usd = flow === "import" ? it.impUsd : it.expUsd;
    const q1 = flow === "import" ? it.impQty1 : it.expQty1;
    const q2 = flow === "import" ? it.impQty2 : it.expQty2;
    const u1 = Math.floor(usd * 0.6);
    const u2 = usd - u1;
    const g1Q1 = Math.floor(q1 * 0.6);
    const g2Q1 = q1 - g1Q1;
    const g1Q2 = Math.floor(q2 * 0.6);
    const g2Q2 = q2 - g1Q2;
    lines.push(`${it.hs8},${csvEscape(it.name)},4403,广东深圳,${g1Q1},台,${g1Q2},千克,${u1}`);
    lines.push(`${it.hs8},${csvEscape(it.name)},3100,上海市,${g2Q1},台,${g2Q2},千克,${u2}`);
  }
  return lines.join("\r\n") + "\r\n";
}

/** 通过 POST /api/trade/import 导入并发布完整 2024 全年（96 个批次） */
async function importAndPublishFull2024(harness, dict, quiet) {
  const allHs8 = dict.entries.map((e) => e.hs8);
  const yearPlan = buildDeterministicYearPlan(dict.entries, 2024);
  const tStart = performance.now();
  let uploadCount = 0;
  let publishedTriggerCount = 0;
  let finalReleaseId = null;

  for (const [month, monthItems] of yearPlan.entries()) {
    for (const flow of TRADE_FLOWS) {
      for (const grouping of TRADE_GROUPINGS) {
        const csvText = buildFull164CsvText(monthItems, flow, grouping);
        const manifest = {
          dictVersion: DICT_VERSION,
          month,
          flow,
          currency: "USD",
          grouping,
          hs8: allHs8,
          emptyHs8: [],
        };
        const form = new FormData();
        form.append("manifest", JSON.stringify(manifest));
        form.append(
          "file",
          new File([csvText], `fixture_${month}_${flow}_${grouping}_164.csv`, {
            type: "text/csv",
          }),
        );

        const res = await harness.request("/api/trade/import", {
          method: "POST",
          body: form,
        });
        if (res.status !== 200) {
          throw new Error(
            `POST /api/trade/import 失败 (${month}/${flow}/${grouping}): HTTP ${res.status} ${await res.text()}`,
          );
        }
        const receipt = await res.json();
        uploadCount++;
        if (receipt.coverage.missing.length !== 0 || receipt.coverage.received.length !== 164) {
          throw new Error(
            `覆盖率不完整 (${month}/${flow}/${grouping}): received=${receipt.coverage.received.length}`,
          );
        }
        const isMonthLast = flow === "export" && grouping === "region";
        if (isMonthLast) {
          if (receipt.status !== "published" || !receipt.releaseId) {
            throw new Error(`月份 ${month} 末批未触发发布: ${JSON.stringify(receipt)}`);
          }
          publishedTriggerCount++;
          finalReleaseId = receipt.releaseId;
        }
      }
    }
    logProgress(quiet, `已导入并发布 ${month} (${uploadCount}/96)`);
  }

  return {
    uploadCount,
    publishedTriggerCount,
    releaseId: finalReleaseId,
    elapsedMs: roundMs(performance.now() - tStart),
  };
}

/** 查询核心表当前总行数，用于对比历史扩容前后库规模 */
async function collectTableRowCounts(harness) {
  const tables = [
    "trade_fact",
    "trade_hs_coverage",
    "trade_import_batch",
    "trade_period_snapshot",
    "trade_current_snapshot",
    "trade_release",
    "observation",
    "indicator",
  ];
  const counts = {};
  for (const tbl of tables) {
    const { results } = await harness.queryWithMeta(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
    counts[tbl] = Number(results[0]?.cnt ?? 0);
  }
  return counts;
}

/**
 * 对底层 D1 SQL 执行 EXPLAIN QUERY PLAN 与 /__test/query-meta（记录 meta.rows_read、表名、索引名）
 */
async function inspectSqlPlansAndRowsRead(harness) {
  const probes = [
    {
      id: "trade_current_snapshot_by_period",
      endpoint: "GET /api/trade/overview?period=2024",
      table: "trade_current_snapshot",
      expectedIndex: "sqlite_autoindex_trade_current_snapshot_1",
      sql: "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
      params: [DICT_VERSION, "2024"],
    },
    {
      id: "trade_current_snapshot_latest_month",
      endpoint: "GET /api/trade/overview (default latest month)",
      table: "trade_current_snapshot",
      expectedIndex: "trade_current_snapshot_latest_idx",
      sql: "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND is_latest_month = 1 LIMIT 1",
      params: [DICT_VERSION],
    },
    {
      id: "observation_by_indicator_period_page",
      endpoint: "GET /api/observations?indicator_id=TRD-001&period=2024 (page)",
      table: "observation",
      expectedIndex: "observation_indicator_period_idx",
      sql: `SELECT CAST(o.id AS TEXT) AS id, o.indicator_id, o.period, o.geo, o.dims,
                   o.value_num, o.value_text, o.unit, o.batch_id, o.created_at
            FROM observation o LEFT JOIN indicator i ON i.id = o.indicator_id
            WHERE o.indicator_id = ?1 AND o.period = ?2
            ORDER BY o.period DESC, o.id DESC
            LIMIT ?3 OFFSET ?4`,
      params: ["TRD-001", "2024", 100, 0],
    },
    {
      id: "observation_by_indicator_period_count",
      endpoint: "GET /api/observations?indicator_id=TRD-001&period=2024 (count)",
      table: "observation + indicator",
      expectedIndex: "observation_indicator_period_idx + sqlite_autoindex_indicator_1",
      sql: `SELECT COUNT(*) AS total
            FROM observation o LEFT JOIN indicator i ON i.id = o.indicator_id
            WHERE o.indicator_id = ?1 AND o.period = ?2`,
      params: ["TRD-001", "2024"],
    },
    {
      id: "trade_release_latest",
      endpoint: "GET /api/trade/periods",
      table: "trade_release",
      expectedIndex: "trade_release_dict_created_idx",
      sql: `SELECT release_id, published_months_json, available_periods_json, created_at
            FROM trade_release
            WHERE dict_version = ?1
            ORDER BY created_at DESC
            LIMIT 1`,
      params: [DICT_VERSION],
    },
    {
      id: "trade_hs_dict_by_hs8",
      endpoint: "HS8 dictionary primary-key lookup (90181100)",
      table: "trade_hs_dict",
      expectedIndex: "sqlite_autoindex_trade_hs_dict_1",
      sql: "SELECT hs8, hs6, item_name, category_name FROM trade_hs_dict WHERE dict_version = ?1 AND hs8 = ?2",
      params: [DICT_VERSION, "90181100"],
    },
    {
      id: "search_observations_token",
      endpoint: "GET /api/search?q=90181100 (observation token scan)",
      table: "observation + indicator",
      expectedIndex: "sqlite_autoindex_indicator_1 (no trade_fact access)",
      sql: `SELECT COUNT(*) AS total
            FROM observation o LEFT JOIN indicator i ON i.id = o.indicator_id
            WHERE (instr(lower(o.indicator_id || ' ' || coalesce(i.name, '') || ' ' || o.period || ' ' || o.geo || ' ' || o.dims || ' ' || coalesce(cast(o.value_num as text), '') || ' ' || coalesce(o.value_text, '') || ' ' || o.unit || ' ' || coalesce(o.batch_id, '')), ?1) > 0)`,
      params: ["90181100"],
    },
  ];

  const results = {};
  for (const p of probes) {
    const eqpRes = await harness.queryWithMeta(`EXPLAIN QUERY PLAN ${p.sql}`, p.params);
    const execRes = await harness.queryWithMeta(p.sql, p.params);
    const planDetails = eqpRes.results.map((r) => String(r.detail ?? JSON.stringify(r)));
    const touchesTradeFact = planDetails.some((d) => d.toLowerCase().includes("trade_fact"));
    if (touchesTradeFact) {
      throw new Error(`发现意外访问月度明细表 trade_fact: ${p.id} -> ${planDetails.join(" | ")}`);
    }
    results[p.id] = {
      endpoint: p.endpoint,
      table: p.table,
      expectedIndex: p.expectedIndex,
      explainQueryPlan: planDetails,
      rowsRead: Number(execRes.meta?.rows_read ?? -1),
      rowsReturned: execRes.results.length,
      touchesTradeFact: false,
    };
  }
  return results;
}

/**
 * 对单个热点接口执行 warmup 次预热 + samples 次串行请求：
 * 按 docs/贸易业务验收用例.md 第 59 行，50 个样本升序排列后取第 48 个值（1-based 48, sorted[47]）作为精确 P95
 */
async function measureEndpointSerial(harness, endpointPath, { warmup, samples }) {
  const warmupLatencies = [];
  for (let i = 0; i < warmup; i++) {
    const t0 = performance.now();
    const res = await harness.request(endpointPath);
    if (res.status !== 200) {
      throw new Error(`预热请求失败 ${endpointPath}: HTTP ${res.status}`);
    }
    await res.text();
    warmupLatencies.push(performance.now() - t0);
  }

  const rawLatencies = [];
  let responseByteLength = 0;
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const res = await harness.request(endpointPath);
    if (res.status !== 200) {
      throw new Error(`正式采样请求失败 ${endpointPath} (#${i + 1}): HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    const elapsed = performance.now() - t0;
    responseByteLength = buf.byteLength;
    rawLatencies.push(elapsed);
  }

  const sorted = [...rawLatencies].sort((a, b) => a - b);
  // 50 次采样取第 48 个值（sorted[47]）；若自定义 samples != 50 则取 Math.ceil(samples * 0.95) - 1（50 * 0.95 = 47.5 -> ceil = 48 -> index 47）
  const p95Index0 = samples === 50 ? 47 : Math.min(samples - 1, Math.ceil(samples * 0.95) - 1);
  const p50Index0 = Math.floor((samples - 1) * 0.5);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    endpoint: endpointPath,
    warmupCount: warmup,
    sampleCount: samples,
    p95Rule: `sorted[${p95Index0}] (1-based #${p95Index0 + 1} of ${samples})`,
    responseByteLength,
    minMs: roundMs(sorted[0]),
    p50Ms: roundMs(sorted[p50Index0]),
    meanMs: roundMs(sum / samples),
    p95Ms: roundMs(sorted[p95Index0]),
    maxMs: roundMs(sorted[sorted.length - 1]),
    warmupMeanMs:
      warmupLatencies.length > 0
        ? roundMs(warmupLatencies.reduce((a, b) => a + b, 0) / warmupLatencies.length)
        : 0,
    sortedSamplesMs: sorted.map(roundMs),
  };
}

function sqlLit(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * 向库中注入完整 2023 历史年度（2023-01..2023-12 × 164 HS8 × 2 流向 × 4 分组）：
 * - 写入 96 个历史批次、15,744 条覆盖记录、31,488 条月度贸易明细（trade_fact 翻倍）
 * - 写入 29 个 2023 年度/季度/月度/YTD 快照（trade_period_snapshot + trade_current_snapshot）及派生观测值
 * - 严格保持 2024 年已发布快照与 releaseId 不变（验证 AC-016「增加其他年度历史事实后，以原期间、同版快照再测一组」）
 */
async function insertHistoricalYear2023(harness, dict, template2024OverviewPayload, quiet) {
  const t0 = performance.now();
  const allHs8 = [...dict.entries.map((e) => e.hs8)].sort();
  const hs8Json = JSON.stringify(allHs8);
  const yearPlan = buildDeterministicYearPlan(dict.entries, 2023);
  const histCreatedAt = "2024-01-15T00:00:00.000Z";
  const histReleaseId = "00000000-2023-4000-8000-000000002023";

  const months2023 = Array.from({ length: 12 }, (_, i) => `2023-${String(i + 1).padStart(2, "0")}`);
  const periods2023 = [
    ...months2023,
    "2023-Q1",
    "2023-Q2",
    "2023-Q3",
    "2023-Q4",
    ...Array.from({ length: 12 }, (_, i) => `2023-YTD-${String(i + 1).padStart(2, "0")}`),
    "2023",
  ];

  const stmts = [];
  let insertedFactRows = 0;
  let insertedCoverageRows = 0;

  for (const [month, monthItems] of yearPlan.entries()) {
    for (const flow of TRADE_FLOWS) {
      for (const grouping of TRADE_GROUPINGS) {
        const batchId = crypto.randomUUID();
        const scopeKey = `${DICT_VERSION}|${month}|${flow}|USD|${grouping}|${allHs8.join(",")}`;
        const fakeSha = crypto
          .createHash("sha256")
          .update(`hist-2023:${month}:${flow}:${grouping}`)
          .digest("hex");
        const filename = `fixture_${month}_${flow}_${grouping}_164.csv`;

        const factRows = [];
        for (const it of monthItems) {
          const usd = flow === "import" ? it.impUsd : it.expUsd;
          const q1 = flow === "import" ? it.impQty1 : it.expQty1;
          const q2 = flow === "import" ? it.impQty2 : it.expQty2;
          if (grouping === "product") {
            factRows.push({
              hs8: it.hs8,
              itemName: it.name,
              groupCode: "ALL",
              groupName: "全国",
              usdScaled: String(BigInt(usd) * 10000n),
              usdRaw: String(usd),
              qty1: q1,
              unit1: "台",
              qty2: q2,
              unit2: "千克",
            });
          } else if (grouping === "partner") {
            const u1 = Math.floor(usd * 0.5);
            const u2 = Math.floor(usd * 0.3);
            const u3 = usd - u1 - u2;
            factRows.push(
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "502",
                groupName: "美国",
                usdScaled: String(BigInt(u1) * 10000n),
                usdRaw: String(u1),
                qty1: Math.floor(q1 * 0.5),
                unit1: "台",
                qty2: Math.floor(q2 * 0.5),
                unit2: "千克",
              },
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "304",
                groupName: "德国",
                usdScaled: String(BigInt(u2) * 10000n),
                usdRaw: String(u2),
                qty1: Math.floor(q1 * 0.3),
                unit1: "台",
                qty2: Math.floor(q2 * 0.3),
                unit2: "千克",
              },
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "116",
                groupName: "日本",
                usdScaled: String(BigInt(u3) * 10000n),
                usdRaw: String(u3),
                qty1: q1 - Math.floor(q1 * 0.5) - Math.floor(q1 * 0.3),
                unit1: "台",
                qty2: q2 - Math.floor(q2 * 0.5) - Math.floor(q2 * 0.3),
                unit2: "千克",
              },
            );
          } else if (grouping === "regime") {
            const u1 = Math.floor(usd * 0.7);
            const u2 = usd - u1;
            factRows.push(
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "10",
                groupName: "一般贸易",
                usdScaled: String(BigInt(u1) * 10000n),
                usdRaw: String(u1),
                qty1: Math.floor(q1 * 0.7),
                unit1: "台",
                qty2: Math.floor(q2 * 0.7),
                unit2: "千克",
              },
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "14",
                groupName: "进料加工贸易",
                usdScaled: String(BigInt(u2) * 10000n),
                usdRaw: String(u2),
                qty1: q1 - Math.floor(q1 * 0.7),
                unit1: "台",
                qty2: q2 - Math.floor(q2 * 0.7),
                unit2: "千克",
              },
            );
          } else {
            const u1 = Math.floor(usd * 0.6);
            const u2 = usd - u1;
            factRows.push(
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "4403",
                groupName: "广东深圳",
                usdScaled: String(BigInt(u1) * 10000n),
                usdRaw: String(u1),
                qty1: Math.floor(q1 * 0.6),
                unit1: "台",
                qty2: Math.floor(q2 * 0.6),
                unit2: "千克",
              },
              {
                hs8: it.hs8,
                itemName: it.name,
                groupCode: "3100",
                groupName: "上海市",
                usdScaled: String(BigInt(u2) * 10000n),
                usdRaw: String(u2),
                qty1: q1 - Math.floor(q1 * 0.6),
                unit1: "台",
                qty2: q2 - Math.floor(q2 * 0.6),
                unit2: "千克",
              },
            );
          }
        }

        stmts.push(
          `INSERT INTO import_batch (id, filename, status, row_ok, row_err, errors_json, created_at) VALUES (${sqlLit(batchId)}, ${sqlLit(filename)}, 'completed', ${factRows.length}, 0, '[]', ${sqlLit(histCreatedAt)})`,
          `INSERT INTO trade_import_batch (batch_id, dict_version, month, flow, currency, grouping, scope_key, hs8_json, empty_hs8_json, received_hs8_json, confirmed_empty_hs8_json, missing_hs8_json, filename, source_sha256, evidence_sha256s_json, row_count, publish_state, superseded_by, created_at) VALUES (${sqlLit(batchId)}, ${sqlLit(DICT_VERSION)}, ${sqlLit(month)}, ${sqlLit(flow)}, 'USD', ${sqlLit(grouping)}, ${sqlLit(scopeKey)}, ${sqlLit(hs8Json)}, '[]', ${sqlLit(hs8Json)}, '[]', '[]', ${sqlLit(filename)}, ${sqlLit(fakeSha)}, '[]', ${factRows.length}, 'published', NULL, ${sqlLit(histCreatedAt)})`,
          `INSERT INTO trade_active_scope (scope_key, dict_version, month, flow, grouping, batch_id, release_id, updated_at) VALUES (${sqlLit(scopeKey)}, ${sqlLit(DICT_VERSION)}, ${sqlLit(month)}, ${sqlLit(flow)}, ${sqlLit(grouping)}, ${sqlLit(batchId)}, ${sqlLit(histReleaseId)}, ${sqlLit(histCreatedAt)})`,
        );

        const covArr = allHs8.map((hs8) => ({ hs8, status: "received", evidenceSha256: fakeSha }));
        stmts.push(
          `INSERT INTO trade_hs_coverage (batch_id, dict_version, month, flow, grouping, hs8, status, evidence_sha256) SELECT ${sqlLit(batchId)}, ${sqlLit(DICT_VERSION)}, ${sqlLit(month)}, ${sqlLit(flow)}, ${sqlLit(grouping)}, json_extract(value, '$.hs8'), json_extract(value, '$.status'), json_extract(value, '$.evidenceSha256') FROM json_each(${sqlLit(JSON.stringify(covArr))})`,
        );
        insertedCoverageRows += covArr.length;

        const CHUNK = 120;
        for (let i = 0; i < factRows.length; i += CHUNK) {
          const slice = factRows.slice(i, i + CHUNK);
          stmts.push(
            `INSERT INTO trade_fact (batch_id, dict_version, month, flow, grouping, hs8, item_name, group_code, group_name, usd_scaled, usd_raw, qty1, unit1, qty2, unit2) SELECT ${sqlLit(batchId)}, ${sqlLit(DICT_VERSION)}, ${sqlLit(month)}, ${sqlLit(flow)}, ${sqlLit(grouping)}, json_extract(value, '$.hs8'), json_extract(value, '$.itemName'), json_extract(value, '$.groupCode'), json_extract(value, '$.groupName'), CAST(json_extract(value, '$.usdScaled') AS INTEGER), json_extract(value, '$.usdRaw'), json_extract(value, '$.qty1'), json_extract(value, '$.unit1'), json_extract(value, '$.qty2'), json_extract(value, '$.unit2') FROM json_each(${sqlLit(JSON.stringify(slice))})`,
          );
          insertedFactRows += slice.length;
        }
      }
    }
  }

  // 写入 2023 历史 release（created_at 早于 2024，不影响当前最新 releaseId 指针）与 29 个历史快照
  stmts.push(
    `INSERT INTO trade_release (release_id, dict_version, prev_release_id, published_months_json, available_periods_json, created_at) VALUES (${sqlLit(histReleaseId)}, ${sqlLit(DICT_VERSION)}, NULL, ${sqlLit(JSON.stringify(months2023))}, ${sqlLit(JSON.stringify(periods2023))}, ${sqlLit(histCreatedAt)})`,
  );

  const sampleBatchIdRes = await harness.queryWithMeta(
    "SELECT id FROM import_batch ORDER BY created_at ASC LIMIT 1",
  );
  const fallbackBatchId = String(sampleBatchIdRes.results[0]?.id ?? "");

  let insertedSnapshots = 0;
  let insertedObs = 0;
  const snapshotParamInserts = [];
  for (const p2023 of periods2023) {
    const snapPayload = {
      ...template2024OverviewPayload,
      period: p2023,
      releaseId: histReleaseId,
    };
    const payloadStr = JSON.stringify(snapPayload);
    const avStr = JSON.stringify(template2024OverviewPayload.availablePeriods);
    snapshotParamInserts.push({
      snapshotId: crypto.randomUUID(),
      period: p2023,
      payloadStr,
      avStr,
    });
    insertedSnapshots++;

    const obsItems = [
      {
        indicator_id: "TRD-001",
        period: p2023,
        geo: "CN",
        dims: JSON.stringify({
          source: "china_customs",
          dictVersion: DICT_VERSION,
          releaseId: histReleaseId,
          trade_type: "import",
          raw_usd: 1500000000,
        }),
        value_num: 15.0,
        value_text: null,
        unit: "亿美元",
        object_ref: `trade_snapshot:${DICT_VERSION}:${p2023}`,
      },
      {
        indicator_id: "TRD-002",
        period: p2023,
        geo: "CN",
        dims: JSON.stringify({
          source: "china_customs",
          dictVersion: DICT_VERSION,
          releaseId: histReleaseId,
          trade_type: "export",
          raw_usd: 1800000000,
          balance_usd: 300000000,
        }),
        value_num: 18.0,
        value_text: null,
        unit: "亿美元",
        object_ref: `trade_snapshot:${DICT_VERSION}:${p2023}`,
      },
      {
        indicator_id: "TRD-006",
        period: p2023,
        geo: "CN",
        dims: JSON.stringify({
          source: "china_customs",
          dictVersion: DICT_VERSION,
          releaseId: histReleaseId,
          trade_type: "import",
          metric: "CR3",
        }),
        value_num: 100,
        value_text: null,
        unit: "%",
        object_ref: `trade_snapshot:${DICT_VERSION}:${p2023}`,
      },
      {
        indicator_id: "TRD-007",
        period: p2023,
        geo: "CN",
        dims: JSON.stringify({
          source: "china_customs",
          dictVersion: DICT_VERSION,
          releaseId: histReleaseId,
          trade_type: "export",
          metric: "CR3",
        }),
        value_num: 100,
        value_text: null,
        unit: "%",
        object_ref: `trade_snapshot:${DICT_VERSION}:${p2023}`,
      },
    ];
    stmts.push(
      `INSERT INTO observation (indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, object_ref, created_at) SELECT json_extract(value, '$.indicator_id'), json_extract(value, '$.period'), json_extract(value, '$.geo'), json_extract(value, '$.dims'), json_extract(value, '$.value_num'), json_extract(value, '$.value_text'), json_extract(value, '$.unit'), ${sqlLit(fallbackBatchId)}, json_extract(value, '$.object_ref'), ${sqlLit(histCreatedAt)} FROM json_each(${sqlLit(JSON.stringify(obsItems))})`,
    );
    insertedObs += obsItems.length;
  }

  logProgress(
    quiet,
    `正在写入 2023 历史年度扩容数据 (${insertedFactRows} 条 trade_fact, ${insertedSnapshots} 个快照)...`,
  );
  await harness.execSql(stmts);

  for (const snap of snapshotParamInserts) {
    await harness.queryWithMeta(
      `INSERT INTO trade_period_snapshot (snapshot_id, dict_version, period, release_id, source_batches_json, payload_json, created_at)
       VALUES (?1, ?2, ?3, ?4, '[]', ?5, ?6)`,
      [snap.snapshotId, DICT_VERSION, snap.period, histReleaseId, snap.payloadStr, histCreatedAt],
    );
    await harness.queryWithMeta(
      `INSERT INTO trade_current_snapshot (dict_version, period, is_latest_month, release_id, available_periods_json, payload_json, updated_at)
       VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6)`,
      [DICT_VERSION, snap.period, histReleaseId, snap.avStr, snap.payloadStr, histCreatedAt],
    );
  }

  return {
    historicalYear: 2023,
    monthsInserted: months2023.length,
    insertedBatchCount: 96,
    insertedCoverageRows,
    insertedFactRows,
    insertedSnapshots,
    insertedObservationRows: insertedObs,
    elapsedMs: roundMs(performance.now() - t0),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "用法: node scripts/measure-trade-p95.mjs [--warmup 5] [--samples 50] [--out <jsonPath>] [--quiet]\n",
    );
    return;
  }

  const dict = loadAndVerifyHsDict202601(DICT_PATH);
  logProgress(opts.quiet, "正在打包 harness-worker.ts 并启动本地 Miniflare D1...");
  const harness = await bootMiniflareHarness();

  try {
    // 1. 导入并发布完整 2024 年度（164 HS8 × 12 月 × 2 流向 × 4 分组 = 96 次上传）
    const import2024 = await importAndPublishFull2024(harness, dict, opts.quiet);

    // 2. 跨入口同源版本一致性校验（AC-016 第 1 步）
    const ovRes = await harness.request("/api/trade/overview?period=2024");
    const ovBody = await ovRes.json();
    const obsRes = await harness.request("/api/observations?indicator_id=TRD-001&period=2024");
    const obsBody = await obsRes.json();
    const searchRes = await harness.request("/api/search?q=90181100");
    const searchBody = await searchRes.json();
    const periodsRes = await harness.request("/api/trade/periods");
    const periodsBody = await periodsRes.json();

    if (ovBody.status !== "published" || ovBody.period !== "2024") {
      throw new Error(`2024 年度快照未处于已发布状态: ${ovBody.status}`);
    }
    const fixedReleaseId = ovBody.releaseId;
    if (obsBody.total !== 1 || obsBody.items[0]?.dims?.releaseId !== fixedReleaseId) {
      throw new Error("TRD-001 观测值与贸易专题 releaseId 不一致");
    }
    if (obsBody.items[0]?.dims?.raw_usd !== ovBody.totals.importUsd) {
      throw new Error("TRD-001 原始美元金额与贸易专题总额不一致");
    }
    if (periodsBody.releaseId !== fixedReleaseId || !periodsBody.availablePeriods.includes("2024")) {
      throw new Error("GET /api/trade/periods releaseId 或可用期间不一致");
    }

    const hotEndpoints = [
      "/api/trade/overview?period=2024",
      "/api/observations?indicator_id=TRD-001&period=2024",
      "/api/search?q=90181100",
      "/api/trade/periods",
    ];

    // 3. 扩容前基线测量（行数统计 + SQL 执行计划 + rows_read + 5 次预热 / 50 次串行采样）
    const countsBefore = await collectTableRowCounts(harness);
    const sqlMetaBefore = await inspectSqlPlansAndRowsRead(harness);

    logProgress(
      opts.quiet,
      `开始扩容前 4 类热点查询串行测量 (warmup=${opts.warmup}, samples=${opts.samples})...`,
    );
    const latencyBefore = {};
    for (const ep of hotEndpoints) {
      latencyBefore[ep] = await measureEndpointSerial(harness, ep, opts);
    }

    // 4. 历史事实扩容（注入 2023 全年 164 码 × 12 月 × 2 流向 × 4 分组 + 29 个历史快照，保持 2024 同版快照）
    const expansion = await insertHistoricalYear2023(harness, dict, ovBody, opts.quiet);

    // 确认原期间 2024 快照仍为同一 releaseId
    const ovAfterRes = await harness.request("/api/trade/overview?period=2024");
    const ovAfterBody = await ovAfterRes.json();
    if (ovAfterBody.releaseId !== fixedReleaseId) {
      throw new Error(
        `扩容后 2024 快照 releaseId 发生变化: ${ovAfterBody.releaseId} !== ${fixedReleaseId}`,
      );
    }

    // 5. 扩容后复测（行数统计 + SQL 执行计划 + rows_read 断言 + 5 次预热 / 50 次串行采样）
    const countsAfter = await collectTableRowCounts(harness);
    const sqlMetaAfter = await inspectSqlPlansAndRowsRead(harness);

    // 核心验收断言：专题快照查询 rows_read 在扩容前后严格恒等于 1，且绝无全表扫描 trade_fact
    const snapRowsBefore = sqlMetaBefore.trade_current_snapshot_by_period.rowsRead;
    const snapRowsAfter = sqlMetaAfter.trade_current_snapshot_by_period.rowsRead;
    const latestRowsBefore = sqlMetaBefore.trade_current_snapshot_latest_month.rowsRead;
    const latestRowsAfter = sqlMetaAfter.trade_current_snapshot_latest_month.rowsRead;
    const obsCountRowsBefore = sqlMetaBefore.observation_by_indicator_period_count.rowsRead;
    const obsCountRowsAfter = sqlMetaAfter.observation_by_indicator_period_count.rowsRead;

    if (snapRowsBefore !== 1 || snapRowsAfter !== 1) {
      throw new Error(
        `trade_current_snapshot 按期间查询 rows_read 断言失败: before=${snapRowsBefore}, after=${snapRowsAfter} (预期均为 1)`,
      );
    }
    if (latestRowsBefore !== 1 || latestRowsAfter !== 1) {
      throw new Error(
        `trade_current_snapshot 最新月份索引查询 rows_read 断言失败: before=${latestRowsBefore}, after=${latestRowsAfter} (预期均为 1)`,
      );
    }
    if (obsCountRowsBefore !== obsCountRowsAfter) {
      throw new Error(
        `observation 按 (indicator_id, period) 索引计数 rows_read 发生变化: before=${obsCountRowsBefore}, after=${obsCountRowsAfter}`,
      );
    }

    logProgress(
      opts.quiet,
      `开始扩容后 4 类热点查询串行复测 (warmup=${opts.warmup}, samples=${opts.samples})...`,
    );
    const latencyAfter = {};
    for (const ep of hotEndpoints) {
      latencyAfter[ep] = await measureEndpointSerial(harness, ep, opts);
    }

    const comparison = hotEndpoints.map((ep) => ({
      endpoint: ep,
      beforeP95Ms: latencyBefore[ep].p95Ms,
      afterP95Ms: latencyAfter[ep].p95Ms,
      deltaP95Ms: roundMs(latencyAfter[ep].p95Ms - latencyBefore[ep].p95Ms),
      beforeMeanMs: latencyBefore[ep].meanMs,
      afterMeanMs: latencyAfter[ep].meanMs,
      responseByteLength: latencyAfter[ep].responseByteLength,
    }));

    const report = {
      acceptanceCase: "AC-016",
      step: "Step 3 — Hot Portal Query Latency P95, EXPLAIN QUERY PLAN & D1 rows_read",
      measuredAt: new Date().toISOString(),
      dataOrigin: "isolated_local_d1_fixture_164_hs8_full_year",
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuModel: os.cpus()[0]?.model ?? "unknown",
        cpuCores: os.cpus().length,
        runtime: "Miniflare (workerd + local SQLite D1)",
        migrationFiles: harness.migrationFiles,
      },
      fixedQueryScope: {
        dictVersion: DICT_VERSION,
        dictSha256: dict.sha256,
        period: "2024",
        releaseId: fixedReleaseId,
        hs8Count: dict.hs8Count,
        categoryCount: dict.categoryCount,
        warmupRequests: opts.warmup,
        measuredSerialRequests: opts.samples,
        p95Definition:
          opts.samples === 50
            ? "48th value of 50 ascending-sorted serial latencies (sorted[47])"
            : `sorted[${Math.min(opts.samples - 1, Math.ceil(opts.samples * 0.95) - 1)}]`,
      },
      crossEntryConsistency: {
        overviewReleaseId: ovBody.releaseId,
        observationReleaseId: obsBody.items[0]?.dims?.releaseId,
        periodsReleaseId: periodsBody.releaseId,
        overviewImportUsd: ovBody.totals.importUsd,
        trd001RawUsd: obsBody.items[0]?.dims?.raw_usd,
        trd001DisplayYiUsd: obsBody.items[0]?.value_num,
        searchQuery: searchBody.query,
        allConsistent: true,
      },
      seed2024Summary: import2024,
      historicalExpansionSummary: expansion,
      tableRowCounts: {
        beforeExpansion: countsBefore,
        afterExpansion: countsAfter,
      },
      d1QueryPlansAndRowsRead: {
        beforeExpansion: sqlMetaBefore,
        afterExpansion: sqlMetaAfter,
        assertions: {
          snapshotPeriodRowsReadBefore: snapRowsBefore,
          snapshotPeriodRowsReadAfter: snapRowsAfter,
          snapshotPeriodRowsReadConstantAtOne: snapRowsBefore === 1 && snapRowsAfter === 1,
          snapshotLatestMonthRowsReadBefore: latestRowsBefore,
          snapshotLatestMonthRowsReadAfter: latestRowsAfter,
          observationPeriodRowsReadBefore:
            sqlMetaBefore.observation_by_indicator_period_page.rowsRead,
          observationPeriodRowsReadAfter:
            sqlMetaAfter.observation_by_indicator_period_page.rowsRead,
          observationCountRowsReadBefore: obsCountRowsBefore,
          observationCountRowsReadAfter: obsCountRowsAfter,
          tradeReleaseLatestRowsReadBefore: sqlMetaBefore.trade_release_latest.rowsRead,
          tradeReleaseLatestRowsReadAfter: sqlMetaAfter.trade_release_latest.rowsRead,
          zeroFullTableScanOnTradeFact: true,
        },
      },
      latencyComparisonSummary: comparison,
      measurements: {
        beforeExpansion: latencyBefore,
        afterExpansion: latencyAfter,
      },
      verdict: "PASS",
    };

    const jsonText = JSON.stringify(report, null, 2) + "\n";
    if (opts.outPath) {
      fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
      fs.writeFileSync(opts.outPath, jsonText, "utf8");
      logProgress(opts.quiet, `已写出报告至 ${opts.outPath}`);
    }
    process.stdout.write(jsonText);
  } finally {
    await harness.dispose();
  }
}

main().catch((err) => {
  process.stderr.write(
    `[measure-trade-p95] 失败: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
