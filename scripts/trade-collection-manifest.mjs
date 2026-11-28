/**
 * 中国海关医疗器械进出口原件批次清单生成器与本地归档覆盖率扫描工具
 *
 * 严格遵循：
 * - docs/海关原件采集规程.md
 * - docs/API.md（POST /api/trade/import 清单与覆盖契约）
 * - docs/贸易后端启动提示词.md & docs/贸易业务验收用例.md（G1/AC-013, G5/AC-017）
 *
 * 常用命令行用法：
 *   node mdes-platform/scripts/trade-collection-manifest.mjs --pilot-2024-check
 *   node mdes-platform/scripts/trade-collection-manifest.mjs --pilot --month 2024-01
 *   node mdes-platform/scripts/trade-collection-manifest.mjs --groups --month 2024-01
 *   node mdes-platform/scripts/trade-collection-manifest.mjs --scan --full --year 2024
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DICT_VERSION = "202601";
export const EXPECTED_DICT_SHA256 =
  "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b";
export const EXPECTED_HS8_COUNT = 164;
export const EXPECTED_HS6_COUNT = 117;
export const EXPECTED_CATEGORY_COUNT = 11;

export const PILOT_HS8 = Object.freeze(["90181100"]);
export const TRADE_FLOWS = Object.freeze(["import", "export"]);
export const TRADE_GROUPINGS = Object.freeze(["product", "partner", "regime", "region"]);
export const DEFAULT_BATCH_GROUP_SIZE = 20;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DICT_PATH = path.resolve(SCRIPT_DIR, "../data/hs_dict_202601.csv");
export const DEFAULT_ARCHIVE_DIR = path.resolve(SCRIPT_DIR, "../data/customs-raw");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 将 CRLF / CR 换行规范化为 LF，确保字典摘要不受不同平台 git core.autocrlf 检出影响 */
export function normalizeLineEndingsLf(rawBytes) {
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d) {
      if (i + 1 < buf.length && buf[i + 1] === 0x0a) i++;
      out.push(0x0a);
    } else {
      out.push(buf[i]);
    }
  }
  return Buffer.from(out);
}

/** 计算原始字节的 SHA-256（小写十六进制） */
export function computeSha256Hex(rawBytes) {
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** RFC 4180 CSV 解析器（保留引号内逗号与换行，绝不修改原文件） */
export function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * 加载并严格校验 202601 正式字典：
 * - 原始字节 SHA-256 = ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b
 * - 164 个唯一 HS8、117 个唯一 HS6、11 个一级类别
 * - 核验 901819 跨一级类别归属（医用诊断装备、生命支持装备）
 */
export function loadAndVerifyHsDict202601(dictPath = DEFAULT_DICT_PATH) {
  const resolvedPath = path.resolve(dictPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`未找到正式 HS 字典文件: ${resolvedPath}`);
  }

  const rawBuffer = fs.readFileSync(resolvedPath);
  const sha256 = computeSha256Hex(normalizeLineEndingsLf(rawBuffer));
  if (sha256 !== EXPECTED_DICT_SHA256) {
    throw new Error(
      `HS 字典 SHA-256 校验不匹配: 实际 ${sha256}, 预期 ${EXPECTED_DICT_SHA256} (${resolvedPath})`
    );
  }

  const text = rawBuffer.toString("utf8").replace(/^\uFEFF/, "");
  const records = parseCsvRecords(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (records.length < 2) {
    throw new Error(`HS 字典内容为空: ${resolvedPath}`);
  }

  const header = records[0].map((c) => c.trim());
  const expectedHeader = ["序号", "一级类别", "名称", "HS海关编码", "HS联合国编码"];
  if (expectedHeader.some((col, idx) => header[idx] !== col)) {
    throw new Error(`HS 字典表头不符合预期: ${header.join(",")}`);
  }

  const entries = [];
  const byHs8 = new Map();
  const hs6Set = new Set();
  const categoryMap = new Map();

  for (let i = 1; i < records.length; i++) {
    const [seqRaw, categoryRaw, nameRaw, hs8Raw, hs6Raw] = records[i].map((c) => c.trim());
    const seq = Number(seqRaw);
    if (!Number.isInteger(seq) || seq !== i) {
      throw new Error(`第 ${i + 1} 行序号异常: ${seqRaw}`);
    }
    if (!/^\d{8}$/.test(hs8Raw)) {
      throw new Error(`第 ${i + 1} 行 HS8 格式非法: ${hs8Raw}`);
    }
    if (!/^\d{6}$/.test(hs6Raw) || !hs8Raw.startsWith(hs6Raw)) {
      throw new Error(`第 ${i + 1} 行 HS6 与 HS8 前缀不一致: ${hs6Raw} vs ${hs8Raw}`);
    }
    if (byHs8.has(hs8Raw)) {
      throw new Error(`发现重复 HS8 编码: ${hs8Raw}`);
    }

    const entry = Object.freeze({
      seq,
      category: categoryRaw,
      name: nameRaw,
      hs8: hs8Raw,
      hs6: hs6Raw
    });
    entries.push(entry);
    byHs8.set(hs8Raw, entry);
    hs6Set.add(hs6Raw);

    if (!categoryMap.has(categoryRaw)) categoryMap.set(categoryRaw, []);
    categoryMap.get(categoryRaw).push(hs8Raw);
  }

  if (entries.length !== EXPECTED_HS8_COUNT) {
    throw new Error(`HS8 总数不匹配: 实际 ${entries.length}, 预期 ${EXPECTED_HS8_COUNT}`);
  }
  if (hs6Set.size !== EXPECTED_HS6_COUNT) {
    throw new Error(`唯一 HS6 总数不匹配: 实际 ${hs6Set.size}, 预期 ${EXPECTED_HS6_COUNT}`);
  }
  if (categoryMap.size !== EXPECTED_CATEGORY_COUNT) {
    throw new Error(`一级类别数不匹配: 实际 ${categoryMap.size}, 预期 ${EXPECTED_CATEGORY_COUNT}`);
  }

  const hs6Cross901819 = Array.from(
    new Set(entries.filter((e) => e.hs6 === "901819").map((e) => e.category))
  );

  const categories = Object.freeze(
    Array.from(categoryMap.entries()).map(([category, hs8]) =>
      Object.freeze({ category, count: hs8.length, hs8: Object.freeze([...hs8]) })
    )
  );

  return Object.freeze({
    dictVersion: DICT_VERSION,
    dictPath: resolvedPath,
    sha256,
    hs8Count: entries.length,
    hs6Count: hs6Set.size,
    categoryCount: categories.length,
    hs6Cross901819: Object.freeze(hs6Cross901819),
    categories,
    entries: Object.freeze(entries),
    byHs8
  });
}

/** 按字典顺序切分互不重叠的稳定编码组（G01..G09，每组默认 20 码） */
export function buildBatchGroups(entries, groupSize = DEFAULT_BATCH_GROUP_SIZE) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("entries 不能为空");
  }
  if (!Number.isInteger(groupSize) || groupSize <= 0) {
    throw new Error(`groupSize 必须为正整数: ${String(groupSize)}`);
  }

  const groups = [];
  for (let offset = 0; offset < entries.length; offset += groupSize) {
    const slice = entries.slice(offset, offset + groupSize);
    const index = Math.floor(offset / groupSize) + 1;
    const groupId = `G${String(index).padStart(2, "0")}`;
    const categories = Array.from(new Set(slice.map((item) => item.category)));
    groups.push(
      Object.freeze({
        groupId,
        startSeq: slice[0].seq,
        endSeq: slice[slice.length - 1].seq,
        count: slice.length,
        firstHs8: slice[0].hs8,
        lastHs8: slice[slice.length - 1].hs8,
        categories: Object.freeze(categories),
        hs8: Object.freeze(slice.map((item) => item.hs8))
      })
    );
  }
  return Object.freeze(groups);
}

