import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTradeSummaryDualTableCsv, type TradeOverviewPublished } from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

let h: Harness;

beforeAll(async () => {
  h = await startHarness({ maxRows: 20_000 });
}, 30_000);

afterAll(async () => {
  await h?.dispose();
});

beforeEach(async () => {
  await h.reset();
});

function buildBulkForm(manifest: Record<string, unknown>, csvLines: string[]): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("deferPublish", "1");
  form.append("file", new File([csvLines.join("\r\n")], "annual.csv", { type: "text/csv" }));
  return { method: "POST", body: form };
}

describe("G8 / AC-020：跨年年度趋势（含 YTD 同窗口同比）、同单位数量同比、确定性研判摘要与 Excel 双表导出", () => {
  it(
    "一次性计算 totals.totalUsd、2022–2026-YTD 跨年趋势、同单位第一数量同比（异构单位返回 null）及区分『同比』与『区间增长/下降』的研判文段",
    async () => {
      const dictVer = "202601-G8";
      await h.sql([
        `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
         VALUES ('${dictVer}', 'g8_dict.csv', '0000000000000000000000000000000000000000000000000000000000000008', 2, 2, 2, 'pilot')`,
        `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
         ('${dictVer}', '90181100', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
         ('${dictVer}', '90221200', '902212', 'X射线断层检查仪', 'cat-02', '高端影像装备', 2, 2)`,
      ]);

      // 构造 2022(逆差)、2023(逆差缩小)、2024(转为顺差，且 90221200 计量单位由“千克”变为“台”验证异构单位安全 null)、2025(完整年)、2026(01..06 非完整年)
      const yearPlan = [
        { year: 2022, endMonth: 12, impPerMonth9018: 2000, expPerMonth9018: 1000, impPerMonth9022: 1000, expPerMonth9022: 500, unit9022: "千克", qty9018: 100 },
        { year: 2023, endMonth: 12, impPerMonth9018: 2200, expPerMonth9018: 2000, impPerMonth9022: 800, expPerMonth9022: 800, unit9022: "千克", qty9018: 120 },
        { year: 2024, endMonth: 12, impPerMonth9018: 2000, expPerMonth9018: 3600, impPerMonth9022: 1000, expPerMonth9022: 1400, unit9022: "台", qty9018: 150 },
        { year: 2025, endMonth: 12, impPerMonth9018: 2500, expPerMonth9018: 4000, impPerMonth9022: 1500, expPerMonth9022: 2000, unit9022: "台", qty9018: 180 },
        { year: 2026, endMonth: 6, impPerMonth9018: 3000, expPerMonth9018: 4800, impPerMonth9022: 1800, expPerMonth9022: 2400, unit9022: "台", qty9018: 216 },
      ];

      for (const yp of yearPlan) {
        const months = Array.from({ length: yp.endMonth }, (_, i) => `${yp.year}-${String(i + 1).padStart(2, "0")}`);
        for (const flow of ["import", "export"] as const) {
          for (const grouping of ["product", "partner", "regime", "region"] as const) {
            const lines: string[] = [];
            if (grouping === "product") {
              lines.push("数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
            } else if (grouping === "partner") {
              lines.push("数据年月,商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元");
            } else if (grouping === "regime") {
              lines.push("数据年月,商品编码,商品名称,贸易方式编码,贸易方式名称,美元");
            } else {
              lines.push("数据年月,商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元");
            }

            for (let m = 1; m <= yp.endMonth; m++) {
              const ym = `${yp.year}${String(m).padStart(2, "0")}`;
              const u9018 = flow === "import" ? yp.impPerMonth9018 : yp.expPerMonth9018;
              const u9022 = flow === "import" ? yp.impPerMonth9022 : yp.expPerMonth9022;
              const items = [
                { hs8: "90181100", name: "心电图记录仪", usd: u9018, qty1: yp.qty9018, unit1: "台" },
                { hs8: "90221200", name: "X射线断层检查仪", usd: u9022, qty1: 10, unit1: yp.unit9022 },
              ];
              for (const it of items) {
                if (grouping === "product") {
                  lines.push(`${ym},${it.hs8},${it.name},${it.qty1},${it.unit1},50,千克,${it.usd}`);
                } else if (grouping === "partner") {
                  const p1 = Math.floor(it.usd * 0.8);
                  const p2 = it.usd - p1;
                  lines.push(`${ym},${it.hs8},${it.name},502,美国,${p1}`);
                  lines.push(`${ym},${it.hs8},${it.name},304,德国,${p2}`);
                } else if (grouping === "regime") {
                  lines.push(`${ym},${it.hs8},${it.name},0110,一般贸易,${it.usd}`);
                } else {
                  lines.push(`${ym},${it.hs8},${it.name},3100,上海市,${it.usd}`);
                }
              }
            }

            const res = await h.request(
              "/api/trade/import-bulk",
              buildBulkForm(
                {
                  dictVersion: dictVer,
                  months,
                  flow,
                  currency: "USD",
                  grouping,
                  hs8: ["90181100", "90221200"],
                  probeVerifiedZero: true,
                },
                lines,
              ),
            );
            expect(res.status).toBe(200);
          }
        }
      }

      const pubRes = await h.post("/api/trade/publish", { dictVersion: dictVer });
      expect(pubRes.status).toBe(200);

      // 查询 2024 全年快照
      const ov2024Res = await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024`);
      expect(ov2024Res.status).toBe(200);
      const snap2024 = (await ov2024Res.json()) as TradeOverviewPublished;

      // 1) totals.totalUsd 与 totalYoyPct
      // 2024 imp = (2000+1000)*12 = 36,000; exp = (3600+1400)*12 = 60,000 -> totalUsd = 96,000, balance = +24,000
      // 2023 imp = (2200+800)*12 = 36,000; exp = (2000+800)*12 = 33,600 -> totalUsd = 69,600, balance = -2,400
      expect(snap2024.totals.importUsd).toBe(36_000);
      expect(snap2024.totals.exportUsd).toBe(60_000);
      expect(snap2024.totals.totalUsd).toBe(96_000);
      expect(snap2024.totals.totalYoyPct).toBeCloseTo(((96_000 - 69_600) / 69_600) * 100, 3);

      // 2) annualTrend 包含 2022..2025 完整年与 2026-YTD-06（isPartial=true，且与 2025-01..06 同窗口比较 +20%）
      expect(snap2024.annualTrend.map((p) => p.period)).toEqual(["2022", "2023", "2024", "2025", "2026-YTD-06"]);
      const pt2026 = snap2024.annualTrend.find((p) => p.year === 2026)!;
      expect(pt2026.isPartial).toBe(true);
      expect(pt2026.coveredMonths).toBe(6);
      // 2026-01..06 imp = (3000+1800)*6 = 28,800 vs 2025-01..06 imp = (2500+1500)*6 = 24,000 -> +20%
      expect(pt2026.importYoyPct).toBe(20);
      expect(pt2026.exportYoyPct).toBe(20);

      // 3) 第一数量同比：90181100 单位同为“台”（150 vs 120 -> +25%）；90221200 单位由“千克”变“台”（异构单位返回 null）
      const item9018 = snap2024.hsItems.find((i) => i.hs8 === "90181100")!;
      const item9022 = snap2024.hsItems.find((i) => i.hs8 === "90221200")!;
      expect(item9018.importQty1YoyPct).toBe(25);
      expect(item9018.exportQty1YoyPct).toBe(25);
      expect(item9022.importQty1YoyPct).toBeNull();
      expect(item9022.exportQty1YoyPct).toBeNull();

      // 4) narrativeSummary：2024 vs 2023 使用“同比”且识别出“逆差转为顺差”；跨多年（2022–2025）使用“区间增长”而非误标“同比”
      expect(snap2024.narrativeSummary.scaleParagraph).toContain("同比");
      expect(snap2024.narrativeSummary.scaleParagraph).toContain("顺差");
      expect(snap2024.narrativeSummary.scaleParagraph).toMatch(/由上年同期逆差转为顺差|逆差转为顺差/);
      expect(snap2024.narrativeSummary.multiYearParagraph).toContain("区间增长");
      expect(snap2024.narrativeSummary.multiYearParagraph).not.toMatch(/2022[^。]*2025[^。]*同比/);
      expect(snap2024.narrativeSummary.multiYearParagraph).toContain("2026-YTD-06");
      expect(snap2024.narrativeSummary.concentrationAlert).toContain("CR3");

      // 5) 对齐 Excel 样表（汇总表 + Sheet1 16 列）的双表导出
      const dualCsv = buildTradeSummaryDualTableCsv(snap2024);
      expect(dualCsv).toContain("进出口总额(亿美元)");
      expect(dualCsv).toContain("进口数量同比(%)");
      expect(dualCsv).toContain("90181100");
    },
    60_000,
  );
});
