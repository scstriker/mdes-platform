/**
 * 演示版（npm run build:demo）的浏览器内 API：不连后端，在内存里实现与真实 API 相同的接口与错误体，
 * 让页面可以完整交互。预置数据：99 个指标（data/indicators_seed.json）+ README 样例 + 虚构演示数据。
 * 导入用 @mdes/shared 的同一套解析器；数据只在内存里，刷新页面即重置。
 */
import {
  errorBody,
  parseObservationCsv,
  type ClusterStats,
  type ErrorCode,
  type ErrorParams,
  type ImportBatch,
  type ImportResult,
  type ImportStatus,
  type Indicator,
  type Observation,
  type Phase,
  type Stats,
} from "@mdes/shared";
import seed from "../../../../data/indicators_seed.json";
import sampleCsv from "../../../../data/samples/trd_sample.csv?raw";
import { makeDemoCsv } from "../../../../scripts/make-demo-csv.mjs";
import { inferSourceKind } from "../../../api/src/inferSourceKind";

type SeedIndicator = (typeof seed.indicators)[number];

const LATENCY_MS = 180;
const OBSERVATION_LIMIT_MAX = 500;

const clusters = seed.clusters
  .map((c) => ({ code: c.code, name: c.name, subsystem_id: "med" }))
  .sort((a, b) => a.code.localeCompare(b.code));