/** 校验并展开单自然月列表（YYYY-MM） */
export function expandNaturalMonths({ month, year, fromMonth, toMonth } = {}) {
  const isValidMonth = (m) => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

  if (month) {
    if (!isValidMonth(month)) {
      throw new Error(`非法月份格式: ${month}（应为 YYYY-MM）`);
    }
    return [month];
  }

  if (year !== undefined && year !== null) {
    const yStr = String(year).trim();
    if (!/^\d{4}$/.test(yStr)) {
      throw new Error(`非法年份格式: ${yStr}（应为 YYYY）`);
    }
    return Array.from({ length: 12 }, (_, idx) => `${yStr}-${String(idx + 1).padStart(2, "0")}`);
  }

  if (fromMonth || toMonth) {
    const start = fromMonth || toMonth;
    const end = toMonth || fromMonth;
    if (!isValidMonth(start) || !isValidMonth(end)) {
      throw new Error(`起止月份格式必须为 YYYY-MM: ${String(start)} .. ${String(end)}`);
    }
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    const sIdx = sy * 12 + (sm - 1);
    const eIdx = ey * 12 + (em - 1);
    if (eIdx < sIdx) {
      throw new Error(`截止月份 ${end} 早于起始月份 ${start}`);
    }
    const list = [];
    for (let cur = sIdx; cur <= eIdx; cur++) {
      const y = Math.floor(cur / 12);
      const m = (cur % 12) + 1;
      list.push(`${y}-${String(m).padStart(2, "0")}`);
    }
    return list;
  }

  throw new Error("必须指定 month、year 或 fromMonth/toMonth 之一");
}

