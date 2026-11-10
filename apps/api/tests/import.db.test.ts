import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, OBSERVATION_INSERT_CHUNK_SIZE } from "../src/app";
import { createSql } from "../src/db";
import type { Sql } from "../src/db";

// Integration tests for POST /api/import/csv against a real Postgres: by default
// the local Docker DB from `npm run dev:db`, or TEST_DATABASE_URL. Skipped when
// no database is reachable. Everything runs in a throwaway schema (created from
// sql/001_init.sql and dropped afterwards), so existing data is never touched.
const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://mdes:mdes@127.0.0.1:5433/mdes";
const schema = `import_test_${process.pid}_${Date.now()}`;
const initSql = readFileSync(new URL("../sql/001_init.sql", import.meta.url), "utf8");
const sampleCsv = readFileSync(new URL("../../../data/samples/trd_sample.csv", import.meta.url), "utf8");

const HEADER = "indicator_id,period,geo,value_num,unit,value_text,dims";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ImportResponse = {
  batch_id: string | null;
  status: string;
  row_ok: number;
  row_err: number;
  errors: { line: number; message: string }[];
};

async function isReachable(url: string) {
  const probe = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

const reachable = await isReachable(baseUrl);
if (!reachable) {
  console.warn(`Skipping import DB tests: no Postgres at ${baseUrl.replace(/:[^:@/]*@/, ":***@")} (run \`npm run dev:db\`).`);
}

function generatedCsv(count: number, periodOf: (i: number) => string = () => "2024-01") {
  const lines = [HEADER];
  for (let i = 0; i < count; i++) {
    lines.push(`TRD-001,${periodOf(i)},CN,${i},亿元,,"{""seq"":${i}}"`);
  }
  return lines.join("\n");
}

describe.skipIf(!reachable)("POST /api/import/csv (Postgres)", () => {
  // Both clients see only the test schema (plus public, for the vector type).
  const schemaUrl = new URL(baseUrl);
  schemaUrl.searchParams.set("search_path", `${schema},public`);

  let db: Sql; // setup + assertions
  let sql: Sql; // the app's client, configured like the Worker (max: 1)
  let app: ReturnType<typeof createApp>;

  const postJson = (csvText: string, filename = "test.csv") =>
    app.request("/api/import/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename, csvText }),
    });

  const counts = async () => {
    const [row] = await db<{ batches: number; observations: number }[]>`
      select
        (select count(*)::int from import_batch) as batches,
        (select count(*)::int from observation) as observations
    `;
    return row;
  };

  beforeAll(async () => {
    db = postgres(schemaUrl.toString(), { max: 1, onnotice: () => {} });
    await db.unsafe(`create schema "${schema}"`);
    const [{ current_schema }] = await db<{ current_schema: string }[]>`select current_schema()`;
    expect(current_schema).toBe(schema);
    await db.unsafe(initSql);

    await db`insert into indicator_cluster (code, name) values ('TRD', 'Trade')`;
    const ids = ["TRD-001", "TRD-002", "TRD-005", "TRD-006", "TRD-007"];
    await db`insert into indicator ${db(ids.map((id) => ({ id, cluster_code: "TRD", name: id })))}`;

    sql = createSql(schemaUrl.toString(), 1);
    app = createApp(async (c, next) => {
      c.set("sql", sql);
      c.set("embeddingDims", 1536);
      c.set("importMaxRows", 5000);
      await next();
    });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 2 });
    await db?.unsafe(`drop schema if exists "${schema}" cascade`);
    await db?.end({ timeout: 2 });
  });

  beforeEach(async () => {
    await db.unsafe(`truncate "${schema}".observation, "${schema}".import_batch restart identity`);
  });

  it("imports the TRD sample (README step 2) with dims stored as jsonb objects", async () => {
    const form = new FormData();
    form.append("file", new File([sampleCsv], "trd_sample.csv", { type: "text/csv" }));
    const res = await app.request("/api/import/csv", { method: "POST", body: form });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResponse;
    expect(body).toEqual({
      batch_id: expect.stringMatching(UUID),
      status: "completed",
      row_ok: 10,
      row_err: 0,
      errors: [],
    });

    const batches = await db`select id, filename, status, row_ok, row_err, errors_json from import_batch`;
    expect(batches).toEqual([
      { id: body.batch_id, filename: "trd_sample.csv", status: "completed", row_ok: 10, row_err: 0, errors_json: [] },
    ]);

    const stored = await db`
      select batch_id, jsonb_typeof(dims) as dims_type from observation order by id
    `;
    expect(stored).toHaveLength(10);
    expect(stored.every((r) => r.batch_id === body.batch_id && r.dims_type === "object")).toBe(true);

    const obs = (await (await app.request("/api/observations?indicator_id=TRD-001")).json()) as {
      items: Record<string, unknown>[];
    };
    expect(
      obs.items.map(({ period, geo, dims, value_num, value_text, unit }) => ({
        period, geo, dims, value_num, value_text, unit,
      })),
    ).toEqual([
      { period: "2024-03", geo: "CN", dims: { trade_type: "import" }, value_num: 125.8, value_text: null, unit: "亿元" },
      { period: "2024-02", geo: "CN", dims: { trade_type: "import" }, value_num: 131.2, value_text: null, unit: "亿元" },
      { period: "2024-01", geo: "CN", dims: { trade_type: "import" }, value_num: 128.5, value_text: null, unit: "亿元" },
    ]);
  });

  it("imports a CSV at IMPORT_MAX_ROWS across several chunked inserts", async () => {
    const res = await postJson(generatedCsv(5000), "max.csv");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResponse;
    expect(body).toMatchObject({ status: "completed", row_ok: 5000, row_err: 0, errors: [] });

    const [summary] = await db`
      select
        count(*)::int as n,
        count(distinct dims->>'seq')::int as distinct_rows,
        count(*) filter (where batch_id = ${body.batch_id})::int as in_batch,
        count(*) filter (where jsonb_typeof(dims) = 'object')::int as object_dims,
        count(*) filter (where (dims->>'seq')::int = value_num)::int as aligned
      from observation
    `;
    expect(summary).toEqual({ n: 5000, distinct_rows: 5000, in_batch: 5000, object_dims: 5000, aligned: 5000 });
  });

  it("keeps the status semantics for partial, all-unknown and unparseable CSVs", async () => {
    const partial = await postJson(`${HEADER}\nTRD-001,2024-01,CN,1,,,\nXXX-999,2024-01,CN,2,,,`);
    expect(partial.status).toBe(200);
    expect(await partial.json()).toMatchObject({
      status: "completed_with_errors",
      row_ok: 1,
      row_err: 1,
      errors: [{ line: 3, message: "unknown indicator_id: XXX-999" }],
    });

    const unknown = await postJson(`${HEADER}\nXXX-1,2024-01,CN,1,,,`);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({
      batch_id: expect.stringMatching(UUID),
      status: "failed",
      row_ok: 0,
      row_err: 1,
    });

    const unparseable = await postJson(`${HEADER}\nTRD-001,2024-01,CN,abc,,,`);
    expect(unparseable.status).toBe(400);
    expect(await unparseable.json()).toEqual({
      batch_id: null,
      status: "failed",
      row_ok: 0,
      row_err: 1,
      errors: [{ line: 2, message: "invalid value_num: abc" }],
    });

    // The partial and all-unknown imports each record a batch; the 400 does not.
    expect(await db`select status, row_ok, row_err from import_batch order by created_at`).toEqual([
      { status: "completed_with_errors", row_ok: 1, row_err: 1 },
      { status: "failed", row_ok: 0, row_err: 1 },
    ]);
    expect(await counts()).toEqual({ batches: 2, observations: 1 });
  });

  it("leaves no batch row and no observations when an insert fails mid-import", async () => {
    // Make the database reject the last row, after two full chunks were written.
    await db.unsafe(`
      create function inject_failure() returns trigger language plpgsql as $$
      begin
        if new.period = 'FAIL' then raise exception 'injected failure'; end if;
        return new;
      end $$;
      create trigger inject_failure before insert on observation
        for each row execute function inject_failure();
    `);
    const rows = 2 * OBSERVATION_INSERT_CHUNK_SIZE + 1;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await postJson(generatedCsv(rows, (i) => (i === rows - 1 ? "FAIL" : "2024-01")));

      expect(res.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: "injected failure" }));
    } finally {
      consoleError.mockRestore();
      await db.unsafe(`drop trigger inject_failure on observation; drop function inject_failure()`);
    }

    expect(await counts()).toEqual({ batches: 0, observations: 0 });
    // The id sequence is not transactional: it proves the earlier rows really
    // were inserted before the failure, and then rolled back.
    const [{ last_value }] = await db`select last_value::int from observation_id_seq`;
    expect(last_value).toBeGreaterThanOrEqual(rows);
  });
});
