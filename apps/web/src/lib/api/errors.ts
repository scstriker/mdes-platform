import { ERROR_CODES } from "@mdes/shared";

/**
 * API 错误码的中文文案（ADR-002「错误码与中文文案」）。
 * 服务端统一返回 { error: { code, message, params } }，message 是英文开发者说明；
 * CSV 行错误为 { line, code, params }。界面文案只按 code 生成，遇到未知 code 时才用 message 兜底。
 */

export type ApiErrorParams = Record<string, string | number | boolean | null | undefined>;

/** 服务端错误码（packages/shared）与前端自有的错误码 */
export const SERVER_ERROR_CODES = ERROR_CODES;

export const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "HTTP_ERROR", "INVALID_RESPONSE", "UNKNOWN_ERROR"] as const;

export type ErrorCode = (typeof SERVER_ERROR_CODES)[number] | (typeof CLIENT_ERROR_CODES)[number];

/** CSV 列名的中文说明，出现在行错误里 */
const FIELD_LABELS: Record<string, string> = {
  indicator_id: "指标编号（indicator_id）",
  period: "期间（period）",
  geo: "地域（geo）",
  value_num: "数值（value_num）",
  value_text: "文本值（value_text）",
  unit: "单位（unit）",
  dims: "维度（dims）",
};

const field = (name: unknown) => FIELD_LABELS[String(name)] ?? String(name ?? "");
const text = (v: unknown, fallback = "") => (v === undefined || v === null || v === "" ? fallback : String(v));

/** 错误文案：说明原因和下一步（ITEI 内容基调） */
const MESSAGES: Record<ErrorCode, (p: ApiErrorParams) => string> = {
  FILE_REQUIRED: () => "未收到文件，请选择要导入的 CSV 文件后重试",
  EMPTY_CSV: () => "CSV 文件没有内容，请检查文件后重试",
  MISSING_HEADER: (p) => `缺少必需的列 ${text(p.header, "（未知列）")}，请对照导入模板补齐表头`,
  ROW_LIMIT_EXCEEDED: (p) =>
    `数据超过 ${text(p.max, "上限")} 行${p.actual ? `（当前 ${p.actual} 行）` : ""}，请拆分为多个文件后分批导入`,
  REQUIRED_FIELD_MISSING: (p) => `${field(p.field)}为空，请补齐后重试`,
  INVALID_VALUE_NUM: (p) => `数值「${text(p.value)}」不是有效数字，请填写阿拉伯数字，不带单位和千分位`,
  VALUE_MISSING: () => "数值（value_num）与文本值（value_text）至少填写一个",
  DIMS_INVALID_JSON: () => "维度（dims）不是合法的 JSON，请检查引号与括号",
  DIMS_NOT_OBJECT: () => '维度（dims）必须是 JSON 对象，例如 {"trade_type":"import"}',
  UNKNOWN_INDICATOR: (p) => `指标编号 ${text(p.indicator_id, "（空）")} 不存在，请核对指标目录后重试`,
  NOT_FOUND: (p) =>
    p.id && p.resource !== "route" ? `未找到 ${p.id}，请确认编号是否正确` : "请求的内容不存在，请返回上一页重试",
  INTERNAL_ERROR: () => "服务器内部错误，请稍后重试",
  NETWORK_ERROR: () => "无法连接服务器，请检查网络后重试",
  HTTP_ERROR: (p) => `服务器返回错误（HTTP ${text(p.status, "?")}），请稍后重试`,
  INVALID_RESPONSE: () => "服务器返回的数据无法解析，请稍后重试",
  UNKNOWN_ERROR: () => "发生未知错误，请刷新页面后重试",
};

export function isKnownCode(code: string): code is ErrorCode {
  return code in MESSAGES;
}

/** 按 code 出中文文案；未知 code 用服务端 message 兜底 */
export function errorMessage(code: string, params: ApiErrorParams = {}, fallback?: string): string {
  if (isKnownCode(code)) return MESSAGES[code](params);
  return fallback || MESSAGES.UNKNOWN_ERROR(params);
}

export type RowErrorLike = { line: number; code: string; params?: ApiErrorParams; message?: string };

/** CSV 行错误：「第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试」 */
export function rowErrorMessage(err: RowErrorLike): string {
  const body = errorMessage(err.code, err.params, err.message);
  return err.line > 0 ? `第 ${err.line} 行：${body}` : body;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly params: ApiErrorParams;
  /** 服务端原始响应体（如导入失败时的行错误） */
  readonly body: unknown;

  constructor(init: { status: number; code: string; params?: ApiErrorParams; message?: string; body?: unknown }) {
    super(errorMessage(init.code, init.params, init.message));
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.params = init.params ?? {};
    this.body = init.body;
  }
}

/** 任意异常 → 给用户看的中文文案 */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return errorMessage("UNKNOWN_ERROR");
}

/**
 * 把非 2xx 响应解析成 ApiError。
 * 兼容两种结构：新的 { error: { code, message, params } }，以及阶段 2 之前的 { error: "not found" }。
 */
export function toApiError(status: number, body: unknown): ApiError {
  const err = (body as { error?: unknown } | null)?.error;
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    const e = err as { code: string; message?: string; params?: ApiErrorParams };
    return new ApiError({ status, code: e.code, params: e.params, message: e.message, body });
  }
  if (status === 404) return new ApiError({ status, code: "NOT_FOUND", body });
  return new ApiError({
    status,
    code: "HTTP_ERROR",
    params: { status },
    message: typeof err === "string" ? err : undefined,
    body,
  });
}
