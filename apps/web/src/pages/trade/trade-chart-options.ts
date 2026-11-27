import {
  getTopStructureRankingByFlow,
  type TradeAnnualTrendPoint,
  type TradeCategoryStat,
  type TradeFlow,
  type TradeOverviewPublished,
  type TradeRankingDimension,
} from "@mdes/shared";
import type { ChartOption } from "@/lib/charts/echarts";
import {
  baseOption,
  statistaHorizontalBarOption,
  statistaTrendWithPartialOption,
  type ChartTheme,
} from "@/lib/charts/theme";
import { formatSharePct, formatUsdToYi, usdToYiNumber } from "@/lib/trade-format";

export type TrendGranularity = "annual" | "monthly";
export type StructureRankingDimension = TradeRankingDimension;

export function filterAnnualTrendByYearRange(
  points: readonly TradeAnnualTrendPoint[],
  startYear: number,
  endYear: number,
): TradeAnnualTrendPoint[] {
  const lo = Math.min(startYear, endYear);
  const hi = Math.max(startYear, endYear);
  return points.filter((p) => p.year >= lo && p.year <= hi);
}

export function buildTrendChartOption(
  t: ChartTheme,
  snap: TradeOverviewPublished,
  opts: {
    trendMode: TrendGranularity;
    startYear: number;
    endYear: number;
  },
): ChartOption {
  const filteredAnnualPoints = filterAnnualTrendByYearRange(
    snap.annualTrend ?? [],
    opts.startYear,
    opts.endYear,
  );
  if (opts.trendMode === "annual" && filteredAnnualPoints.length > 0) {
    const lastPt = filteredAnnualPoints[filteredAnnualPoints.length - 1];
    return statistaTrendWithPartialOption(t, {
      periods: filteredAnnualPoints.map((p) => p.period),
      lastIsPartial: Boolean(lastPt?.isPartial),
      partialLabel: "非完整年累计",
      series: [
        {
          name: "出口额(亿美元)",
          values: filteredAnnualPoints.map((p) => usdToYiNumber(p.exportUsd, 4)),
          colorIndex: 0,
          showLabels: true,
        },
        {
          name: "进口额(亿美元)",
          values: filteredAnnualPoints.map((p) => usdToYiNumber(p.importUsd, 4)),
          colorIndex: 1,
          showLabels: false,
        },
        {
          name: "差额(亿美元)",
          values: filteredAnnualPoints.map((p) => usdToYiNumber(p.balanceUsd, 4)),
          colorIndex: 2,
          showLabels: false,
        },
      ],
    });
  }

  const pts =
    snap.trend.length > 0
      ? snap.trend
      : [
          {
            period: snap.period,
            importUsd: snap.totals.importUsd,
            exportUsd: snap.totals.exportUsd,
            balanceUsd: snap.totals.balanceUsd,
            importYoyPct: snap.totals.importYoyPct,
            exportYoyPct: snap.totals.exportYoyPct,
            isPartial: false,
          },
        ];
  return statistaTrendWithPartialOption(t, {
    periods: pts.map((p) => p.period),
    lastIsPartial: false,
    series: [
      {
        name: "出口额(亿美元)",
        values: pts.map((p) => usdToYiNumber(p.exportUsd, 4)),
        colorIndex: 0,
        showLabels: pts.length <= 6,
      },
      {
        name: "进口额(亿美元)",
        values: pts.map((p) => usdToYiNumber(p.importUsd, 4)),
        colorIndex: 1,
        showLabels: false,
      },
      {
        name: "差额(亿美元)",
        values: pts.map((p) => usdToYiNumber(p.balanceUsd, 4)),
        colorIndex: 2,
        showLabels: pts.length <= 6,
      },
    ],
  });
}