/** 生成并严格校验标准七字段 manifest.json 对象 */
export function createManifest({
  dictVersion = DICT_VERSION,
  month,
  flow,
  currency = "USD",
  grouping,
  hs8,
  emptyHs8 = [],
  knownHs8Set = null
}) {
  if (dictVersion !== DICT_VERSION) {
    throw new Error(`dictVersion 必须为 ${DICT_VERSION}，收到: ${String(dictVersion)}`);
  }
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`month 必须为单自然月 YYYY-MM，收到: ${String(month)}`);
  }
  if (!TRADE_FLOWS.includes(flow)) {
    throw new Error(`flow 必须为 import 或 export，收到: ${String(flow)}`);
  }
  if (currency !== "USD") {
    throw new Error(`currency 必须为 USD，收到: ${String(currency)}`);
  }
  if (!TRADE_GROUPINGS.includes(grouping)) {
    throw new Error(`grouping 非法: ${String(grouping)}`);
  }
  if (!Array.isArray(hs8) || hs8.length === 0) {
    throw new Error("hs8 必须是非空数组");
  }

  const normalizedHs8 = [];
  const hs8Set = new Set();
  for (const raw of hs8) {
    const code = String(raw ?? "").trim();
    if (!/^\d{8}$/.test(code)) {
      throw new Error(`hs8 包含非 8 位数字编码: ${code}`);
    }
    if (knownHs8Set && !knownHs8Set.has(code)) {
      throw new Error(`hs8 编码不在 ${DICT_VERSION} 字典中: ${code}`);
    }
    if (!hs8Set.has(code)) {
      hs8Set.add(code);
      normalizedHs8.push(code);
    }
  }

  if (!Array.isArray(emptyHs8)) {
    throw new Error("emptyHs8 必须是数组");
  }
  const normalizedEmpty = [];
  const emptySet = new Set();
  for (const raw of emptyHs8) {
    const code = String(raw ?? "").trim();
    if (!hs8Set.has(code)) {
      throw new Error(`emptyHs8 编码 ${code} 必须是 hs8 的子集`);
    }
    if (!emptySet.has(code)) {
      emptySet.add(code);
      normalizedEmpty.push(code);
    }
  }

  return {
    dictVersion,
    month,
    flow,
    currency,
    grouping,
    hs8: normalizedHs8,
    emptyHs8: normalizedEmpty
  };
}

/** 生成试点单码（默认 90181100 心电图记录仪）的采集清单组合（单月 8 项 / 全年 96 项） */
export function generatePilotManifests({
  months,
  flows = TRADE_FLOWS,
  groupings = TRADE_GROUPINGS,
  hs8 = PILOT_HS8,
  revision = "r01",
  dict = null
}) {
  const knownHs8Set = dict ? new Set(dict.byHs8.keys()) : null;
  const batchKey = hs8.length === 1 ? `PILOT-${hs8[0]}` : `PILOT-${hs8.length}`;
  const items = [];

  for (const month of months) {
    for (const flow of flows) {
      for (const grouping of groupings) {
        const stem = `customs_${DICT_VERSION}_${month}_${flow}_${grouping}_${batchKey}_${revision}`;
        const manifest = createManifest({
          month,
          flow,
          grouping,
          hs8,
          emptyHs8: [],
          knownHs8Set
        });
        items.push({
          batchKey,
          revision,
          archiveRelativeDir: `${month}/${flow}/${grouping}/${batchKey}/${revision}`,
          suggestedStem: stem,
          manifest
        });
      }
    }
  }
  return items;
}

/** 生成全量 164 码固定编码组（G01..G09）的采集清单组合 */
export function generateBatchGroupManifests({
  dict,
  months,
  flows = TRADE_FLOWS,
  groupings = TRADE_GROUPINGS,
  groupIds = null,
  groupSize = DEFAULT_BATCH_GROUP_SIZE,
  revision = "r01"
}) {
  const allGroups = buildBatchGroups(dict.entries, groupSize);
  const filterSet =
    Array.isArray(groupIds) && groupIds.length > 0
      ? new Set(groupIds.map((g) => g.toUpperCase()))
      : null;
  const selectedGroups = filterSet
    ? allGroups.filter((g) => filterSet.has(g.groupId))
    : allGroups;

  if (selectedGroups.length === 0) {
    throw new Error(`未匹配到指定的固定编码组: ${String(groupIds)}`);
  }

  const knownHs8Set = new Set(dict.byHs8.keys());
  const items = [];

  for (const month of months) {
    for (const group of selectedGroups) {
      for (const flow of flows) {
        for (const grouping of groupings) {
          const stem = `customs_${DICT_VERSION}_${month}_${flow}_${grouping}_${group.groupId}_${revision}`;
          const manifest = createManifest({
            month,
            flow,
            grouping,
            hs8: group.hs8,
            emptyHs8: [],
            knownHs8Set
          });
          items.push({
            groupId: group.groupId,
            batchKey: group.groupId,
            revision,
            archiveRelativeDir: `${month}/${flow}/${grouping}/${group.groupId}/${revision}`,
            suggestedStem: stem,
            manifest
          });
        }
      }
    }
  }

  return { groups: selectedGroups, items };
}

function isHtmlBufferText(text) {
  const head = text.slice(0, 1024).trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.includes("<!doctype html") ||
    head.includes("<html") ||
    head.includes("<head>") ||
    head.includes("<body")
  );
}

function decodeCustomsCsvReadOnly(rawBuffer) {
  if (
    rawBuffer.length >= 3 &&
    rawBuffer[0] === 0xef &&
    rawBuffer[1] === 0xbb &&
    rawBuffer[2] === 0xbf
  ) {
    return {
      encoding: "utf-8-bom",
      text: new TextDecoder("utf-8", { fatal: false }).decode(rawBuffer).replace(/^\uFEFF/, "")
    };
  }
  try {
    const utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(rawBuffer);
    return { encoding: "utf-8", text: utf8Text };
  } catch {
    return {
      encoding: "gb18030",
      text: new TextDecoder("gb18030", { fatal: false }).decode(rawBuffer)
    };
  }
}

