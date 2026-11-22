import { createHash } from "node:crypto";
import iconv from "node:buffer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./helpers/harness";

void iconv;

/**
 * G1 / AC-013：单个真实税号（90181100 心电图记录仪）从月度文件到 2024 年度结果。
 * 说明：本测试使用的月度 CSV 为标明用途的【测试夹具】，年度合计对齐《2024年度仪器仪表海关进出口年度数据统计.xlsx》
 * Sheet1 第 105 行独立金标准（进口 20,375,226 美元 / 191,363,479 台；出口 89,723,246 美元 / 167,167,363 台；顺差 69,348,020 美元）。
 */

const HS8_ECG = "90181100";
const DICT_VERSION = "202601";

// 12 个月进口美元拆分（精确加总 = 20,375,226 美元；第一数量精确加总 = 191,363,479 台）
const MONTHLY_IMPORT_USD = [
  1_650_000, 1_420_000, 1_780_000, 1_690_000, 1_710_000, 1_830_000,
  1_760_000, 1_680_000, 1_740_000, 1_620_000, 1_795_000, 1_700_226,
];
const MONTHLY_IMPORT_QTY1 = [
  15_500_000, 14_200_000, 16_100_000, 15_800_000, 16_000_000, 16_400_000,
  16_200_000, 15_900_000, 16_300_000, 15_700_000, 16_600_000, 16_663_479,
];
const MONTHLY_IMPORT_QTY2 = [
  10_100, 9_200, 10_500, 10_200, 10_300, 10_800,
  10_600, 10_100, 10_400, 9_900, 10_900, 10_540,
];

// 12 个月出口美元拆分（精确加总 = 89,723,246 美元；第一数量精确加总 = 167,167,363 台）
const MONTHLY_EXPORT_USD = [
  7_200_000, 6_450_000, 7_680_000, 7_410_000, 7_520_000, 7_890_000,
  7_610_000, 7_340_000, 7_720_000, 7_490_000, 7_810_000, 7_603_246,
];
const MONTHLY_EXPORT_QTY1 = [
  13_400_000, 12_100_000, 14_300_000, 13_800_000, 14_000_000, 14_600_000,
  14_100_000, 13_700_000, 14_400_000, 13_900_000, 14_500_000, 14_367_363,
];
const MONTHLY_EXPORT_QTY2 = [
  31_000, 28_000, 33_000, 31_500, 32_000, 34_000,
  32_500, 31_200, 33_100, 32_000, 33_400, 32_510,
];

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatWithCommas(n: number): string {
  return n.toLocaleString("en-US");
}

/** 构造模拟海关官方 GBK 原件字节：商品编码 = "90181100", 商品名称 = "心电图记录仪", 单位 = "台" / "千克", 美元带千分位引号 */
function encodeAsciiWithGbkChineseSample(usdFormatted: string, qty1: number, qty2: number): Uint8Array {
  // GBK 编码常量：
  // "商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\r\n"
  const headerGbk = Buffer.from([
    0xc9, 0xcc, 0xc6, 0xb7, 0xb1, 0xe0, 0xc2, 0xeb, 0x2c, // 商品编码,
    0xc9, 0xcc, 0xc6, 0xb7, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, // 商品名称,
    0xb5, 0xda, 0xd2, 0xbb, 0xca, 0xfd, 0xc1, 0xbf, 0x2c, // 第一数量,
    0xb5, 0xda, 0xd2, 0xbb, 0xbc, 0xc6, 0xc1, 0xbf, 0xb5, 0xa5, 0xce, 0xbb, 0x2c, // 第一计量单位,
    0xb5, 0xda, 0xb6, 0xfe, 0xca, 0xfd, 0xc1, 0xbf, 0x2c, // 第二数量,
    0xb5, 0xda, 0xb6, 0xfe, 0xbc, 0xc6, 0xc1, 0xbf, 0xb5, 0xa5, 0xce, 0xbb, 0x2c, // 第二计量单位,
    0xc3, 0xc0, 0xd4, 0xaa, 0x0d, 0x0a, // 美元\r\n
  ]);
  // 心电图记录仪 (GBK): d0 c4 b5 e7 cd bc bc c7 c2 bc d2 c7
  const nameGbk = Buffer.from([0xd0, 0xc4, 0xb5, 0xe7, 0xcd, 0xbc, 0xbc, 0xc7, 0xc2, 0xbc, 0xd2, 0xc7]);
  // 台 (GBK): cc a8
  const taiGbk = Buffer.from([0xcc, 0xa8]);
  // 千克 (GBK): c7 a7 bf cb
  const kgGbk = Buffer.from([0xc7, 0xa7, 0xbf, 0xcb]);

  const rowParts = [
    Buffer.from(`${HS8_ECG},`, "ascii"),
    nameGbk,
    Buffer.from(`,${qty1},`, "ascii"),
    taiGbk,
    Buffer.from(`,${qty2},`, "ascii"),
    kgGbk,
    Buffer.from(`,"${usdFormatted}"\r\n`, "ascii"),
  ];
  return new Uint8Array(Buffer.concat([headerGbk, ...rowParts]));
}

