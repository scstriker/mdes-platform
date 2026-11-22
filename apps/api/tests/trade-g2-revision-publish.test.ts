import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ObservationPage, TradeImportResponse, TradeOverviewPublished } from "@mdes/shared";
import { migrationStatements, startHarness, type Harness } from "./helpers/harness";

const DICT_VERSION = "202601";
const HS_A = "90181100";
const HS_B = "90181210";
const HS_C = "90181291";

// 合法最小 1x1 PNG 字节
const MINIMAL_PNG = new Uint8Array([
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

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeUpload(opts: {
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

async function seedFullMonthFixture(
  h: Harness,
  month: string,
  impTotal: number,
  impPartners: Array<[string, string, number]>,
  expTotal: number,
) {
  const impProd = `商品编码,商品名称,美元\n${HS_A},心电图记录仪,${impTotal}\n`;
  const impPart = [
    "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元",
    ...impPartners.map(([c, n, v]) => `${HS_A},心电图记录仪,${c},${n},${v}`),
  ].join("\n");
  const r1 = Math.floor(impTotal * 0.6);
  const r2 = impTotal - r1;
  const impRegime = [
    "商品编码,商品名称,贸易方式编码,贸易方式名称,美元",
    `${HS_A},心电图记录仪,10,一般贸易,${r1}`,
    `${HS_A},心电图记录仪,14,进料加工贸易,${r2}`,
  ].join("\n");
  const g1 = Math.floor(impTotal * 0.7);
  const g2 = impTotal - g1;
  const impRegion = [
    "商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元",
    `${HS_A},心电图记录仪,4403,广东深圳,${g1}`,
    `${HS_A},心电图记录仪,3100,上海市,${g2}`,
  ].join("\n");

  const expProd = `商品编码,商品名称,美元\n${HS_A},心电图记录仪,${expTotal}\n`;
  const expPart = `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${HS_A},心电图记录仪,502,美国,${expTotal}\n`;
  const expRegime = `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${HS_A},心电图记录仪,10,一般贸易,${expTotal}\n`;
  const expRegion = `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${HS_A},心电图记录仪,4403,广东深圳,${expTotal}\n`;

  const items: Array<[string, string, string]> = [
    ["import", "product", impProd],
    ["import", "partner", impPart],
    ["import", "regime", impRegime],
    ["import", "region", impRegion],
    ["export", "product", expProd],
    ["export", "partner", expPart],
    ["export", "regime", expRegime],
    ["export", "region", expRegion],
  ];

  const receipts: Record<string, TradeImportResponse> = {};
  for (const [flow, grouping, csvText] of items) {
    const res = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month,
          flow,
          currency: "USD",
          grouping,
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText,
        filename: `fixture_${month}_${flow}_${grouping}.csv`,
      }),
    );
    expect(res.status).toBe(200);
    receipts[`${flow}_${grouping}`] = (await res.json()) as TradeImportResponse;
  }
  return { receipts, impPartV1: impPart };
}

describe("G2 / AC-014：顺序迁移、幂等重放、修订撤回一行、发布中断重试与空证据登记", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(() => h?.dispose());

  beforeEach(async () => {
    await h.reset();
  });

  it("在全新本地 Miniflare D1 上按编号顺序执行全部迁移，包含贸易核心表、证据表与索引", async () => {
    const fresh = await startHarness({ migrate: false, seed: false });
    try {
      const stmts = migrationStatements();
      expect(stmts.length).toBeGreaterThan(15);
      await fresh.sql(stmts);
      const tables = (
        await fresh.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      ).map((t) => t.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          "import_batch",
          "observation",
          "trade_dict_meta",
          "trade_hs_dict",
          "trade_import_batch",
          "trade_batch_evidence",
          "trade_hs_coverage",
          "trade_fact",
          "trade_active_scope",
          "trade_release",
          "trade_period_snapshot",
          "trade_current_snapshot",
        ]),
      );
    } finally {
      await fresh.dispose();
    }
  });

  it("AC-014 全流程：重放原件 → 修订 A=44 并删除 F=4 且发布前中断 → 重试切换 releaseId → 重放初版保持现行版本", async () => {
    // 锁定单税号隔离库
    await h.sql([
      `delete from trade_hs_dict where dict_version = '${DICT_VERSION}' and hs8 != '${HS_A}'`,
      `update trade_dict_meta set hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated' where dict_version = '${DICT_VERSION}'`,
    ]);

    const { receipts: janReceipts, impPartV1 } = await seedFullMonthFixture(
      h,
      "2024-01",
      100,
      [
        ["P_A", "伙伴A", 40],
        ["P_B", "伙伴B", 25],
        ["P_C", "伙伴C", 15],
        ["P_D", "伙伴D", 10],
        ["P_E", "伙伴E", 6],
        ["P_F", "伙伴F", 4],
      ],
      200,
    );
    await seedFullMonthFixture(h, "2024-02", 150, [["P_A", "伙伴A", 150]], 250);

    const v1PartnerBatchId = janReceipts["import_partner"].batchId;
    const initOverview = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    const releaseId1 = initOverview.releaseId;
    expect(initOverview.totals.importUsd).toBe(100);
    expect(initOverview.totals.exportUsd).toBe(200);
    expect(initOverview.partners.filter((p) => p.importUsd > 0)).toHaveLength(6);

    // 1. 按相同清单再次导入同一份伙伴文件：返回原批次号，伙伴仍为 6 行，进口总额仍为 100
    const replay1Res = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "partner",
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText: impPartV1,
        filename: "fixture_2024-01_import_partner.csv",
      }),
    );
    expect(replay1Res.status).toBe(200);
    const replay1 = (await replay1Res.json()) as TradeImportResponse;
    expect(replay1.batchId).toBe(v1PartnerBatchId);
    expect(replay1.replayed).toBe(true);

    const afterReplay1 = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    expect(afterReplay1.releaseId).toBe(releaseId1);
    expect(afterReplay1.partners.filter((p) => p.importUsd > 0)).toHaveLength(6);
    expect(afterReplay1.totals.importUsd).toBe(100);

    // 2. 把 A 改为 44 美元，删除 F 的 4 美元记录；在候选写入后、发布切换前注入一次失败
    const impPartV2 = [
      "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元",
      `${HS_A},心电图记录仪,P_A,伙伴A,44`,
      `${HS_A},心电图记录仪,P_B,伙伴B,25`,
      `${HS_A},心电图记录仪,P_C,伙伴C,15`,
      `${HS_A},心电图记录仪,P_D,伙伴D,10`,
      `${HS_A},心电图记录仪,P_E,伙伴E,6`,
    ].join("\n");

    const failRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "partner",
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText: impPartV2,
        filename: "fixture_2024-01_import_partner_v2.csv",
        headers: { "x-test-fail-before-publish": "1" },
      }),
    );
    expect(failRes.status).toBe(500);

    // 通过批次接口确认“候选已接收（staged）”，而通过查询接口确认“用户可见版本未切换（仍为 releaseId1）”
    const batchesAfterFailRes = await h.request("/api/trade/batches?month=2024-01&flow=import&grouping=partner");
    expect(batchesAfterFailRes.status).toBe(200);
    const batchesAfterFail = (await batchesAfterFailRes.json()) as {
      items: Array<{ batchId: string; publishState: string; rowCount: number }>;
    };
    expect(batchesAfterFail.items[0]).toMatchObject({ publishState: "staged", rowCount: 5 });
    const stagedV2BatchId = batchesAfterFail.items[0].batchId;

    const duringFail = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    expect(duringFail.releaseId).toBe(releaseId1);
    expect(duringFail.partners.find((p) => p.partnerCode === "P_A")?.importUsd).toBe(40);
    expect(duringFail.partners.find((p) => p.partnerCode === "P_F")?.importUsd).toBe(4);
    expect(duringFail.totals.importUsd).toBe(100);

    // 3. 用同一份修订文件重试：发布成功，releaseId 切换，伙伴变为 5 行，A=44，F 已撤回
    const retryRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "partner",
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText: impPartV2,
        filename: "fixture_2024-01_import_partner_v2.csv",
      }),
    );
    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as TradeImportResponse;
    expect(retryBody.batchId).toBe(stagedV2BatchId);
    expect(retryBody.status).toBe("published");
    expect(retryBody.releaseId).not.toBe(releaseId1);
    const releaseId2 = retryBody.releaseId!;

    const afterRetry = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    expect(afterRetry.releaseId).toBe(releaseId2);
    expect(afterRetry.partners.filter((p) => p.importUsd > 0)).toHaveLength(5);
    expect(afterRetry.partners.find((p) => p.partnerCode === "P_A")?.importUsd).toBe(44);
    expect(afterRetry.partners.find((p) => p.partnerCode === "P_F")).toBeUndefined();
    expect(afterRetry.totals.importUsd).toBe(100);
    expect(afterRetry.totals.exportUsd).toBe(200); // 另一流向不变

    // 相邻月份 2024-02 不受影响，跨月累计 2024-YTD-02 已同步更新为 A = 44 + 150 = 194
    const febOverview = (await (await h.request("/api/trade/overview?period=2024-02")).json()) as TradeOverviewPublished;
    expect(febOverview.totals).toMatchObject({ importUsd: 150, exportUsd: 250 });
    const ytdOverview = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
    expect(ytdOverview.partners.find((p) => p.partnerCode === "P_A")?.importUsd).toBe(194);
    expect(ytdOverview.partners.find((p) => p.partnerCode === "P_F")).toBeUndefined();

    // 派生观测值 TRD-005 也同步为 releaseId2 且无 P_F
    const obsPage = (await (
      await h.request("/api/observations?indicator_id=TRD-005&period=2024-01")
    ).json()) as ObservationPage;
    const importPartnerObs = obsPage.items.filter((o) => o.dims.trade_type === "import");
    expect(importPartnerObs).toHaveLength(5);
    expect(importPartnerObs.every((o) => o.dims.releaseId === releaseId2)).toBe(true);
    expect(importPartnerObs.some((o) => o.dims.partner === "P_F")).toBe(false);

    // 4. 再重放初版伙伴原件：返回初版批次号，当前已发布版本仍显示 A=44、F 已撤回
    const histReplayRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "partner",
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText: impPartV1,
        filename: "fixture_2024-01_import_partner.csv",
      }),
    );
    expect(histReplayRes.status).toBe(200);
    const histReplay = (await histReplayRes.json()) as TradeImportResponse;
    expect(histReplay.batchId).toBe(v1PartnerBatchId);
    expect(histReplay.replayed).toBe(true);

    const afterHistReplay = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    expect(afterHistReplay.releaseId).toBe(releaseId2);
    expect(afterHistReplay.partners.find((p) => p.partnerCode === "P_A")?.importUsd).toBe(44);
    expect(afterHistReplay.partners.find((p) => p.partnerCode === "P_F")).toBeUndefined();
  });

  it("部分范围重叠返回 409；区分官网无记录 PNG 举证（confirmedEmpty）与无截图待补采（missing）", async () => {
    await h.sql([
      `delete from trade_hs_dict where dict_version = '${DICT_VERSION}' and hs8 not in ('${HS_A}', '${HS_B}', '${HS_C}')`,
      `update trade_dict_meta set hs8_count = 3, hs6_count = 2, category_count = 1, scope_mode = 'isolated' where dict_version = '${DICT_VERSION}'`,
    ]);

    // 1) 仅上传 emptyEvidence PNG（整批明确无记录）
    const emptyOnlyRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-03",
          flow: "export",
          currency: "USD",
          grouping: "product",
          hs8: [HS_A],
          emptyHs8: [HS_A],
        },
        evidences: [{ name: "empty_90181100.png", bytes: MINIMAL_PNG }],
      }),
    );
    expect(emptyOnlyRes.status).toBe(200);
    const emptyOnly = (await emptyOnlyRes.json()) as TradeImportResponse;
    expect(emptyOnly.rowCount).toBe(0);
    expect(emptyOnly.sourceSha256).toBe(sha256Hex(MINIMAL_PNG));
    expect(emptyOnly.coverage).toEqual({
      received: [],
      confirmedEmpty: [HS_A],
      missing: [],
    });

    // 2) 部分重叠请求 [HS_A, HS_B] 返回 409 TRADE_SCOPE_CONFLICT
    const overlapRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-03",
          flow: "export",
          currency: "USD",
          grouping: "product",
          hs8: [HS_A, HS_B],
          emptyHs8: [],
        },
        csvText: `商品编码,商品名称,美元\n${HS_A},心电图记录仪,10\n${HS_B},B超,20\n`,
      }),
    );
    expect(overlapRes.status).toBe(409);

    // 3) 带明细 CSV 同时声明 [HS_B, HS_C] 无记录，但只提供对应 HS_B 的 1 张补查截图：HS_B 记 confirmedEmpty，无证明的 HS_C 降为 missing
    const partialProofRes = await h.request(
      "/api/trade/import",
      makeUpload({
        manifest: {
          dictVersion: DICT_VERSION,
          month: "2024-04",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_A, HS_B, HS_C],
          emptyHs8: [HS_B, HS_C],
        },
        csvText: `商品编码,商品名称,美元\n${HS_A},心电图记录仪,50\n`,
        evidences: [{ name: `empty_${HS_B}.png`, bytes: MINIMAL_PNG }],
      }),
    );
    expect(partialProofRes.status).toBe(200);
    const partialProof = (await partialProofRes.json()) as TradeImportResponse;
    expect(partialProof.coverage).toEqual({
      received: [HS_A],
      confirmedEmpty: [HS_B],
      missing: [HS_C],
    });
    expect(partialProof.status).toBe("staged");
  });
});
