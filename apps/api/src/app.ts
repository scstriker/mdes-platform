import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { Sql } from "./db";
import { checkHealth } from "./db";
import { parseObservationCsv } from "./csv";

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

    const valid = [];
    const errors = [...parsed.errors];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      if (!knownSet.has(row.indicator_id)) {
        errors.push({
          line: i + 2,
          message: `unknown indicator_id: ${row.indicator_id}`,
        });
        continue;
      }
      valid.push(row);
    }

    const status =
      valid.length === 0
        ? "failed"
        : errors.length > 0
          ? "completed_with_errors"
          : "completed";

    const [batch] = await sql<{ id: string }[]>`
      insert into import_batch (filename, status, row_ok, row_err, errors_json)
      values (
        ${filename},
        ${status},
        ${valid.length},
        ${errors.length},
        ${sql.json(errors)}
      )
      returning id
    `;

    if (valid.length > 0) {
      for (const row of valid) {
        await sql`
          insert into observation (
            indicator_id, period, geo, dims, value_num, value_text, unit, batch_id
          ) values (
            ${row.indicator_id},
            ${row.period},
            ${row.geo},
            ${sql.json(row.dims)},
            ${row.value_num},
            ${row.value_text},
            ${row.unit},
            ${batch.id}
          )
        `;
      }
    }

    return c.json({
      batch_id: batch.id,
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
