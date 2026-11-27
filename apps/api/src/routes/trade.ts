import type { Context, Hono } from "hono";
import type { AppEnv } from "../env";
import { AppError, textParam } from "../errors";
import {
  getTradeCoverageMatrix,
  getTradeOverview,
  getTradePeriodsMeta,
  importTradeBatch,
  importTradeBulkBatch,
  listTradeBatches,
  publishAllReadyTradeMonths,
  type TradeFileInput,
} from "../trade";

function isFileLike(v: unknown): v is File {
  return Boolean(v && typeof v === "object" && "arrayBuffer" in v && typeof (v as File).arrayBuffer === "function");
}

function parseBoolField(raw: unknown, defaultValue: boolean): boolean {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string") return defaultValue;
  const norm = val.trim().toLowerCase();
  if (norm === "1" || norm === "true" || norm === "yes") return true;
  if (norm === "0" || norm === "false" || norm === "no") return false;
  return defaultValue;
}

async function readTradeMultipart(c: Context<AppEnv>): Promise<{
  rawManifest: string | null;
  file: TradeFileInput | null;
  emptyEvidences: TradeFileInput[];
  deferPublishField: unknown;
}> {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new AppError(400, "TRADE_MANIFEST_INVALID", { field: "content-type", reason: "multipart/form-data required" });
  }
  const body = await c.req.parseBody({ all: true });

  let rawManifest: string | null = null;
  const manifestField = Array.isArray(body["manifest"]) ? body["manifest"][0] : body["manifest"];
  if (typeof manifestField === "string") {
    rawManifest = manifestField;
  } else if (isFileLike(manifestField)) {
    rawManifest = await manifestField.text();
  }

  let file: TradeFileInput | null = null;
  const fileField = Array.isArray(body["file"]) ? body["file"][0] : body["file"];
  if (isFileLike(fileField)) {
    file = {
      filename: fileField.name || "customs.csv",
      bytes: new Uint8Array(await fileField.arrayBuffer()),
    };
  }

  const emptyEvidences: TradeFileInput[] = [];
  const rawEv = body["emptyEvidence"];
  const evList = Array.isArray(rawEv) ? rawEv : rawEv !== undefined ? [rawEv] : [];
  for (const item of evList) {
    if (isFileLike(item)) {
      emptyEvidences.push({
        filename: item.name || "empty_evidence.png",
        bytes: new Uint8Array(await item.arrayBuffer()),
      });
    }
  }

  return { rawManifest, file, emptyEvidences, deferPublishField: body["deferPublish"] };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function isLoopbackHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * 写路由入口统一门禁（遵循 docs/TECH_SPEC.md）：
 * - 公开部署默认关闭写入（wrangler.toml 不开启 ENABLE_TRADE_WRITE），直接返回 403 TRADE_WRITE_DISABLED；
 * - 若配置了 TRADE_WRITE_TOKEN，则强制校验 X-Admin-Token 或 Authorization: Bearer 令牌；
 * - 否则仅在显式开启 ENABLE_TRADE_WRITE=1 且请求来自本机回环（localhost/127.0.0.1/::1）时放行。
 */
export function requireTradeWriteAccess(c: Context<AppEnv>): void {
  const writeFlag = String(c.env.ENABLE_TRADE_WRITE ?? "")
    .trim()
    .toLowerCase();
  const writeEnabled = writeFlag === "1" || writeFlag === "true";
  const configuredToken = String(c.env.TRADE_WRITE_TOKEN ?? "").trim();

  if (!writeEnabled && !configuredToken) {
    throw new AppError(403, "TRADE_WRITE_DISABLED", {
      reason: "write endpoints disabled by default; set ENABLE_TRADE_WRITE=1 in local admin environment",
    });
  }

  if (configuredToken) {
    const authHeader = (c.req.header("authorization") || "").trim();
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() ?? "";
    const provided = (c.req.header("x-admin-token") || "").trim() || bearer;
    if (!provided || !timingSafeEqualStr(provided, configuredToken)) {
      throw new AppError(403, "TRADE_WRITE_DISABLED", {
        reason: "valid admin write token required",
      });
    }
    return;
  }

  if (!isLoopbackHost(c.req.url)) {
    throw new AppError(403, "TRADE_WRITE_DISABLED", {
      reason: "non-loopback write requires TRADE_WRITE_TOKEN",
    });
  }
}

