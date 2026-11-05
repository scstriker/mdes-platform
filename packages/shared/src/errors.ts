/**
 * API 错误码（ADR-002「错误码与中文文案」及阶段 2 补充约定）。
 *
 * - 接口错误统一返回 { error: { code, message, params } }；message 是给开发者看的英文说明，
 *   界面文案由前端按 code 生成（apps/web/src/lib/api/errors.ts）。
 * - CSV 行错误为 { line, code, params }，line 是表格行号（表头为第 1 行，空行也计数）。
 */

/** 文件级错误：不建批次，返回 400 */
export const FILE_ERROR_CODES = ["FILE_REQUIRED", "EMPTY_CSV", "MISSING_HEADER", "ROW_LIMIT_EXCEEDED"] as const;

/** 行级错误：该行跳过，其余行照常导入 */
export const ROW_ERROR_CODES = [
  "REQUIRED_FIELD_MISSING",
  "INVALID_VALUE_NUM",
  "VALUE_MISSING",
  "DIMS_INVALID_JSON",
  "DIMS_NOT_OBJECT",
  "UNKNOWN_INDICATOR",
] as const;

export const ERROR_CODES = [...FILE_ERROR_CODES, ...ROW_ERROR_CODES, "NOT_FOUND", "INTERNAL_ERROR"] as const;

export type FileErrorCode = (typeof FILE_ERROR_CODES)[number];
export type RowErrorCode = (typeof ROW_ERROR_CODES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];

/** 各错误码携带的参数 */
export type ErrorParamsMap = {
  FILE_REQUIRED: Record<string, never>;
  EMPTY_CSV: Record<string, never>;
  MISSING_HEADER: { header: string };
  ROW_LIMIT_EXCEEDED: { max: number; actual: number };
  REQUIRED_FIELD_MISSING: { field: string };
  INVALID_VALUE_NUM: { value: string };
  VALUE_MISSING: Record<string, never>;
  DIMS_INVALID_JSON: Record<string, never>;
  DIMS_NOT_OBJECT: Record<string, never>;
  UNKNOWN_INDICATOR: { indicator_id: string };
  NOT_FOUND: { resource: string; id: string };
  INTERNAL_ERROR: Record<string, never>;
};

export type ErrorParams = Record<string, string | number>;

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; params: ErrorParams };
};

export type RowError<C extends RowErrorCode = RowErrorCode> = {
  line: number;
  code: C;
  params: ErrorParamsMap[C];
};

export type FileError<C extends FileErrorCode = FileErrorCode> = {
  code: C;
  params: ErrorParamsMap[C];
};

/** 给开发者看的英文说明（API 响应的 message 字段） */
export function developerMessage(code: ErrorCode, params: ErrorParams = {}): string {
  switch (code) {
    case "FILE_REQUIRED":
      return "multipart field 'file' or JSON field 'csvText' is required";
    case "EMPTY_CSV":
      return "csv has no rows";
    case "MISSING_HEADER":
      return `missing required header: ${params.header}`;
    case "ROW_LIMIT_EXCEEDED":
      return `row limit exceeded: ${params.actual} > ${params.max}`;
    case "REQUIRED_FIELD_MISSING":
      return `${params.field} is required`;
    case "INVALID_VALUE_NUM":
      return `invalid value_num: ${params.value}`;
    case "VALUE_MISSING":
      return "either value_num or value_text is required";
    case "DIMS_INVALID_JSON":
      return "dims is not valid JSON";
    case "DIMS_NOT_OBJECT":
      return "dims must be a JSON object";
    case "UNKNOWN_INDICATOR":
      return `unknown indicator_id: ${params.indicator_id}`;
    case "NOT_FOUND":
      return `${params.resource ?? "resource"} not found: ${params.id ?? ""}`.trim();
    case "INTERNAL_ERROR":
      return "internal server error";
  }
}

export function errorBody(code: ErrorCode, params: ErrorParams = {}, message?: string): ApiErrorBody {
  return { error: { code, message: message ?? developerMessage(code, params), params } };
}
