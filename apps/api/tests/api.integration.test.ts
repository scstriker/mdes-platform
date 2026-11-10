import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  ImportBatch,
  ImportResult,
  Indicator,
  IndicatorListItem,
  ObservationPage,
  Stats,
} from "@mdes/shared";
import { csvUpload, SAMPLE_CSV, startHarness, type Harness } from "./helpers/harness";

/**
 * API 集成测试：真实 Worker 跑在 Miniflare（workerd + 本地 D1）里，每个用例前清空观测值与批次。
 */
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, 60_000);
afterAll(() => h?.dispose());
beforeEach(() => h.reset());

const json = async <T>(path: string, init?: RequestInit) => {
  const res = await h.request(path, init);
  return { status: res.status, body: (await res.json()) as T };
};
const importSample = () => json<ImportResult>("/api/import/csv", csvUpload(SAMPLE_CSV, "trd_sample.csv"));
const count = async (table: string, where = "") =>
  Number((await h.query<{ n: number }>(`select count(*) as n from ${table} ${where}`))[0].n);

describe("GET /api/health", () => {
  it("AC-004：数据库可用", async () => {
    const { status, body } = await json<{ ok: boolean; db: string }>("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, db: "ok" });
  });

  it("AC-004：知识库预留表可写入（本轮不含向量）", async () => {
    await h.sql([
      "insert into document (id, title) values ('doc-1', '测试文档')",
      "insert into document_chunk (document_id, chunk_index, content) values ('doc-1', 0, '第一段')",
    ]);
    expect(await count("document_chunk", "where document_id = 'doc-1'")).toBe(1);
    const cols = await h.query<{ name: string }>("select name from pragma_table_info('document_chunk')");
    expect(cols.map((c) => c.name)).not.toContain("embedding");
  });
});

describe("数据库不可用", () => {
  let broken: Harness;
  beforeAll(async () => {
    broken = await startHarness({ withDb: false });
  }, 60_000);
  afterAll(() => broken?.dispose());

  it("健康检查返回 503 与统一错误体", async () => {
    const res = await broken.request("/api/health");
    const body = (await res.json()) as ApiErrorBody & { ok: boolean };
    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("意外异常：500 INTERNAL_ERROR，不暴露内部细节", async () => {
    const res = await broken.request("/api/indicators");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "internal server error", params: {} } });
  });
});

describe("GET /api/indicators", () => {
  it("AC-001：一期 30 项，带 obs_count / latest_period / automation", async () => {
    const { body } = await json<{ items: IndicatorListItem[] }>("/api/indicators?phase=phase1");
    expect(body.items).toHaveLength(30);
    for (const item of body.items) {
      expect(item.obs_count).toBe(0);
      expect(item.latest_period).toBeNull();
      expect(typeof item.automation).toBe("string");
      expect(item).not.toHaveProperty("spec_json");
    }
  });

  it("全部 99 项；按簇筛选", async () => {
    expect((await json<{ items: unknown[] }>("/api/indicators")).body.items).toHaveLength(99);
    const trd = (await json<{ items: IndicatorListItem[] }>("/api/indicators?cluster=TRD")).body.items;
    expect(trd.length).toBeGreaterThan(0);
    expect(trd.every((i) => i.cluster_code === "TRD")).toBe(true);
  });

  it("导入后统计字段随之更新", async () => {
    await importSample();
    const { body } = await json<{ items: IndicatorListItem[] }>("/api/indicators?cluster=TRD");
    const byId = Object.fromEntries(body.items.map((i) => [i.id, i]));
    expect(byId["TRD-001"]).toMatchObject({ obs_count: 3, latest_period: "2024-03", automation: "全自动" });
    expect(byId["TRD-005"]).toMatchObject({ obs_count: 3, latest_period: "2024-01" });
    expect(byId["TRD-008"]).toMatchObject({ phase: "later", obs_count: 0, latest_period: null });
  });

  it("详情带 spec_json 对象与统计字段；不存在时 404 NOT_FOUND", async () => {
    await importSample();
    const ok = await json<Indicator>("/api/indicators/TRD-001");
    expect(ok.body).toMatchObject({ id: "TRD-001", obs_count: 3, latest_period: "2024-03" });
    expect(ok.body.spec_json).toHaveProperty("definition");
    const miss = await json<ApiErrorBody>("/api/indicators/TRD-999");
    expect(miss.status).toBe(404);
    expect(miss.body.error).toEqual({
      code: "NOT_FOUND",
      message: "indicator not found: TRD-999",
      params: { resource: "indicator", id: "TRD-999" },
    });
  });
});

