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
import crypto from "node:crypto";
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
    if (item.months.length === 0 || item.hs8.length === 0) {
      selected.push(item);
      continue;
    }

    const overlappedMonths = [];
    const uncoveredMonths = [];
    let totalPairs = 0;
    let coveredPairs = 0;

    for (const m of item.months) {
      const key = `${item.manifestObj.dictVersion}|${m}|${item.manifestObj.flow}|${item.manifestObj.grouping}`;
      const formalSet = formalScopeHs8.get(key);
      let monthCoveredCount = 0;
      for (const code of item.hs8) {
        totalPairs += 1;
        if (formalSet && formalSet.has(code)) {
          coveredPairs += 1;
          monthCoveredCount += 1;
        }
      }
      if (monthCoveredCount > 0) overlappedMonths.push(m);
      if (monthCoveredCount < item.hs8.length) uncoveredMonths.push(m);
    }

    if (coveredPairs === 0) {
      selected.push(item);
    } else if (coveredPairs === totalPairs) {
      skippedPilot.push(item);
    } else {
      throw new Error(
        `PILOT_PARTIAL_OVERLAP: 试点清单 ${path.basename(item.mfPath)} 与正式批次仅部分重叠` +
          `（已覆盖月份=[${overlappedMonths.join(",")}]，未覆盖月份=[${uncoveredMonths.join(",")}]）。` +
          "拒绝跳过整份试点清单以免丢失未覆盖月份；请补齐正式分组采集或将试点文件隔离至独立目录 data/customs-raw-pilot/。",
      );
    }
  }
  return { selected, skippedPilot };
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * 核验归档原件（.raw.csv / .empty.png）在落盘后的字节完整性，防止归档 CSV 被截断或缺行后仍携带
 * probeVerifiedZero=true 上传导致缺失记录被误确认为零。
 */
export function verifyArchiveEntryIntegrity(entry) {
  const { mfPath, manifestObj, months } = entry;
  const dir = path.dirname(mfPath);
  const stem = path.basename(mfPath, ".manifest.json");
  const csvPath = path.join(dir, `${stem}.raw.csv`);
  const pngPath = path.join(dir, `${stem}.empty.png`);
  const metaPath = path.join(dir, `${stem}.meta.json`);

  const hasCsv = fs.existsSync(csvPath);
  const hasPng = fs.existsSync(pngPath);
  if (!hasCsv && !hasPng) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): 缺少 .raw.csv 与 .empty.png 原件`);
  }

  const csvBytes = hasCsv ? fs.readFileSync(csvPath) : null;
  const pngBytes = hasPng ? fs.readFileSync(pngPath) : null;
  const actualCsvSha256 = csvBytes ? sha256Hex(csvBytes) : null;
  const actualPngSha256 = pngBytes ? sha256Hex(pngBytes) : null;
  const hasMeta = fs.existsSync(metaPath);

  if (!hasMeta) {
    if (manifestObj.probeVerifiedZero === true) {
      throw new Error(
        `ARCHIVE_INTEGRITY_ERROR (${stem}): probeVerifiedZero=true 的归档批次缺少配套 .meta.json 摘要凭证，拒绝上传`,
      );
    }
    return {
      stem,
      csvPath: hasCsv ? csvPath : null,
      pngPath: hasPng ? pngPath : null,
      csvBytes,
      pngBytes,
      expectedSourceSha256: actualCsvSha256 ?? actualPngSha256,
      expectedDetailRowCount: null,
    };
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (err) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json 解析失败 (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json 必须为 JSON 对象`);
  }
  if (meta.dictVersion && meta.dictVersion !== manifestObj.dictVersion) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json dictVersion(${meta.dictVersion}) 与清单(${manifestObj.dictVersion})不一致`);
  }
  if (meta.flow && meta.flow !== manifestObj.flow) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json flow(${meta.flow}) 与清单(${manifestObj.flow})不一致`);
  }
  if (meta.grouping && meta.grouping !== manifestObj.grouping) {
    throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json grouping(${meta.grouping}) 与清单(${manifestObj.grouping})不一致`);
  }
  if (Array.isArray(meta.months)) {
    const metaMonthsSorted = [...meta.months].map(String).sort();
    const manifestMonthsSorted = [...months].map(String).sort();
    if (JSON.stringify(metaMonthsSorted) !== JSON.stringify(manifestMonthsSorted)) {
      throw new Error(
        `ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json months([${metaMonthsSorted.join(",")}]) 与清单([${manifestMonthsSorted.join(",")}])不一致`,
      );
    }
  }

  let expectedSourceSha256 = null;
  let expectedDetailRowCount = null;

  if (csvBytes) {
    const metaSha = typeof meta.sha256 === "string" ? meta.sha256.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(metaSha)) {
      throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): .meta.json 缺少合法的 CSV sha256 摘要`);
    }
    if (actualCsvSha256 !== metaSha) {
      throw new Error(
        `ARCHIVE_INTEGRITY_ERROR (${stem}): .raw.csv 摘要校验失败（文件可能已被截断或修改）：actual=${actualCsvSha256}, expected=${metaSha}`,
      );
    }
    if (typeof meta.byteLength === "number" && csvBytes.byteLength !== meta.byteLength) {
      throw new Error(
        `ARCHIVE_INTEGRITY_ERROR (${stem}): .raw.csv 字节数校验失败：actual=${csvBytes.byteLength}, expected=${meta.byteLength}`,
      );
    }
    expectedSourceSha256 = metaSha;
    if (meta.inspection && typeof meta.inspection.detailRowCount === "number") {
      expectedDetailRowCount = meta.inspection.detailRowCount;
    }
  }

  if (pngBytes) {
    const metaPngSha = typeof meta.emptyPngSha256 === "string" ? meta.emptyPngSha256.trim().toLowerCase() : "";
    if (metaPngSha) {
      if (!/^[0-9a-f]{64}$/.test(metaPngSha) || actualPngSha256 !== metaPngSha) {
        throw new Error(
          `ARCHIVE_INTEGRITY_ERROR (${stem}): .empty.png 摘要校验失败：actual=${actualPngSha256}, expected=${metaPngSha}`,
        );
      }
      if (!csvBytes) expectedSourceSha256 = metaPngSha;
    } else if (!csvBytes && manifestObj.probeVerifiedZero === true) {
      throw new Error(`ARCHIVE_INTEGRITY_ERROR (${stem}): 零结果批次 .meta.json 缺少 emptyPngSha256 摘要`);
    } else if (!csvBytes) {
      expectedSourceSha256 = actualPngSha256;
    }
  }

  return {
    stem,
    csvPath: hasCsv ? csvPath : null,
    pngPath: hasPng ? pngPath : null,
    csvBytes,
    pngBytes,
    expectedSourceSha256,
    expectedDetailRowCount,
  };
}

