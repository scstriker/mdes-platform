#!/usr/bin/env node
/**
 * AC-017：164 个税号正式字典核验、2024 年度 Excel 金标准（37 重合码）逐项对账、
 * 隔离 D1 全量 164 码（含 confirmedEmpty PNG 证据）贯通核验与本地海关原件归档（2024-01..2026-10）覆盖扫描脚本
 *
 * 用法（在 mdes-platform/ 目录下执行）：
 *   node scripts/verify-ac017-reconciliation.mjs
 *   node scripts/verify-ac017-reconciliation.mjs --out <jsonPath>
 *
 * 零外部 Python / 第三方 Excel 运行时依赖：使用 Node 内置 node:zlib (inflateRawSync) 直接解析 .xlsx ZIP/XML。
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { build } from "esbuild";
import * as miniflarePkg from "miniflare";
import {
  DICT_VERSION,
  EXPECTED_CATEGORY_COUNT,
  EXPECTED_DICT_SHA256,
  EXPECTED_HS6_COUNT,
  EXPECTED_HS8_COUNT,
  TRADE_FLOWS,
  TRADE_GROUPINGS,
  computeSha256Hex,
  expandNaturalMonths,
  loadAndVerifyHsDict202601,
  scanRawArchiveCoverage,
} from "./trade-collection-manifest.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = path.resolve(SCRIPT_DIR, "..");
const API_ROOT = path.resolve(PLATFORM_ROOT, "apps/api");
const DEFAULT_DICT_PATH = path.resolve(PLATFORM_ROOT, "data/hs_dict_202601.csv");
const DOCS_DICT_COPY_PATH = path.resolve(
  PLATFORM_ROOT,
  "../docs/医疗器械HS编码最终版_202601_164项.csv",
);
const DEFAULT_XLSX_PATH = path.resolve(
  PLATFORM_ROOT,
  "../docs/我国海关平台-2024年度仪器仪表海关进出口年度数据统计.xlsx",
);
const DEFAULT_ARCHIVE_DIR = path.resolve(PLATFORM_ROOT, "data/customs-raw");
const SEED_JSON_PATH = path.resolve(PLATFORM_ROOT, "data/indicators_seed.json");

// 金标准对账常量（见 docs/贸易业务验收用例.md AC-017 第 70-75 行 & docs/ACCEPTANCE.md 第 143 行）
const EXPECTED_INTERSECTION_COUNT = 37;
const EXPECTED_IMPORT_SUM_USD = 17_410_795_225n;
const EXPECTED_KNOWN_EXPORT_COUNT = 36;
const EXPECTED_EXPORT_SUM_USD = 13_792_423_197n;
const SPECIAL_NO_EXPORT_REF_HS8 = "90222190";
const SPECIAL_NO_EXPORT_REF_ROW = 126;
const SPECIAL_NO_EXPORT_REF_IMP_USD = 5_215_518n;

// 合法最小 1x1 PNG 字节（用于验证 AC-017 第 4 步官网无记录 PNG 证据与 0 行回执）
const MINIMAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function parseArgs(argv) {
  const opts = {
    dictPath: DEFAULT_DICT_PATH,
    xlsxPath: DEFAULT_XLSX_PATH,
    archiveDir: DEFAULT_ARCHIVE_DIR,
    latestCompleteMonth: "2026-10",
    outPath: null,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dict" && argv[i + 1]) {
      opts.dictPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--xlsx" && argv[i + 1]) {
      opts.xlsxPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--archive-dir" && argv[i + 1]) {
      opts.archiveDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--to-month" && argv[i + 1]) {
      opts.latestCompleteMonth = argv[++i];
    } else if (arg === "--out" && argv[i + 1]) {
      opts.outPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--quiet") {
      opts.quiet = true;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return opts;
}

function logProgress(quiet, msg) {
  if (!quiet) {
    process.stderr.write(`[verify-ac017] ${msg}\n`);
  }
}

function roundMs(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function unescapeXml(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * 纯 Node 内置 node:zlib 解析 .xlsx (OOXML ZIP) 指定工作表单元格
 */