describe("POST /api/import/csv", () => {
  it("AC-002：样例导入 completed，10 行全部写入并带批次号", async () => {
    const { status, body } = await importSample();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "completed", row_ok: 10, row_err: 0, errors: [] });
    expect(await count("observation", `where batch_id = '${body.batch_id}'`)).toBe(10);
  });

  it("部分行失败：completed_with_errors，行错误带行号与错误码", async () => {
    const csv = [
      "indicator_id,period,value_num,dims",
      "TRD-001,2024-04,1,",
      "TRD-099,2024-04,1,",
      "TRD-001,2024-05,abc,",
      'TRD-001,2024-06,1,"{bad"',
    ].join("\n");
    const { status, body } = await json<ImportResult>("/api/import/csv", csvUpload(csv));
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "completed_with_errors", row_ok: 1, row_err: 3 });
    expect(body.errors).toEqual([
      { line: 3, code: "UNKNOWN_INDICATOR", params: { indicator_id: "TRD-099" } },
      { line: 4, code: "INVALID_VALUE_NUM", params: { value: "abc" } },
      { line: 5, code: "DIMS_INVALID_JSON", params: {} },
    ]);
    const batches = await json<{ items: ImportBatch[] }>("/api/import/batches");
    expect(batches.body.items[0].errors_json).toEqual(body.errors);
  });

  it("全部行失败：仍记录 failed 批次，返回 200，不写观测值", async () => {
    const { status, body } = await json<ImportResult>(
      "/api/import/csv",
      csvUpload("indicator_id,period,value_num\nTRD-099,2024,1\nTRD-098,2024,1"),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "failed", row_ok: 0, row_err: 2 });
    expect(body.batch_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await count("observation")).toBe(0);
    expect((await json<{ items: ImportBatch[] }>("/api/import/batches")).body.items).toHaveLength(1);
  });

  it("JSON 方式上传 { filename, csvText }", async () => {
    const { body } = await json<ImportResult>("/api/import/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "inline.csv", csvText: "indicator_id,period,value_num\nTRD-001,2024-07,1" }),
    });
    expect(body).toMatchObject({ status: "completed", row_ok: 1 });
    const batches = await json<{ items: ImportBatch[] }>("/api/import/batches");
    expect(batches.body.items[0].filename).toBe("inline.csv");
  });

  it("dims 存为 JSON、读出还原为对象；数值与文本值原样保留", async () => {
    await json("/api/import/csv", csvUpload('indicator_id,period,value_num,value_text,dims\nTRD-005,2024-02,1.5,,"{""partner"":""US""}"\nTRD-008,2024,,待论证,'));
    const page = (await json<ObservationPage>("/api/observations?period_from=2024")).body;
    const byIndicator = Object.fromEntries(page.items.map((o) => [o.indicator_id, o]));
    expect(byIndicator["TRD-005"]).toMatchObject({ dims: { partner: "US" }, value_num: 1.5, value_text: null });
    expect(byIndicator["TRD-008"]).toMatchObject({ dims: {}, value_num: null, value_text: "待论证" });
  });

  it.each([
    ["没有文件", { method: "POST", body: new FormData() }, "FILE_REQUIRED", {}],
    ["JSON 不合法", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }, "FILE_REQUIRED", {}],
    ["空文件", csvUpload(""), "EMPTY_CSV", {}],
    ["只有表头", csvUpload("indicator_id,period,value_num\n"), "EMPTY_CSV", {}],
    ["缺 period 列", csvUpload("indicator_id,value_num\nTRD-001,1"), "MISSING_HEADER", { header: "period" }],
  ] as const)("文件级错误（%s）：400 %s，不建批次", async (_, init, code, params) => {
    const { status, body } = await json<ApiErrorBody>("/api/import/csv", init as RequestInit);
    expect(status).toBe(400);
    expect(body.error.code).toBe(code);
    expect(body.error.params).toEqual(params);
    expect(typeof body.error.message).toBe("string");
    expect(await count("import_batch")).toBe(0);
  });

  it("超过行数上限：400 ROW_LIMIT_EXCEEDED", async () => {
    const small = await startHarness({ maxRows: 2, seed: false });
    try {
      const res = await small.request("/api/import/csv", csvUpload("indicator_id,period,value_num\nTRD-001,1,1\nTRD-001,2,1\nTRD-001,3,1"));
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error).toMatchObject({
        code: "ROW_LIMIT_EXCEEDED",
        params: { max: 2, actual: 3 },
      });
    } finally {
      await small.dispose();
    }
  }, 60_000);

  it("分块批量插入：每块一条语句，块大小 2、5 行时 1 条批次 + 3 条插入", async () => {
    const res = await h.post("/__test/chunks", { rows: 5, chunkSize: 2 });
    expect(await res.json()).toEqual({ statements: 4 });
    const csv = ["indicator_id,period,value_num", ...[1, 2, 3, 4, 5].map((m) => `TRD-001,2024-0${m},${m}`)].join("\n");
    const out = (await (await h.post("/__test/import", { csvText: csv, chunkSize: 2 })).json()) as { ok: boolean; result: ImportResult };
    expect(out.ok).toBe(true);
    expect(out.result.row_ok).toBe(5);
    expect(await count("observation")).toBe(5);
  });

  it("单事务：批量里任何一条失败都整体回滚，不留半批数据，也不留批次", async () => {
    const csv = ["indicator_id,period,value_num", ...[1, 2, 3, 4, 5].map((m) => `TRD-001,2024-0${m},${m}`)].join("\n");
    const out = (await (await h.post("/__test/import", { csvText: csv, chunkSize: 2, failAtEnd: true })).json()) as {
      ok: boolean;
      error: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/FOREIGN KEY/i);
    expect({ obs: await count("observation"), batches: await count("import_batch") }).toEqual({ obs: 0, batches: 0 });
  });

  it("5000 行一次导入", async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `TRD-001,P${String(i).padStart(4, "0")},${i}`);
    const started = Date.now();
    const { body } = await json<ImportResult>("/api/import/csv", csvUpload(`indicator_id,period,value_num\n${lines.join("\n")}`));
    expect(body).toMatchObject({ status: "completed", row_ok: 5000 });
    expect(await count("observation")).toBe(5000);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("GET /api/observations", () => {
  it("AC-003：按指标查询有多行，返回 total", async () => {
    await importSample();
    const { body } = await json<ObservationPage>("/api/observations?indicator_id=TRD-001");
    expect(body.total).toBe(3);
    expect(body.items.map((o) => o.period)).toEqual(["2024-03", "2024-02", "2024-01"]);
    expect(body).toMatchObject({ limit: 100, offset: 0 });
    expect(typeof body.items[0].id).toBe("string");
  });

  it("limit / offset 分页，total 不受分页影响", async () => {
    await importSample();
    const p1 = (await json<ObservationPage>("/api/observations?limit=4&offset=0")).body;
    const p3 = (await json<ObservationPage>("/api/observations?limit=4&offset=8")).body;
    expect(p1.total).toBe(10);
    expect(p1.items).toHaveLength(4);
    expect(p3.items).toHaveLength(2);
    expect(p3.total).toBe(10);
    const beyond = (await json<ObservationPage>("/api/observations?limit=4&offset=40")).body;
    expect(beyond).toMatchObject({ items: [], total: 10 });
  });

  it("期间范围：period_to 含以它为前缀的子期间", async () => {
    await importSample();
    const q = async (s: string) => (await json<ObservationPage>(`/api/observations?${s}`)).body;
    expect((await q("indicator_id=TRD-001&period_from=2024-02")).total).toBe(2);
    expect((await q("indicator_id=TRD-001&period_to=2024-02")).total).toBe(2);
    expect((await q("period_from=2024&period_to=2024")).total).toBe(10);
    expect((await q("period=2024")).total).toBe(2);
  });

  it("geo 与 batch_id 筛选（查看本批次数据）", async () => {
    const first = (await importSample()).body;
    await json<ImportResult>("/api/import/csv", csvUpload("indicator_id,period,geo,value_num\nTRD-001,2024-01,110000,5"));
    expect((await json<ObservationPage>(`/api/observations?batch_id=${first.batch_id}`)).body.total).toBe(10);
    const bj = (await json<ObservationPage>("/api/observations?geo=110000")).body;
    expect(bj.total).toBe(1);
    expect(bj.items[0]).toMatchObject({ geo: "110000", value_num: 5 });
  });

  it("参数非法时宽松处理：limit 回落默认、超上限截到 500，批次号不合法查不到", async () => {
    await importSample();
    expect((await json<ObservationPage>("/api/observations?limit=abc&offset=-3")).body).toMatchObject({ limit: 100, offset: 0, total: 10 });
    expect((await json<ObservationPage>("/api/observations?limit=99999")).body.limit).toBe(500);
    const bad = await json<ObservationPage>("/api/observations?batch_id=not-a-uuid");
    expect(bad.status).toBe(200);
    expect(bad.body.total).toBe(0);
  });
});