/**
 * 核验 POST /api/trade/publish 最终状态：仅当无对账差异且本次全部导入月份与批次均已处于 published 状态时才视为成功。
 */
export function verifyPublishOutcome({
  expectedMonths = [],
  importedBatchIds = [],
  publishResponse,
  batchesAfterPublish = null,
}) {
  if (!publishResponse || publishResponse.status !== 200) {
    throw new Error(
      `批量发布失败: HTTP ${publishResponse?.status ?? "unknown"} ${JSON.stringify(publishResponse?.json ?? null)}`,
    );
  }
  const body = publishResponse.json && typeof publishResponse.json === "object" ? publishResponse.json : {};
  const reconNotes =
    body.reconciliationNotes && typeof body.reconciliationNotes === "object" ? body.reconciliationNotes : {};
  const reconEntries = Object.entries(reconNotes);
  if (reconEntries.length > 0) {
    throw new Error(`批量发布存在对账差异，未通过核验: ${JSON.stringify(reconNotes)}`);
  }

  const publishedMonths = Array.isArray(body.publishedMonths) ? body.publishedMonths.map(String) : [];
  const pubMonthSet = new Set(publishedMonths);
  const expectedUnique = [...new Set(expectedMonths.map(String))].sort();
  const unpublishedMonths = expectedUnique.filter((m) => !pubMonthSet.has(m));
  if (unpublishedMonths.length > 0) {
    throw new Error(
      `批量发布未覆盖全部导入月份（可能缺分组/缺税号或对账未通过）：未发布月份=[${unpublishedMonths.join(",")}]，已发布月份=[${publishedMonths.join(",")}]`,
    );
  }

  if (expectedUnique.length === 0 && body.published !== true) {
    throw new Error(`批量发布未生成任何已发布月份: ${JSON.stringify(body)}`);
  }

  if (Array.isArray(batchesAfterPublish) && importedBatchIds.length > 0) {
    const byId = new Map(batchesAfterPublish.map((b) => [b.batchId, b]));
    const unpublishedBatches = importedBatchIds.filter((bid) => {
      const rec = byId.get(bid);
      return !rec || (rec.publishState !== "published" && !rec.supersededBy);
    });
    if (unpublishedBatches.length > 0) {
      throw new Error(
        `以下导入批次在发布后仍未处于 published 状态（可能存在未就绪修订或对账拦截）：[${unpublishedBatches.join(",")}]`,
      );
    }
  }
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
    console.log(`[import-archive] 共发现 ${entriesToImport.length} 个可导入采集批次，开始完整度校验与 deferPublish=true 批量暂存...`);
    let totalRows = 0;
    let importedCount = 0;
    const expectedMonths = new Set();
    const importedBatchIds = [];

    for (const entry of entriesToImport) {
      const { rawManifestText } = entry;
      const integrity = verifyArchiveEntryIntegrity(entry);

      const form = new FormData();
      form.append("manifest", rawManifestText);
      form.append("deferPublish", "1");

      if (integrity.csvPath && integrity.csvBytes) {
        form.append("file", new File([integrity.csvBytes], path.basename(integrity.csvPath), { type: "text/csv" }));
      }
      if (integrity.pngPath && integrity.pngBytes) {
        form.append(
          "emptyEvidence",
          new File([integrity.pngBytes], path.basename(integrity.pngPath), { type: "image/png" }),
        );
      }

      const { status, json } = await client.sendMultipart("/api/trade/import-bulk", form);
      if (status !== 200) {
        throw new Error(`批次导入失败 (${integrity.stem}): HTTP ${status} ${JSON.stringify(json)}`);
      }
      if (integrity.expectedSourceSha256 && json.sourceSha256 && json.sourceSha256 !== integrity.expectedSourceSha256) {
        throw new Error(
          `ARCHIVE_INTEGRITY_ERROR (${integrity.stem}): 后端实收原件摘要(${json.sourceSha256}) 与归档 .meta.json(${integrity.expectedSourceSha256})不一致`,
        );
      }
      if (
        integrity.expectedDetailRowCount !== null &&
        Number(json.totalRowCount) !== integrity.expectedDetailRowCount
      ) {
        throw new Error(
          `ARCHIVE_INTEGRITY_ERROR (${integrity.stem}): 后端解析行数(${json.totalRowCount}) 与归档 .meta.json(${integrity.expectedDetailRowCount})不一致`,
        );
      }
      for (const m of Array.isArray(json.months) ? json.months : entry.months) {
        expectedMonths.add(String(m));
      }
      for (const bid of Array.isArray(json.batchIds) ? json.batchIds : []) {
        importedBatchIds.push(String(bid));
      }
      totalRows += Number(json.totalRowCount || 0);
      importedCount += 1;
    }

    console.log(`[import-archive] 已暂存 ${importedCount} 个批次（累计明细 ${totalRows} 行），开始执行单次向量化发布...`);
    const pub = await client.sendJson("/api/trade/publish", "POST", { dictVersion: opts.dictVersion });
    let batchesAfterPublish = null;
    if (pub.status === 200 && importedBatchIds.length > 0) {
      const newlySet = new Set(Array.isArray(pub.json?.newlyPublishedMonths) ? pub.json.newlyPublishedMonths.map(String) : []);
      const monthsToInspect = [...expectedMonths].filter((m) => !newlySet.has(m));
      if (monthsToInspect.length > 0) {
        const fetched = [];
        for (const m of monthsToInspect) {
          const res = await client.sendJson(
            `/api/trade/batches?dictVersion=${encodeURIComponent(opts.dictVersion)}&month=${encodeURIComponent(m)}`,
          );
          if (res.status === 200 && Array.isArray(res.json?.items)) {
            fetched.push(...res.json.items);
          }
        }
        // 对于本轮 newlyPublishedMonths 中的批次，直接标记为已发布（仅核验未新发布月份中的批次状态）
        const inspectedMonthSet = new Set(monthsToInspect);
        const batchIdsToVerify = [];
        for (const item of importedBatchIds) {
          if (fetched.some((b) => b.batchId === item)) {
            batchIdsToVerify.push(item);
          }
        }
        if (batchIdsToVerify.length > 0) {
          batchesAfterPublish = fetched;
        } else if (inspectedMonthSet.size > 0 && fetched.length > 0) {
          batchesAfterPublish = fetched;
        }
      }
    }
    verifyPublishOutcome({
      expectedMonths: [...expectedMonths],
      importedBatchIds: batchesAfterPublish
        ? importedBatchIds.filter((bid) => batchesAfterPublish.some((b) => b.batchId === bid))
        : [],
      publishResponse: pub,
      batchesAfterPublish,
    });

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
