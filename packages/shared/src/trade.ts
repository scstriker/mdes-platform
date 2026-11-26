import { parseCsvRecords } from "./csv";
import type { ErrorCode, ErrorParams } from "./errors";

export const USD_SCALE = 10_000n;
const USD_SCALE_NUM = 10_000;

export type TradeFlow = "import" | "export";
export type TradeGrouping = "product" | "partner" | "regime" | "region";
export type TradePublishStatus = "staged" | "published";

export const TRADE_FLOWS: readonly TradeFlow[] = ["import", "export"];
export const TRADE_GROUPINGS: readonly TradeGrouping[] = ["product", "partner", "regime", "region"];

export type TradeImportManifest = {
  dictVersion: string;
  month: string;
  flow: TradeFlow;
  currency: string;
  grouping: TradeGrouping;
  hs8: string[];
  emptyHs8: string[];
  probeVerifiedZero?: boolean;
};

export type TradeBulkImportManifest = {
  dictVersion: string;
  months: string[];
  flow: TradeFlow;
  currency: string;
  grouping: TradeGrouping;
  hs8: string[];
  emptyHs8?: string[];
  probeVerifiedZero?: boolean;
};

export type NormalizedTradeManifest = {
  dictVersion: string;
  month: string;
  year: number;
  flow: TradeFlow;
  currency: "USD";
  grouping: TradeGrouping;
  hs8: string[];
  emptyHs8: string[];
  probeVerifiedZero: boolean;
  scopeKey: string;
};

export type NormalizedTradeBulkManifest = {
  dictVersion: string;
  months: string[];
  flow: TradeFlow;
  currency: "USD";
  grouping: TradeGrouping;
  hs8: string[];
  emptyHs8: string[];
  probeVerifiedZero: boolean;
};

export type MultiMonthCustomsCsvParseOutcome =
  | {
      ok: true;
      encoding: "utf-8" | "gb18030";
      headers: string[];
      byMonth: Map<string, ParsedCustomsFactRow[]>;
      totalRows: number;
      summaryRowsSkipped: number;
    }
  | {
      ok: false;
      error: TradeValidationFailure;
    };

export type ParsedCustomsFactRow = {
  line: number;
  hs8: string;
  itemName: string;
  groupCode: string;
  groupName: string;
  usdScaled: bigint;
  usdRaw: string;
  qty1: number | null;
  unit1: string | null;
  qty2: number | null;
  unit2: string | null;
};

export type TradeValidationFailure = {
  status: 400 | 409;
  code: ErrorCode;
  params: ErrorParams;
};

export type CustomsCsvParseOutcome =
  | {
      ok: true;
      encoding: "utf-8" | "gb18030";
      headers: string[];
      rows: ParsedCustomsFactRow[];
      summaryRowsSkipped: number;
    }
  | {
      ok: false;
      error: TradeValidationFailure;
    };

export type ConcentrationMetrics = {
  cr1: number | null;
  cr3: number | null;
  cr5: number | null;
  hhi: number | null;
  partnerCount: number;
};

export type ParsedTradePeriod = {
  period: string;
  kind: "month" | "quarter" | "year" | "ytd";
  year: number;
  months: string[];
  priorPeriod: string;
};

export function roundMetric(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function scaledToUsdNumber(scaled: bigint | number): number {
  const b = typeof scaled === "bigint" ? scaled : BigInt(Math.trunc(scaled));
  const whole = b / USD_SCALE;
  const rem = b % USD_SCALE;
  if (rem === 0n) return Number(whole);
  return Number(b) / USD_SCALE_NUM;
}

export function parseUsdToScaled(raw: string): { scaled: bigint; normalized: string } | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const match = /^\+?(\d+)(?:\.(\d{1,4})0*)?$/.exec(cleaned);
  if (!match) return null;
  const intPart = BigInt(match[1]);
  const fracStr = (match[2] ?? "").padEnd(4, "0");
  const fracPart = BigInt(fracStr);
  const scaled = intPart * USD_SCALE + fracPart;
  const trimmedFrac = (match[2] ?? "").replace(/0+$/, "");
  const normalized = trimmedFrac ? `${intPart.toString()}.${trimmedFrac}` : intPart.toString();
  return { scaled, normalized };
}

function parseOptionalQuantity(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed || trimmed === "--" || trimmed === "—") {
    return { ok: true, value: null };
  }
  if (!/^\+?\d+(?:\.\d+)?$/.test(trimmed)) {
    return { ok: false };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function parseOptionalUnit(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "--" || trimmed === "—") return null;
  return trimmed;
}

