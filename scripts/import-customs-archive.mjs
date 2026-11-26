#!/usr/bin/env node
/**
 * 扫描 data/customs-raw/ 归档原件目录，以 deferPublish=true 批量导入到真实后端（本地持久 D1 或指定 API），
 * 随后执行一次 POST /api/trade/publish 完成单次向量化全周期快照发布与 2024 金标准自动核对。
 *
 * 用法：
 *   node scripts/import-customs-archive.mjs --archive data/customs-raw --target local-d1
 *   node scripts/import-customs-archive.mjs --archive data/customs-raw --api-url http://127.0.0.1:8787
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = path.resolve(here, "..");
const API_ROOT = path.join(PLATFORM_ROOT, "apps", "api");
const GOLD_STANDARD_PATH = path.join(PLATFORM_ROOT, "data", "gold_standard_2024_37_hs8.json");

function parseArgs(argv) {
  const opts = {
    archiveDir: path.join(PLATFORM_ROOT, "data", "customs-raw"),
    target: "local-d1",
    apiUrl: "",
    dictVersion: "202601",
    persistDir: path.join(API_ROOT, ".wrangler", "state"),
    includePilot: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--archive" && argv[i + 1]) opts.archiveDir = path.resolve(argv[++i]);
    else if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--api-url" && argv[i + 1]) {
      opts.apiUrl = argv[++i].replace(/\/$/, "");
      opts.target = "http";
    } else if (a === "--dict-version" && argv[i + 1]) opts.dictVersion = argv[++i];
    else if (a === "--persist-dir" && argv[i + 1]) opts.persistDir = path.resolve(argv[++i]);
    else if (a === "--include-pilot") opts.includePilot = true;
  }
  return opts;
}

export function isPilotManifestPath(filePath) {
  const norm = filePath.replace(/\\/g, "/");
  const segments = norm.split("/");
  const base = path.basename(filePath);
  return segments.some((seg) => /^PILOT-/i.test(seg)) || /_PILOT-/i.test(base);
}

/**
 * 防御性去重：若同一归档目录下同时存在试点批次（PILOT-*）与正式分组批次（如 G01），
 * 且试点税号范围已被同字典、同月、同流向、同分组的正式批次覆盖，则跳过被覆盖的试点清单，
 * 避免向后端重复提交重叠范围而触发 409 TRADE_SCOPE_CONFLICT；若目录内仅有试点清单则正常导入。
 */
export function selectImportableManifestEntries(manifestFiles, { dictVersion = "202601", includePilot = false } = {}) {
  const loaded = [];
  for (const mfPath of manifestFiles) {
    const rawManifestText = fs.readFileSync(mfPath, "utf8");
    const manifestObj = JSON.parse(rawManifestText);
    if (dictVersion && manifestObj.dictVersion !== dictVersion) {
      continue;
    }
    const months = Array.isArray(manifestObj.months)
      ? manifestObj.months
      : typeof manifestObj.month === "string" && manifestObj.month
        ? [manifestObj.month]
        : [];
    const hs8 = Array.isArray(manifestObj.hs8) ? manifestObj.hs8.map((c) => String(c).trim()) : [];
    loaded.push({
      mfPath,
      rawManifestText,
      manifestObj,
      months,
      hs8,
      isPilot: isPilotManifestPath(mfPath),
    });
  }

  if (includePilot) {
    return { selected: loaded, skippedPilot: [] };
  }

  const formalScopeHs8 = new Map();
  for (const item of loaded) {
    if (item.isPilot) continue;
    for (const m of item.months) {
      const key = `${item.manifestObj.dictVersion}|${m}|${item.manifestObj.flow}|${item.manifestObj.grouping}`;
      let set = formalScopeHs8.get(key);
      if (!set) {
        set = new Set();
        formalScopeHs8.set(key, set);
      }
      for (const code of item.hs8) set.add(code);
    }
  }

  const selected = [];
  const skippedPilot = [];
  for (const item of loaded) {
    if (!item.isPilot) {
      selected.push(item);
      continue;
    }
    const overlapsFormal = item.months.some((m) => {
      const key = `${item.manifestObj.dictVersion}|${m}|${item.manifestObj.flow}|${item.manifestObj.grouping}`;
      const formalSet = formalScopeHs8.get(key);
      return Boolean(formalSet && item.hs8.some((code) => formalSet.has(code)));
    });
    if (overlapsFormal) {
      skippedPilot.push(item);
    } else {
      selected.push(item);
    }
  }
  return { selected, skippedPilot };
}

function collectManifestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (curr) => {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      const full = path.join(curr, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".manifest.json")) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

function normalizeWranglerPersistRoot(persistDir) {
  const resolved = path.resolve(persistDir);
  const norm = resolved.replace(/\\/g, "/").replace(/\/+$/, "");
  if (norm.endsWith("/v3/d1")) {
    return path.resolve(resolved, "../..");
  }
  return resolved;
}