function normalizeHs8Cell(cell) {
  const cleaned = String(cell ?? "")
    .trim()
    .replace(/^="(\d+)"$/, "$1")
    .replace(/^'(\d+)$/, "$1")
    .trim();
  return /^\d{8}$/.test(cleaned) ? cleaned : null;
}

/** 只读检查本地海关原始 CSV 字节（先算原始字节 SHA-256，再只读解码核验表头与返回 HS8） */
export function inspectRawCustomsCsvBytes(rawBytes, requestedHs8 = []) {
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  const sha256 = computeSha256Hex(buf);

  if (buf.length === 0) {
    return { ok: false, reason: "empty_file", sha256, byteLength: 0 };
  }

  const { encoding, text } = decodeCustomsCsvReadOnly(buf);
  if (isHtmlBufferText(text)) {
    return { ok: false, reason: "html_error_page", sha256, byteLength: buf.length, encoding };
  }

  const records = parseCsvRecords(text.replace(/^\uFEFF/, "")).filter((r) =>
    r.some((c) => c.trim() !== "")
  );
  if (records.length === 0) {
    return { ok: false, reason: "blank_csv", sha256, byteLength: buf.length, encoding };
  }

  const headerColumns = records[0].map((c) => c.trim());
  const hsColIndex = headerColumns.findIndex((h) =>
    ["商品编码", "商品代码", "商品税号", "HS海关编码", "HS编码", "CODE_TS"].includes(h)
  );
  const usdColIndex = headerColumns.findIndex(
    (h) => h === "美元" || h.includes("美元") || h.toUpperCase() === "USD"
  );
  const hasRmbOnly =
    usdColIndex < 0 && headerColumns.some((h) => h.includes("人民币") || h.toUpperCase() === "RMB");

  if (hasRmbOnly) {
    return {
      ok: false,
      reason: "rmb_currency_detected",
      sha256,
      byteLength: buf.length,
      encoding,
      headerColumns
    };
  }
  if (hsColIndex < 0 || usdColIndex < 0) {
    return {
      ok: false,
      reason: "missing_required_customs_headers",
      sha256,
      byteLength: buf.length,
      encoding,
      headerColumns
    };
  }

  const secondaryCols = headerColumns
    .map((h, idx) => ({ h, idx }))
    .filter(
      ({ h, idx }) =>
        idx !== hsColIndex &&
        (h.includes("伙伴") || h.includes("方式") || h.includes("注册地") || h.includes("国"))
    )
    .map(({ idx }) => idx);

  const returnedSet = new Set();
  let detailRowCount = 0;

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const hs8 = normalizeHs8Cell(row[hsColIndex]);
    if (!hs8) continue;
    const isSubtotal = secondaryCols.some((cIdx) => {
      const val = String(row[cIdx] ?? "").trim();
      return val === "合计" || val === "总计" || val === "全国合计";
    });
    if (isSubtotal) continue;
    detailRowCount++;
    returnedSet.add(hs8);
  }

  const req = requestedHs8.map((c) => String(c).trim());
  return {
    ok: true,
    sha256,
    byteLength: buf.length,
    encoding,
    headerColumns,
    detailRowCount,
    returnedHs8: req.length > 0 ? req.filter((c) => returnedSet.has(c)) : Array.from(returnedSet),
    allReturnedHs8: Array.from(returnedSet)
  };
}

/** 只读检查空结果截图 PNG 字节并计算 SHA-256 */
export function inspectPngEvidenceBytes(rawBytes) {
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  const sha256 = computeSha256Hex(buf);
  const isPng = buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
  if (!isPng) {
    return { ok: false, reason: "invalid_png_signature", sha256, byteLength: buf.length };
  }
  return { ok: true, sha256, byteLength: buf.length };
}

function walkManifestFiles(dirPath) {
  const found = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkManifestFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name === "manifest.json" || entry.name.endsWith(".manifest.json"))
    ) {
      found.push(fullPath);
    }
  }
  return found;
}

function findCompanionArtifacts(manifestPath) {
  const dir = path.dirname(manifestPath);
  const base = path.basename(manifestPath);
  const dirFiles = fs.readdirSync(dir);

  if (base.endsWith(".manifest.json")) {
    const stem = base.slice(0, -".manifest.json".length);
    const csvCandidates = [`${stem}.raw.csv`, `${stem}.csv`].filter((f) => dirFiles.includes(f));
    const metaCandidates = [`${stem}.meta.json`].filter((f) => dirFiles.includes(f));
    const pngCandidates = dirFiles
      .filter((f) => f.startsWith(stem) && f.toLowerCase().endsWith(".png"))
      .sort();
    return {
      stem,
      csvPath: csvCandidates[0] ? path.join(dir, csvCandidates[0]) : null,
      metaPath: metaCandidates[0] ? path.join(dir, metaCandidates[0]) : null,
      pngPaths: pngCandidates.map((f) => path.join(dir, f))
    };
  }

  // 目录分档结构：manifest.json + raw.csv / *.csv + archive-meta.json + *.png
  const metaName = ["archive-meta.json", "meta.json"].find((f) => dirFiles.includes(f)) || null;
  let preferredCsv = null;
  if (metaName) {
    try {
      const metaObj = JSON.parse(fs.readFileSync(path.join(dir, metaName), "utf8"));
      const hinted = metaObj.savedCsvFilename || metaObj.originalFilename;
      if (hinted && dirFiles.includes(hinted)) preferredCsv = hinted;
    } catch {
      // meta 解析异常交由后续统一记录
    }
  }
  if (!preferredCsv) {
    const csvList = dirFiles.filter((f) => f.toLowerCase().endsWith(".csv")).sort();
    preferredCsv = csvList.includes("raw.csv") ? "raw.csv" : csvList[0] || null;
  }
  const pngList = dirFiles.filter((f) => f.toLowerCase().endsWith(".png")).sort();
  return {
    stem: path.basename(dir),
    csvPath: preferredCsv ? path.join(dir, preferredCsv) : null,
    metaPath: metaName ? path.join(dir, metaName) : null,
    pngPaths: pngList.map((f) => path.join(dir, f))
  };
}