export function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export function buildTradeScopeKey(input: {
  dictVersion: string;
  month: string;
  flow: TradeFlow;
  currency: "USD";
  grouping: TradeGrouping;
  hs8: readonly string[];
}): string {
  const sorted = [...new Set(input.hs8)].sort();
  return `${input.dictVersion}|${input.month}|${input.flow}|${input.currency}|${input.grouping}|${sorted.join(",")}`;
}

export function validateTradeManifest(
  raw: unknown,
  options?: { knownDictVersions?: Set<string>; applicableHs8?: Set<string> },
): { ok: true; value: NormalizedTradeManifest } | { ok: false; error: TradeValidationFailure } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "manifest", reason: "must be JSON object" } },
    };
  }
  const obj = raw as Record<string, unknown>;
  const dictVersion = typeof obj.dictVersion === "string" ? obj.dictVersion.trim() : "";
  if (!dictVersion || (options?.knownDictVersions && !options.knownDictVersions.has(dictVersion))) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "dictVersion", reason: "unknown or empty" } },
    };
  }

  const month = typeof obj.month === "string" ? obj.month.trim() : "";
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!monthMatch) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "month", reason: "expected YYYY-MM" } },
    };
  }
  const year = Number(monthMatch[1]);

  const flow = typeof obj.flow === "string" ? obj.flow.trim() : "";
  if (flow !== "import" && flow !== "export") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "flow", reason: "expected import or export" } },
    };
  }

  const currency = typeof obj.currency === "string" ? obj.currency.trim().toUpperCase() : "";
  if (currency !== "USD") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: String(obj.currency ?? "") } },
    };
  }

  const grouping = typeof obj.grouping === "string" ? obj.grouping.trim() : "";
  if (grouping !== "product" && grouping !== "partner" && grouping !== "regime" && grouping !== "region") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "grouping", reason: "invalid grouping" } },
    };
  }

  if (!Array.isArray(obj.hs8) || obj.hs8.length === 0) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: "non-empty array required" } },
    };
  }
  const hs8Set = new Set<string>();
  for (const item of obj.hs8) {
    const code = typeof item === "string" ? item.trim() : "";
    if (!/^\d{8}$/.test(code)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: `invalid hs8 '${String(item)}'` } },
      };
    }
    if (options?.applicableHs8 && !options.applicableHs8.has(code)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: `hs8 '${code}' not in dictionary` } },
      };
    }
    hs8Set.add(code);
  }
  const hs8 = [...hs8Set].sort();

  const rawEmpty = obj.emptyHs8 ?? [];
  if (!Array.isArray(rawEmpty)) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "emptyHs8", reason: "array required" } },
    };
  }
  const emptySet = new Set<string>();
  for (const item of rawEmpty) {
    const code = typeof item === "string" ? item.trim() : "";
    if (!/^\d{8}$/.test(code) || !hs8Set.has(code)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: "TRADE_MANIFEST_INVALID",
          params: { field: "emptyHs8", reason: `emptyHs8 '${String(item)}' must belong to hs8` },
        },
      };
    }
    emptySet.add(code);
  }
  const emptyHs8 = [...emptySet].sort();

  if (obj.probeVerifiedZero !== undefined && typeof obj.probeVerifiedZero !== "boolean") {
    return {
      ok: false,
      error: {
        status: 400,
        code: "TRADE_MANIFEST_INVALID",
        params: { field: "probeVerifiedZero", reason: "must be boolean" },
      },
    };
  }

  return {
    ok: true,
    value: {
      dictVersion,
      month,
      year,
      flow,
      currency: "USD",
      grouping,
      hs8,
      emptyHs8,
      probeVerifiedZero: obj.probeVerifiedZero === true,
      scopeKey: buildTradeScopeKey({ dictVersion, month, flow, currency: "USD", grouping, hs8 }),
    },
  };
}

