import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TradeOverviewPublished } from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

const DICT_VERSION = "202601";
const HS_A = "90181100";

function uploadCsv(manifest: Record<string, unknown>, csvText: string): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("file", new File([csvText], "fixture.csv", { type: "text/csv" }));
  return { method: "POST", body: form };
}

async function importFlowFourGroupings(
  h: Harness,
  month: string,
  flow: "import" | "export",
  totalUsd: number,
  partners: Array<[string, string, number]>,
  regimes: Array<[string, string, number]>,
  regions: Array<[string, string, number]>,
  includeSummaryNoise = false,
) {
  const prodLines = [
    "商品编码,商品名称,美元",
    `${HS_A},心电图记录仪,${totalUsd}`,
    ...(includeSummaryNoise ? [`合计,,${totalUsd}`] : []),
  ].join("\n");

  const partLines = [
    "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元",
    ...partners.map(([c, n, v]) => `${HS_A},心电图记录仪,${c},${n},${v}`),
    ...(includeSummaryNoise
      ? [
          `${HS_A},心电图记录仪,000,世界,${totalUsd}`,
          `${HS_A},心电图记录仪,合计,合计,${totalUsd}`,
        ]
      : []),
  ].join("\n");

  const regmLines = [
    "商品编码,商品名称,贸易方式编码,贸易方式名称,美元",
    ...regimes.map(([c, n, v]) => `${HS_A},心电图记录仪,${c},${n},${v}`),
    ...(includeSummaryNoise ? [`${HS_A},心电图记录仪,全部,全部,${totalUsd}`] : []),
  ].join("\n");

  const regnLines = [
    "商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元",
    ...regions.map(([c, n, v]) => `${HS_A},心电图记录仪,${c},${n},${v}`),
    ...(includeSummaryNoise ? [`${HS_A},心电图记录仪,全国,全国,${totalUsd}`] : []),
  ].join("\n");

  for (const [grouping, csvText] of [
    ["product", prodLines],
    ["partner", partLines],
    ["regime", regmLines],
    ["region", regnLines],
  ] as const) {
    const res = await h.request(
      "/api/trade/import",
      uploadCsv(
        {
          dictVersion: DICT_VERSION,
          month,
          flow,
          currency: "USD",
          grouping,
          hs8: [HS_A],
          emptyHs8: [],
        },
        csvText,
      ),
    );
    expect(res.status).toBe(200);
  }
}