function extractRevisionRank(revisionStr, manifestPath) {
  const source = `${revisionStr || ""} ${manifestPath}`;
  const match = source.match(/(?:^|[/_\\-])r(\d{1,4})(?:$|[._\\/-])/i);
  return match ? Number(match[1]) : 1;
}

/**
 * 扫描本地海关原件归档目录（默认 mdes-platform/data/customs-raw/，不存在时优雅回退），
 * 按月份 × 流向 × 分组 × HS8 输出 received / confirmedEmpty / missing 结构化覆盖报告。
 */
export function scanRawArchiveCoverage({
  archiveDir = DEFAULT_ARCHIVE_DIR,
  dict,
  months,
  flows = TRADE_FLOWS,
  groupings = TRADE_GROUPINGS,
  targetHs8 = PILOT_HS8,
  scope = "pilot"
}) {
  const resolvedArchiveDir = path.resolve(archiveDir);
  const knownHs8Set = new Set(dict.byHs8.keys());
  const normalizedTargetHs8 = targetHs8.map((c) => String(c).trim());
  for (const code of normalizedTargetHs8) {
    if (!knownHs8Set.has(code)) {
      throw new Error(`目标税号 ${code} 不在 ${DICT_VERSION} 正式字典内`);
    }
  }

  const archiveExists = fs.existsSync(resolvedArchiveDir);
  const manifestFiles = archiveExists ? walkManifestFiles(resolvedArchiveDir) : [];

  const invalidArtifacts = [];
  const validBatchesByScopeKey = new Map();
  let supersededBatchCount = 0;

  for (const manifestPath of manifestFiles) {
    let rawManifestObj;
    let validatedManifest;
    try {
      rawManifestObj = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      validatedManifest = createManifest({
        ...rawManifestObj,
        knownHs8Set
      });
    } catch (err) {
      invalidArtifacts.push({
        manifestPath,
        reason: "invalid_manifest",
        detail: err instanceof Error ? err.message : String(err)
      });
      continue;
    }

    const companions = findCompanionArtifacts(manifestPath);
    let metaObj = null;
    if (companions.metaPath) {
      try {
        metaObj = JSON.parse(fs.readFileSync(companions.metaPath, "utf8"));
      } catch (err) {
        invalidArtifacts.push({
          manifestPath,
          metaPath: companions.metaPath,
          reason: "invalid_meta_json",
          detail: err instanceof Error ? err.message : String(err)
        });
      }
    }

    let csvInspection = null;
    if (companions.csvPath) {
      const csvBuf = fs.readFileSync(companions.csvPath);
      csvInspection = inspectRawCustomsCsvBytes(csvBuf, validatedManifest.hs8);
      if (!csvInspection.ok) {
        invalidArtifacts.push({
          manifestPath,
          csvPath: companions.csvPath,
          reason: csvInspection.reason,
          sha256: csvInspection.sha256
        });
        continue;
      }
      if (
        metaObj?.sha256 &&
        typeof metaObj.sha256 === "string" &&
        metaObj.sha256.toLowerCase() !== csvInspection.sha256
      ) {
        invalidArtifacts.push({
          manifestPath,
          csvPath: companions.csvPath,
          reason: "sha256_mismatch_with_meta",
          expectedSha256: metaObj.sha256.toLowerCase(),
          actualSha256: csvInspection.sha256
        });
        continue;
      }
    }

    const validPngs = [];
    for (const pngPath of companions.pngPaths) {
      const pngInfo = inspectPngEvidenceBytes(fs.readFileSync(pngPath));
      if (!pngInfo.ok) {
        invalidArtifacts.push({
          manifestPath,
          pngPath,
          reason: pngInfo.reason,
          sha256: pngInfo.sha256
        });
      } else {
        validPngs.push({ pngPath, sha256: pngInfo.sha256, byteLength: pngInfo.byteLength });
      }
    }

    if (!csvInspection && validPngs.length === 0) {
      invalidArtifacts.push({
        manifestPath,
        reason: "manifest_without_csv_or_png_evidence"
      });
      continue;
    }

    const sortedHs8Key = [...validatedManifest.hs8].sort().join(",");
    const scopeKey = `${validatedManifest.dictVersion}|${validatedManifest.month}|${validatedManifest.flow}|${validatedManifest.grouping}|${sortedHs8Key}`;
    const revision = metaObj?.revision || `r${String(extractRevisionRank("", manifestPath)).padStart(2, "0")}`;
    const revRank = extractRevisionRank(revision, manifestPath);
    const collectedAt = typeof metaObj?.collectedAt === "string" ? metaObj.collectedAt : "";

    const candidate = {
      scopeKey,
      manifestPath,
      manifest: validatedManifest,
      revision,
      revRank,
      collectedAt,
      csvPath: companions.csvPath,
      csvInspection,
      validPngs
    };

    const existing = validBatchesByScopeKey.get(scopeKey);
    if (!existing) {
      validBatchesByScopeKey.set(scopeKey, candidate);
    } else {
      supersededBatchCount++;
      const isNewer =
        candidate.revRank > existing.revRank ||
        (candidate.revRank === existing.revRank &&
          candidate.collectedAt.localeCompare(existing.collectedAt) >= 0);
      if (isNewer) {
        validBatchesByScopeKey.set(scopeKey, candidate);
      }
    }
  }

  // 将生效批次映射到 (month|flow|grouping|hs8) 单元格
  const cellMap = new Map();
  const activeBatches = Array.from(validBatchesByScopeKey.values());
  for (const batch of activeBatches) {
    const { month, flow, grouping, hs8, emptyHs8 } = batch.manifest;
    const returnedSet = new Set(batch.csvInspection ? batch.csvInspection.returnedHs8 : []);
    const emptySet = new Set(emptyHs8);
    const primaryPng = batch.validPngs[0] || null;

    for (const code of hs8) {
      const cellKey = `${month}|${flow}|${grouping}|${code}`;
      if (returnedSet.has(code) && batch.csvInspection) {
        cellMap.set(cellKey, {
          status: "received",
          month,
          flow,
          grouping,
          hs8: code,
          sha256: batch.csvInspection.sha256,
          rowCount: batch.csvInspection.detailRowCount,
          encoding: batch.csvInspection.encoding,
          csvPath: batch.csvPath,
          manifestPath: batch.manifestPath,
          revision: batch.revision
        });
      } else if (emptySet.has(code) && primaryPng) {
        cellMap.set(cellKey, {
          status: "confirmedEmpty",
          month,
          flow,
          grouping,
          hs8: code,
          pngSha256: primaryPng.sha256,
          csvSha256: batch.csvInspection ? batch.csvInspection.sha256 : null,
          pngPath: primaryPng.pngPath,
          csvPath: batch.csvPath,
          manifestPath: batch.manifestPath,
          revision: batch.revision
        });
      } else if (!cellMap.has(cellKey)) {
        const missingReason = emptySet.has(code)
          ? "empty_without_png_evidence"
          : "absent_from_csv_rows";
        cellMap.set(cellKey, {
          status: "missing",
          month,
          flow,
          grouping,
          hs8: code,
          reason: missingReason,
          manifestPath: batch.manifestPath
        });
      }
    }
  }

  const received = [];
  const confirmedEmpty = [];
  const missing = [];
  const byMonth = [];

  for (const month of months) {
    let mExpected = 0;
    let mReceived = 0;
    let mEmpty = 0;
    let mMissing = 0;
    const missingByFlow = { import: [], export: [] };

    for (const flow of flows) {
      for (const grouping of groupings) {
        let groupMissingCount = 0;
        for (const code of normalizedTargetHs8) {
          mExpected++;
          const cellKey = `${month}|${flow}|${grouping}|${code}`;
          const cell = cellMap.get(cellKey);
          if (cell && cell.status === "received") {
            mReceived++;
            received.push(cell);
          } else if (cell && cell.status === "confirmedEmpty") {
            mEmpty++;
            confirmedEmpty.push(cell);
          } else {
            mMissing++;
            groupMissingCount++;
            missing.push({
              month,
              flow,
              grouping,
              hs8: code,
              reason: cell ? cell.reason : "uncollected"
            });
          }
        }
        if (groupMissingCount > 0 && Array.isArray(missingByFlow[flow])) {
          missingByFlow[flow].push(
            normalizedTargetHs8.length === 1
              ? grouping
              : `${grouping}(${groupMissingCount}/${normalizedTargetHs8.length})`
          );
        }
      }
    }

    byMonth.push({
      month,
      expected: mExpected,
      received: mReceived,
      confirmedEmpty: mEmpty,
      missing: mMissing,
      readyToPublish: mMissing === 0,
      missingByFlow
    });
  }

  const expectedCombinations = months.length * flows.length * groupings.length * normalizedTargetHs8.length;
  const coveredCount = received.length + confirmedEmpty.length;
  const completionPct =
    expectedCombinations === 0
      ? 0
      : Number(((coveredCount / expectedCombinations) * 100).toFixed(2));
  const readyMonthsCount = byMonth.filter((m) => m.readyToPublish).length;
  const pendingMonthsCount = byMonth.length - readyMonthsCount;

  const pilotMeta =
    normalizedTargetHs8.length === 1 ? dict.byHs8.get(normalizedTargetHs8[0]) || null : null;

  return {
    dictVersion: DICT_VERSION,
    checkedAt: new Date().toISOString(),
    dictionary: {
      dictVersion: dict.dictVersion,
      path: dict.dictPath,
      sha256: dict.sha256,
      verified: true,
      hs8Count: dict.hs8Count,
      hs6Count: dict.hs6Count,
      categoryCount: dict.categoryCount,
      hs6Cross901819: dict.hs6Cross901819
    },
    target: {
      scope,
      hs8Count: normalizedTargetHs8.length,
      hs8: normalizedTargetHs8,
      ...(pilotMeta
        ? {
            pilotItem: {
              seq: pilotMeta.seq,
              hs8: pilotMeta.hs8,
              hs6: pilotMeta.hs6,
              name: pilotMeta.name,
              category: pilotMeta.category
            }
          }
        : {}),
      months,
      flows: [...flows],
      groupings: [...groupings]
    },
    archive: {
      archiveDir: resolvedArchiveDir,
      exists: archiveExists,
      scannedManifestCount: manifestFiles.length,
      validBatchCount: activeBatches.length,
      supersededBatchCount,
      invalidArtifactCount: invalidArtifacts.length,
      invalidArtifacts
    },
    summary: {
      expectedCombinations,
      receivedCount: received.length,
      confirmedEmptyCount: confirmedEmpty.length,
      missingCount: missing.length,
      completionPct,
      readyMonthsCount,
      pendingMonthsCount,
      status:
        missing.length === 0
          ? "complete"
          : coveredCount > 0
            ? "partial_collection"
            : "pending_collection"
    },
    byMonth,
    coverage: {
      received,
      confirmedEmpty,
      missing
    }
  };
}