export function validateTradeBulkManifest(
  raw: unknown,
  options?: { knownDictVersions?: Set<string>; dictHs8Set?: Set<string> },
): { ok: true; value: NormalizedTradeBulkManifest } | { ok: false; error: TradeValidationFailure } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "manifest", reason: "must be JSON object" } },
    };
  }
  const obj = raw as Record<string, unknown>;
  const dictVersion = typeof obj.dictVersion === "string" ? obj.dictVersion.trim() : "";
  if (!dictVersion || (options?.knownDictVersions && !options.knownDictVersions.has(dictVersion))) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "dictVersion", reason: "unknown or empty" } },
    };
  }

  const rawMonthsInput = Array.isArray(obj.months)
    ? obj.months
    : typeof obj.month === "string" && obj.month.trim()
      ? [obj.month.trim()]
      : [];
  if (rawMonthsInput.length === 0 || rawMonthsInput.length > 60) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "months", reason: "1..60 YYYY-MM months required" } },
    };
  }
  const monthSet = new Set<string>();
  for (const mItem of rawMonthsInput) {
    const mStr = typeof mItem === "string" ? mItem.trim() : "";
    if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(mStr)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "months", reason: `expected YYYY-MM, got '${String(mItem)}'` } },
      };
    }
    monthSet.add(mStr);
  }
  const months = [...monthSet].sort();

  const flow = typeof obj.flow === "string" ? obj.flow.trim() : "";
  if (flow !== "import" && flow !== "export") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "flow", reason: "expected import or export" } },
    };
  }

  const currency = typeof obj.currency === "string" ? obj.currency.trim().toUpperCase() : "";
  if (currency !== "USD") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: String(obj.currency ?? "") } },
    };
  }

  const grouping = typeof obj.grouping === "string" ? obj.grouping.trim() : "";
  if (grouping !== "product" && grouping !== "partner" && grouping !== "regime" && grouping !== "region") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "grouping", reason: "invalid grouping" } },
    };
  }

  if (!Array.isArray(obj.hs8) || obj.hs8.length === 0) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: "non-empty array required" } },
    };
  }
  const hs8Set = new Set<string>();
  for (const item of obj.hs8) {
    const code = typeof item === "string" ? item.trim() : "";
    if (!/^\d{8}$/.test(code)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: `invalid hs8 '${String(item)}'` } },
      };
    }
    if (options?.dictHs8Set && !options.dictHs8Set.has(code)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "hs8", reason: `hs8 '${code}' not in dictionary` } },
      };
    }
    hs8Set.add(code);
  }
  const hs8 = [...hs8Set].sort();

  const rawEmpty = obj.emptyHs8 ?? [];
  if (!Array.isArray(rawEmpty)) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_MANIFEST_INVALID", params: { field: "emptyHs8", reason: "array required" } },
    };
  }
  const emptySet = new Set<string>();
  for (const item of rawEmpty) {
    const code = typeof item === "string" ? item.trim() : "";
    if (!/^\d{8}$/.test(code) || !hs8Set.has(code)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: "TRADE_MANIFEST_INVALID",
          params: { field: "emptyHs8", reason: `emptyHs8 '${String(item)}' must belong to hs8` },
        },
      };
    }
    emptySet.add(code);
  }

  if (obj.probeVerifiedZero !== undefined && typeof obj.probeVerifiedZero !== "boolean") {
    return {
      ok: false,
      error: {
        status: 400,
        code: "TRADE_MANIFEST_INVALID",
        params: { field: "probeVerifiedZero", reason: "must be boolean" },
      },
    };
  }

  return {
    ok: true,
    value: {
      dictVersion,
      months,
      flow,
      currency: "USD",
      grouping,
      hs8,
      emptyHs8: [...emptySet].sort(),
      probeVerifiedZero: obj.probeVerifiedZero === true,
    },
  };
}

export function decodeCustomsBytes(
  bytes: Uint8Array,
): { ok: true; text: string; encoding: "utf-8" | "gb18030" } | { ok: false; error: TradeValidationFailure } {
  let text = "";
  let encoding: "utf-8" | "gb18030" = "utf-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder("gb18030", { fatal: true, ignoreBOM: false }).decode(bytes);
      encoding = "gb18030";
    } catch {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 0, field: "encoding", reason: "unable to decode UTF-8 or GBK" } },
      };
    }
  }
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const head = text.slice(0, 512).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("<html")) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_EVIDENCE_INVALID", params: { reason: "html_error_page" } },
    };
  }
  return { ok: true, text, encoding };
}

const HS_HEADERS = ["商品编码", "商品代码", "hs海关编码", "hs编码", "hs_code", "hscode"];
const ITEM_NAME_HEADERS = ["商品名称", "名称", "product_name", "item_name"];
const USD_HEADERS = ["美元", "金额(美元)", "金额（美元）", "美元金额", "usd", "amount_usd"];
const NON_USD_HEADERS = ["人民币", "金额(人民币)", "金额（人民币）", "rmb", "cny"];
const QTY1_HEADERS = ["第一数量", "数量", "qty1", "first_quantity"];
const UNIT1_HEADERS = ["第一计量单位", "计量单位", "unit1", "first_unit"];
const QTY2_HEADERS = ["第二数量", "qty2", "second_quantity"];
const UNIT2_HEADERS = ["第二计量单位", "unit2", "second_unit"];
const PERIOD_HEADERS = ["数据年月", "统计年月", "年月", "period", "month"];
const FLOW_HEADERS = ["进出口", "贸易流向", "流向", "flow"];

