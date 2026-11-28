/**
 * 观测值 CSV 解析与校验（从 apps/api/src/csv.ts 迁来，前后端共用同一套规则）。
 *
 * - 按 RFC 4180 解析：双引号包裹的字段可以含逗号、换行，"" 表示一个双引号；兼容 BOM 与 CRLF。
 * - 行号是表格行号：表头为第 1 行，空行也计数，与 Excel 等表格软件一致。
 * - 文件级问题（空文件、缺列、超行数）返回 fileError，不产出任何行；
 *   行级问题每行只报第一个错误，该行跳过。
 * - 传入 knownIndicatorIds 时同时校验指标编号，前端可以用指标目录做导入前预校验。
 */
import type { FileError, RowError } from "./errors";

export type CsvObservationRow = {
  /** 表格行号 */
  line: number;
  indicator_id: string;
  period: string;
  geo: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  dims: Record<string, unknown>;
};

export type CsvParseOptions = {
  /** 数据行上限（不含表头与空行），默认 5000 */
  maxRows?: number;
  knownIndicatorIds?: ReadonlySet<string> | readonly string[];
};

export type CsvParseResult =
  | { ok: false; fileError: FileError }
  | { ok: true; rows: CsvObservationRow[]; errors: RowError[]; dataRows: number };

/** 必需列；另外 value_num 与 value_text 至少要有一列 */
export const REQUIRED_HEADERS = ["indicator_id", "period"] as const;
export const OPTIONAL_HEADERS = ["geo", "value_num", "value_text", "unit", "dims"] as const;
export const DEFAULT_MAX_ROWS = 5000;

/** RFC 4180 记录切分，返回每条记录的字段（未去空白） */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
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

const isBlank = (fields: string[]) => fields.every((f) => f.trim() === "");

/** RFC 4180 单元格转义 */
function encodeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 递归按对象键名字典序重排，保证等价 JSON 序列化文本一致 */
export function canonicalizeDimsObject(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeDimsObject);
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    out[k] = canonicalizeDimsObject(v);
  }
  return out;
}

export function canonicalizeDimsJson(dims: Record<string, unknown>): string {
  return JSON.stringify(canonicalizeDimsObject(dims));
}

/** 按 RFC 4180 提取首行非空表头（去除 BOM 与首尾空白，保留表头原始大小写） */
export function extractCsvHeaders(text: string): string[] {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  const headerRow = records.find((r) => !isBlank(r));
  return headerRow ? headerRow.map((h) => h.trim()) : [];
}

/**
 * 将源 CSV 按字段对照映射表转换为标准观测值 CSV（保留原文件前导及中间空行以对齐表格行号）：
 * - 标准目标列：indicator_id, period, geo, value_num, value_text, unit, dims
 * - extraDimKeys 中被映射的非空列自动合并入对应行的 dims JSON 对象
 */
export function applyObservationColumnMapping(
  rawText: string,
  mapping: Readonly<Record<string, string>>,
  extraDimKeys: readonly string[] = [],
): string {
  const records = parseCsvRecords(rawText.replace(/^\uFEFF/, ""));
  const headerIndex = records.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) return rawText;

  const sourceHeaders = records[headerIndex].map((h) => h.trim());
  const colIndexByHeader = new Map<string, number>();
  sourceHeaders.forEach((h, idx) => {
    if (!colIndexByHeader.has(h)) colIndexByHeader.set(h, idx);
  });
  // 大小写不敏感兜底
  const colIndexLower = new Map<string, number>();
  sourceHeaders.forEach((h, idx) => {
    const low = h.toLowerCase();
    if (!colIndexLower.has(low)) colIndexLower.set(low, idx);
  });

  const resolveColIndex = (mappedHeader: string | undefined): number | undefined => {
    const trimmed = mappedHeader?.trim();
    if (!trimmed) return undefined;
    return colIndexByHeader.get(trimmed) ?? colIndexLower.get(trimmed.toLowerCase());
  };

  const canonicalTargets = ["indicator_id", "period", "geo", "value_num", "value_text", "unit", "dims"] as const;
  const activeExtraKeys = extraDimKeys.filter((k) => resolveColIndex(mapping[k]) !== undefined);
  const activeTargets = canonicalTargets.filter((t) => {
    if (t === "dims" && activeExtraKeys.length > 0) return true;
    return resolveColIndex(mapping[t]) !== undefined;
  });

  // 若用户将全部目标列都设为了“不导入”，输出一个占位表头使 parseObservationCsv 精确报 MISSING_HEADER: indicator_id
  const outHeaders = activeTargets.length > 0 ? [...activeTargets] : ["__unmapped__"];
  const outLines: string[] = [];

  for (let rIdx = 0; rIdx < records.length; rIdx++) {
    const row = records[rIdx];
    if (rIdx < headerIndex || (rIdx > headerIndex && isBlank(row))) {
      outLines.push("");
      continue;
    }
    if (rIdx === headerIndex) {
      outLines.push(outHeaders.map(encodeCsvCell).join(","));
      continue;
    }

    const readCell = (targetKey: string): string => {
      const cIdx = resolveColIndex(mapping[targetKey]);
      return cIdx === undefined ? "" : (row[cIdx] ?? "").trim();
    };

    if (activeTargets.length === 0) {
      outLines.push(encodeCsvCell(row[0] ?? "x"));
      continue;
    }

    const cells = activeTargets.map((target) => {
      if (target !== "dims") {
        return encodeCsvCell(readCell(target));
      }
      const rawDims = readCell("dims");
      if (activeExtraKeys.length === 0) {
        return encodeCsvCell(rawDims);
      }
      const extraObj: Record<string, string> = {};
      for (const ek of activeExtraKeys) {
        const val = readCell(ek);
        if (val !== "") extraObj[ek] = val;
      }
      if (Object.keys(extraObj).length === 0) {
        return encodeCsvCell(rawDims);
      }
      if (!rawDims) {
        return encodeCsvCell(canonicalizeDimsJson(extraObj));
      }
      try {
        const parsed = JSON.parse(rawDims) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return encodeCsvCell(rawDims);
        }
        return encodeCsvCell(canonicalizeDimsJson({ ...(parsed as Record<string, unknown>), ...extraObj }));
      } catch {
        // 保留非法 JSON 原串，交由 parseObservationCsv 报出对应行号的 DIMS_INVALID_JSON
        return encodeCsvCell(rawDims);
      }
    });
    outLines.push(cells.join(","));
  }

  return outLines.join("\n");
}