function parseCliArgs(argv) {
  const opts = {
    help: false,
    pilot2024Check: false,
    pilot: false,
    groups: false,
    scan: false,
    full: false,
    month: null,
    year: null,
    fromMonth: null,
    toMonth: null,
    groupIds: [],
    revision: "r01",
    dictPath: DEFAULT_DICT_PATH,
    archiveDir: DEFAULT_ARCHIVE_DIR,
    writeManifestsDir: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--pilot-2024-check") {
      opts.pilot2024Check = true;
    } else if (arg === "--pilot") {
      opts.pilot = true;
    } else if (arg === "--groups") {
      opts.groups = true;
    } else if (arg === "--scan") {
      opts.scan = true;
    } else if (arg === "--full") {
      opts.full = true;
    } else if (arg === "--month" && argv[i + 1]) {
      opts.month = argv[++i];
    } else if (arg === "--year" && argv[i + 1]) {
      opts.year = argv[++i];
    } else if (arg === "--from" && argv[i + 1]) {
      opts.fromMonth = argv[++i];
    } else if (arg === "--to" && argv[i + 1]) {
      opts.toMonth = argv[++i];
    } else if (arg === "--group" && argv[i + 1]) {
      opts.groupIds.push(
        ...argv[++i]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (arg === "--revision" && argv[i + 1]) {
      opts.revision = argv[++i];
    } else if (arg === "--dict" && argv[i + 1]) {
      opts.dictPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--archive-dir" && argv[i + 1]) {
      opts.archiveDir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--write-manifests" && argv[i + 1]) {
      opts.writeManifestsDir = path.resolve(process.cwd(), argv[++i]);
    } else {
      throw new Error(`未知命令行参数: ${arg}（使用 --help 查看用法）`);
    }
  }
  return opts;
}

function writeManifestItemsToDisk(items, outRootDir) {
  const written = [];
  for (const item of items) {
    const targetDir = path.join(outRootDir, item.archiveRelativeDir);
    fs.mkdirSync(targetDir, { recursive: true });
    const manifestFile = path.join(targetDir, "manifest.json");
    fs.writeFileSync(manifestFile, JSON.stringify(item.manifest, null, 2) + "\n", "utf8");
    written.push(manifestFile);
  }
  return written;
}

function printHelp() {
  const helpText = `用法: node mdes-platform/scripts/trade-collection-manifest.mjs [选项]

核心模式:
  --pilot-2024-check           校验 202601 字典并扫描 90181100 在 2024 全年(12月×2流向×4分组=96组合)的归档覆盖率
  --pilot                      生成 90181100 心电图记录仪的试点批次清单（配合 --month / --year / --from --to）
  --groups                     输出 164 码确定性固定编码组 G01..G09（传入月份参数时一并生成各组 8 组合清单）
  --scan                       扫描本地原件归档目录，输出 received / confirmedEmpty / missing 覆盖报告

筛选与路径参数:
  --month <YYYY-MM>            指定单个自然月（如 2024-01）
  --year <YYYY>                指定完整自然年 12 个月（如 2024）
  --from <YYYY-MM> --to <YYYY-MM> 指定起止自然月区间
  --group <G01,G02,...>        仅选择指定固定编码组
  --full                       在 --scan 模式下覆盖全部 164 个正式 HS8 税号
  --revision <r01>             指定清单修订目录号（默认 r01）
  --dict <path>                指定 HS 字典 CSV 路径（默认 mdes-platform/data/hs_dict_202601.csv）
  --archive-dir <dir>          指定本地原件归档目录（默认 mdes-platform/data/customs-raw）
  --write-manifests <dir>      将生成的 manifest.json 按归档目录层级落盘到指定目录
`;
  process.stdout.write(helpText);
}

export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    printHelp();
    return 0;
  }

  const dict = loadAndVerifyHsDict202601(opts.dictPath);
  const allGroups = buildBatchGroups(dict.entries, DEFAULT_BATCH_GROUP_SIZE);

  // 默认或显式 --pilot-2024-check
  if (
    opts.pilot2024Check ||
    (!opts.pilot && !opts.groups && !opts.scan)
  ) {
    const months = expandNaturalMonths({ year: 2024 });
    const report = scanRawArchiveCoverage({
      archiveDir: opts.archiveDir,
      dict,
      months,
      targetHs8: PILOT_HS8,
      scope: "pilot-2024"
    });
    const samplePilotManifests = generatePilotManifests({
      months: ["2024-01"],
      hs8: PILOT_HS8,
      dict
    });
    const output = {
      mode: "pilot-2024-check",
      ...report,
      batchGroupsOverview: allGroups.map((g) => ({
        groupId: g.groupId,
        startSeq: g.startSeq,
        endSeq: g.endSeq,
        count: g.count,
        firstHs8: g.firstHs8,
        lastHs8: g.lastHs8
      })),
      pilotSingleMonthCombinationsPreview: samplePilotManifests.map((m) => ({
        archiveRelativeDir: m.archiveRelativeDir,
        manifest: m.manifest
      }))
    };
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    return 0;
  }

  if (opts.scan) {
    const months = expandNaturalMonths({
      month: opts.month,
      year: opts.year ?? (!opts.month && !opts.fromMonth && !opts.toMonth ? 2024 : null),
      fromMonth: opts.fromMonth,
      toMonth: opts.toMonth
    });
    let targetHs8 = PILOT_HS8;
    let scope = "pilot";
    if (opts.full) {
      targetHs8 = dict.entries.map((e) => e.hs8);
      scope = "full-164";
    } else if (opts.groupIds.length > 0) {
      const wanted = new Set(opts.groupIds.map((g) => g.toUpperCase()));
      const matched = allGroups.filter((g) => wanted.has(g.groupId));
      if (matched.length === 0) {
        throw new Error(`未找到指定的编码组: ${opts.groupIds.join(",")}`);
      }
      targetHs8 = matched.flatMap((g) => g.hs8);
      scope = `groups:${matched.map((g) => g.groupId).join(",")}`;
    }

    const report = scanRawArchiveCoverage({
      archiveDir: opts.archiveDir,
      dict,
      months,
      targetHs8,
      scope
    });
    process.stdout.write(JSON.stringify({ mode: "scan", ...report }, null, 2) + "\n");
    return 0;
  }

  if (opts.groups) {
    const hasPeriod = Boolean(opts.month || opts.year || opts.fromMonth || opts.toMonth);
    if (!hasPeriod) {
      const wanted =
        opts.groupIds.length > 0
          ? allGroups.filter((g) => opts.groupIds.map((x) => x.toUpperCase()).includes(g.groupId))
          : allGroups;
      process.stdout.write(
        JSON.stringify(
          {
            mode: "groups",
            dictionary: {
              dictVersion: dict.dictVersion,
              sha256: dict.sha256,
              hs8Count: dict.hs8Count,
              hs6Count: dict.hs6Count,
              categoryCount: dict.categoryCount
            },
            groupSize: DEFAULT_BATCH_GROUP_SIZE,
            groupCount: wanted.length,
            groups: wanted
          },
          null,
          2
        ) + "\n"
      );
      return 0;
    }

    const months = expandNaturalMonths({
      month: opts.month,
      year: opts.year,
      fromMonth: opts.fromMonth,
      toMonth: opts.toMonth
    });
    const { groups, items } = generateBatchGroupManifests({
      dict,
      months,
      groupIds: opts.groupIds,
      revision: opts.revision
    });
    const writtenFiles = opts.writeManifestsDir
      ? writeManifestItemsToDisk(items, opts.writeManifestsDir)
      : undefined;

    process.stdout.write(
      JSON.stringify(
        {
          mode: "group-manifests",
          dictVersion: dict.dictVersion,
          dictSha256: dict.sha256,
          months,
          groupCount: groups.length,
          manifestCount: items.length,
          ...(writtenFiles ? { writtenCount: writtenFiles.length, outDir: opts.writeManifestsDir } : {}),
          groups,
          items
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  if (opts.pilot) {
    const months = expandNaturalMonths({
      month: opts.month,
      year: opts.year ?? (!opts.month && !opts.fromMonth && !opts.toMonth ? 2024 : null),
      fromMonth: opts.fromMonth,
      toMonth: opts.toMonth
    });
    const items = generatePilotManifests({
      months,
      hs8: PILOT_HS8,
      revision: opts.revision,
      dict
    });
    const writtenFiles = opts.writeManifestsDir
      ? writeManifestItemsToDisk(items, opts.writeManifestsDir)
      : undefined;

    process.stdout.write(
      JSON.stringify(
        {
          mode: "pilot-manifests",
          dictVersion: dict.dictVersion,
          dictSha256: dict.sha256,
          hs8: PILOT_HS8,
          months,
          manifestCount: items.length,
          ...(writtenFiles ? { writtenCount: writtenFiles.length, outDir: opts.writeManifestsDir } : {}),
          items
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  return 0;
}

const isCliEntry =
  typeof process !== "undefined" &&
  Boolean(process.argv?.[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCliEntry) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(
      `[trade-collection-manifest] 错误: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  }
}