const PARTNER_CODE_HEADERS = ["贸易伙伴编码", "贸易伙伴代码", "原产国(地)编码", "最终目的国(地)编码", "产销国(地)编码", "partner_code"];
const PARTNER_NAME_HEADERS = ["贸易伙伴名称", "贸易伙伴", "原产国(地)", "最终目的国(地)", "产销国(地)", "partner_name"];
const REGIME_CODE_HEADERS = ["贸易方式编码", "贸易方式代码", "regime_code"];
const REGIME_NAME_HEADERS = ["贸易方式名称", "贸易方式", "regime_name"];
const REGION_CODE_HEADERS = ["收发货人注册地编码", "收发货人注册地代码", "注册地编码", "注册地代码", "region_code"];
const REGION_NAME_HEADERS = ["收发货人注册地名称", "收发货人注册地", "注册地名称", "注册地", "region_name"];

const SUMMARY_LABELS = new Set(["合计", "总计", "全国", "全部", "世界", "world", "total", "all"]);

function findCol(headers: readonly string[], aliases: readonly string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

export function looksLikeCustomsCsvHeader(firstLine: string): boolean {
  const cols = firstLine
    .replace(/^\uFEFF/, "")
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""));
  return findCol(cols, HS_HEADERS) !== -1 && (findCol(cols, USD_HEADERS) !== -1 || findCol(cols, NON_USD_HEADERS) !== -1);
}

function isAggregateLabel(val: string): boolean {
  return SUMMARY_LABELS.has(val.trim().toLowerCase());
}

function normalizeCsvMonth(raw: string): string | null {
  const t = raw.trim();
  const m1 = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(t);
  if (m1) return `${m1[1]}-${m1[2]}`;
  const m2 = /^(\d{4})(0[1-9]|1[0-2])$/.exec(t);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return null;
}

function normalizeCsvFlow(raw: string): TradeFlow | null {
  const t = raw.trim().toLowerCase();
  if (t === "进口" || t === "import" || t === "1") return "import";
  if (t === "出口" || t === "export" || t === "0") return "export";
  return null;
}

