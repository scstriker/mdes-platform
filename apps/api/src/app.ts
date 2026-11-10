import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { Sql } from "./db";
import { checkHealth } from "./db";
import { parseObservationCsv } from "./csv";
import type { CsvRow } from "./csv";

export type AppEnv = {
  Bindings: {
    HYPERDRIVE?: { connectionString: string };
    DATABASE_URL?: string;
    EMBEDDING_DIMS?: string;
    IMPORT_MAX_ROWS?: string;
  };
  Variables: {
    sql: Sql;
    embeddingDims: number;
    importMaxRows: number;
  };
};

// Observations per multi-row INSERT. Each row binds 8 parameters, so a chunk
// binds 8,000 — far below Postgres's 65,535 limit — and a CSV at the default
// IMPORT_MAX_ROWS (5,000) needs 5 INSERT statements instead of 5,000.
export const OBSERVATION_INSERT_CHUNK_SIZE = 1000;

export function createApp(bindDeps: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();

  app.use("*", cors());
  app.use("*", bindDeps);

  app.get("/api/health", async (c) => {
    const sql = c.get("sql");
    try {
      const h = await checkHealth(sql);
      return c.json({
        ok: true,
        ...h,
        embedding_dims: c.get("embeddingDims"),
      });
    } catch (err) {
      return c.json(
        {
          ok: false,
          db: "error",
          vector: false,
          error: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  });

  app.get("/api/clusters", async (c) => {
    const sql = c.get("sql");
    const items = await sql`
      select code, name, subsystem_id
      from indicator_cluster
      order by code
    `;
    return c.json({ items });
  });

  app.get("/api/indicators", async (c) => {
    const sql = c.get("sql");
    const phase = c.req.query("phase");
    const cluster = c.req.query("cluster");

    // Keep list payloads small for Workers; full spec is on detail endpoint.
    const items = phase && cluster
      ? await sql`
          select id, cluster_code, name, phase, update_freq, source_kind, phase_scope
          from indicator
          where phase = ${phase} and cluster_code = ${cluster}
          order by id
        `
      : phase
        ? await sql`
            select id, cluster_code, name, phase, update_freq, source_kind, phase_scope
            from indicator
            where phase = ${phase}
            order by id
          `
        : cluster
          ? await sql`
              select id, cluster_code, name, phase, update_freq, source_kind, phase_scope
              from indicator
              where cluster_code = ${cluster}
              order by id
            `
          : await sql`
              select id, cluster_code, name, phase, update_freq, source_kind, phase_scope
              from indicator
              order by id
            `;
    return c.json({ items });
  });

  app.get("/api/indicators/:id", async (c) => {
    const sql = c.get("sql");
    const id = c.req.param("id");
    const rows = await sql`
      select id, cluster_code, name, phase, update_freq, source_kind, phase_scope, spec_json
      from indicator where id = ${id}
    `;
    if (!rows[0]) return c.json({ error: "not found" }, 404);
    return c.json(rows[0]);
  });

  app.post("/api/import/csv", async (c) => {
    const sql = c.get("sql");
    const maxRows = c.get("importMaxRows");

    let filename = "upload.csv";
    let csvText = "";

    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const body = await c.req.parseBody();
      const file = body["file"];
      if (file && typeof file === "object" && "text" in file) {
        filename = file.name || filename;
        csvText = await file.text();
      } else if (typeof body["csvText"] === "string") {
        csvText = body["csvText"];
        if (typeof body["filename"] === "string") filename = body["filename"];
      }
    } else {
      const body = await c.req.json<{ filename?: string; csvText?: string | string[] }>();
      filename = body.filename || filename;
      const raw = body.csvText;
      csvText = Array.isArray(raw) ? raw.join("\n") : raw || "";
    }

    csvText = String(csvText);
    if (!csvText.trim()) {
      return c.json({ error: "csvText/file required" }, 400);
    }

    const parsed = parseObservationCsv(csvText, maxRows);
    if (parsed.rows.length === 0 && parsed.errors.length > 0) {
      return c.json(
        {
          batch_id: null,
          status: "failed",
          row_ok: 0,
          row_err: parsed.errors.length,
          errors: parsed.errors,
        },
        400,
      );
    }

    const known = await sql<{ id: string }[]>`select id from indicator`;
    const knownSet = new Set(known.map((r) => r.id));

    const valid: CsvRow[] = [];
    const errors = [...parsed.errors];
    for (const row of parsed.rows) {
      if (!knownSet.has(row.indicator_id)) {
        errors.push({
          line: row.line,
          message: `unknown indicator_id: ${row.indicator_id}`,
        });
        continue;
      }
      valid.push(row);
    }
    // Report errors in file order, not grouped by which check failed.
    errors.sort((a, b) => a.line - b.line);

    const status =
      valid.length === 0
        ? "failed"
        : errors.length > 0
          ? "completed_with_errors"
          : "completed";

    // All-or-nothing: if any insert fails, the rollback removes the batch row
    // and every observation already written for it.
    const batchId = await sql.begin(async (tx) => {
      const [batch] = await tx<{ id: string }[]>`
        insert into import_batch (filename, status, row_ok, row_err, errors_json)
        values (
          ${filename},
          ${status},
          ${valid.length},
          ${errors.length},
          ${tx.json(errors)}
        )
        returning id
      `;

      for (let i = 0; i < valid.length; i += OBSERVATION_INSERT_CHUNK_SIZE) {
        const chunk = valid.slice(i, i + OBSERVATION_INSERT_CHUNK_SIZE).map((row) => ({
          ...row,
          // Explicitly jsonb so dims is stored as an object; passing a JSON
          // string here would store a double-encoded jsonb string instead.
          dims: tx.json(row.dims),
          batch_id: batch.id,
        }));
        await tx`
          insert into observation ${tx(
            chunk,
            "indicator_id",
            "period",
            "geo",
            "dims",
            "value_num",
            "value_text",
            "unit",
            "batch_id",
          )}
        `;
      }

      return batch.id;
    });

    return c.json({
      batch_id: batchId,
      status,
      row_ok: valid.length,
      row_err: errors.length,
      errors,
    });
  });

  app.get("/api/import/batches", async (c) => {
    const sql = c.get("sql");
    const items = await sql`
      select id, filename, status, row_ok, row_err, errors_json, created_at
      from import_batch
      order by created_at desc
      limit 50
    `;
    return c.json({ items });
  });

  app.get("/api/observations", async (c) => {
    const sql = c.get("sql");
    const indicatorId = c.req.query("indicator_id");
    const period = c.req.query("period");
    const limit = Math.min(Number(c.req.query("limit") || 100), 500);

    const items = await sql`
      select
        id, indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, created_at
      from observation
      where (${indicatorId ?? null}::text is null or indicator_id = ${indicatorId ?? null})
        and (${period ?? null}::text is null or period = ${period ?? null})
      order by period desc, id desc
      limit ${limit}
    `;
    return c.json({ items });
  });

  return app;
}