function buildGroupingCsvUtf8(
  grouping: "product" | "partner" | "regime" | "region",
  totalUsd: number,
  qty1: number,
  qty2: number,
): Uint8Array {
  if (grouping === "product") {
    const csv = [
      "商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元",
      `${HS8_ECG},心电图记录仪,${qty1},台,${qty2},千克,"${formatWithCommas(totalUsd)}"`,
    ].join("\r\n");
    return new TextEncoder().encode(csv);
  }
  const aUsd = Math.floor(totalUsd * 0.6);
  const bUsd = totalUsd - aUsd;
  const aQty1 = Math.floor(qty1 * 0.6);
  const bQty1 = qty1 - aQty1;
  const aQty2 = Math.floor(qty2 * 0.6);
  const bQty2 = qty2 - aQty2;

  if (grouping === "partner") {
    const csv = [
      "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,第二数量,第二计量单位,美元",
      `${HS8_ECG},心电图记录仪,502,美国,${aQty1},台,${aQty2},千克,"${formatWithCommas(aUsd)}"`,
      `${HS8_ECG},心电图记录仪,304,德国,${bQty1},台,${bQty2},千克,"${formatWithCommas(bUsd)}"`,
    ].join("\r\n");
    return new TextEncoder().encode(csv);
  }
  if (grouping === "regime") {
    const csv = [
      "商品编码,商品名称,贸易方式编码,贸易方式名称,第一数量,第一计量单位,第二数量,第二计量单位,美元",
      `${HS8_ECG},心电图记录仪,10,一般贸易,${aQty1},台,${aQty2},千克,"${formatWithCommas(aUsd)}"`,
      `${HS8_ECG},心电图记录仪,14,进料加工贸易,${bQty1},台,${bQty2},千克,"${formatWithCommas(bUsd)}"`,
    ].join("\r\n");
    return new TextEncoder().encode(csv);
  }
  const csv = [
    "商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,第一数量,第一计量单位,第二数量,第二计量单位,美元",
    `${HS8_ECG},心电图记录仪,4403,广东深圳,${aQty1},台,${aQty2},千克,"${formatWithCommas(aUsd)}"`,
    `${HS8_ECG},心电图记录仪,3100,上海市,${bQty1},台,${bQty2},千克,"${formatWithCommas(bUsd)}"`,
  ].join("\r\n");
  return new TextEncoder().encode(csv);
}

function tradeUpload(
  manifest: Record<string, unknown>,
  rawBytes?: Uint8Array,
  filename = "fixture_customs.csv",
): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  if (rawBytes) {
    const copy = new Uint8Array(rawBytes.byteLength);
    copy.set(rawBytes);
    form.append("file", new File([copy], filename, { type: "text/csv" }));
  }
  return { method: "POST", body: form };
}

