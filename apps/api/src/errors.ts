import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorBody, type ErrorCode, type ErrorParams } from "@mdes/shared";

/**
 * 业务错误：抛出后由 onError 统一转成 { error: { code, message, params } }。
 * message 是英文开发者说明；界面文案由前端按 code 生成。
 */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

export function onError(err: Error, c: Context) {
  if (err instanceof AppError) return c.json(errorBody(err.code, err.params), err.status);
  console.error(err);
  return c.json(errorBody("INTERNAL_ERROR"), 500);
}

export function onNotFound(c: Context) {
  return c.json(errorBody("NOT_FOUND", { resource: "route", id: `${c.req.method} ${c.req.path}` }), 404);
}

/** 查询参数宽松处理：非法值回落到默认值，不报错（ADR-002 阶段 2 补充约定） */
export function intParam(raw: string | undefined, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) return fallback;
  return Math.min(n, max);
}

/** 空字符串视为未传 */
export function textParam(raw: string | undefined): string | null {
  const v = raw?.trim();
  return v ? v : null;
}