export function parseCustomsCsvBytes(
  bytes: Uint8Array,
  manifest: Pick<TradeImportManifest, "dictVersion" | "month" | "flow" | "currency" | "grouping" | "hs8" | "emptyHs8">,
  options?: { maxRows?: number; allowHeaderOnlyEmpty?: boolean },
): CustomsCsvParseOutcome {
  if (manifest.currency.trim().toUpperCase() !== "USD") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: manifest.currency } },
    };
  }
  const decoded = decodeCustomsBytes(bytes);
  if (!decoded.ok) return decoded;

  const rawRecords = parseCsvRecords(decoded.text);
  const isBlank = (fields: string[]) => fields.every((f) => f.trim() === "");
  const headerIndex = rawRecords.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) {
    return {
      ok: false,
      error: { status: 400, code: "EMPTY_CSV", params: {} },
    };
  }

  const headers = rawRecords[headerIndex].map((f) => f.trim());
  if (findCol(headers, NON_USD_HEADERS) !== -1 && findCol(headers, USD_HEADERS) === -1) {
    const badHeader = headers[findCol(headers, NON_USD_HEADERS)];
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: badHeader } },
    };
  }

  const hsCol = findCol(headers, HS_HEADERS);
  if (hsCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "hs8", reason: "missing product code header" } },
    };
  }
  const nameCol = findCol(headers, ITEM_NAME_HEADERS);
  if (nameCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "itemName", reason: "missing product name header" } },
    };
  }
  const usdCol = findCol(headers, USD_HEADERS);
  if (usdCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: "missing_usd_header" } },
    };
  }

  const partnerCodeCol = findCol(headers, PARTNER_CODE_HEADERS);
  const partnerNameCol = findCol(headers, PARTNER_NAME_HEADERS);
  const regimeCodeCol = findCol(headers, REGIME_CODE_HEADERS);
  const regimeNameCol = findCol(headers, REGIME_NAME_HEADERS);
  const regionCodeCol = findCol(headers, REGION_CODE_HEADERS);
  const regionNameCol = findCol(headers, REGION_NAME_HEADERS);

  let groupCodeCol = -1;
  let groupNameCol = -1;
  if (manifest.grouping === "partner") {
    groupCodeCol = partnerCodeCol;
    groupNameCol = partnerNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "partner", reason: "missing partner columns" } },
      };
    }
  } else if (manifest.grouping === "regime") {
    groupCodeCol = regimeCodeCol;
    groupNameCol = regimeNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "regime", reason: "missing regime columns" } },
      };
    }
  } else if (manifest.grouping === "region") {
    groupCodeCol = regionCodeCol;
    groupNameCol = regionNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "region", reason: "missing region columns" } },
      };
    }
  }

  const qty1Col = findCol(headers, QTY1_HEADERS);
  const unit1Col = findCol(headers, UNIT1_HEADERS);
  const qty2Col = findCol(headers, QTY2_HEADERS);
  const unit2Col = findCol(headers, UNIT2_HEADERS);
  const periodCol = findCol(headers, PERIOD_HEADERS);
  const flowCol = findCol(headers, FLOW_HEADERS);

  const dataRecords = rawRecords
    .map((fields, index) => ({ fields, line: index + 1 }))
    .slice(headerIndex + 1)
    .filter((r) => !isBlank(r.fields));
  if (dataRecords.length === 0) {
    if (options?.allowHeaderOnlyEmpty) {
      return { ok: true, encoding: decoded.encoding, headers, rows: [], summaryRowsSkipped: 0 };
    }
    return { ok: false, error: { status: 400, code: "EMPTY_CSV", params: {} } };
  }

  const maxRows = options?.maxRows ?? 5000;
  if (dataRecords.length > maxRows) {
    return {
      ok: false,
      error: { status: 400, code: "ROW_LIMIT_EXCEEDED", params: { max: maxRows, actual: dataRecords.length } },
    };
  }

  const allowedHs8 = new Set(manifest.hs8.map((c) => c.trim()));
  const declaredEmptyHs8 = new Set(manifest.emptyHs8.map((c) => c.trim()));
  const seenKeys = new Set<string>();
  const rows: ParsedCustomsFactRow[] = [];
  let summaryRowsSkipped = 0;

  for (const rec of dataRecords) {
    const get = (col: number) => (col >= 0 ? (rec.fields[col] ?? "").trim() : "");
    const rawHs = get(hsCol);
    const rawName = get(nameCol);

    // 识别文件级全国合计 / 总计行
    if ((!rawHs && isAggregateLabel(rawName)) || isAggregateLabel(rawHs) || isAggregateLabel(rawName)) {
      summaryRowsSkipped += 1;
      continue;
    }

    if (!/^\d{8}$/.test(rawHs)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "hs8", reason: `invalid hs8 '${rawHs}'` } },
      };
    }
    if (!allowedHs8.has(rawHs)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "hs8", reason: `hs8 '${rawHs}' not in manifest` } },
      };
    }

    if (periodCol !== -1) {
      const cellPeriod = get(periodCol);
      if (cellPeriod) {
        const normP = normalizeCsvMonth(cellPeriod);
        if (normP !== manifest.month) {
          return {
            ok: false,
            error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "month", reason: "month mismatch with manifest" } },
          };
        }
      }
    }

    if (flowCol !== -1) {
      const cellFlow = get(flowCol);
      if (cellFlow) {
        const normF = normalizeCsvFlow(cellFlow);
        if (normF !== manifest.flow) {
          return {
            ok: false,
            error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "flow", reason: "flow mismatch with manifest" } },
          };
        }
      }
    }

    let groupCode = "ALL";
    let groupName = "全国";
    if (manifest.grouping !== "product") {
      const gc = get(groupCodeCol);
      const gn = get(groupNameCol);
      const isZeroWorld = (gc === "0" || gc === "00" || gc === "000") && (gn === "" || isAggregateLabel(gn));
      if (isAggregateLabel(gc) || isAggregateLabel(gn) || isZeroWorld) {
        summaryRowsSkipped += 1;
        continue;
      }
      if (!gc || !gn) {
        return {
          ok: false,
          error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: manifest.grouping, reason: "missing group code or name" } },
        };
      }
      groupCode = gc;
      groupName = gn;
    } else {
      // product 分组若携带 13 列脚本表头，不允许包含非汇总的伙伴/方式/注册地拆行
      for (const extraCol of [partnerCodeCol, partnerNameCol, regimeCodeCol, regimeNameCol, regionCodeCol, regionNameCol]) {
        const extraVal = get(extraCol);
        if (extraVal && !isAggregateLabel(extraVal)) {
          return {
            ok: false,
            error: {
              status: 400,
              code: "TRADE_CSV_INVALID",
              params: { line: rec.line, field: "grouping", reason: "product grouping cannot contain breakdown codes" },
            },
          };
        }
      }
    }

    if (declaredEmptyHs8.has(rawHs)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: "TRADE_CSV_INVALID",
          params: { line: rec.line, field: "emptyHs8", reason: `hs8 '${rawHs}' has detail row but listed in emptyHs8` },
        },
      };
    }

    const parsedUsd = parseUsdToScaled(get(usdCol));
    if (!parsedUsd) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "usd", reason: "invalid USD amount" } },
      };
    }

    const q1 = parseOptionalQuantity(get(qty1Col));
    if (!q1.ok) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "qty1", reason: "invalid first quantity" } },
      };
    }
    const q2 = parseOptionalQuantity(get(qty2Col));
    if (!q2.ok) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "qty2", reason: "invalid second quantity" } },
      };
    }

    const bizKey = `${rawHs}|${groupCode}`;
    if (seenKeys.has(bizKey)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "duplicate_key", reason: `duplicate (${rawHs}, ${groupCode})` } },
      };
    }
    seenKeys.add(bizKey);

    rows.push({
      line: rec.line,
      hs8: rawHs,
      itemName: rawName || rawHs,
      groupCode,
      groupName,
      usdScaled: parsedUsd.scaled,
      usdRaw: parsedUsd.normalized,
      qty1: q1.value,
      unit1: parseOptionalUnit(get(unit1Col)),
      qty2: q2.value,
      unit2: parseOptionalUnit(get(unit2Col)),
    });
  }

  if (rows.length === 0 && !options?.allowHeaderOnlyEmpty) {
    return { ok: false, error: { status: 400, code: "EMPTY_CSV", params: {} } };
  }

  return {
    ok: true,
    encoding: decoded.encoding,
    headers,
    rows,
    summaryRowsSkipped,
  };
}