function readXlsxSheetRows(xlsxFilePath, targetSheetName = "Sheet1") {
  if (!fs.existsSync(xlsxFilePath)) {
    throw new Error(`未找到年度对账样表文件: ${xlsxFilePath}`);
  }
  const buf = fs.readFileSync(xlsxFilePath);
  const sha256 = computeSha256Hex(buf);

  // 定位 ZIP End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  const minSearch = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minSearch; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error(`无效的 .xlsx ZIP 文件（未找到 EOCD）: ${xlsxFilePath}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdPos = buf.readUInt32LE(eocdOffset + 16);
  const zipEntries = new Map();

  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(cdPos) !== 0x02014b50) {
      throw new Error(`ZIP Central Directory 签名异常 @ ${cdPos}`);
    }
    const method = buf.readUInt16LE(cdPos + 10);
    const compSize = buf.readUInt32LE(cdPos + 20);
    const nameLen = buf.readUInt16LE(cdPos + 28);
    const extraLen = buf.readUInt16LE(cdPos + 30);
    const commentLen = buf.readUInt16LE(cdPos + 32);
    const localOffset = buf.readUInt32LE(cdPos + 42);
    const entryName = buf.subarray(cdPos + 46, cdPos + 46 + nameLen).toString("utf8");

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = buf.subarray(dataStart, dataStart + compSize);
    zipEntries.set(entryName, { method, rawSlice });

    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  const readXmlEntry = (name) => {
    const entry = zipEntries.get(name);
    if (!entry) return null;
    const inflated =
      entry.method === 8
        ? zlib.inflateRawSync(entry.rawSlice)
        : entry.method === 0
          ? entry.rawSlice
          : (() => {
              throw new Error(`不支持的 ZIP 压缩算法 method=${entry.method} (${name})`);
            })();
    return inflated.toString("utf8");
  };

  // 解析 sharedStrings.xml
  const sharedStrings = [];
  const sstXml = readXmlEntry("xl/sharedStrings.xml");
  if (sstXml) {
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(sstXml)) !== null) {
      const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let tMatch;
      let combined = "";
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        combined += unescapeXml(tMatch[1]);
      }
      sharedStrings.push(combined);
    }
  }

  // 根据 workbook.xml + workbook.xml.rels 定位 Sheet1 对应 XML 路径
  let sheetEntryPath = "xl/worksheets/sheet1.xml";
  const wbXml = readXmlEntry("xl/workbook.xml");
  const relsXml = readXmlEntry("xl/_rels/workbook.xml.rels");
  if (wbXml && relsXml) {
    const sheetRegex = /<sheet\b([^>]*?)\/?>/g;
    let sMatch;
    let targetRid = null;
    while ((sMatch = sheetRegex.exec(wbXml)) !== null) {
      const nameAttr = /\bname="([^"]+)"/.exec(sMatch[1])?.[1];
      const ridAttr = /\br:id="([^"]+)"/.exec(sMatch[1])?.[1];
      if (nameAttr && unescapeXml(nameAttr) === targetSheetName && ridAttr) {
        targetRid = ridAttr;
        break;
      }
    }
    if (targetRid) {
      const relRegex = /<Relationship\b([^>]*?)\/?>/g;
      let rMatch;
      while ((rMatch = relRegex.exec(relsXml)) !== null) {
        const idAttr = /\bId="([^"]+)"/.exec(rMatch[1])?.[1];
        const targetAttr = /\bTarget="([^"]+)"/.exec(rMatch[1])?.[1];
        if (idAttr === targetRid && targetAttr) {
          sheetEntryPath = targetAttr.startsWith("xl/")
            ? targetAttr
            : `xl/${targetAttr.replace(/^\/+/, "")}`;
          break;
        }
      }
    }
  }

  const sheetXml = readXmlEntry(sheetEntryPath);
  if (!sheetXml) {
    throw new Error(`未在工作簿中找到工作表 ${targetSheetName} (${sheetEntryPath})`);
  }

  const rows = [];
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowNumber = Number(rowMatch[1]);
    const cells = {};
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[2])) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const col = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!col) continue;
      const cellType = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let val = null;
      if (cellType === "s" && vMatch) {
        val = sharedStrings[Number(vMatch[1])] ?? "";
      } else if (cellType === "inlineStr") {
        const itMatch = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner);
        val = itMatch ? unescapeXml(itMatch[1]) : "";
      } else if (vMatch) {
        val = unescapeXml(vMatch[1]);
      }
      cells[col] = val;
    }
    rows.push({ rowNumber, cells });
  }

  return {
    xlsxPath: xlsxFilePath,
    xlsxSha256: sha256,
    sheetName: targetSheetName,
    sheetEntryPath,
    totalSheetRows: rows.length,
    rows,
  };
}

function parseExactIntegerBigInt(raw, contextLabel) {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return null;
  }
  const s = String(raw).trim().replace(/,/g, "");
  if (/^[+-]?\d+$/.test(s)) {
    return BigInt(s);
  }
  const num = Number(s);
  if (!Number.isFinite(num) || Math.round(num) !== num) {
    throw new Error(`${contextLabel} 不是精确整数美元值: ${String(raw)}`);
  }
  return BigInt(Math.round(num));
}

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

async function loadSeedStatements(dictPath) {
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
  return mod.seedStatements(SEED_JSON_PATH, dictPath);
}

