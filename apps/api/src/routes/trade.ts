import type { Context, Hono } from "hono";
import type { AppEnv } from "../env";
import { AppError, textParam } from "../errors";
import {
  getTradeCoverageMatrix,
  getTradeOverview,
  getTradePeriodsMeta,
  importTradeBatch,
  listTradeBatches,
  type TradeFileInput,
} from "../trade";

function isFileLike(v: unknown): v is File {
  return Boolean(v && typeof v === "object" && "arrayBuffer" in v && typeof (v as File).arrayBuffer === "function");
}

async function readTradeMultipart(c: Context<AppEnv>): Promise<{
  rawManifest: string | null;
  file: TradeFileInput | null;
  emptyEvidences: TradeFileInput[];
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

  return { rawManifest, file, emptyEvidences };
}

export function tradeRoutes(app: Hono<AppEnv>) {
  app.post("/api/trade/import", async (c) => {
    const parsed = await readTradeMultipart(c);
    const failHeader = c.req.header("x-test-fail-before-publish") === "1";
    const result = await importTradeBatch(c.get("db"), {
      ...parsed,
      maxRows: c.get("importMaxRows"),
      failBeforePublishCommit: failHeader,
    });
    return c.json(result);
  });

  app.get("/api/trade/overview", async (c) => {
    const period = textParam(c.req.query("period"));
    const dictVersion = textParam(c.req.query("dictVersion"));
    const overview = await getTradeOverview(c.get("db"), { period, dictVersion });
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
    const list = await listTradeBatches(c.get("db"), { dictVersion, month, flow, grouping });
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
