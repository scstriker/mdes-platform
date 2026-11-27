import {
  buildTradeReportHtml,
  buildTradeSummaryDualTableCsv,
  normalizeTradeOverviewSnapshot,
  type TradeFlow,
  type TradeOverviewPublished,
  type TradeReportEmbeddedCharts,
} from "@mdes/shared";
import type { ChartOption } from "@/lib/charts/echarts";
import { PUBLICATION_LIGHT_THEME } from "@/lib/charts/publication-theme";
import type { ChartTheme } from "@/lib/charts/theme";
import { downloadText } from "@/lib/download";
import {
  buildCategoryDonutOption,
  buildCr3ChartOption,
  buildStructureRankingOption,
  buildTrendChartOption,
  type StructureRankingDimension,
  type TrendGranularity,
} from "./trade-chart-options";

export type TradeReportExportOptions = {
  flow?: TradeFlow;
  rankingDimension?: StructureRankingDimension;
  trendMode?: TrendGranularity;
  startYear?: number;
  endYear?: number;
  theme?: ChartTheme;
};

export function resolveExportTheme(explicit?: ChartTheme): ChartTheme {
  return explicit ?? PUBLICATION_LIGHT_THEME;
}

/**
 * 直接基于已发布快照离屏渲染四张矢量 SVG 图表（不依赖当前 DOM 是否因搜索筛选或“数据表”视图切换而卸载图表）。
 */
export async function renderTradeReportChartsFromSnapshot(
  rawSnap: TradeOverviewPublished,
  options: TradeReportExportOptions = {},
): Promise<TradeReportEmbeddedCharts> {
  const snap = normalizeTradeOverviewSnapshot(rawSnap);
  const flow: TradeFlow = options.flow === "export" ? "export" : "import";
  const rankingDimension: StructureRankingDimension = options.rankingDimension ?? "partners";
  const years = (snap.annualTrend ?? []).map((p) => p.year);
  const defaultStart = years[0] ?? Number(snap.period.slice(0, 4));
  const defaultEnd = years[years.length - 1] ?? defaultStart;
  const startYear = options.startYear ?? defaultStart;
  const endYear = options.endYear ?? defaultEnd;
  const trendMode: TrendGranularity = options.trendMode ?? ((snap.annualTrend?.length ?? 0) >= 2 ? "annual" : "monthly");
  const theme = resolveExportTheme(options.theme);

  const { echarts } = await import("@/lib/charts/echarts");

  const renderSvg = (opt: ChartOption, width: number, height: number): string => {
    const chart = echarts.init(null, null, {
      renderer: "svg",
      ssr: true,
      width,
      height,
      locale: "ZH",
    });
    try {
      chart.setOption({ ...opt, animation: false });
      return chart.renderToSVGString();
    } finally {
      chart.dispose();
    }
  };

  return {
    trendSvg: renderSvg(buildTrendChartOption(theme, snap, { trendMode, startYear, endYear }), 520, 292),
    categorySvg: renderSvg(buildCategoryDonutOption(theme, snap.categories, flow), 520, 292),
    rankingSvg: renderSvg(buildStructureRankingOption(theme, snap, rankingDimension, flow), 520, 316),
    cr3Svg: renderSvg(buildCr3ChartOption(theme, snap.categories, flow), 520, 316),
  };
}

export async function generateTradeReportHtmlFromSnapshot(
  rawSnap: TradeOverviewPublished,
  options: TradeReportExportOptions = {},
): Promise<string> {
  const snap = normalizeTradeOverviewSnapshot(rawSnap);
  const flow: TradeFlow = options.flow === "export" ? "export" : "import";
  const rankingDimension: StructureRankingDimension = options.rankingDimension ?? "partners";
  const charts = await renderTradeReportChartsFromSnapshot(snap, { ...options, flow, rankingDimension });
  return buildTradeReportHtml(snap, charts, { flow, rankingDimension });
}

export async function exportTradeReportHtml(
  snap: TradeOverviewPublished,
  options: TradeReportExportOptions = {},
): Promise<void> {
  const html = await generateTradeReportHtmlFromSnapshot(snap, options);
  downloadText(`mdes-trade-report-${snap.period}.html`, html, "text/html;charset=utf-8");
}

export function exportTradeSummaryDualCsv(snap: TradeOverviewPublished) {
  const csv = buildTradeSummaryDualTableCsv(snap);
  downloadText(`mdes-trade-summary-${snap.period}.csv`, csv, "text/csv;charset=utf-8");
}