export function parseMultiMonthCustomsCsvBytes(
  bytes: Uint8Array,
  manifest: Pick<
    TradeBulkImportManifest,
    "dictVersion" | "months" | "flow" | "currency" | "grouping" | "hs8" | "emptyHs8" | "probeVerifiedZero"
  >,
  options?: { maxRows?: number; allowHeaderOnlyEmpty?: boolean },
): MultiMonthCustomsCsvParseOutcome {
  if (manifest.currency.trim().toUpperCase() !== "USD") {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: manifest.currency } },
    };
  }
  const decoded = decodeCustomsBytes(bytes);
  if (!decoded.ok) return decoded;

  const rawRecords = parseCsvRecords(decoded.text);
  const isBlank = (fields: string[]) => fields.every((f) => f.trim() === "");
  const headerIndex = rawRecords.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) {
    return { ok: false, error: { status: 400, code: "EMPTY_CSV", params: {} } };
  }

  const headers = rawRecords[headerIndex].map((f) => f.trim());
  if (findCol(headers, NON_USD_HEADERS) !== -1 && findCol(headers, USD_HEADERS) === -1) {
    const badHeader = headers[findCol(headers, NON_USD_HEADERS)];
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: badHeader } },
    };
  }

  const hsCol = findCol(headers, HS_HEADERS);
  if (hsCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "hs8", reason: "missing product code header" } },
    };
  }
  const nameCol = findCol(headers, ITEM_NAME_HEADERS);
  if (nameCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "itemName", reason: "missing product name header" } },
    };
  }
  const usdCol = findCol(headers, USD_HEADERS);
  if (usdCol === -1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CURRENCY_INVALID", params: { currency: "missing_usd_header" } },
    };
  }

  const partnerCodeCol = findCol(headers, PARTNER_CODE_HEADERS);
  const partnerNameCol = findCol(headers, PARTNER_NAME_HEADERS);
  const regimeCodeCol = findCol(headers, REGIME_CODE_HEADERS);
  const regimeNameCol = findCol(headers, REGIME_NAME_HEADERS);
  const regionCodeCol = findCol(headers, REGION_CODE_HEADERS);
  const regionNameCol = findCol(headers, REGION_NAME_HEADERS);

  let groupCodeCol = -1;
  let groupNameCol = -1;
  if (manifest.grouping === "partner") {
    groupCodeCol = partnerCodeCol;
    groupNameCol = partnerNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "partner", reason: "missing partner columns" } },
      };
    }
  } else if (manifest.grouping === "regime") {
    groupCodeCol = regimeCodeCol;
    groupNameCol = regimeNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "regime", reason: "missing regime columns" } },
      };
    }
  } else if (manifest.grouping === "region") {
    groupCodeCol = regionCodeCol;
    groupNameCol = regionNameCol;
    if (groupCodeCol === -1 || groupNameCol === -1) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "region", reason: "missing region columns" } },
      };
    }
  }

  const qty1Col = findCol(headers, QTY1_HEADERS);
  const unit1Col = findCol(headers, UNIT1_HEADERS);
  const qty2Col = findCol(headers, QTY2_HEADERS);
  const unit2Col = findCol(headers, UNIT2_HEADERS);
  const periodCol = findCol(headers, PERIOD_HEADERS);
  const flowCol = findCol(headers, FLOW_HEADERS);

  const byMonth = new Map<string, ParsedCustomsFactRow[]>();
  for (const m of manifest.months) {
    byMonth.set(m, []);
  }

  const dataRecords = rawRecords
    .map((fields, index) => ({ fields, line: index + 1 }))
    .slice(headerIndex + 1)
    .filter((r) => !isBlank(r.fields));

  const probeVerifiedZero = manifest.probeVerifiedZero === true;

  if (dataRecords.length === 0) {
    if (options?.allowHeaderOnlyEmpty || probeVerifiedZero) {
      return { ok: true, encoding: decoded.encoding, headers, byMonth, totalRows: 0, summaryRowsSkipped: 0 };
    }
    return { ok: false, error: { status: 400, code: "EMPTY_CSV", params: {} } };
  }

  if (periodCol === -1 && manifest.months.length > 1) {
    return {
      ok: false,
      error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: 1, field: "month", reason: "multi-month CSV requires period header" } },
    };
  }

  const maxRows = options?.maxRows ?? 100_000;
  if (dataRecords.length > maxRows) {
    return {
      ok: false,
      error: { status: 400, code: "ROW_LIMIT_EXCEEDED", params: { max: maxRows, actual: dataRecords.length } },
    };
  }

  const allowedMonths = new Set(manifest.months);
  const allowedHs8 = new Set(manifest.hs8.map((c) => c.trim()));
  const declaredEmptyHs8 = new Set((manifest.emptyHs8 ?? []).map((c) => c.trim()));
  const seenKeys = new Set<string>();
  let totalRows = 0;
  let summaryRowsSkipped = 0;

  for (const rec of dataRecords) {
    const get = (col: number) => (col >= 0 ? (rec.fields[col] ?? "").trim() : "");
    const rawHs = get(hsCol);
    const rawName = get(nameCol);

    if ((!rawHs && isAggregateLabel(rawName)) || isAggregateLabel(rawHs) || isAggregateLabel(rawName)) {
      summaryRowsSkipped += 1;
      continue;
    }

    if (!/^\d{8}$/.test(rawHs)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "hs8", reason: `invalid hs8 '${rawHs}'` } },
      };
    }
    if (!allowedHs8.has(rawHs)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "hs8", reason: `hs8 '${rawHs}' not in manifest` } },
      };
    }

    const rowMonth = periodCol !== -1 ? normalizeCsvMonth(get(periodCol)) : manifest.months[0];
    if (!rowMonth || !allowedMonths.has(rowMonth)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "month", reason: `row month '${get(periodCol)}' outside manifest months` } },
      };
    }

    if (flowCol !== -1) {
      const cellFlow = get(flowCol);
      if (cellFlow) {
        const normF = normalizeCsvFlow(cellFlow);
        if (normF !== manifest.flow) {
          return {
            ok: false,
            error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "flow", reason: "flow mismatch with manifest" } },
          };
        }
      }
    }

    let groupCode = "ALL";
    let groupName = "全国";
    if (manifest.grouping !== "product") {
      const gc = get(groupCodeCol);
      const gn = get(groupNameCol);
      const isZeroWorld = (gc === "0" || gc === "00" || gc === "000") && (gn === "" || isAggregateLabel(gn));
      if (isAggregateLabel(gc) || isAggregateLabel(gn) || isZeroWorld) {
        summaryRowsSkipped += 1;
        continue;
      }
      if (!gc || !gn) {
        return {
          ok: false,
          error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: manifest.grouping, reason: "missing group code or name" } },
        };
      }
      groupCode = gc;
      groupName = gn;
    } else {
      for (const extraCol of [partnerCodeCol, partnerNameCol, regimeCodeCol, regimeNameCol, regionCodeCol, regionNameCol]) {
        const extraVal = get(extraCol);
        if (extraVal && !isAggregateLabel(extraVal)) {
          return {
            ok: false,
            error: {
              status: 400,
              code: "TRADE_CSV_INVALID",
              params: { line: rec.line, field: "grouping", reason: "product grouping cannot contain breakdown codes" },
            },
          };
        }
      }
    }

    if (!probeVerifiedZero && declaredEmptyHs8.has(rawHs)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: "TRADE_CSV_INVALID",
          params: { line: rec.line, field: "emptyHs8", reason: `hs8 '${rawHs}' has detail row but listed in emptyHs8` },
        },
      };
    }

    const parsedUsd = parseUsdToScaled(get(usdCol));
    if (!parsedUsd) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "usd", reason: "invalid USD amount" } },
      };
    }

    const q1 = parseOptionalQuantity(get(qty1Col));
    if (!q1.ok) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "qty1", reason: "invalid first quantity" } },
      };
    }
    const q2 = parseOptionalQuantity(get(qty2Col));
    if (!q2.ok) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "qty2", reason: "invalid second quantity" } },
      };
    }

    const bizKey = `${rowMonth}|${rawHs}|${groupCode}`;
    if (seenKeys.has(bizKey)) {
      return {
        ok: false,
        error: { status: 400, code: "TRADE_CSV_INVALID", params: { line: rec.line, field: "duplicate_key", reason: `duplicate (${rowMonth}, ${rawHs}, ${groupCode})` } },
      };
    }
    seenKeys.add(bizKey);

    byMonth.get(rowMonth)!.push({
      line: rec.line,
      hs8: rawHs,
      itemName: rawName || rawHs,
      groupCode,
      groupName,
      usdScaled: parsedUsd.scaled,
      usdRaw: parsedUsd.normalized,
      qty1: q1.value,
      unit1: parseOptionalUnit(get(unit1Col)),
      qty2: q2.value,
      unit2: parseOptionalUnit(get(unit2Col)),
    });
    totalRows += 1;
  }

  if (totalRows === 0 && !options?.allowHeaderOnlyEmpty && !probeVerifiedZero) {
    return { ok: false, error: { status: 400, code: "EMPTY_CSV", params: {} } };
  }

  return {
    ok: true,
    encoding: decoded.encoding,
    headers,
    byMonth,
    totalRows,
    summaryRowsSkipped,
  };
}

