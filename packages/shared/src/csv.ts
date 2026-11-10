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