export function buildCategoryDonutOption(
  t: ChartTheme,
  categories: readonly TradeCategoryStat[],
  flow: TradeFlow,
): ChartOption {
  const palette = [...t.series, t.brandNavy, t.brandSky, t.emphasis];
  const sorted = [...categories]
    .map((c) => ({
      name: c.category,
      usd: flow === "export" ? c.exportUsd : c.importUsd,
    }))
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  const data =
    sorted.length > 0
      ? sorted.map((item, idx) => ({
          name: item.name,
          value: usdToYiNumber(item.usd, 4),
          itemStyle: {
            color: palette[idx % palette.length],
            borderColor: t.surface,
            borderWidth: 1.5,
          },
        }))
      : [
          {
            name: "暂无数据",
            value: 0,
            itemStyle: { color: t.border, borderColor: t.surface, borderWidth: 1 },
          },
        ];

  return {
    color: palette,
    textStyle: { fontFamily: t.fontFamily, color: t.ink },
    animationDuration: 200,
    aria: { enabled: true, decal: { show: false } },
    tooltip: {
      trigger: "item",
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 13, fontFamily: t.fontFamily },
      extraCssText: "box-shadow:none;border-radius:0;",
      formatter: "{b}：<b>{c}</b> 亿美元（{d}%）",
    },
    legend: {
      show: false,
    },
    series: [
      {
        name: flow === "export" ? "出口品类构成(亿美元)" : "进口品类构成(亿美元)",
        type: "pie",
        radius: ["44%", "72%"],
        center: ["50%", "52%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          color: t.ink,
          fontSize: 12,
          fontFamily: t.fontFamily,
          formatter: "{b} {d}%",
        },
        labelLine: {
          show: true,
          length: 10,
          length2: 8,
          lineStyle: { color: t.borderStrong },
        },
        labelLayout: { hideOverlap: true },
        data,
      },
    ],
  };
}

export function buildStructureRankingOption(
  t: ChartTheme,
  snap: TradeOverviewPublished,
  dimension: StructureRankingDimension,
  flow: TradeFlow,
): ChartOption {
  const top = getTopStructureRankingByFlow(snap, dimension, flow, 10);

  if (top.length === 0) {
    return {
      ...baseOption(t, 1),
      ...statistaHorizontalBarOption(t, {
        categories: ["暂无记录"],
        values: [0],
        labels: ["0.0000 亿"],
        rightPadding: 96,
      }),
    };
  }

  return statistaHorizontalBarOption(t, {
    categories: top.map((i) => i.name),
    values: top.map((i) => usdToYiNumber(i.selectedUsd, 4)),
    labels: top.map((i) => `${formatUsdToYi(i.selectedUsd, 4)} 亿 (${formatSharePct(i.selectedSharePct)})`),
    highlightTopN: 3,
    rightPadding: 132,
  });
}

export function buildCr3RankingItems(categories: readonly TradeCategoryStat[], flow: TradeFlow) {
  return categories
    .map((c) => {
      const conc = flow === "export" ? c.exportConcentration : c.importConcentration;
      const tops = flow === "export" ? c.topExportPartners : c.topImportPartners;
      return {
        name: c.category,
        tier: "一级类别",
        cr3: conc.cr3 ?? 0,
        cr3Text: formatSharePct(conc.cr3),
        hhi: conc.hhi ?? "暂无数据",
        topPartners: tops.join(" / ") || "暂无数据",
      };
    })
    .sort((a, b) => b.cr3 - a.cr3)
    .slice(0, 11);
}

export function buildCr3ChartOption(
  t: ChartTheme,
  categories: readonly TradeCategoryStat[],
  flow: TradeFlow,
): ChartOption {
  const ranked = buildCr3RankingItems(categories, flow);
  const items = ranked.length > 0 ? ranked : [{ name: "暂无分类", cr3: 0, cr3Text: "0.0%" }];
  return statistaHorizontalBarOption(t, {
    categories: items.map((i) => i.name),
    values: items.map((i) => Number(i.cr3.toFixed(1))),
    labels: items.map((i) => i.cr3Text),
    emphasizeIndex: 0,
    highlightTopN: 3,
    max: 100,
    rightPadding: 76,
    referenceLine: { value: 70, label: "70% 高集中度线" },
  });
}