const indicators: Indicator[] = seed.indicators
  .map((i: SeedIndicator) => ({
    id: i.id,
    cluster_code: i.cluster_code,
    name: i.name,
    phase: i.phase as Phase,
    update_freq: i.update_freq,
    source_kind: inferSourceKind(i.source, i.collect_method),
    phase_scope: i.phase_scope,
    obs_count: 0,
    latest_period: null,
    automation: i.automation || null,
    spec_json: {
      business_value: i.business_value,
      definition: i.definition,
      source: i.source,
      collect_method: i.collect_method,
      usage: i.usage,
      automation: i.automation,
      note: i.note,
    },
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const knownIds = new Set(indicators.map((i) => i.id));
const observations: Observation[] = [];
const batches: ImportBatch[] = [];
let nextObservationId = 1;
let clock = Date.parse("2026-11-05T02:00:00Z");

function importText(filename: string, text: string): ImportResult | { fileError: { code: ErrorCode; params: ErrorParams } } {
  const parsed = parseObservationCsv(text, { maxRows: 5000, knownIndicatorIds: knownIds });
  if (!parsed.ok) return { fileError: { code: parsed.fileError.code, params: parsed.fileError.params as ErrorParams } };
  const { rows, errors } = parsed;
  const status: ImportStatus = rows.length === 0 ? "failed" : errors.length ? "completed_with_errors" : "completed";
  clock = Math.max(clock + 60_000, Date.now());
  const created_at = new Date(clock).toISOString();
  const id = crypto.randomUUID();
  batches.push({ id, filename, status, row_ok: rows.length, row_err: errors.length, errors_json: errors, created_at });
  for (const r of rows) {
    observations.push({
      id: String(nextObservationId++),
      indicator_id: r.indicator_id,
      period: r.period,
      geo: r.geo,
      dims: r.dims,
      value_num: r.value_num,
      value_text: r.value_text,
      unit: r.unit,
      batch_id: id,
      created_at,
    });
  }
  return { batch_id: id, status, row_ok: rows.length, row_err: errors.length, errors };
}

importText("trd_sample.csv", sampleCsv);
importText("trd_demo.csv", makeDemoCsv());

function withStats(i: Indicator): Indicator {
  const own = observations.filter((o) => o.indicator_id === i.id);
  return {
    ...i,
    obs_count: own.length,
    latest_period: own.reduce<string | null>((m, o) => (m === null || o.period > m ? o.period : m), null),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, code: ErrorCode, params: ErrorParams = {}) => json(errorBody(code, params), status);

const text = (q: URLSearchParams, k: string) => q.get(k)?.trim() || null;
function int(raw: string | null, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? Math.min(n, max) : fallback;
}

async function handle(method: string, url: URL, body: BodyInit | null | undefined): Promise<Response> {
  const path = url.pathname;
  const q = url.searchParams;

  if (method === "GET" && path === "/api/health") return json({ ok: true, db: "ok", vector: true, embedding_dims: 1536 });
  if (method === "GET" && path === "/api/clusters") return json({ items: clusters });

  if (method === "GET" && path === "/api/indicators") {
    const phase = text(q, "phase");
    const cluster = text(q, "cluster");
    const items = indicators
      .filter((i) => (!phase || i.phase === phase) && (!cluster || i.cluster_code === cluster))
      .map((i) => {
        const { spec_json: _spec, ...rest } = withStats(i);
        void _spec;
        return rest;
      });
    return json({ items });
  }

  const detail = path.match(/^\/api\/indicators\/([^/]+)$/);
  if (method === "GET" && detail) {
    const id = decodeURIComponent(detail[1]);
    const found = indicators.find((i) => i.id === id);
    return found ? json(withStats(found)) : fail(404, "NOT_FOUND", { resource: "indicator", id });
  }

  if (method === "GET" && path === "/api/observations") {
    const f = Object.fromEntries(
      ["indicator_id", "period", "period_from", "period_to", "geo", "batch_id"].map((k) => [k, text(q, k)]),
    );
    const limit = int(q.get("limit"), 100, 1, OBSERVATION_LIMIT_MAX);
    const offset = int(q.get("offset"), 0, 0);
    const matched = observations
      .filter(
        (o) =>
          (!f.indicator_id || o.indicator_id === f.indicator_id) &&
          (!f.period || o.period === f.period) &&
          (!f.period_from || o.period >= f.period_from) &&
          (!f.period_to || o.period.slice(0, f.period_to.length) <= f.period_to) &&
          (!f.geo || o.geo === f.geo) &&
          (!f.batch_id || o.batch_id === f.batch_id),
      )
      .sort((a, b) => b.period.localeCompare(a.period) || Number(b.id) - Number(a.id));
    return json({ items: matched.slice(offset, offset + limit), total: matched.length, limit, offset });
  }

  if (method === "POST" && path === "/api/import/csv") {
    const file = body instanceof FormData ? body.get("file") : null;
    if (!file || typeof file === "string") return fail(400, "FILE_REQUIRED");
    const result = importText(file.name || "upload.csv", await file.text());
    return "fileError" in result ? fail(400, result.fileError.code, result.fileError.params) : json(result);
  }

  if (method === "GET" && path === "/api/import/batches") {
    return json({ items: [...batches].reverse().slice(0, 50) });
  }

  if (method === "GET" && path === "/api/stats") {
    const withData = new Set(observations.map((o) => o.indicator_id));
    const phase1 = indicators.filter((i) => i.phase === "phase1");
    const latest = batches.at(-1);
    const clusterStats: ClusterStats[] = clusters.map((c) => {
      const own = indicators.filter((i) => i.cluster_code === c.code);
      return {
        code: c.code,
        name: c.name,
        phase1: own.filter((i) => i.phase === "phase1").length,
        phase1_with_data: own.filter((i) => i.phase === "phase1" && withData.has(i.id)).length,
        later: own.filter((i) => i.phase !== "phase1").length,
        observations: observations.filter((o) => own.some((i) => i.id === o.indicator_id)).length,
      };
    });
    const stats: Stats = {
      indicators: {
        total: indicators.length,
        phase1: phase1.length,
        phase1_with_data: phase1.filter((i) => withData.has(i.id)).length,
      },
      observations: {
        total: observations.length,
        latest_period: observations.reduce<string | null>((m, o) => (m === null || o.period > m ? o.period : m), null),
      },
      clusters: clusterStats,
      latest_batch: latest
        ? { id: latest.id, filename: latest.filename, status: latest.status, row_ok: latest.row_ok, row_err: latest.row_err, created_at: latest.created_at }
        : null,
    };
    return json(stats);
  }

  return fail(404, "NOT_FOUND", { resource: "route", id: `${method} ${path}` });
}

/** 与 fetch 同签名；请求在内存里处理，带一点延迟以便看到加载状态 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://demo.local");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, LATENCY_MS);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
  return handle((init?.method ?? "GET").toUpperCase(), url, init?.body);
}