describe("GET /api/stats", () => {
  it("空库时为 0，最近批次为 null", async () => {
    const { body } = await json<Stats>("/api/stats");
    expect(body.indicators).toEqual({ total: 99, phase1: 30, phase1_with_data: 0 });
    expect(body.observations).toEqual({ total: 0, latest_period: null });
    expect(body.clusters).toHaveLength(7);
    expect(body.clusters.reduce((s, c) => s + c.phase1 + c.later, 0)).toBe(99);
    expect(body.latest_batch).toBeNull();
  });

  it("导入后按簇统计，并给出最近一次导入", async () => {
    const imported = (await importSample()).body;
    const { body } = await json<Stats>("/api/stats");
    expect(body.observations).toEqual({ total: 10, latest_period: "2024-03" });
    const trd = body.clusters.find((c) => c.code === "TRD")!;
    expect(trd.observations).toBe(10);
    // 样例覆盖 TRD 的 5 个一期指标（001、002、005、006、007）
    expect(trd).toMatchObject({ phase1: 5, phase1_with_data: 5, later: 2 });
    expect(body.indicators.phase1_with_data).toBe(5);
    expect(body.latest_batch).toMatchObject({ id: imported.batch_id, filename: "trd_sample.csv", status: "completed", row_ok: 10 });
  });
});

describe("统一错误体", () => {
  it("未知路由：404 NOT_FOUND", async () => {
    const { status, body } = await json<ApiErrorBody>("/api/nope");
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
