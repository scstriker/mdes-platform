import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "../src/lib/api/client";
import { ApiError, errorMessage, rowErrorMessage, SERVER_ERROR_CODES, toApiError } from "../src/lib/api/errors";

describe("错误码 → 中文文案", () => {
  it("每个服务端错误码都有中文文案", () => {
    for (const code of SERVER_ERROR_CODES) {
      const msg = errorMessage(code, {});
      expect(msg).toMatch(/[一-龥]/);
      expect(msg).not.toContain("undefined");
    }
  });

  it("行错误带行号：与 ADR-002 示例一致", () => {
    expect(rowErrorMessage({ line: 5, code: "UNKNOWN_INDICATOR", params: { indicator_id: "TRD-099" } })).toBe(
      "第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试",
    );
  });

  it("缺数值列时说明 value_num 与 value_text 二选一", () => {
    expect(errorMessage("MISSING_HEADER", { header: "value_num" })).toMatch(/value_num 与 value_text 至少要有一列/);
  });

  it("未知错误码用服务端 message 兜底", () => {
    expect(errorMessage("SOMETHING_NEW", {}, "服务端说明")).toBe("服务端说明");
    expect(errorMessage("SOMETHING_NEW", {})).toMatch(/未知错误/);
  });
});

describe("toApiError", () => {
  it("解析新结构 { error: { code, message, params } }", () => {
    const err = toApiError(400, { error: { code: "MISSING_HEADER", message: "missing", params: { header: "period" } } });
    expect(err.code).toBe("MISSING_HEADER");
    expect(err.status).toBe(400);
    expect(err.message).toBe("缺少必需的列 period，请对照导入模板补齐表头");
  });

  it("兼容阶段 2 之前的 { error: \"not found\" }", () => {
    expect(toApiError(404, { error: "not found" }).code).toBe("NOT_FOUND");
    const e = toApiError(500, { error: "boom" });
    expect(e.code).toBe("HTTP_ERROR");
    expect(e.message).toBe("服务器返回错误（HTTP 500），请稍后重试");
  });
});

describe("request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("网络失败抛 NETWORK_ERROR，不返回空数据", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(request("/api/indicators")).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("非 2xx 抛 ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "NOT_FOUND", params: { id: "TRD-099" } } }), { status: 404 }),
      ),
    );
    const err = await request<unknown>("/api/indicators/TRD-099").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("未找到 TRD-099，请确认编号是否正确");
  });

  it("2xx 但不是 JSON 抛 INVALID_RESPONSE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    await expect(request("/api/stats")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("取消请求时原样抛出 AbortError，交给 TanStack Query 处理", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(request("/api/stats")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("查询参数忽略空值", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{\"items\":[]}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await request("/api/observations", { query: { indicator_id: "TRD-001", geo: "", period: undefined, limit: 50 } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/observations?indicator_id=TRD-001&limit=50");
  });
});