describe("G1 / AC-013：单税号隔离库贯通（90181100 心电图记录仪 2024 年度还原）", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(() => h?.dispose());

  beforeEach(async () => {
    await h.reset();
    // 显式将隔离验收库统计范围锁定为 202601 字典中的单个税号 90181100
    await h.sql([
      `delete from trade_hs_dict where dict_version = '${DICT_VERSION}' and hs8 != '${HS8_ECG}'`,
      `update trade_dict_meta set hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated' where dict_version = '${DICT_VERSION}'`,
    ]);
  });

  it("空库查询 GET /api/trade/overview 返回 status=empty，显式查询未发布 2024 返回 404", async () => {
    const emptyRes = await h.request("/api/trade/overview");
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as { status: string; period: string | null };
    expect(emptyBody.status).toBe("empty");
    expect(emptyBody.period).toBeNull();

    const missRes = await h.request("/api/trade/overview?period=2024");
    expect(missRes.status).toBe(404);
  });

  it("拒绝非美元币制与官网 HTML 报错页（400，不建批次）", async () => {
    const rmbCsv = new TextEncoder().encode("商品编码,商品名称,人民币\r\n90181100,心电图记录仪,1000\r\n");
    const rmbRes = await h.request(
      "/api/trade/import",
      tradeUpload(
        {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS8_ECG],
          emptyHs8: [],
        },
        rmbCsv,
        "fixture_rmb.csv",
      ),
    );
    expect(rmbRes.status).toBe(400);

    const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body>会话超时</body></html>");
    const htmlRes = await h.request(
      "/api/trade/import",
      tradeUpload(
        {
          dictVersion: DICT_VERSION,
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS8_ECG],
          emptyHs8: [],
        },
        htmlBytes,
        "fixture_timeout.csv",
      ),
    );
    expect(htmlRes.status).toBe(400);
  });

  it("导入 2024 年 12 个月 × 双流向 × 四分组原件（含 GBK 原生字节与千分位金额），精确还原金标准年度总额与双数量", async () => {
    expect(MONTHLY_IMPORT_USD.reduce((a, b) => a + b, 0)).toBe(20_375_226);
    expect(MONTHLY_EXPORT_USD.reduce((a, b) => a + b, 0)).toBe(89_723_246);
    expect(MONTHLY_IMPORT_QTY1.reduce((a, b) => a + b, 0)).toBe(191_363_479);
    expect(MONTHLY_EXPORT_QTY1.reduce((a, b) => a + b, 0)).toBe(167_167_363);

    const groupings = ["product", "partner", "regime", "region"] as const;
    let firstGbkSha = "";
    let firstGbkBatchId = "";

    for (let m = 0; m < 12; m++) {
      const month = `2024-${String(m + 1).padStart(2, "0")}`;
      const flows = [
        { flow: "import" as const, usd: MONTHLY_IMPORT_USD[m], q1: MONTHLY_IMPORT_QTY1[m], q2: MONTHLY_IMPORT_QTY2[m] },
        { flow: "export" as const, usd: MONTHLY_EXPORT_USD[m], q1: MONTHLY_EXPORT_QTY1[m], q2: MONTHLY_EXPORT_QTY2[m] },
      ];

      for (const f of flows) {
        for (const g of groupings) {
          // 2024-01 进口 product 使用真实 GBK 字节与带逗号金额测试原字节哈希与解码
          const useGbk = m === 0 && f.flow === "import" && g === "product";
          const bytes = useGbk
            ? encodeAsciiWithGbkChineseSample(formatWithCommas(f.usd), f.q1, f.q2)
            : buildGroupingCsvUtf8(g, f.usd, f.q1, f.q2);
          const expectedSha = sha256Hex(bytes);

          const res = await h.request(
            "/api/trade/import",
            tradeUpload(
              {
                dictVersion: DICT_VERSION,
                month,
                flow: f.flow,
                currency: "USD",
                grouping: g,
                hs8: [HS8_ECG],
                emptyHs8: [],
              },
              bytes,
              `fixture_${month}_${f.flow}_${g}.csv`,
            ),
          );
          expect(res.status).toBe(200);
          const receipt = (await res.json()) as {
            batchId: string;
            sourceSha256: string;
            rowCount: number;
            coverage: { received: string[]; confirmedEmpty: string[]; missing: string[] };
            status: "staged" | "published";
          };
          expect(receipt.sourceSha256).toBe(expectedSha);
          expect(receipt.coverage).toEqual({ received: [HS8_ECG], confirmedEmpty: [], missing: [] });

          if (useGbk) {
            firstGbkSha = expectedSha;
            firstGbkBatchId = receipt.batchId;
            expect(receipt.status).toBe("staged");
          }

          const isLastOfMonth = f.flow === "export" && g === "region";
          if (isLastOfMonth) {
            expect(receipt.status).toBe("published");
          }
        }
      }

      if (m === 0) {
        // 仅发布 2024-01 时，全年 2024 尚未齐备，应返回 404；单月 2024-01 可查
        const janRes = await h.request("/api/trade/overview?period=2024-01");
        expect(janRes.status).toBe(200);
        const yearEarlyRes = await h.request("/api/trade/overview?period=2024");
        expect(yearEarlyRes.status).toBe(404);
      }
    }

    // 12 个月全部齐备后，查询 2024 年度快照核对金标准 Sheet1 第 105 行
    const annualRes = await h.request("/api/trade/overview?period=2024");
    expect(annualRes.status).toBe(200);
    const annual = (await annualRes.json()) as {
      status: string;
      period: string;
      dictVersion: string;
      source: string;
      releaseId: string;
      totals: {
        importUsd: number;
        exportUsd: number;
        balanceUsd: number;
        importYoyPct: number | null;
        exportYoyPct: number | null;
      };
      sourceBatches: Array<{ batchId: string; month: string; flow: string; grouping: string; sourceSha256: string }>;
      hsItems: Array<{
        hs8: string;
        category: string;
        importUsd: number;
        exportUsd: number;
        balanceUsd: number;
        importQty1: { value: number | null; unit: string | null };
        importQty2: { value: number | null; unit: string | null };
        exportQty1: { value: number | null; unit: string | null };
        exportQty2: { value: number | null; unit: string | null };
      }>;
    };

    expect(annual.status).toBe("published");
    expect(annual.period).toBe("2024");
    expect(annual.dictVersion).toBe(DICT_VERSION);
    expect(annual.source).toBe("china_customs");
    expect(annual.releaseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(annual.totals).toEqual({
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importYoyPct: null,
      exportYoyPct: null,
    });

    expect(annual.hsItems).toHaveLength(1);
    expect(annual.hsItems[0]).toMatchObject({
      hs8: HS8_ECG,
      category: "医用诊断装备",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importQty1: { value: 191_363_479, unit: "台" },
      importQty2: { value: MONTHLY_IMPORT_QTY2.reduce((a, b) => a + b, 0), unit: "千克" },
      exportQty1: { value: 167_167_363, unit: "台" },
      exportQty2: { value: MONTHLY_EXPORT_QTY2.reduce((a, b) => a + b, 0), unit: "千克" },
    });

    // 从年度发布结果追溯至 2024-01 进口 GBK 原件批次与 SHA-256
    expect(annual.sourceBatches).toHaveLength(96);
    expect(annual.sourceBatches).toContainEqual(
      expect.objectContaining({
        batchId: firstGbkBatchId,
        month: "2024-01",
        flow: "import",
        grouping: "product",
        sourceSha256: firstGbkSha,
      }),
    );
  }, 30_000);
});
