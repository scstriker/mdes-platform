import { ApiError, toApiError } from "./errors";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";

type Query = Record<string, string | number | undefined | null>;

/**
 * 演示版（vite build --mode demo）改用浏览器内的模拟 API；MODE 在构建时被替换成常量，
 * 正常构建里这一分支连同 demo 代码被整体剔除。
 */
const doFetch: typeof fetch =
  import.meta.env.MODE === "demo"
    ? (input, init) => import("@/demo/demo-api").then((m) => m.demoFetch(input, init))
    : (input, init) => fetch(input, init);

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * 统一请求：非 2xx 抛 ApiError（带 code 与中文文案），网络失败抛 NETWORK_ERROR，
 * 不把失败吞成空数据；signal 由 TanStack Query 传入，过期请求会被取消。
 */
export async function request<T>(
  path: string,
  init: { method?: string; query?: Query; body?: BodyInit; json?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: HeadersInit = {};
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await doFetch(`${API_BASE}${path}${buildQuery(init.query)}`, {
      method: init.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError({ status: 0, code: "NETWORK_ERROR" });
  }

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (res.ok) throw new ApiError({ status: res.status, code: "INVALID_RESPONSE" });
    }
  }
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}