async function bootIsolatedMiniflare(dictPath) {
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
    d1Databases: { DB: `mdes-ac017-${process.pid}-${Date.now()}` },
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
        throw new Error(`SQL 执行失败 (${res.status}): ${await res.text()}`);
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
  const seedStmts = await loadSeedStatements(dictPath);
  await execSql(seedStmts);

  return {
    request,
    queryWithMeta,
    migrationFiles,
    dispose: () => mf.dispose(),
  };
}

/** 将年度精确整数美元拆分为 12 个自然月正整数，使 12 个月之和恒等于 annualUsd */
function splitAnnualBigIntAcross12Months(annualUsd) {
  const base = annualUsd / 12n;
  const rem = annualUsd - base * 11n;
  return Array.from({ length: 12 }, (_, idx) => Number(idx < 11 ? base : rem));
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildGoldSubsetCsv(itemsForMonth, grouping) {
  const lines = [];
  if (grouping === "product") {
    lines.push("商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of itemsForMonth) {
      lines.push(`${it.hs8},${csvEscape(it.name)},${it.qty1},${csvEscape(it.unit)},100,千克,${it.usd}`);
    }
    return lines.join("\r\n") + "\r\n";
  }
  if (grouping === "partner") {
    lines.push("商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of itemsForMonth) {
      const u1 = Math.floor(it.usd * 0.6);
      const u2 = it.usd - u1;
      const q1 = Math.floor(it.qty1 * 0.6);
      const q2 = it.qty1 - q1;
      lines.push(`${it.hs8},${csvEscape(it.name)},502,美国,${q1},${csvEscape(it.unit)},60,千克,${u1}`);
      lines.push(`${it.hs8},${csvEscape(it.name)},304,德国,${q2},${csvEscape(it.unit)},40,千克,${u2}`);
    }
    return lines.join("\r\n") + "\r\n";
  }
  if (grouping === "regime") {
    lines.push("商品编码,商品名称,贸易方式编码,贸易方式名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of itemsForMonth) {
      const u1 = Math.floor(it.usd * 0.7);
      const u2 = it.usd - u1;
      const q1 = Math.floor(it.qty1 * 0.7);
      const q2 = it.qty1 - q1;
      lines.push(`${it.hs8},${csvEscape(it.name)},10,一般贸易,${q1},${csvEscape(it.unit)},70,千克,${u1}`);
      lines.push(`${it.hs8},${csvEscape(it.name)},14,进料加工贸易,${q2},${csvEscape(it.unit)},30,千克,${u2}`);
    }
    return lines.join("\r\n") + "\r\n";
  }
  lines.push("商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
  for (const it of itemsForMonth) {
    const u1 = Math.floor(it.usd * 0.65);
    const u2 = it.usd - u1;
    const q1 = Math.floor(it.qty1 * 0.65);
    const q2 = it.qty1 - q1;
    lines.push(`${it.hs8},${csvEscape(it.name)},4403,广东深圳,${q1},${csvEscape(it.unit)},65,千克,${u1}`);
    lines.push(`${it.hs8},${csvEscape(it.name)},3100,上海市,${q2},${csvEscape(it.unit)},35,千克,${u2}`);
  }
  return lines.join("\r\n") + "\r\n";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "用法: node scripts/verify-ac017-reconciliation.mjs [--dict <csv>] [--xlsx <xlsx>] [--archive-dir <dir>] [--to-month 2026-10] [--out <jsonPath>] [--quiet]\n",
    );
    return;
  }

  const tStart = performance.now();

  // =========================================================================
  // Step 1: 核验 202601 正式字典 SHA-256、164 HS8 / 117 HS6 / 11 类及 901819 跨类拆分
  // =========================================================================
  logProgress(opts.quiet, "Step 1: 核验 202601 正式字典与 901819 跨一级类别归属...");
  const dict = loadAndVerifyHsDict202601(opts.dictPath);

  if (dict.sha256 !== EXPECTED_DICT_SHA256) {
    throw new Error(`字典 SHA-256 不匹配: ${dict.sha256}`);
  }
  if (
    dict.hs8Count !== EXPECTED_HS8_COUNT ||
    dict.hs6Count !== EXPECTED_HS6_COUNT ||
    dict.categoryCount !== EXPECTED_CATEGORY_COUNT
  ) {
    throw new Error("字典统计计数不符合 164 / 117 / 11 要求");
  }

  const docsCopySha256 = fs.existsSync(DOCS_DICT_COPY_PATH)
    ? computeSha256Hex(fs.readFileSync(DOCS_DICT_COPY_PATH))
    : null;
  if (docsCopySha256 !== null && docsCopySha256 !== EXPECTED_DICT_SHA256) {
    throw new Error(`docs 字典副本 SHA-256 不一致: ${docsCopySha256}`);
  }

  const hs6Split901819 = {};
  for (const e of dict.entries.filter((it) => it.hs6 === "901819")) {
    hs6Split901819[e.category] ??= [];
    hs6Split901819[e.category].push(e.hs8);
  }
  const diag901819 = hs6Split901819["医用诊断装备"] ?? [];
  const life901819 = hs6Split901819["生命支持装备"] ?? [];
  if (
    JSON.stringify(diag901819) !== JSON.stringify(["90181941", "90181949", "90181990"]) ||
    JSON.stringify(life901819) !== JSON.stringify(["90181930"])
  ) {
    throw new Error(`901819 跨一级类别归属不符合预期: ${JSON.stringify(hs6Split901819)}`);
  }

  // =========================================================================
  // Step 2 & 3: 纯 Node node:zlib 解析年度样表 Sheet1 并核对 37 个重合码与合计
  // =========================================================================
  logProgress(opts.quiet, "Step 2 & 3: 解析 2024 年度海关样表 Sheet1 并核对 37 重合码金额...");
  const workbook = readXlsxSheetRows(opts.xlsxPath, "Sheet1");
  const excelGoldItems = [];
  const seenExcelHs8 = new Set();

  for (const row of workbook.rows) {
    const rawB = row.cells.B != null ? String(row.cells.B).trim() : "";
    if (!/^\d{7,8}$/.test(rawB)) continue;
    const hs8 = rawB.padStart(8, "0");
    if (!dict.byHs8.has(hs8)) continue;
    if (seenExcelHs8.has(hs8)) {
      throw new Error(`样表 Sheet1 发现重复重合 HS8 编码: ${hs8} (行 ${row.rowNumber})`);
    }
    seenExcelHs8.add(hs8);

    const dictMeta = dict.byHs8.get(hs8);
    const impUsd = parseExactIntegerBigInt(row.cells.H, `Row ${row.rowNumber} H (${hs8})`);
    const expUsd = parseExactIntegerBigInt(row.cells.N, `Row ${row.rowNumber} N (${hs8})`);
    const impQty = parseExactIntegerBigInt(row.cells.E, `Row ${row.rowNumber} E (${hs8})`);
    const expQty = parseExactIntegerBigInt(row.cells.K, `Row ${row.rowNumber} K (${hs8})`);

    if (impUsd === null) {
      throw new Error(`样表重合码 ${hs8} (行 ${row.rowNumber}) 缺少进口美元值`);
    }

    excelGoldItems.push({
      sheetRow: row.rowNumber,
      hs8,
      hs6: dictMeta.hs6,
      dictCategory: dictMeta.category,
      dictItemName: dictMeta.name,
      sheetItemName: String(row.cells.C ?? "").trim(),
      sheetUnit: String(row.cells.D ?? "台").trim() || "台",
      importQty: impQty !== null ? Number(impQty) : 120,
      exportQty: expQty !== null ? Number(expQty) : 120,
      importUsdBigInt: impUsd,
      importUsd: Number(impUsd),
      exportUsdBigInt: expUsd,
      exportUsd: expUsd !== null ? Number(expUsd) : null,
      exportRefStatus: expUsd !== null ? "has_reference" : "缺对照",
    });
  }

  if (excelGoldItems.length !== EXPECTED_INTERSECTION_COUNT) {
    throw new Error(
      `字典与样表交集数量不匹配: 实际 ${excelGoldItems.length}, 预期 ${EXPECTED_INTERSECTION_COUNT}`,
    );
  }

  const importSumBigInt = excelGoldItems.reduce((acc, it) => acc + it.importUsdBigInt, 0n);
  const knownExportItems = excelGoldItems.filter((it) => it.exportUsdBigInt !== null);
  const exportSumBigInt = knownExportItems.reduce((acc, it) => acc + it.exportUsdBigInt, 0n);
  const special90222190 = excelGoldItems.find((it) => it.hs8 === SPECIAL_NO_EXPORT_REF_HS8);

  if (importSumBigInt !== EXPECTED_IMPORT_SUM_USD) {
    throw new Error(
      `37 项进口合计不匹配: 实际 ${importSumBigInt}, 预期 ${EXPECTED_IMPORT_SUM_USD}`,
    );
  }
  if (knownExportItems.length !== EXPECTED_KNOWN_EXPORT_COUNT) {
    throw new Error(
      `已知出口项数不匹配: 实际 ${knownExportItems.length}, 预期 ${EXPECTED_KNOWN_EXPORT_COUNT}`,
    );
  }
  if (exportSumBigInt !== EXPECTED_EXPORT_SUM_USD) {
    throw new Error(
      `36 项已知出口合计不匹配: 实际 ${exportSumBigInt}, 预期 ${EXPECTED_EXPORT_SUM_USD}`,
    );
  }
  if (
    !special90222190 ||
    special90222190.sheetRow !== SPECIAL_NO_EXPORT_REF_ROW ||
    special90222190.importUsdBigInt !== SPECIAL_NO_EXPORT_REF_IMP_USD ||
    special90222190.exportUsd !== null
  ) {
    throw new Error(`90222190 (Row 126) 特殊对账项校验失败: ${JSON.stringify(special90222190)}`);
  }

  // =========================================================================
  // Step 4A: 启动隔离 Miniflare D1，导入 2024 全年 164 码 × 12 月 × 2 流向 × 4 分组
  //   - 37 个重合码进口 & 36 个已知出口码使用与 Sheet1 完全一致的月度拆分 CSV
  //   - 其余 127 个医疗器械税号（及 90222190 出口）使用 PNG 空结果凭证（confirmedEmpty）
  // =========================================================================
  logProgress(
    opts.quiet,
    "Step 4A: 启动隔离 Miniflare D1 并导入 2024 全年 164 码（CSV + confirmedEmpty PNG 证据）...",
  );
  const harness = await bootIsolatedMiniflare(opts.dictPath);
  let d1Verification;

  try {
    const goldByHs8 = new Map(excelGoldItems.map((it) => [it.hs8, it]));
    const monthlySplitImp = new Map();
    const monthlySplitExp = new Map();
    for (const it of excelGoldItems) {
      monthlySplitImp.set(it.hs8, splitAnnualBigIntAcross12Months(it.importUsdBigInt));
      if (it.exportUsdBigInt !== null) {
        monthlySplitExp.set(it.hs8, splitAnnualBigIntAcross12Months(it.exportUsdBigInt));
      }
    }

    const impReceivedHs8 = excelGoldItems.map((it) => it.hs8);
    const impEmptyHs8 = dict.entries
      .map((e) => e.hs8)
      .filter((code) => !goldByHs8.has(code));

    const expReceivedHs8 = knownExportItems.map((it) => it.hs8);
    const expReceivedSet = new Set(expReceivedHs8);
    const expEmptyHs8 = dict.entries
      .map((e) => e.hs8)
      .filter((code) => !expReceivedSet.has(code));

    const pngSha256Expected = computeSha256Hex(MINIMAL_PNG);
    let csvBatchUploads = 0;
    let emptyPngBatchUploads = 0;
    let sampleZeroRowReceipt = null;

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const month = `2024-${String(mIdx + 1).padStart(2, "0")}`;
      for (const flow of TRADE_FLOWS) {
        const activeGoldCodes = flow === "import" ? impReceivedHs8 : expReceivedHs8;
        const activeEmptyCodes = flow === "import" ? impEmptyHs8 : expEmptyHs8;

        const monthGoldRows = activeGoldCodes.map((code) => {
          const g = goldByHs8.get(code);
          const usd =
            flow === "import"
              ? monthlySplitImp.get(code)[mIdx]
              : monthlySplitExp.get(code)[mIdx];
          const baseQty = Math.max(12, flow === "import" ? g.importQty : g.exportQty);
          const qFloor = Math.floor(baseQty / 12);
          const qty1 = mIdx < 11 ? qFloor : baseQty - qFloor * 11;
          return {
            hs8: code,
            name: g.dictItemName,
            unit: g.sheetUnit,
            qty1: Math.max(1, qty1),
            usd,
          };
        });

        for (const grouping of TRADE_GROUPINGS) {
          // 批次 1：重合码明细 CSV
          const csvText = buildGoldSubsetCsv(monthGoldRows, grouping);
          const formCsv = new FormData();
          formCsv.append(
            "manifest",
            JSON.stringify({
              dictVersion: DICT_VERSION,
              month,
              flow,
              currency: "USD",
              grouping,
              hs8: activeGoldCodes,
              emptyHs8: [],
            }),
          );
          formCsv.append(
            "file",
            new File([csvText], `fixture_ac017_${month}_${flow}_${grouping}_gold.csv`, {
              type: "text/csv",
            }),
          );
          const csvRes = await harness.request("/api/trade/import", {
            method: "POST",
            body: formCsv,
          });
          if (csvRes.status !== 200) {
            throw new Error(
              `重合码 CSV 导入失败 (${month}/${flow}/${grouping}): HTTP ${csvRes.status} ${await csvRes.text()}`,
            );
          }
          await csvRes.json();
          csvBatchUploads++;

          // 批次 2：其余医疗器械税号使用官网空结果 PNG 凭证上传（0 行回执，confirmedEmpty）
          const formPng = new FormData();
          formPng.append(
            "manifest",
            JSON.stringify({
              dictVersion: DICT_VERSION,
              month,
              flow,
              currency: "USD",
              grouping,
              hs8: activeEmptyCodes,
              emptyHs8: activeEmptyCodes,
            }),
          );
          formPng.append(
            "emptyEvidence",
            new File([MINIMAL_PNG], `fixture_empty_${month}_${flow}_${grouping}.png`, {
              type: "image/png",
            }),
          );
          const pngRes = await harness.request("/api/trade/import", {
            method: "POST",
            body: formPng,
          });
          if (pngRes.status !== 200) {
            throw new Error(
              `空结果 PNG 批次导入失败 (${month}/${flow}/${grouping}): HTTP ${pngRes.status} ${await pngRes.text()}`,
            );
          }
          const pngReceipt = await pngRes.json();
          emptyPngBatchUploads++;

          if (
            pngReceipt.rowCount !== 0 ||
            pngReceipt.coverage.confirmedEmpty.length !== activeEmptyCodes.length ||
            pngReceipt.coverage.missing.length !== 0 ||
            pngReceipt.evidenceSha256s[0] !== pngSha256Expected
          ) {
            throw new Error(`空结果 PNG 回执断言失败: ${JSON.stringify(pngReceipt)}`);
          }
          if (!sampleZeroRowReceipt) {
            sampleZeroRowReceipt = {
              batchId: pngReceipt.batchId,
              month,
              flow,
              grouping,
              rowCount: pngReceipt.rowCount,
              evidenceSha256s: pngReceipt.evidenceSha256s,
              confirmedEmptyCount: pngReceipt.coverage.confirmedEmpty.length,
              missingCount: pngReceipt.coverage.missing.length,
              status: pngReceipt.status,
            };
          }
        }
      }
      logProgress(opts.quiet, `已完成隔离库 ${month} 双流向×四分组覆盖导入 (${mIdx + 1}/12)`);
    }

    // 查询 GET /api/trade/overview?period=2024 逐项核对 11 类顺序、164 码完整度与 37 重合码 0 差额
    const ovRes = await harness.request("/api/trade/overview?period=2024");
    if (ovRes.status !== 200) {
      throw new Error(`GET /api/trade/overview?period=2024 失败: HTTP ${ovRes.status}`);
    }
    const overview = await ovRes.json();

    const expectedCategoryNames = dict.categories.map((c) => c.category);
    const actualCategoryNames = overview.categories.map((c) => c.category);
    if (
      overview.categories.length !== EXPECTED_CATEGORY_COUNT ||
      JSON.stringify(actualCategoryNames) !== JSON.stringify(expectedCategoryNames)
    ) {
      throw new Error(
        `11 个一级类别顺序或数量不匹配: 实际 ${JSON.stringify(actualCategoryNames)}`,
      );
    }
    if (overview.hsItems.length !== EXPECTED_HS8_COUNT) {
      throw new Error(
        `overview.hsItems 数量不匹配: 实际 ${overview.hsItems.length}, 预期 ${EXPECTED_HS8_COUNT}`,
      );
    }

    const overviewByHs8 = new Map(overview.hsItems.map((it) => [it.hs8, it]));
    const itemReconciliations = [];
    for (const gold of excelGoldItems) {
      const actual = overviewByHs8.get(gold.hs8);
      if (!actual) {
        throw new Error(`overview.hsItems 缺失税号 ${gold.hs8}`);
      }
      const impDiff = actual.importUsd - gold.importUsd;
      const expDiff = gold.exportUsd !== null ? actual.exportUsd - gold.exportUsd : null;
      if (impDiff !== 0) {
        throw new Error(
          `税号 ${gold.hs8} 进口对账差额非 0: actual=${actual.importUsd}, expected=${gold.importUsd}`,
        );
      }
      if (expDiff !== null && expDiff !== 0) {
        throw new Error(
          `税号 ${gold.hs8} 出口对账差额非 0: actual=${actual.exportUsd}, expected=${gold.exportUsd}`,
        );
      }
      itemReconciliations.push({
        sheetRow: gold.sheetRow,
        hs8: gold.hs8,
        hs6: gold.hs6,
        category: actual.category,
        itemName: gold.dictItemName,
        expectedImportUsd: gold.importUsd,
        actualImportUsd: actual.importUsd,
        importDiffUsd: impDiff,
        expectedExportUsd: gold.exportUsd,
        actualExportUsd: actual.exportUsd,
        exportDiffUsd: expDiff,
        exportReferenceStatus: gold.exportRefStatus,
      });
    }

    // 验证 D1 trade_hs_coverage 2024 年 15,744 格状态统计
    const covStatsRes = await harness.queryWithMeta(
      `SELECT status, COUNT(*) AS cnt
       FROM trade_hs_coverage
       WHERE dict_version = ?1 AND substr(month, 1, 4) = '2024'
       GROUP BY status`,
      [DICT_VERSION],
    );
    const d1CellCounts = { received: 0, confirmedEmpty: 0, missing: 0, notApplicable: 0 };
    for (const r of covStatsRes.results) {
      if (r.status === "received") d1CellCounts.received = Number(r.cnt);
      else if (r.status === "confirmed_empty") d1CellCounts.confirmedEmpty = Number(r.cnt);
      else if (r.status === "missing") d1CellCounts.missing = Number(r.cnt);
    }
    const totalD1Cells =
      d1CellCounts.received +
      d1CellCounts.confirmedEmpty +
      d1CellCounts.missing +
      d1CellCounts.notApplicable;
    if (totalD1Cells !== 15_744 || d1CellCounts.missing !== 0) {
      throw new Error(
        `隔离库 2024 年 15,744 格覆盖统计异常: total=${totalD1Cells}, detail=${JSON.stringify(d1CellCounts)}`,
      );
    }

    // 验证 AC-017 第 4 步缺采保护：向 2025-01 提交含缺采（无 PNG 凭证）批次，标记 staged 且保留原正式发布
    const partialForm = new FormData();
    partialForm.append(
      "manifest",
      JSON.stringify({
        dictVersion: DICT_VERSION,
        month: "2025-01",
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: ["90181100", "90181210"],
        emptyHs8: [],
      }),
    );
    partialForm.append(
      "file",
      new File(
        ["商品编码,商品名称,美元\r\n90181100,心电图记录仪,1000\r\n"],
        "fixture_2025-01_partial_missing.csv",
        { type: "text/csv" },
      ),
    );
    const partialRes = await harness.request("/api/trade/import", {
      method: "POST",
      body: partialForm,
    });
    const partialReceipt = await partialRes.json();
    const periodsAfterPartial = await (await harness.request("/api/trade/periods")).json();
    if (
      partialReceipt.status !== "staged" ||
      !partialReceipt.coverage.missing.includes("90181210") ||
      periodsAfterPartial.releaseId !== overview.releaseId
    ) {
      throw new Error("缺采批次待补采拦截或保留上一完整发布版本校验失败");
    }

    d1Verification = {
      status: "PASS",
      releaseId: overview.releaseId,
      csvBatchUploads,
      emptyPngBatchUploads,
      totalBatchesUploadedFor2024: csvBatchUploads + emptyPngBatchUploads,
      categoriesReturnedCount: overview.categories.length,
      categoriesInOrder: actualCategoryNames,
      hsItemsReturnedCount: overview.hsItems.length,
      overviewTotalsUsd: overview.totals,
      coverage2024CellsInD1: {
        expectedCells: 15_744,
        ...d1CellCounts,
      },
      emptyEvidenceSampleReceipt: sampleZeroRowReceipt,
      missingProtectionCheck: {
        testedMonth: "2025-01",
        receiptStatus: partialReceipt.status,
        missingHs8: partialReceipt.coverage.missing,
        activeReleaseIdPreserved: periodsAfterPartial.releaseId === overview.releaseId,
      },
      reconciled37Items: itemReconciliations,
    };
  } finally {
    await harness.dispose();
  }

  // =========================================================================
  // Step 4B: 扫描本地真实海关原件归档 data/customs-raw/（2024-01 至 2026-10）
  // =========================================================================
  logProgress(
    opts.quiet,
    `Step 4B: 扫描本地真实原件目录 ${opts.archiveDir} (2024-01 .. ${opts.latestCompleteMonth})...`,
  );
  const allTargetHs8 = dict.entries.map((e) => e.hs8);
  const months2024 = expandNaturalMonths({ year: 2024 });
  const monthsBackfill = expandNaturalMonths({
    fromMonth: "2024-01",
    toMonth: opts.latestCompleteMonth,
  });

  const rawScan2024 = scanRawArchiveCoverage({
    archiveDir: opts.archiveDir,
    dict,
    months: months2024,
    targetHs8: allTargetHs8,
    scope: "full-164-2024",
  });

  const rawScanBackfill = scanRawArchiveCoverage({
    archiveDir: opts.archiveDir,
    dict,
    months: monthsBackfill,
    targetHs8: allTargetHs8,
    scope: `full-164-2024-01..${opts.latestCompleteMonth}`,
  });

  const backfillByYear = {};
  for (const mEntry of rawScanBackfill.byMonth) {
    const yr = mEntry.month.slice(0, 4);
    backfillByYear[yr] ??= {
      months: 0,
      expectedCells: 0,
      received: 0,
      confirmedEmpty: 0,
      missing: 0,
      notApplicable: 0,
      readyMonths: 0,
    };
    backfillByYear[yr].months += 1;
    backfillByYear[yr].expectedCells += mEntry.expected;
    backfillByYear[yr].received += mEntry.received;
    backfillByYear[yr].confirmedEmpty += mEntry.confirmedEmpty;
    backfillByYear[yr].missing += mEntry.missing;
    if (mEntry.readyToPublish) backfillByYear[yr].readyMonths += 1;
  }

  const report = {
    acceptanceCase: "AC-017",
    verifiedAt: new Date().toISOString(),
    elapsedMs: roundMs(performance.now() - tStart),
    dictionaryVerification: {
      dictVersion: dict.dictVersion,
      dictPath: dict.dictPath,
      docsCopyPath: fs.existsSync(DOCS_DICT_COPY_PATH) ? DOCS_DICT_COPY_PATH : null,
      sha256: dict.sha256,
      expectedSha256: EXPECTED_DICT_SHA256,
      docsCopySha256Match: docsCopySha256 === null ? null : docsCopySha256 === EXPECTED_DICT_SHA256,
      hs8Count: dict.hs8Count,
      hs6Count: dict.hs6Count,
      categoryCount: dict.categoryCount,
      hs6Split901819: {
        hs6: "901819",
        categories: hs6Split901819,
        verifiedSplitAcrossDiagnosticAndLifeSupport: true,
      },
      categories: dict.categories.map((c, idx) => ({
        order: idx + 1,
        category: c.category,
        hs8Count: c.count,
      })),
      verified: true,
    },
    excelGoldStandardReconciliation: {
      xlsxPath: workbook.xlsxPath,
      xlsxSha256: workbook.xlsxSha256,
      sheetName: workbook.sheetName,
      intersectionHs8Count: excelGoldItems.length,
      importItemCount: excelGoldItems.length,
      expectedImportSumUsd: Number(EXPECTED_IMPORT_SUM_USD),
      actualImportSumUsd: Number(importSumBigInt),
      importSumDiffUsd: Number(importSumBigInt - EXPECTED_IMPORT_SUM_USD),
      knownExportItemCount: knownExportItems.length,
      expectedKnownExportSumUsd: Number(EXPECTED_EXPORT_SUM_USD),
      actualKnownExportSumUsd: Number(exportSumBigInt),
      knownExportSumDiffUsd: Number(exportSumBigInt - EXPECTED_EXPORT_SUM_USD),
      specialNoExportReferenceItem: {
        hs8: special90222190.hs8,
        sheetRow: special90222190.sheetRow,
        importCell: "H126",
        importUsd: special90222190.importUsd,
        exportCell: "N126",
        exportUsd: special90222190.exportUsd,
        status: special90222190.exportRefStatus,
      },
      verified: true,
    },
    isolatedD1Full164Verification: d1Verification,
    officialCustomsRawArchiveScan: {
      archiveDir: rawScanBackfill.archive.archiveDir,
      archiveDirExists: rawScanBackfill.archive.exists,
      scannedManifestCount: rawScanBackfill.archive.scannedManifestCount,
      validBatchCount: rawScanBackfill.archive.validBatchCount,
      invalidArtifactCount: rawScanBackfill.archive.invalidArtifactCount,
      year2024Matrix15744: {
        formula: "164 HS8 × 12 months × 2 flows × 4 groupings = 15,744",
        expectedCells: rawScan2024.summary.expectedCombinations,
        received: rawScan2024.summary.receivedCount,
        confirmedEmpty: rawScan2024.summary.confirmedEmptyCount,
        missing: rawScan2024.summary.missingCount,
        notApplicable: 0,
        completionPct: rawScan2024.summary.completionPct,
        readyMonthsCount: rawScan2024.summary.readyMonthsCount,
        status: rawScan2024.summary.status,
      },
      backfillRange2024To202610: {
        fromMonth: "2024-01",
        toMonth: opts.latestCompleteMonth,
        totalMonths: monthsBackfill.length,
        expectedCells: rawScanBackfill.summary.expectedCombinations,
        received: rawScanBackfill.summary.receivedCount,
        confirmedEmpty: rawScanBackfill.summary.confirmedEmptyCount,
        missing: rawScanBackfill.summary.missingCount,
        notApplicable: 0,
        completionPct: rawScanBackfill.summary.completionPct,
        status: rawScanBackfill.summary.status,
        byYear: backfillByYear,
      },
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
}

main().catch((err) => {
  process.stderr.write(
    `[verify-ac017] 失败: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