export function parseObservationCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const known = options.knownIndicatorIds
    ? options.knownIndicatorIds instanceof Set
      ? (options.knownIndicatorIds as ReadonlySet<string>)
      : new Set(options.knownIndicatorIds as readonly string[])
    : null;

  const records = parseCsvRecords(text.replace(/^﻿/, ""));
  const headerIndex = records.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) return { ok: false, fileError: { code: "EMPTY_CSV", params: {} } };

  const headers = records[headerIndex].map((h) => h.trim().toLowerCase());
  for (const name of REQUIRED_HEADERS) {
    if (!headers.includes(name)) return { ok: false, fileError: { code: "MISSING_HEADER", params: { header: name } } };
  }
  if (!headers.includes("value_num") && !headers.includes("value_text")) {
    return { ok: false, fileError: { code: "MISSING_HEADER", params: { header: "value_num" } } };
  }

  const data = records
    .map((fields, index) => ({ fields, line: index + 1 }))
    .slice(headerIndex + 1)
    .filter((r) => !isBlank(r.fields));
  if (data.length === 0) return { ok: false, fileError: { code: "EMPTY_CSV", params: {} } };
  if (data.length > maxRows) {
    return { ok: false, fileError: { code: "ROW_LIMIT_EXCEEDED", params: { max: maxRows, actual: data.length } } };
  }

  const col = Object.fromEntries(headers.map((h, i) => [h, i])) as Record<string, number | undefined>;
  const rows: CsvObservationRow[] = [];
  const errors: RowError[] = [];

  for (const { fields, line } of data) {
    const get = (name: string) => {
      const i = col[name];
      return i === undefined ? "" : (fields[i] ?? "").trim();
    };

    const indicator_id = get("indicator_id");
    if (!indicator_id) {
      errors.push({ line, code: "REQUIRED_FIELD_MISSING", params: { field: "indicator_id" } });
      continue;
    }
    const period = get("period");
    if (!period) {
      errors.push({ line, code: "REQUIRED_FIELD_MISSING", params: { field: "period" } });
      continue;
    }
    if (known && !known.has(indicator_id)) {
      errors.push({ line, code: "UNKNOWN_INDICATOR", params: { indicator_id } });
      continue;
    }

    const rawNum = get("value_num");
    let value_num: number | null = null;
    if (rawNum !== "") {
      const n = Number(rawNum);
      if (!Number.isFinite(n)) {
        errors.push({ line, code: "INVALID_VALUE_NUM", params: { value: rawNum } });
        continue;
      }
      value_num = n;
    }

    const rawDims = get("dims");
    let dims: Record<string, unknown> = {};
    if (rawDims) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDims);
      } catch {
        errors.push({ line, code: "DIMS_INVALID_JSON", params: {} });
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push({ line, code: "DIMS_NOT_OBJECT", params: {} });
        continue;
      }
      dims = parsed as Record<string, unknown>;
    }

    const value_text = get("value_text") || null;
    if (value_num === null && !value_text) {
      errors.push({ line, code: "VALUE_MISSING", params: {} });
      continue;
    }

    rows.push({ line, indicator_id, period, geo: get("geo") || "CN", value_num, value_text, unit: get("unit"), dims });
  }

  return { ok: true, rows, errors, dataRows: data.length };
}