export function tradeRoutes(app: Hono<AppEnv>) {
  app.post("/api/trade/import", async (c) => {
    requireTradeWriteAccess(c);
    const parsed = await readTradeMultipart(c);
    const hooksEnabled = c.env.ENABLE_TEST_HOOKS === "1";
    const failHeader = hooksEnabled && c.req.header("x-test-fail-before-publish") === "1";
    const preemptHeader = hooksEnabled && c.req.header("x-test-preempt-release-once") === "1";
    const rawDelayMs = hooksEnabled ? c.req.header("x-test-delay-before-import-commit-ms") : undefined;
    const delayBeforeCommitMs =
      rawDelayMs && Number.isFinite(Number.parseInt(rawDelayMs, 10)) && Number.parseInt(rawDelayMs, 10) > 0
        ? Math.min(2000, Number.parseInt(rawDelayMs, 10))
        : undefined;
    const deferPublish = parseBoolField(parsed.deferPublishField, false);
    const result = await importTradeBatch(c.get("db"), {
      rawManifest: parsed.rawManifest,
      file: parsed.file,
      emptyEvidences: parsed.emptyEvidences,
      maxRows: c.get("importMaxRows"),
      deferPublish,
      failBeforePublishCommit: failHeader,
      preemptReleaseOnce: preemptHeader,
      delayBeforeCommitMs,
    });
    return c.json(result);
  });

  app.post("/api/trade/import-bulk", async (c) => {
    requireTradeWriteAccess(c);
    const parsed = await readTradeMultipart(c);
    const deferPublish = parseBoolField(parsed.deferPublishField, true);
    const parseOptPositiveInt = (raw: string | undefined): number | undefined => {
      if (!raw) return undefined;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const hooksEnabled = c.env.ENABLE_TEST_HOOKS === "1";
    const rawDelayMs = hooksEnabled ? parseOptPositiveInt(c.req.header("x-test-delay-before-import-commit-ms")) : undefined;
    const result = await importTradeBulkBatch(c.get("db"), {
      rawManifest: parsed.rawManifest,
      file: parsed.file,
      emptyEvidences: parsed.emptyEvidences,
      maxRows: c.get("importMaxRows"),
      deferPublish,
      failAfterMonthIndex: hooksEnabled
        ? parseOptPositiveInt(c.req.header("x-test-fail-bulk-after-month"))
        : undefined,
      failDuringOversizedMonth: hooksEnabled && c.req.header("x-test-fail-bulk-oversized-month") === "1",
      maxBatchStmtsOverride: hooksEnabled
        ? parseOptPositiveInt(c.req.header("x-test-bulk-max-stmts"))
        : undefined,
      delayBeforeCommitMs: rawDelayMs ? Math.min(2000, rawDelayMs) : undefined,
    });
    return c.json(result);
  });

  app.post("/api/trade/publish", async (c) => {
    requireTradeWriteAccess(c);
    let dictVersion: string | null = textParam(c.req.query("dictVersion")) ?? null;
    const rawBody = await c.req.text();
    if (rawBody.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new AppError(400, "TRADE_MANIFEST_INVALID", {
          field: "body",
          reason: "invalid JSON body",
        });
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new AppError(400, "TRADE_MANIFEST_INVALID", {
          field: "body",
          reason: "JSON body must be an object",
        });
      }
      const body = parsed as Record<string, unknown>;
      if (body.dictVersion !== undefined && body.dictVersion !== null) {
        if (typeof body.dictVersion !== "string" || !body.dictVersion.trim()) {
          throw new AppError(400, "TRADE_MANIFEST_INVALID", {
            field: "dictVersion",
            reason: "dictVersion must be a non-empty string",
          });
        }
        dictVersion = body.dictVersion.trim();
      }
    }
    const hooksEnabled = c.env.ENABLE_TEST_HOOKS === "1";
    const rawFailStage = hooksEnabled ? c.req.header("x-test-fail-publish-stage-after") : undefined;
    const failAfterStageBatch =
      rawFailStage && Number.isFinite(Number.parseInt(rawFailStage, 10)) && Number.parseInt(rawFailStage, 10) > 0
        ? Number.parseInt(rawFailStage, 10)
        : undefined;
    const rawStageThreshold = hooksEnabled ? c.req.header("x-test-publish-stage-threshold") : undefined;
    const stageThresholdOverride =
      rawStageThreshold &&
      Number.isFinite(Number.parseInt(rawStageThreshold, 10)) &&
      Number.parseInt(rawStageThreshold, 10) >= 0
        ? Number.parseInt(rawStageThreshold, 10)
        : undefined;
    const result = await publishAllReadyTradeMonths(c.get("db"), dictVersion, {
      failAfterStageBatch,
      stageThresholdOverride,
    });
    return c.json(result);
  });

  app.get("/api/trade/overview", async (c) => {
    const period = textParam(c.req.query("period"));
    const dictVersion = textParam(c.req.query("dictVersion"));
    const releaseId = textParam(c.req.query("releaseId"));
    const overview = await getTradeOverview(c.get("db"), { period, dictVersion, releaseId });
    return c.json(overview);
  });

  app.get("/api/trade/periods", async (c) => {
    const dictVersion = textParam(c.req.query("dictVersion"));
    const meta = await getTradePeriodsMeta(c.get("db"), dictVersion);
    return c.json(meta);
  });

  app.get("/api/trade/batches", async (c) => {
    const dictVersion = textParam(c.req.query("dictVersion"));
    const month = textParam(c.req.query("month"));
    const flow = textParam(c.req.query("flow"));
    const grouping = textParam(c.req.query("grouping"));
    const rawBatchIds = textParam(c.req.query("batchIds"));
    const batchIds = rawBatchIds
      ? rawBatchIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const list = await listTradeBatches(c.get("db"), { dictVersion, month, flow, grouping, batchIds });
    return c.json(list);
  });

  app.get("/api/trade/coverage", async (c) => {
    const dictVersion = textParam(c.req.query("dictVersion"));
    const year = textParam(c.req.query("year"));
    const fromMonth = textParam(c.req.query("fromMonth"));
    const toMonth = textParam(c.req.query("toMonth"));
    const month = textParam(c.req.query("month"));
    const hs8 = textParam(c.req.query("hs8"));
    const matrix = await getTradeCoverageMatrix(c.get("db"), {
      dictVersion,
      year,
      fromMonth,
      toMonth,
      month,
      hs8,
    });
    return c.json(matrix);
  });
}
