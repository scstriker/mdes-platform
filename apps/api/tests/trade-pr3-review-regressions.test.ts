import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ImportResult,
  ObservationPage,
  TradeCoverageMatrixResponse,
  TradeImportResponse,
  TradeOverviewPublished,
} from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

const DICT_VERSION = "202601";
const HS_SINGLE = "90181100";

// 两份内容不同的合法 PNG 字节（末尾附加不同 tEXt 注释块前或不同 IHDR 尺寸以产生不同 SHA-256）
const PNG_1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const PNG_2 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x9a, 0x76, 0x82,
  0x16, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeTradeUpload(opts: {
  manifest: Record<string, unknown>;
  csvText?: string;
  filename?: string;
  evidences?: Array<{ name: string; bytes: Uint8Array }>;
  headers?: Record<string, string>;
}): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(opts.manifest));
  if (opts.csvText !== undefined) {
    form.append("file", new File([opts.csvText], opts.filename ?? "fixture.csv", { type: "text/csv" }));
  }
  for (const ev of opts.evidences ?? []) {
    const copy = new Uint8Array(ev.bytes.byteLength);
    copy.set(ev.bytes);
    form.append("emptyEvidence", new File([copy], ev.name, { type: "image/png" }));
  }
  return { method: "POST", body: form, headers: opts.headers };
}

function buildSingleCodeCsv(grouping: "product" | "partner" | "regime" | "region", usd: number, hs8 = HS_SINGLE): string {
  if (grouping === "product") {
    return `商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\n${hs8},心电图记录仪,10,台,50,千克,${usd}`;
  }
  if (grouping === "partner") {
    return `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${hs8},心电图记录仪,502,美国,${usd}`;
  }
  if (grouping === "regime") {
    return `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${hs8},心电图记录仪,10,一般贸易,${usd}`;
  }
  return `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${hs8},心电图记录仪,4403,广东深圳,${usd}`;
}

async function isolateSingleCodeDict(h: Harness, hs8 = HS_SINGLE) {
  await h.sql([
    `DELETE FROM trade_hs_dict WHERE dict_version = '${DICT_VERSION}' AND hs8 != '${hs8}'`,
    `UPDATE trade_dict_meta SET hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated_test' WHERE dict_version = '${DICT_VERSION}'`,
  ]);
}

async function importSingleCodeMonthCombos(
  h: Harness,
  month: string,
  impUsd: number,
  expUsd: number,
  skipLastCombo = false,
): Promise<TradeImportResponse | null> {
  const combos: Array<["import" | "export", "product" | "partner" | "regime" | "region", number]> = [
    ["import", "product", impUsd],
    ["import", "partner", impUsd],
    ["import", "regime", impUsd],
    ["import", "region", impUsd],
    ["export", "product", expUsd],
    ["export", "partner", expUsd],
    ["export", "regime", expUsd],
    ["export", "region", expUsd],
  ];
  const list = skipLastCombo ? combos.slice(0, 7) : combos;
  let last: TradeImportResponse | null = null;
  for (const [flow, grouping, usd] of list) {
    const res = await h.request(
      "/api/trade/import",
      makeTradeUpload({
        manifest: { dictVersion: DICT_VERSION, month, flow, currency: "USD", grouping, hs8: [HS_SINGLE], emptyHs8: [] },
        csvText: buildSingleCodeCsv(grouping, usd),
        filename: `fixture_${month}_${flow}_${grouping}.csv`,
      }),
    );
    expect(res.status).toBe(200);
    last = (await res.json()) as TradeImportResponse;
  }
  return last;
}

