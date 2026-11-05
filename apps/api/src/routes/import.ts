import type { Context, Hono } from "hono";
import { AppError } from "../errors";
import type { AppEnv } from "../env";
import { importObservations } from "../import";

/** 读取上传：multipart 的 file（或 csvText 字段），或 JSON { filename, csvText } */
async function readUpload(c: Context<AppEnv>): Promise<{ filename: string; csvText: string }> {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (file && typeof file === "object" && "text" in file) {
      return { filename: file.name || "upload.csv", csvText: await file.text() };
    }
    if (typeof body["csvText"] === "string") {
      return {
        filename: typeof body["filename"] === "string" ? body["filename"] : "upload.csv",
        csvText: body["csvText"],
      };
    }
    throw new AppError(400, "FILE_REQUIRED");
  }
  let body: { filename?: unknown; csvText?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "FILE_REQUIRED");
  }
  const raw = body?.csvText;
  const csvText = Array.isArray(raw) ? raw.join("\n") : typeof raw === "string" ? raw : null;
  if (csvText === null) throw new AppError(400, "FILE_REQUIRED");
  return { filename: typeof body.filename === "string" && body.filename ? body.filename : "upload.csv", csvText };
}

export function importRoutes(app: Hono<AppEnv>) {
  app.post("/api/import/csv", async (c) => {
    const { filename, csvText } = await readUpload(c);
    const result = await importObservations(c.get("sql"), { filename, csvText, maxRows: c.get("importMaxRows") });
    return c.json(result);
  });

  app.get("/api/import/batches", async (c) => {
    const items = await c.get("sql")`
      select id, filename, status, row_ok, row_err, errors_json, created_at
      from import_batch
      order by created_at desc
      limit 50
    `;
    return c.json({ items });
  });
}