export function parseTradePeriod(raw: string): ParsedTradePeriod | null {
  const s = raw.trim();
  const mMonth = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  if (mMonth) {
    const year = Number(mMonth[1]);
    const mm = mMonth[2];
    return {
      period: s,
      kind: "month",
      year,
      months: [s],
      priorPeriod: `${year - 1}-${mm}`,
    };
  }
  const mQuarter = /^(\d{4})-Q([1-4])$/.exec(s);
  if (mQuarter) {
    const year = Number(mQuarter[1]);
    const q = Number(mQuarter[2]);
    const startM = (q - 1) * 3 + 1;
    const months = [0, 1, 2].map((d) => `${year}-${String(startM + d).padStart(2, "0")}`);
    return {
      period: s,
      kind: "quarter",
      year,
      months,
      priorPeriod: `${year - 1}-Q${q}`,
    };
  }
  const mYear = /^(\d{4})$/.exec(s);
  if (mYear) {
    const year = Number(mYear[1]);
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    return {
      period: s,
      kind: "year",
      year,
      months,
      priorPeriod: `${year - 1}`,
    };
  }
  const mYtd = /^(\d{4})-YTD-(0[1-9]|1[0-2])$/.exec(s);
  if (mYtd) {
    const year = Number(mYtd[1]);
    const endM = Number(mYtd[2]);
    const months = Array.from({ length: endM }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    return {
      period: s,
      kind: "ytd",
      year,
      months,
      priorPeriod: `${year - 1}-YTD-${mYtd[2]}`,
    };
  }
  return null;
}

/**
 * 伙伴集中度（CR1 / CR3 / CR5 / HHI）：
 * - 先按伙伴汇总所选期间内的金额（partnerTotalsScaled），以对应全国或分类总额（denominatorScaled）为分母
 * - 按金额降序排列，份额以百分数（0–100）计，HHI = Σ(sharePct^2)（0–10,000 刻度）
 * - 分母为 0 或无有效伙伴明细时返回 null
 */
export function computeConcentration(
  partnerTotalsScaled: ReadonlyArray<{ partnerCode: string; usdScaled: bigint }>,
  denominatorScaled: bigint,
): ConcentrationMetrics {
  const positive = partnerTotalsScaled.filter((p) => p.usdScaled > 0n);
  if (denominatorScaled <= 0n || positive.length === 0) {
    return { cr1: null, cr3: null, cr5: null, hhi: null, partnerCount: positive.length };
  }
  const sorted = [...positive].sort((a, b) => {
    if (b.usdScaled !== a.usdScaled) return b.usdScaled > a.usdScaled ? 1 : -1;
    return a.partnerCode.localeCompare(b.partnerCode);
  });

  const denom = Number(denominatorScaled);
  const shares = sorted.map((p) => (Number(p.usdScaled) / denom) * 100);
  const sumTop = (k: number) => shares.slice(0, Math.min(k, shares.length)).reduce((acc, v) => acc + v, 0);
  const hhiRaw = shares.reduce((acc, s) => acc + s * s, 0);

  return {
    cr1: roundMetric(sumTop(1), 4),
    cr3: roundMetric(sumTop(3), 4),
    cr5: roundMetric(sumTop(5), 4),
    hhi: roundMetric(hhiRaw, 4),
    partnerCount: sorted.length,
  };
}

export function computeYoyPct(currentScaled: bigint, priorScaled: bigint | null): number | null {
  if (priorScaled === null || priorScaled <= 0n) return null;
  const pct = (Number(currentScaled - priorScaled) / Number(priorScaled)) * 100;
  return roundMetric(pct, 4);
}