describe("PR #3 独立审查 6 项问题回归验证（2 P1 + 4 P2）", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 30_000);

  afterAll(async () => {
    await h?.dispose();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it(
    "[P1] 并行发布不丢失已发布月份与累计快照：并发完成两个月 + 模拟跨实例 CAS 抢占后自动重算合并",
    async () => {
      await isolateSingleCodeDict(h);

      // 1) 先暂存 2024-01 与 2024-02 的前 7 个组合
      await importSingleCodeMonthCombos(h, "2024-01", 100, 120, true);
      await importSingleCodeMonthCombos(h, "2024-02", 200, 240, true);

      // 2) 同时提交两个月份的最后一块（export/region），验证同实例并发不会覆盖可用期间索引
      const [r1, r2] = await Promise.all([
        h.request(
          "/api/trade/import",
          makeTradeUpload({
            manifest: { dictVersion: DICT_VERSION, month: "2024-01", flow: "export", currency: "USD", grouping: "region", hs8: [HS_SINGLE], emptyHs8: [] },
            csvText: buildSingleCodeCsv("region", 120),
            filename: "fixture_2024-01_export_region.csv",
          }),
        ),
        h.request(
          "/api/trade/import",
          makeTradeUpload({
            manifest: { dictVersion: DICT_VERSION, month: "2024-02", flow: "export", currency: "USD", grouping: "region", hs8: [HS_SINGLE], emptyHs8: [] },
            csvText: buildSingleCodeCsv("region", 240),
            filename: "fixture_2024-02_export_region.csv",
          }),
        ),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(((await r1.json()) as TradeImportResponse).status).toBe("published");
      expect(((await r2.json()) as TradeImportResponse).status).toBe("published");

      const periodsAfterParallel = (await (await h.request("/api/trade/periods")).json()) as {
        publishedMonths: string[];
        availablePeriods: string[];
      };
      expect(periodsAfterParallel.publishedMonths).toEqual(["2024-01", "2024-02"]);
      expect(periodsAfterParallel.availablePeriods).toEqual([
        "2024-01",
        "2024-02",
        "2024-YTD-01",
        "2024-YTD-02",
      ]);

      const ytd02 = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
      expect(ytd02.totals.importUsd).toBe(300);
      expect(ytd02.totals.exportUsd).toBe(360);

      // 3) 模拟跨 Worker 实例并发 CAS 冲突：在提交 2024-03 发布事务前注入一次并发 version_seq 抢占，断言自动重读重算成功
      await importSingleCodeMonthCombos(h, "2024-03", 300, 360, true);
      const r3 = await h.request(
        "/api/trade/import",
        makeTradeUpload({
          manifest: { dictVersion: DICT_VERSION, month: "2024-03", flow: "export", currency: "USD", grouping: "region", hs8: [HS_SINGLE], emptyHs8: [] },
          csvText: buildSingleCodeCsv("region", 360),
          filename: "fixture_2024-03_export_region.csv",
          headers: { "x-test-preempt-release-once": "1" },
        }),
      );
      expect(r3.status).toBe(200);
      expect(((await r3.json()) as TradeImportResponse).status).toBe("published");

      const periodsAfterCas = (await (await h.request("/api/trade/periods")).json()) as {
        publishedMonths: string[];
        availablePeriods: string[];
      };
      expect(periodsAfterCas.publishedMonths).toEqual(["2024-01", "2024-02", "2024-03"]);
      expect(periodsAfterCas.availablePeriods).toContain("2024-Q1");
    },
    30_000,
  );

  it(
    "[P1] 单月超过 100 个候选批次（164 税号按 10 码一组 = 136 批）不触发 D1 绑定参数上限并正常发布",
    async () => {
      const dictRows = await h.query<{ hs8: string }>(
        `SELECT hs8 FROM trade_hs_dict WHERE dict_version = '${DICT_VERSION}' ORDER BY category_order ASC, seq_no ASC`,
      );
      const allHs8 = dictRows.map((d) => d.hs8);
      expect(allHs8).toHaveLength(164);

      const groups: string[][] = [];
      for (let i = 0; i < allHs8.length; i += 10) {
        groups.push(allHs8.slice(i, i + 10));
      }
      expect(groups).toHaveLength(17); // 17 * 2 * 4 = 136 > 100

      let batchCalls = 0;
      let lastResp: TradeImportResponse | null = null;

      for (const flow of ["import", "export"] as const) {
        for (const grouping of ["product", "partner", "regime", "region"] as const) {
          for (let gIdx = 0; gIdx < groups.length; gIdx++) {
            const slice = groups[gIdx];
            const header =
              grouping === "product"
                ? "商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元"
                : grouping === "partner"
                  ? "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元"
                  : grouping === "regime"
                    ? "商品编码,商品名称,贸易方式编码,贸易方式名称,美元"
                    : "商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元";
            const lines = [header];
            for (const code of slice) {
              const usd = flow === "import" ? 10 : 20;
              if (grouping === "product") {
                lines.push(`${code},器械,1,台,2,千克,${usd}`);
              } else if (grouping === "partner") {
                lines.push(`${code},器械,502,美国,${usd}`);
              } else if (grouping === "regime") {
                lines.push(`${code},器械,10,一般贸易,${usd}`);
              } else {
                lines.push(`${code},器械,4403,广东深圳,${usd}`);
              }
            }
            const res = await h.request(
              "/api/trade/import",
              makeTradeUpload({
                manifest: {
                  dictVersion: DICT_VERSION,
                  month: "2024-01",
                  flow,
                  currency: "USD",
                  grouping,
                  hs8: slice,
                  emptyHs8: [],
                },
                csvText: lines.join("\n"),
                filename: `g${gIdx}_${flow}_${grouping}.csv`,
              }),
            );
            expect(res.status).toBe(200);
            lastResp = (await res.json()) as TradeImportResponse;
            batchCalls += 1;
          }
        }
      }

      expect(batchCalls).toBe(136);
      expect(lastResp?.status).toBe("published");

      const ov = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
      expect(ov.totals.importUsd).toBe(164 * 10);
      expect(ov.totals.exportUsd).toBe(164 * 20);
      expect(ov.sourceBatches).toHaveLength(136);
    },
    60_000,
  );

  it(
    "[P2] 修订历史月份（或补发上年基期月）后，后续月度快照的趋势序列与趋势点同比同步更新",
    async () => {
      await isolateSingleCodeDict(h);

      await importSingleCodeMonthCombos(h, "2024-01", 100, 120);
      const pubFeb = await importSingleCodeMonthCombos(h, "2024-02", 200, 240);
      expect(pubFeb?.status).toBe("published");
      const initialReleaseId = pubFeb!.releaseId!;

      // 修订 2024-01 进口额由 100 -> 150（全分组同步更新）
      let revJanResp: TradeImportResponse | null = null;
      for (const grouping of ["product", "partner", "regime", "region"] as const) {
        const res = await h.request(
          "/api/trade/import",
          makeTradeUpload({
            manifest: { dictVersion: DICT_VERSION, month: "2024-01", flow: "import", currency: "USD", grouping, hs8: [HS_SINGLE], emptyHs8: [] },
            csvText: buildSingleCodeCsv(grouping, 150),
            filename: `rev_2024-01_import_${grouping}.csv`,
          }),
        );
        expect(res.status).toBe(200);
        revJanResp = (await res.json()) as TradeImportResponse;
      }
      expect(revJanResp?.status).toBe("published");
      expect(revJanResp?.releaseId).not.toBe(initialReleaseId);

      // 默认最新月（2024-02）快照的 trend[0]（2024-01）必须更新为 150 且切换至新 releaseId
      const latestOv = (await (await h.request("/api/trade/overview")).json()) as TradeOverviewPublished;
      expect(latestOv.period).toBe("2024-02");
      expect(latestOv.releaseId).toBe(revJanResp!.releaseId);
      expect(latestOv.trend.map((t) => ({ period: t.period, importUsd: t.importUsd, importYoyPct: t.importYoyPct }))).toEqual([
        { period: "2024-01", importUsd: 150, importYoyPct: null },
        { period: "2024-02", importUsd: 200, importYoyPct: null },
      ]);

      // 补发上年同期 2023-01（进口 100），2024-02 快照中 trend[0]（2024-01）的同比也必须联动更新为 +50%
      const pub2023Jan = await importSingleCodeMonthCombos(h, "2023-01", 100, 100);
      expect(pub2023Jan?.status).toBe("published");

      const febAfterPrior = (await (await h.request("/api/trade/overview?period=2024-02")).json()) as TradeOverviewPublished;
      expect(febAfterPrior.releaseId).toBe(pub2023Jan!.releaseId);
      expect(febAfterPrior.trend[0]).toMatchObject({
        period: "2024-01",
        importUsd: 150,
        importYoyPct: 50,
      });
    },
    30_000,
  );

  it(
    "[P2] 同一批次上传多张不同空结果 PNG 截图时，各 confirmedEmpty 税号分别关联各自截图 SHA-256",
    async () => {
      const sha1 = sha256Hex(PNG_1);
      const sha2 = sha256Hex(PNG_2);
      expect(sha1).not.toBe(sha2);

      // 场景 A：CSV（含 90181100）+ 两张命名截图（分别对应 90181210、90181291）
      const resCsvMulti = await h.request(
        "/api/trade/import",
        makeTradeUpload({
          manifest: {
            dictVersion: DICT_VERSION,
            month: "2024-01",
            flow: "import",
            currency: "USD",
            grouping: "product",
            hs8: ["90181100", "90181210", "90181291"],
            emptyHs8: ["90181210", "90181291"],
          },
          csvText: buildSingleCodeCsv("product", 100, "90181100"),
          filename: "partial.csv",
          evidences: [
            { name: "empty_90181210.png", bytes: PNG_1 },
            { name: "empty_90181291.png", bytes: PNG_2 },
          ],
        }),
      );
      expect(resCsvMulti.status).toBe(200);

      // 场景 B：纯空结果批次（无 CSV），上传两张顺序截图对应 90181310、90181390
      const resEmptyOnlyMulti = await h.request(
        "/api/trade/import",
        makeTradeUpload({
          manifest: {
            dictVersion: DICT_VERSION,
            month: "2024-01",
            flow: "export",
            currency: "USD",
            grouping: "product",
            hs8: ["90181310", "90181390"],
            emptyHs8: ["90181310", "90181390"],
          },
          evidences: [
            { name: "shot_first.png", bytes: PNG_1 },
            { name: "shot_second.png", bytes: PNG_2 },
          ],
        }),
      );
      expect(resEmptyOnlyMulti.status).toBe(200);

      const cov = (await (await h.request("/api/trade/coverage?month=2024-01")).json()) as TradeCoverageMatrixResponse;
      const cellMap = new Map(cov.cells!.map((c) => [`${c.flow}|${c.grouping}|${c.hs8}`, c]));

      expect(cellMap.get("import|product|90181210")).toMatchObject({
        status: "confirmedEmpty",
        evidenceSha256: sha1,
      });
      expect(cellMap.get("import|product|90181291")).toMatchObject({
        status: "confirmedEmpty",
        evidenceSha256: sha2,
      });
      expect(cellMap.get("export|product|90181310")).toMatchObject({
        status: "confirmedEmpty",
        evidenceSha256: sha1,
      });
      expect(cellMap.get("export|product|90181390")).toMatchObject({
        status: "confirmedEmpty",
        evidenceSha256: sha2,
      });
    },
    30_000,
  );

  it(
    "[P2] 通用观测值 CSV 导入支持 mode=upsert（按自然键与规范化 dims 融合替换，不产生重复计数）与 mode=append",
    async () => {
      // 1) 初次以 upsert 写入 TRD-001 2024-01（dims 键序 b,a），数值 10
      const r1 = await h.request("/api/import/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "init.csv",
          mode: "upsert",
          csvText: 'indicator_id,period,geo,dims,value_num,unit\nTRD-001,2024-01,CN,"{""b"":2,""a"":1}",10,亿元',
        }),
      });
      expect(r1.status).toBe(200);
      expect((await r1.json()) as ImportResult).toMatchObject({ status: "completed", row_ok: 1 });

      // 2) 二次以 upsert 传入相同自然键（dims 键序反转为 a,b），修正数值为 20，同时新增 2024-02 = 30
      const r2 = await h.request("/api/import/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "revised.csv",
          mode: "upsert",
          csvText: [
            "indicator_id,period,geo,dims,value_num,unit",
            'TRD-001,2024-01,CN,"{""a"":1,""b"":2}",20,亿元',
            'TRD-001,2024-02,CN,"{""a"":1,""b"":2}",30,亿元',
          ].join("\n"),
        }),
      });
      expect(r2.status).toBe(200);

      const obsAfterUpsert = (await (await h.request("/api/observations?indicator_id=TRD-001")).json()) as ObservationPage;
      expect(obsAfterUpsert.total).toBe(2);
      const byPeriod = Object.fromEntries(obsAfterUpsert.items.map((o) => [o.period, o.value_num]));
      expect(byPeriod).toEqual({ "2024-01": 20, "2024-02": 30 });

      // 3) 显式选择 mode=append 时保留历史记录并追加
      const formAppend = new FormData();
      formAppend.append("mode", "append");
      formAppend.append(
        "file",
        new File(
          ['indicator_id,period,geo,dims,value_num,unit\nTRD-001,2024-01,CN,"{""a"":1,""b"":2}",25,亿元'],
          "append.csv",
          { type: "text/csv" },
        ),
      );
      const r3 = await h.request("/api/import/csv", { method: "POST", body: formAppend });
      expect(r3.status).toBe(200);

      const obsAfterAppend = (await (await h.request("/api/observations?indicator_id=TRD-001&period=2024-01")).json()) as ObservationPage;
      expect(obsAfterAppend.total).toBe(2);
    },
    30_000,
  );
});