async function createLocalD1Client(persistDir) {
  const require = createRequire(import.meta.url);
  const wranglerBin = path.resolve(
    path.dirname(require.resolve("wrangler/package.json")),
    "bin/wrangler.js",
  );
  const persistRoot = normalizeWranglerPersistRoot(persistDir);
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const proc = spawn(
    process.execPath,
    [
      wranglerBin,
      "dev",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--persist-to",
      persistRoot,
      "--var",
      "IMPORT_MAX_ROWS:100000",
    ],
    {
      cwd: API_ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderrTail = "";
  proc.stderr?.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2000);
  });

  const deadline = Date.now() + 45_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`本地 wrangler dev 提前退出 (code=${proc.exitCode}): ${stderrTail}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!ready) {
    proc.kill();
    throw new Error(`等待本地 wrangler dev (${baseUrl}) 超时: ${stderrTail}`);
  }

  const http = createHttpClient(baseUrl);
  return {
    sendMultipart: http.sendMultipart,
    sendJson: http.sendJson,
    async dispose() {
      proc.kill();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

function createHttpClient(apiUrl) {
  return {
    async sendMultipart(pathname, form) {
      const res = await fetch(`${apiUrl}${pathname}`, { method: "POST", body: form });
      return { status: res.status, json: await res.json() };
    },
    async sendJson(pathname, method = "GET", body = undefined) {
      const init = { method, headers: {} };
      if (body !== undefined) {
        init.headers["content-type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const res = await fetch(`${apiUrl}${pathname}`, init);
      return { status: res.status, json: await res.json() };
    },
    async dispose() {},
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifestFiles = collectManifestFiles(opts.archiveDir);
  if (manifestFiles.length === 0) {
    console.error(`[import-archive] 未在 ${opts.archiveDir} 下发现任何 *.manifest.json 原件批次。`);
    process.exit(1);
  }

  const { selected: entriesToImport, skippedPilot } = selectImportableManifestEntries(manifestFiles, {
    dictVersion: opts.dictVersion,
    includePilot: opts.includePilot,
  });
  if (skippedPilot.length > 0) {
    console.warn(
      `[import-archive] 检测到 ${skippedPilot.length} 个试点清单与正式批次范围重叠，已自动跳过（请将试点归档置于独立目录 data/customs-raw-pilot/）。`,
    );
  }
  if (entriesToImport.length === 0) {
    console.error(`[import-archive] 未在 ${opts.archiveDir} 下发现匹配 dictVersion=${opts.dictVersion} 的可导入批次。`);
    process.exit(1);
  }

  const client =
    opts.target === "http" ? createHttpClient(opts.apiUrl) : await createLocalD1Client(opts.persistDir);

  try {
    console.log(`[import-archive] 共发现 ${entriesToImport.length} 个可导入采集批次，开始 deferPublish=true 批量暂存...`);
    let totalRows = 0;
    let importedCount = 0;

    for (const entry of entriesToImport) {
      const { mfPath, rawManifestText } = entry;
      const dir = path.dirname(mfPath);
      const stem = path.basename(mfPath, ".manifest.json");

      const csvPath = path.join(dir, `${stem}.raw.csv`);
      const pngPath = path.join(dir, `${stem}.empty.png`);

      const form = new FormData();
      form.append("manifest", rawManifestText);
      form.append("deferPublish", "1");

      if (fs.existsSync(csvPath)) {
        const bytes = fs.readFileSync(csvPath);
        form.append("file", new File([bytes], path.basename(csvPath), { type: "text/csv" }));
      }
      if (fs.existsSync(pngPath)) {
        const pngBytes = fs.readFileSync(pngPath);
        form.append("emptyEvidence", new File([pngBytes], path.basename(pngPath), { type: "image/png" }));
      }

      const { status, json } = await client.sendMultipart("/api/trade/import-bulk", form);
      if (status !== 200) {
        throw new Error(`批次导入失败 (${stem}): HTTP ${status} ${JSON.stringify(json)}`);
      }
      totalRows += Number(json.totalRowCount || 0);
      importedCount += 1;
    }

    console.log(`[import-archive] 已暂存 ${importedCount} 个批次（累计明细 ${totalRows} 行），开始执行单次向量化发布...`);
    const pub = await client.sendJson("/api/trade/publish", "POST", { dictVersion: opts.dictVersion });
    if (pub.status !== 200) {
      throw new Error(`批量发布失败: HTTP ${pub.status} ${JSON.stringify(pub.json)}`);
    }

    const summary = {
      importedBatchFiles: importedCount,
      totalDetailRows: totalRows,
      publishResult: pub.json,
      reconciliation2024: null,
    };

    if (Array.isArray(pub.json.availablePeriods) && pub.json.availablePeriods.includes("2024") && fs.existsSync(GOLD_STANDARD_PATH)) {
      const ov2024 = await client.sendJson(`/api/trade/overview?dictVersion=${opts.dictVersion}&period=2024`);
      if (ov2024.status === 200 && ov2024.json.status === "published") {
        const gold = JSON.parse(fs.readFileSync(GOLD_STANDARD_PATH, "utf8"));
        const byHs = new Map(ov2024.json.hsItems.map((it) => [it.hs8, it]));
        let matchedImp = 0;
        let matchedExp = 0;
        const diffs = [];
        for (const g of gold.items || []) {
          const actual = byHs.get(g.hs8);
          if (!actual) continue;
          if (actual.importUsd === g.importUsd) matchedImp += 1;
          else diffs.push({ hs8: g.hs8, flow: "import", expected: g.importUsd, actual: actual.importUsd });
          if (g.exportUsd !== null) {
            if (actual.exportUsd === g.exportUsd) matchedExp += 1;
            else diffs.push({ hs8: g.hs8, flow: "export", expected: g.exportUsd, actual: actual.exportUsd });
          }
        }
        summary.reconciliation2024 = {
          matchedImportItems: matchedImp,
          matchedExportItems: matchedExp,
          discrepancyCount: diffs.length,
          discrepancies: diffs.slice(0, 10),
        };
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.dispose();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}
