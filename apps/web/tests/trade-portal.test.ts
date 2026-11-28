import { describe, expect, it } from "vitest";
import type { TradeOverviewPublished } from "@mdes/shared";
import { queryAllPublicGrouped, queryPublicSuggestions } from "../src/lib/search/search-index";
import { formatBalanceYi, formatUsdToYi } from "../src/lib/trade-format";

const SAMPLE_PUBLISHED: TradeOverviewPublished = {
  status: "published",
  period: "2024",
  source: "china_customs",
  dictVersion: "202601",
  releaseId: "11111111-2222-3333-4444-555555555555",
  units: {
    amount: "USD",
    displayAmount: "100M_USD",
    share: "PCT",
    cr: "PCT",
    hhi: "0_10000",
  },
  availablePeriods: ["2024-01", "2024"],
  coverage: {
    months: [
      "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06",
      "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12",
    ],
    expectedMonths: 12,
    coveredMonths: 12,
    applicableHs8Count: 1,
    coveredHs8Count: 1,
    notApplicableHs8Count: 0,
  },
  sourceBatches: [],
  totals: {
    importUsd: 20_375_226,
    exportUsd: 89_723_246,
    totalUsd: 110_098_472,
    balanceUsd: 69_348_020,
    importYoyPct: null,
    exportYoyPct: null,
    totalYoyPct: null,
  },
  groupingTotals: {
    product: { importUsd: 20_375_226, exportUsd: 89_723_246 },
    partner: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 2 },
    regime: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 1 },
    region: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 1 },
  },
  concentration: {
    import: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
    export: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
  },
  trend: [],
  annualTrend: [
    {
      period: "2024",
      year: 2024,
      coveredMonths: 12,
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      totalUsd: 110_098_472,
      balanceUsd: 69_348_020,
      importYoyPct: null,
      exportYoyPct: null,
      totalYoyPct: null,
      isPartial: false,
    },
  ],
  narrativeSummary: {
    headline: "2024 医疗器械进出口态势研判摘要",
    scaleParagraph: "2024 年医疗器械进出口总额 1.1010 亿美元。",
    multiYearParagraph: "当前发布 2024 单一年度序列。",
    structureParagraph: "第一大品类为医用诊断装备。",
    concentrationAlert: "进口 CR3 为 100.0%。",
  },
  categories: [
    {
      categoryId: "cat-01",
      category: "医用诊断装备",
      order: 1,
      hs8Count: 1,
      hsRange: "90181100",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importYoyPct: null,
      exportYoyPct: null,
      importConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      exportConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      topImportPartners: ["美国", "德国"],
      topExportPartners: ["美国", "德国"],
    },
  ],
  partners: [
    {
      partnerCode: "502",
      partnerName: "美国",
      importUsd: 12_225_135,
      exportUsd: 53_833_947,
      balanceUsd: 41_608_812,
      importSharePct: 60,
      exportSharePct: 60,
      topCategory: "医用诊断装备",
    },
  ],
  regimes: [],
  regions: [],
  hsItems: [
    {
      hs8: "90181100",
      hs6: "901811",
      itemName: "心电图记录仪",
      category: "医用诊断装备",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importYoyPct: null,
      exportYoyPct: null,
      importQty1: { value: 191_363_479, unit: "台" },
      importQty2: { value: 123_540, unit: "千克" },
      importQty1YoyPct: null,
      exportQty1: { value: 167_167_363, unit: "台" },
      exportQty2: { value: 384_210, unit: "千克" },
      exportQty1YoyPct: null,
      importConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      exportConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      topImportPartners: ["美国", "德国"],
      topExportPartners: ["美国", "德国"],
    },
  ],
};

describe("G4 / AC-016：门户单位换算与同版快照检索索引", () => {
  it("原始美元整数按亿美元统一格式化并保持精度一致", () => {
    expect(formatUsdToYi(20_375_226, 4)).toBe("0.2038");
    expect(formatUsdToYi(89_723_246, 4)).toBe("0.8972");
    expect(formatBalanceYi(69_348_020, 4)).toBe("+0.6935");
  });

  it("传入已发布快照时，全站搜索与本栏建议切换至同 releaseId 的真实税号、品类与伙伴", () => {
    const grouped = queryAllPublicGrouped("90181100 心电图记录仪", SAMPLE_PUBLISHED);
    const tradeGroup = grouped.groups.find((g) => g.scope === "/trade");
    expect(tradeGroup?.items).toHaveLength(1);
    expect(tradeGroup?.items[0]?.title).toContain("90181100");
    expect(tradeGroup?.items[0]?.subpageHref).toContain("/trade?period=2024&tab=hs&q=90181100");
    expect(JSON.stringify(tradeGroup?.items[0]?.fields)).toContain("11111111-2222-3333-4444-555555555555");

    // 静态旧基准中的虚构税号在正式快照生效后不再混入贸易搜索结果
    const staleCheck = queryPublicSuggestions("9018.4910", "/trade", SAMPLE_PUBLISHED);
    expect(staleCheck.scopedMatches).toHaveLength(0);
  });
});
