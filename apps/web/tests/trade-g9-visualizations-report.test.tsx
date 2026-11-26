import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { getTopStructureRankingByFlow, type TradeOverviewPublished } from "@mdes/shared";
import type { ChartTheme } from "../src/lib/charts/theme";
import {
  buildCategoryDonutOption,
  buildStructureRankingOption,
  filterAnnualTrendByYearRange,
  LiveTradeView,
} from "../src/pages/trade/live-trade-view";
import { generateTradeReportHtmlFromSnapshot } from "../src/pages/trade/trade-report-export";

const MOCK_THEME: ChartTheme = {
  series: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"],
  emphasis: "var(--chart-3)",
  brandNavy: "var(--brand-navy)",
  brandSky: "var(--brand-sky)",
  brandRed: "var(--brand-red)",
  infoBg: "var(--info-bg)",
  surfaceSunken: "var(--surface-sunken)",
  ink: "var(--ink)",
  muted: "var(--ink-muted)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",
  surface: "var(--surface-raised)",
  fontFamily: "sans-serif",
};

const SAMPLE_G9_SNAP: TradeOverviewPublished = {
  status: "published",
  period: "2024",
  source: "china_customs",
  dictVersion: "202601",
  releaseId: "99999999-8888-7777-6666-555555555555",
  units: {
    amount: "USD",
    displayAmount: "100M_USD",
    share: "PCT",
    cr: "PCT",
    hhi: "0_10000",
  },
  availablePeriods: ["2022", "2023", "2024-01", "2024", "2025", "2026-YTD-10"],
  coverage: {
    months: [
      "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06",
      "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12",
    ],
    expectedMonths: 12,
    coveredMonths: 12,
    applicableHs8Count: 164,
    coveredHs8Count: 164,
    notApplicableHs8Count: 0,
  },
  sourceBatches: [],
  totals: {
    importUsd: 20_375_226,
    exportUsd: 89_723_246,
    totalUsd: 110_098_472,
    balanceUsd: 69_348_020,
    importYoyPct: 4.2,
    exportYoyPct: 1.06,
    totalYoyPct: 1.63,
  },
  groupingTotals: {
    product: { importUsd: 20_375_226, exportUsd: 89_723_246 },
    partner: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 2 },
    regime: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 1 },
    region: { importUsd: 20_375_226, exportUsd: 89_723_246, count: 2 },
  },
  concentration: {
    import: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
    export: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
  },
  trend: [
    {
      period: "2024-01",
      importUsd: 1_800_000,
      exportUsd: 7_200_000,
      balanceUsd: 5_400_000,
      importYoyPct: 3.5,
      exportYoyPct: 2.1,
      isPartial: false,
    },
  ],
  annualTrend: [
    { period: "2022", year: 2022, coveredMonths: 12, importUsd: 18_000_000, exportUsd: 80_000_000, totalUsd: 98_000_000, balanceUsd: 62_000_000, importYoyPct: null, exportYoyPct: null, totalYoyPct: null, isPartial: false },
    { period: "2023", year: 2023, coveredMonths: 12, importUsd: 19_553_125, exportUsd: 88_783_590, totalUsd: 108_336_715, balanceUsd: 69_230_465, importYoyPct: 8.63, exportYoyPct: 10.98, totalYoyPct: 10.55, isPartial: false },
    { period: "2024", year: 2024, coveredMonths: 12, importUsd: 20_375_226, exportUsd: 89_723_246, totalUsd: 110_098_472, balanceUsd: 69_348_020, importYoyPct: 4.2, exportYoyPct: 1.06, totalYoyPct: 1.63, isPartial: false },
    { period: "2025", year: 2025, coveredMonths: 12, importUsd: 21_500_000, exportUsd: 95_000_000, totalUsd: 116_500_000, balanceUsd: 73_500_000, importYoyPct: 5.52, exportYoyPct: 5.88, totalYoyPct: 5.81, isPartial: false },
    { period: "2026-YTD-10", year: 2026, coveredMonths: 10, importUsd: 18_900_000, exportUsd: 84_000_000, totalUsd: 102_900_000, balanceUsd: 65_100_000, importYoyPct: 6.1, exportYoyPct: 6.4, totalYoyPct: 6.3, isPartial: true },
  ],
  narrativeSummary: {
    headline: "2024 医疗器械进出口态势研判摘要",
    scaleParagraph: "2024 我国医疗器械进出口总额 1.1010 亿美元（同比增长 1.63%）。",
    multiYearParagraph: "跨年序列显示，2022—2025 年完整年度进出口总额累计区间增长 18.88%。",
    structureParagraph: "结构分布上，第一大品类为「医用诊断装备」；国内首位收发货人注册地为「上海市」。",
    concentrationAlert: "全行业进口伙伴 CR3 为 100.0%，处于高集中度区间。",
  },
  categories: [
    {
      categoryId: "cat-01",
      category: "医用诊断装备",
      order: 1,
      hs8Count: 27,
      hsRange: "9018 / 9022",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importYoyPct: 4.2,
      exportYoyPct: 1.06,
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
  regimes: [
    {
      regimeCode: "0110",
      regimeName: "一般贸易",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      importSharePct: 100,
      exportSharePct: 100,
    },
  ],
  regions: [
    {
      regionCode: "3100",
      regionName: "上海市",
      importUsd: 12_000_000,
      exportUsd: 50_000_000,
      importSharePct: 58.89,
      exportSharePct: 55.73,
    },
    {
      regionCode: "4403",
      regionName: "广东深圳",
      importUsd: 8_375_226,
      exportUsd: 39_723_246,
      importSharePct: 41.11,
      exportSharePct: 44.27,
    },
  ],
  hsItems: [
    {
      hs8: "90181100",
      hs6: "901811",
      itemName: "心电图记录仪",
      category: "医用诊断装备",
      importUsd: 20_375_226,
      exportUsd: 89_723_246,
      balanceUsd: 69_348_020,
      importYoyPct: 4.2,
      exportYoyPct: 1.06,
      importQty1: { value: 191_363_479, unit: "台" },
      importQty2: { value: 123_540, unit: "千克" },
      importQty1YoyPct: 25,
      exportQty1: { value: 167_167_363, unit: "台" },
      exportQty2: { value: 384_210, unit: "千克" },
      exportQty1YoyPct: 2.59,
      importConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      exportConcentration: { cr1: 60, cr3: 100, cr5: 100, hhi: 5200, partnerCount: 2 },
      topImportPartners: ["美国", "德国"],
      topExportPartners: ["美国", "德国"],
    },
  ],
};

describe("G9 / AC-021：/trade 门户四维旗舰图表矩阵、5栏KPI、研判摘要、数量同比与报告导出", () => {
  it("支持构造 11 大类环形饼图、伙伴/国内省市/贸易方式多维横向条形图及年份区间过滤", () => {
    const donutOpt = buildCategoryDonutOption(MOCK_THEME, SAMPLE_G9_SNAP.categories, "import");
    expect(Array.isArray(donutOpt.series)).toBe(true);
    const firstSeries = (donutOpt.series as Array<{ type?: string }>)[0];
    expect(firstSeries?.type).toBe("pie");

    const regionOpt = buildStructureRankingOption(MOCK_THEME, SAMPLE_G9_SNAP, "regions", "export");
    expect(JSON.stringify(regionOpt)).toContain("上海市");

    const filtered = filterAnnualTrendByYearRange(SAMPLE_G9_SNAP.annualTrend, 2023, 2025);
    expect(filtered.map((p) => p.period)).toEqual(["2023", "2024", "2025"]);
  });

  it("渲染 5 栏核心 KPI（含进出口总额）、态势研判摘要卡片、2×2 四维图表容器与一键导出报告按钮", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/trade?period=2024"]}>
        <LiveTradeView snap={SAMPLE_G9_SNAP} />
      </MemoryRouter>,
    );

    expect(html).toContain("2024 进出口总额");
    expect(html).toContain("1.1010");
    expect(html).toContain('data-testid="trade-narrative-summary"');
    expect(html).toContain("累计区间增长 18.88%");
    expect(html).toContain('id="fig-trade-trend"');
    expect(html).toContain('id="fig-trade-category-donut"');
    expect(html).toContain('id="fig-trade-structure-ranking"');
    expect(html).toContain('id="fig-trade-concentration"');
    expect(html).toContain('data-testid="btn-export-trade-report"');
    expect(html).toContain('data-testid="btn-export-trade-summary-csv"');
  });

  it("HS8 税号明细表展示同单位第一数量同比（importQty1YoyPct / exportQty1YoyPct）", () => {
    const hsHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/trade?period=2024&tab=hs"]}>
        <LiveTradeView snap={SAMPLE_G9_SNAP} />
      </MemoryRouter>,
    );

    expect(hsHtml).toContain("90181100");
    expect(hsHtml).toContain("+25.0%");
  });

  it("[P2-8] 无 DOM / 搜索卸载图表 / 切换数据表视图时，仍可直接基于快照生成含全部 4 张 SVG 图表的 A4 分析报告", async () => {
    const html = await generateTradeReportHtmlFromSnapshot(SAMPLE_G9_SNAP, {
      flow: "import",
      rankingDimension: "partners",
      trendMode: "annual",
      startYear: 2022,
      endYear: 2026,
      theme: MOCK_THEME,
    });

    const svgMatches = html.match(/<svg\b/g) ?? [];
    expect(svgMatches).toHaveLength(4);
    expect(html).toContain("图 1 · 跨年/月度进出口规模走势");
    expect(html).toContain("图 2 · 11大类医疗器械进口构成结构");
    expect(html).toContain("图 3 · 前十大贸易伙伴（进口侧）");
    expect(html).toContain("图 4 · 一级类别进口来源 CR3 集中度");
  }, 20_000);

  it("[P2-9] 单边排名与双边排名不同时，图 3、配套表格与 A4 导出共用按当前流向排序的 Top 10", async () => {
    // 构造 12 个贸易伙伴：双边排前 10 的伙伴仅有出口额（进口=0），第 11、12 位伙伴拥有全部进口额
    const exportOnlyPartners = Array.from({ length: 10 }, (_, idx) => ({
      partnerCode: `E${String(idx + 1).padStart(2, "0")}`,
      partnerName: `出口国${idx + 1}`,
      importUsd: 0,
      exportUsd: (20 - idx) * 10_000_000,
      balanceUsd: (20 - idx) * 10_000_000,
      importSharePct: 0,
      exportSharePct: 10,
      topCategory: "医用诊断装备",
    }));
    const importOnlyPartners = [
      {
        partnerCode: "I01",
        partnerName: "头号进口国甲",
        importUsd: 80_000_000,
        exportUsd: 0,
        balanceUsd: -80_000_000,
        importSharePct: 80,
        exportSharePct: 0,
        topCategory: "医用诊断装备",
      },
      {
        partnerCode: "I02",
        partnerName: "次席进口国乙",
        importUsd: 20_000_000,
        exportUsd: 0,
        balanceUsd: -20_000_000,
        importSharePct: 20,
        exportSharePct: 0,
        topCategory: "医用诊断装备",
      },
    ];
    const asymSnap: TradeOverviewPublished = {
      ...SAMPLE_G9_SNAP,
      partners: [...exportOnlyPartners, ...importOnlyPartners],
    };

    // 1) 进口侧：图 3 与共享选择器均排 [头号进口国甲, 次席进口国乙]，绝不列出进口为 0 的出口国
    const impTop = getTopStructureRankingByFlow(asymSnap, "partners", "import", 10);
    expect(impTop.map((x) => x.name)).toEqual(["头号进口国甲", "次席进口国乙"]);

    const impChartOpt = buildStructureRankingOption(MOCK_THEME, asymSnap, "partners", "import");
    expect((impChartOpt.yAxis as { data: string[] }).data).toEqual(["头号进口国甲", "次席进口国乙"]);

    const impReportHtml = await generateTradeReportHtmlFromSnapshot(asymSnap, {
      flow: "import",
      rankingDimension: "partners",
      theme: MOCK_THEME,
    });
    expect(impReportHtml).toContain("头号进口国甲 (I01)");
    expect(impReportHtml).toContain("次席进口国乙 (I02)");
    expect(impReportHtml).not.toContain("出口国1 (E01)");

    // 2) 出口侧：图 3 与 A4 报告均列出出口国1..10，绝不混入出口为 0 的进口国
    const expTop = getTopStructureRankingByFlow(asymSnap, "partners", "export", 10);
    expect(expTop).toHaveLength(10);
    expect(expTop[0].name).toBe("出口国1");
    expect(expTop.some((x) => x.code === "I01")).toBe(false);

    const expChartOpt = buildStructureRankingOption(MOCK_THEME, asymSnap, "partners", "export");
    expect((expChartOpt.yAxis as { data: string[] }).data[0]).toBe("出口国1");

    const expReportHtml = await generateTradeReportHtmlFromSnapshot(asymSnap, {
      flow: "export",
      rankingDimension: "partners",
      theme: MOCK_THEME,
    });
    expect(expReportHtml).toContain("出口国1 (E01)");
    expect(expReportHtml).not.toContain("头号进口国甲 (I01)");
  }, 20_000);
});