describe("G3 / AC-015：四分组独立汇总、进出口月度与跨月 CR/HHI 集中度及同期同比", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(() => h?.dispose());

  beforeEach(async () => {
    await h.reset();
    await h.sql([
      `delete from trade_hs_dict where dict_version = '${DICT_VERSION}' and hs8 != '${HS_A}'`,
      `update trade_dict_meta set hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated' where dict_version = '${DICT_VERSION}'`,
    ]);
  });

  it("核对金额单位、四种分组各自小计 100 美元（不误计为 400），且进出口两侧月度 HHI=2602、跨月累计 HHI=2489.5", async () => {
    const m1Partners: Array<[string, string, number]> = [
      ["P_A", "伙伴A", 40],
      ["P_B", "伙伴B", 25],
      ["P_C", "伙伴C", 15],
      ["P_D", "伙伴D", 10],
      ["P_E", "伙伴E", 6],
      ["P_F", "伙伴F", 4],
    ];
    const m2Partners: Array<[string, string, number]> = [
      ["P_A", "伙伴A", 25],
      ["P_B", "伙伴B", 40],
      ["P_C", "伙伴C", 15],
      ["P_D", "伙伴D", 10],
      ["P_E", "伙伴E", 6],
      ["P_F", "伙伴F", 4],
    ];

    // 第一个月：进口、出口均采用 6 伙伴算例，且夹带官网合计/世界行验证剔除
    await importFlowFourGroupings(
      h,
      "2024-01",
      "import",
      100,
      m1Partners,
      [
        ["10", "一般贸易", 60],
        ["14", "进料加工贸易", 40],
      ],
      [
        ["4403", "广东深圳", 70],
        ["3100", "上海市", 30],
      ],
      true,
    );
    await importFlowFourGroupings(
      h,
      "2024-01",
      "export",
      100,
      m1Partners,
      [
        ["10", "一般贸易", 60],
        ["14", "进料加工贸易", 40],
      ],
      [
        ["4403", "广东深圳", 70],
        ["3100", "上海市", 30],
      ],
      true,
    );

    const m1 = (await (await h.request("/api/trade/overview?period=2024-01")).json()) as TradeOverviewPublished;
    expect(m1.units).toEqual({
      amount: "USD",
      displayAmount: "100M_USD",
      share: "PCT",
      cr: "PCT",
      hhi: "0_10000",
    });
    expect(m1.totals.importUsd).toBe(100);
    expect(m1.totals.exportUsd).toBe(100);
    expect(m1.groupingTotals).toEqual({
      product: { importUsd: 100, exportUsd: 100 },
      partner: { importUsd: 100, exportUsd: 100, count: 6 },
      regime: { importUsd: 100, exportUsd: 100, count: 2 },
      region: { importUsd: 100, exportUsd: 100, count: 2 },
    });

    expect(m1.partners).toHaveLength(6);
    expect(m1.concentration.import).toEqual({ cr1: 40, cr3: 80, cr5: 96, hhi: 2602, partnerCount: 6 });
    expect(m1.concentration.export).toEqual({ cr1: 40, cr3: 80, cr5: 96, hhi: 2602, partnerCount: 6 });

    // 第二个月：A、B 金额互换
    await importFlowFourGroupings(
      h,
      "2024-02",
      "import",
      100,
      m2Partners,
      [
        ["10", "一般贸易", 60],
        ["14", "进料加工贸易", 40],
      ],
      [
        ["4403", "广东深圳", 70],
        ["3100", "上海市", 30],
      ],
    );
    await importFlowFourGroupings(
      h,
      "2024-02",
      "export",
      100,
      m2Partners,
      [
        ["10", "一般贸易", 60],
        ["14", "进料加工贸易", 40],
      ],
      [
        ["4403", "广东深圳", 70],
        ["3100", "上海市", 30],
      ],
    );

    const ytd = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
    expect(ytd.totals.importUsd).toBe(200);
    expect(ytd.totals.exportUsd).toBe(200);
    expect(ytd.partners.slice(0, 2).map((p) => p.importUsd)).toEqual([65, 65]);
    expect(ytd.partners.slice(0, 2).map((p) => p.importSharePct)).toEqual([32.5, 32.5]);
    expect(ytd.concentration.import).toEqual({ cr1: 32.5, cr3: 80, cr5: 96, hhi: 2489.5, partnerCount: 6 });
    expect(ytd.concentration.export).toEqual({ cr1: 32.5, cr3: 80, cr5: 96, hhi: 2489.5, partnerCount: 6 });
  });

  it("跨月累计同比：缺基期返回 null；补齐上年同期 80 美元后为 25%；基期修订为 0 美元后返回 null", async () => {
    const simplePartner = (v: number): Array<[string, string, number]> => (v > 0 ? [["P_A", "伙伴A", v]] : []);
    const simpleRegime = (v: number): Array<[string, string, number]> => (v > 0 ? [["10", "一般贸易", v]] : []);
    const simpleRegion = (v: number): Array<[string, string, number]> => (v > 0 ? [["4403", "广东深圳", v]] : []);

    // 本年 2024-01/02 各 50 美元，合计 100 美元
    for (const m of ["2024-01", "2024-02"]) {
      await importFlowFourGroupings(h, m, "import", 50, simplePartner(50), simpleRegime(50), simpleRegion(50));
      await importFlowFourGroupings(h, m, "export", 50, simplePartner(50), simpleRegime(50), simpleRegion(50));
    }

    // 1. 尚无上年基期 -> null
    const noBase = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
    expect(noBase.totals.importYoyPct).toBeNull();
    expect(noBase.totals.exportYoyPct).toBeNull();
    expect(noBase.hsItems[0].importYoyPct).toBeNull();

    // 2. 补入上年 2023-01/02 各 40 美元（合计 80 美元）-> 自动重算 2024-YTD-02 同比为 +25%
    for (const m of ["2023-01", "2023-02"]) {
      await importFlowFourGroupings(h, m, "import", 40, simplePartner(40), simpleRegime(40), simpleRegion(40));
      await importFlowFourGroupings(h, m, "export", 40, simplePartner(40), simpleRegime(40), simpleRegion(40));
    }

    const withBase = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
    expect(withBase.totals.importYoyPct).toBe(25);
    expect(withBase.totals.exportYoyPct).toBe(25);
    expect(withBase.hsItems[0].importYoyPct).toBe(25);
    expect(withBase.hsItems[0].exportYoyPct).toBe(25);

    // 3. 将上年 2023-01/02 金额均修订为 0 美元 -> 基期为 0 返回 null，集中度分母为 0 也返回 null
    for (const m of ["2023-01", "2023-02"]) {
      for (const flow of ["import", "export"] as const) {
        for (const grouping of ["product", "partner", "regime", "region"] as const) {
          const zeroCsv =
            grouping === "product"
              ? `商品编码,商品名称,美元\n${HS_A},心电图记录仪,0\n`
              : grouping === "partner"
                ? `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${HS_A},心电图记录仪,P_A,伙伴A,0\n`
                : grouping === "regime"
                  ? `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${HS_A},心电图记录仪,10,一般贸易,0\n`
                  : `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${HS_A},心电图记录仪,4403,广东深圳,0\n`;
          const res = await h.request(
            "/api/trade/import",
            uploadCsv({ dictVersion: DICT_VERSION, month: m, flow, currency: "USD", grouping, hs8: [HS_A], emptyHs8: [] }, zeroCsv),
          );
          expect(res.status).toBe(200);
        }
      }
    }

    const zeroBase = (await (await h.request("/api/trade/overview?period=2024-YTD-02")).json()) as TradeOverviewPublished;
    expect(zeroBase.totals.importYoyPct).toBeNull();
    expect(zeroBase.totals.exportYoyPct).toBeNull();
    expect(zeroBase.hsItems[0].importYoyPct).toBeNull();

    const base2023 = (await (await h.request("/api/trade/overview?period=2023-YTD-02")).json()) as TradeOverviewPublished;
    expect(base2023.concentration.import).toEqual({ cr1: null, cr3: null, cr5: null, hhi: null, partnerCount: 0 });
  });
});
