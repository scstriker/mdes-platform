import {
  formatStatNumber,
  projectStatisticView,
  type ChartTypeId,
  type ObsStatus,
  type ProjectedSeries,
  type ProjectedStatisticView,
  type ReferenceLineSpec,
  type Statistic,
  type StatisticViewState,
} from "@mdes/shared";
import type {
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";
import type { ChartOption } from "./echarts";
import { axisText, baseOption, categoryAxis, SERIES_SYMBOLS, valueAxis, type ChartTheme } from "./theme";

export type ChartPointDatum = {
  value: number | null;
  name?: string;
  seriesKey: string;
  seriesLabel: string;
  period: string;
  unit: string;
  obsStatus: ObsStatus;
  statusLabel: string;
  drillHref?: string;
  rawDisplay?: string;
};

export type BuiltStatisticChart = {
  option: ChartOption;
  projected: ProjectedStatisticView;
};

export const CHART_TYPE_LABELS: Record<ChartTypeId, string> = {
  line: "折线图",
  bar: "柱状图",
  horizontal_bar: "横向条形图",
  grouped_bar: "分组柱状图",
  stacked_bar: "堆叠柱状图",
  stacked_bar_100: "百分比堆叠柱状图",
  area: "面积图",
  pie: "环形构成图",
  scatter: "散点对标图",
};

export function makeLabelCoordKey(seriesKey: string, period: string): string {
  return `${seriesKey}:${period}`;
}

export function formatSignedGrowth(value: number | null, unit = "%"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const absFormatted = formatStatNumber(Math.abs(value), unit);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return unit === "%" ? `${sign}${absFormatted}%` : `${sign}${absFormatted}`;
}

function formatAxisPointLabel(value: number | null, unit: string, forceSigned = false): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (forceSigned) return formatSignedGrowth(value, unit);
  const num = formatStatNumber(value, unit);
  return unit === "%" ? `${num}%` : num;
}

function isLabelVisible(
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
  seriesKey: string,
  period: string,
): boolean {
  if (!showLabels) return false;
  return !hiddenSet.has(makeLabelCoordKey(seriesKey, period));
}

function buildReferenceMarkLine(
  refs: readonly ReferenceLineSpec[],
  theme: ChartTheme,
  axisKey: "xAxis" | "yAxis",
) {
  if (refs.length === 0) return undefined;
  return {
    symbol: ["none", "none"] as [string, string],
    silent: true,
    data: refs.map((ref) => {
      const toneColor = ref.tone === "warning" ? theme.brandRed : theme.brandSky;
      return {
        [axisKey]: ref.value,
        lineStyle: { color: toneColor, type: "dashed" as const, width: 1.5 },
        label: {
          show: true,
          position: axisKey === "xAxis" ? ("end" as const) : ("insideEndTop" as const),
          formatter: ref.label,
          color: toneColor,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: theme.fontFamily,
        },
      };
    }),
  };
}

function buildMethodologyBreakMarkLine(projected: ProjectedStatisticView, theme: ChartTheme) {
  if (projected.methodologyBreaks.length === 0) return undefined;
  return {
    symbol: ["none", "none"] as [string, string],
    silent: true,
    data: projected.methodologyBreaks.map((brk) => ({
      xAxis: brk.effective_period,
      lineStyle: { color: theme.brandRed, type: "dashed" as const, width: 1.5 },
      label: {
        show: true,
        position: "insideEndTop" as const,
        distance: 4,
        formatter: brk.short_label,
        color: theme.brandRed,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
    })),
  };
}

function buildNonActualMarkAreas(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  extendToPreviousJoin: boolean,
) {
  const { periods, plottedSeries } = projected;
  if (periods.length === 0 || plottedSeries.length === 0) return undefined;

  const periodStatuses: (ObsStatus | null)[] = periods.map((_, pIdx) => {
    for (const s of plottedSeries) {
      const st = s.points[pIdx]?.status ?? "A";
      if (st !== "A") return st;
    }
    return null;
  });

  const ranges: { startIdx: number; endIdx: number; status: ObsStatus }[] = [];
  let idx = 0;
  while (idx < periodStatuses.length) {
    const st = periodStatuses[idx];
    if (st) {
      let end = idx;
      while (end + 1 < periodStatuses.length && periodStatuses[end + 1] !== null) {
        end++;
      }
      ranges.push({ startIdx: idx, endIdx: end, status: st });
      idx = end + 1;
    } else {
      idx++;
    }
  }

  if (ranges.length === 0) return undefined;

  const statusTagLabel = (st: ObsStatus) => {
    if (st === "F") return "预测区间";
    if (st === "E") return "估算区间";
    return "非完整期";
  };

  return {
    silent: true,
    itemStyle: { color: theme.infoBg, opacity: 0.55 },
    label: {
      show: true,
      position: "top" as const,
      distance: 4,
      color: theme.brandNavy,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: theme.fontFamily,
    },
    data: ranges.map(
      (r): [{ name: string; xAxis: string }, { xAxis: string }] => {
        const fromIdx = extendToPreviousJoin && r.startIdx > 0 ? r.startIdx - 1 : r.startIdx;
        return [
          { name: statusTagLabel(r.status), xAxis: periods[fromIdx]! },
          { xAxis: periods[r.endIdx]! },
        ];
      },
    ),
  };
}

function buildUnifiedAxisTooltip(
  theme: ChartTheme,
  baseTooltip: ChartOption["tooltip"],
  opts: { signed?: boolean; pointerType?: "line" | "shadow" } = {},
): ChartOption["tooltip"] {
  return {
    ...(typeof baseTooltip === "object" && !Array.isArray(baseTooltip) ? baseTooltip : {}),
    trigger: "axis",
    axisPointer:
      opts.pointerType === "shadow"
        ? { type: "shadow" }
        : { type: "line", lineStyle: { color: theme.borderStrong, type: "dashed" } },
    formatter: (params: unknown) => {
      const list = Array.isArray(params) ? params : [params];
      if (list.length === 0) return "";
      const first = list[0] as { axisValueLabel?: string; name?: string };
      const header = String(first?.axisValueLabel ?? first?.name ?? "");
      const lines: string[] = [header];
      const seenKeys = new Set<string>();

      for (const raw of list) {
        const item = raw as {
          seriesName?: string;
          marker?: string;
          value?: unknown;
          data?: ChartPointDatum;
        };
        const datum = item.data;
        const val = typeof datum?.value === "number" ? datum.value : typeof item.value === "number" ? item.value : null;
        if (val === null || !Number.isFinite(val)) continue;

        const dedupeKey = datum ? `${datum.seriesKey}:${datum.period}` : `${item.seriesName ?? ""}:${header}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const unit = datum?.unit ?? "";
        const displayVal =
          datum?.rawDisplay ??
          (opts.signed ? formatSignedGrowth(val, unit) : `${formatStatNumber(val, unit)}${unit ? ` ${unit}` : ""}`);
        const statusSuffix =
          datum && datum.obsStatus !== "A" ? ` <span style="opacity:0.8">（${datum.statusLabel}）</span>` : "";
        lines.push(`${item.marker ?? ""} ${item.seriesName ?? datum?.seriesLabel ?? ""}：<b>${displayVal}</b>${statusSuffix}`);
      }
      return lines.join("<br/>");
    },
  };
}

function maybeBuildDataZoom(periods: readonly string[], theme: ChartTheme) {
  if (periods.length <= 8) return undefined;
  return [
    { type: "inside" as const, xAxisIndex: 0 },
    {
      type: "slider" as const,
      xAxisIndex: 0,
      height: 18,
      bottom: 4,
      borderColor: theme.border,
      fillerColor: theme.infoBg,
      textStyle: { color: theme.muted, fontSize: 11, fontFamily: theme.fontFamily },
    },
  ];
}

function computeStacked100Values(plottedSeries: readonly ProjectedSeries[], periodCount: number): number[][] {
  const totals = Array.from({ length: periodCount }, (_, pIdx) =>
    plottedSeries.reduce((sum, s) => {
      const v = s.points[pIdx]?.value;
      return v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? sum + v : sum;
    }, 0),
  );
  return plottedSeries.map((s) =>
    s.points.map((pt, pIdx) => {
      const total = totals[pIdx] ?? 0;
      if (pt.value === null || !Number.isFinite(pt.value) || total <= 0) return 0;
      return Math.round((pt.value / total) * 10000) / 100;
    }),
  );
}

/* ==================== 1. time_series ==================== */

function buildTimeSeriesOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  const { periods, plottedSeries, chartType, zeroBaseline, metricMode } = projected;
  const base = baseOption(theme, plottedSeries.length);
  const hasZoom = periods.length > 8;
  const dataZoom = maybeBuildDataZoom(periods, theme);
  const breakMarkLine = buildMethodologyBreakMarkLine(projected, theme);
  const isLineOrArea = chartType === "line" || chartType === "area";
  const nonActualMarkArea = buildNonActualMarkAreas(projected, theme, isLineOrArea);
  const hasTopAnnotations = Boolean(breakMarkLine || nonActualMarkArea);
  const signedLabels = metricMode === "yoy_growth";

  if (chartType === "line" || chartType === "area") {
    const lineSeriesList: LineSeriesOption[] = [];

    plottedSeries.forEach((s, sIdx) => {
      const color = theme.series[sIdx % theme.series.length]!;
      const symbol = SERIES_SYMBOLS[sIdx % SERIES_SYMBOLS.length]!;
      const hasNonActual = chartType === "line" && s.points.some((pt) => pt.status !== "A" && pt.value !== null);

      if (!hasNonActual) {
        const dataItems = s.points.map((pt) => {
          const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
          return {
            value: pt.value,
            seriesKey: s.key,
            seriesLabel: s.label,
            period: pt.period,
            unit: s.unit,
            obsStatus: pt.status,
            statusLabel: pt.status_label,
            drillHref: pt.drill_href,
            label: {
              show: visible,
              formatter: () => formatAxisPointLabel(pt.value, s.unit, signedLabels),
            },
          };
        });

        lineSeriesList.push({
          id: `${s.key}-actual`,
          name: s.label,
          type: "line",
          universalTransition: true,
          symbol,
          symbolSize: 7,
          data: dataItems as NonNullable<LineSeriesOption["data"]>,
          itemStyle: { color },
          lineStyle: { width: 2.5, color, type: "solid" },
          ...(chartType === "area" ? { areaStyle: { color, opacity: 0.16 } } : {}),
          label: {
            show: showLabels,
            position: "top",
            distance: 6,
            color: theme.ink,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: theme.fontFamily,
          },
          labelLayout: { hideOverlap: true },
          ...(sIdx === 0 && breakMarkLine ? { markLine: breakMarkLine } : {}),
          ...(sIdx === 0 && nonActualMarkArea ? { markArea: nonActualMarkArea } : {}),
        });
        return;
      }

      // 拆分实线实际段（status === "A"）与虚线估算/预测/非完整期段（在衔接索引重叠保证不断线）
      const actualItems = s.points.map((pt) => {
        const isActual = pt.status === "A";
        const visible = isActual && isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
        return {
          value: isActual ? pt.value : null,
          seriesKey: s.key,
          seriesLabel: s.label,
          period: pt.period,
          unit: s.unit,
          obsStatus: pt.status,
          statusLabel: pt.status_label,
          drillHref: pt.drill_href,
          label: {
            show: visible,
            formatter: () => (isActual ? formatAxisPointLabel(pt.value, s.unit, signedLabels) : ""),
          },
        };
      });

      const dashedItems = s.points.map((pt, pIdx) => {
        const prevNonActual = pIdx > 0 && s.points[pIdx - 1]!.status !== "A" && s.points[pIdx - 1]!.value !== null;
        const nextNonActual =
          pIdx < s.points.length - 1 && s.points[pIdx + 1]!.status !== "A" && s.points[pIdx + 1]!.value !== null;
        const includeInDashed = pt.status !== "A" || prevNonActual || nextNonActual;
        const isNonActualPoint = pt.status !== "A";
        const visible = isNonActualPoint && isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
        return {
          value: includeInDashed ? pt.value : null,
          symbol: isNonActualPoint ? "emptyCircle" : "none",
          symbolSize: isNonActualPoint ? 8 : 0,
          seriesKey: s.key,
          seriesLabel: s.label,
          period: pt.period,
          unit: s.unit,
          obsStatus: pt.status,
          statusLabel: pt.status_label,
          drillHref: pt.drill_href,
          label: {
            show: visible,
            formatter: () => (isNonActualPoint ? formatAxisPointLabel(pt.value, s.unit, signedLabels) : ""),
          },
        };
      });

      lineSeriesList.push({
        id: `${s.key}-actual`,
        name: s.label,
        type: "line",
        universalTransition: true,
        symbol,
        symbolSize: 7,
        data: actualItems as NonNullable<LineSeriesOption["data"]>,
        itemStyle: { color },
        lineStyle: { width: 2.5, color, type: "solid" },
        label: {
          show: showLabels,
          position: "top",
          distance: 6,
          color: theme.ink,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: theme.fontFamily,
        },
        labelLayout: { hideOverlap: true },
        ...(sIdx === 0 && breakMarkLine ? { markLine: breakMarkLine } : {}),
        ...(sIdx === 0 && nonActualMarkArea ? { markArea: nonActualMarkArea } : {}),
      });

      lineSeriesList.push({
        id: `${s.key}-forecast`,
        name: s.label,
        type: "line",
        universalTransition: true,
        symbol: "emptyCircle",
        symbolSize: 8,
        data: dashedItems as NonNullable<LineSeriesOption["data"]>,
        itemStyle: { color },
        lineStyle: { width: 2, color, type: "dashed" },
        label: {
          show: showLabels,
          position: "top",
          distance: 6,
          color: theme.brandNavy,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: theme.fontFamily,
        },
        labelLayout: { hideOverlap: true },
      });
    });

    return {
      ...base,
      grid: {
        left: 8,
        right: 28,
        top: plottedSeries.length > 1 ? 52 : hasTopAnnotations ? 38 : 24,
        bottom: hasZoom ? 36 : 8,
        containLabel: true,
      },
      legend: {
        ...(typeof base.legend === "object" && !Array.isArray(base.legend) ? base.legend : {}),
        show: plottedSeries.length > 1,
        data: plottedSeries.map((s) => s.label),
      },
      tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { signed: signedLabels }),
      xAxis: categoryAxis(theme, [...periods], { showAllLabels: periods.length <= 10 }),
      yAxis: valueAxis(theme, { scale: !zeroBaseline }),
      ...(dataZoom ? { dataZoom } : {}),
      series: lineSeriesList,
    };
  }

  // bar / grouped_bar / stacked_bar
  const isStacked = chartType === "stacked_bar";
  const barSeriesList: BarSeriesOption[] = plottedSeries.map((s, sIdx) => {
    const color = theme.series[sIdx % theme.series.length]!;
    const dataItems = s.points.map((pt) => {
      const nonActual = pt.status !== "A";
      const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
      return {
        value: pt.value,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit: s.unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        itemStyle: nonActual
          ? { color: theme.infoBg, borderColor: color, borderWidth: 1.5, borderType: "dashed" as const, borderRadius: 0 }
          : { color, borderRadius: 0 },
        label: {
          show: visible,
          formatter: () => formatAxisPointLabel(pt.value, s.unit, signedLabels),
        },
      };
    });

    return {
      id: s.key,
      name: s.label,
      type: "bar",
      universalTransition: true,
      ...(isStacked ? { stack: "total" } : {}),
      barMaxWidth: 28,
      data: dataItems as NonNullable<BarSeriesOption["data"]>,
      label: {
        show: showLabels,
        position: isStacked ? "inside" : "top",
        distance: 5,
        color: isStacked ? theme.ink : theme.ink,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
      ...(sIdx === 0 && breakMarkLine ? { markLine: breakMarkLine } : {}),
      ...(sIdx === 0 && nonActualMarkArea ? { markArea: nonActualMarkArea } : {}),
    };
  });

  return {
    ...base,
    grid: {
      left: 8,
      right: 24,
      top: plottedSeries.length > 1 ? 52 : hasTopAnnotations ? 38 : 24,
      bottom: hasZoom ? 36 : 8,
      containLabel: true,
    },
    tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { signed: signedLabels, pointerType: "shadow" }),
    xAxis: categoryAxis(theme, [...periods], { showAllLabels: periods.length <= 10 }),
    yAxis: valueAxis(theme, { scale: false }),
    ...(dataZoom ? { dataZoom } : {}),
    series: barSeriesList,
  };
}

/* ==================== 2. growth_rate ==================== */

function buildGrowthRateOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  const { periods, plottedSeries, chartType } = projected;
  const base = baseOption(theme, plottedSeries.length);
  const hasZoom = periods.length > 8;
  const dataZoom = maybeBuildDataZoom(periods, theme);

  const zeroMarkLine = {
    symbol: ["none", "none"] as [string, string],
    silent: true,
    data: [
      {
        yAxis: 0,
        lineStyle: { color: theme.ink, type: "solid" as const, width: 1.5 },
        label: { show: false },
      },
      ...(projected.methodologyBreaks.map((brk) => ({
        xAxis: brk.effective_period,
        lineStyle: { color: theme.brandRed, type: "dashed" as const, width: 1.5 },
        label: {
          show: true,
          position: "insideEndTop" as const,
          formatter: brk.short_label,
          color: theme.brandRed,
          fontSize: 11,
          fontFamily: theme.fontFamily,
        },
      }))),
    ],
  };

  // 严禁红绿涨跌色：正值使用 chart[0] 主深蓝，负值使用 chart[3] 灰蓝（多序列时用 chart[1] 亮蓝区分）
  const positiveColor = theme.series[0]!;
  const negativeColor = theme.series[3] ?? theme.series[1]!;

  if (chartType === "line") {
    const seriesList: LineSeriesOption[] = plottedSeries.map((s, sIdx) => {
      const lineColor = sIdx === 0 ? positiveColor : theme.series[sIdx % theme.series.length]!;
      const symbol = SERIES_SYMBOLS[sIdx % SERIES_SYMBOLS.length]!;
      const dataItems = s.points.map((pt) => {
        const val = pt.value;
        const isNeg = val !== null && val < 0;
        const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
        return {
          value: val,
          seriesKey: s.key,
          seriesLabel: s.label,
          period: pt.period,
          unit: s.unit,
          obsStatus: pt.status,
          statusLabel: pt.status_label,
          drillHref: pt.drill_href,
          rawDisplay: formatSignedGrowth(val, s.unit),
          itemStyle: { color: isNeg ? negativeColor : lineColor },
          label: {
            show: visible,
            position: isNeg ? ("bottom" as const) : ("top" as const),
            formatter: () => formatSignedGrowth(val, s.unit),
          },
        };
      });

      return {
        id: s.key,
        name: s.label,
        type: "line",
        universalTransition: true,
        symbol,
        symbolSize: 7,
        data: dataItems as NonNullable<LineSeriesOption["data"]>,
        lineStyle: { width: 2.5, color: lineColor },
        label: {
          show: showLabels,
          distance: 6,
          color: theme.ink,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: theme.fontFamily,
        },
        labelLayout: { hideOverlap: true },
        ...(sIdx === 0 ? { markLine: zeroMarkLine } : {}),
      };
    });

    return {
      ...base,
      color: [positiveColor, theme.series[1]!, negativeColor],
      grid: { left: 8, right: 24, top: plottedSeries.length > 1 ? 48 : 28, bottom: hasZoom ? 36 : 14, containLabel: true },
      tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { signed: true }),
      xAxis: {
        ...categoryAxis(theme, [...periods], { showAllLabels: periods.length <= 10 }),
        axisLine: { onZero: false, lineStyle: { color: theme.borderStrong } },
      },
      yAxis: {
        ...valueAxis(theme, { scale: false }),
        axisLabel: {
          ...axisText(theme),
          formatter: (val: number) => `${val > 0 ? "+" : ""}${val}%`,
        },
      },
      ...(dataZoom ? { dataZoom } : {}),
      series: seriesList,
    };
  }

  const barSeriesList: BarSeriesOption[] = plottedSeries.map((s, sIdx) => {
    const seriesPosColor = sIdx === 0 ? positiveColor : theme.series[sIdx % theme.series.length]!;
    const dataItems = s.points.map((pt) => {
      const val = pt.value;
      const isNeg = val !== null && val < 0;
      const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
      return {
        value: val,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit: s.unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        rawDisplay: formatSignedGrowth(val, s.unit),
        itemStyle: {
          color: isNeg ? negativeColor : seriesPosColor,
          borderRadius: 0,
        },
        label: {
          show: visible,
          position: isNeg ? ("bottom" as const) : ("top" as const),
          formatter: () => formatSignedGrowth(val, s.unit),
        },
      };
    });

    return {
      id: s.key,
      name: s.label,
      type: "bar",
      universalTransition: true,
      barMaxWidth: 32,
      data: dataItems as NonNullable<BarSeriesOption["data"]>,
      label: {
        show: showLabels,
        distance: 6,
        color: theme.ink,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
      ...(sIdx === 0 ? { markLine: zeroMarkLine } : {}),
    };
  });

  return {
    ...base,
    color: [positiveColor, theme.series[1]!, negativeColor],
    grid: { left: 8, right: 24, top: plottedSeries.length > 1 ? 48 : 28, bottom: hasZoom ? 36 : 14, containLabel: true },
    tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { signed: true, pointerType: "shadow" }),
    xAxis: {
      ...categoryAxis(theme, [...periods], { showAllLabels: periods.length <= 10 }),
      axisLine: { onZero: false, lineStyle: { color: theme.borderStrong } },
    },
    yAxis: {
      ...valueAxis(theme, { scale: false }),
      axisLabel: {
        ...axisText(theme),
        formatter: (val: number) => `${val > 0 ? "+" : ""}${val}%`,
      },
    },
    ...(dataZoom ? { dataZoom } : {}),
    series: barSeriesList,
  };
}

/* ==================== 3. entity_ranking ==================== */

function buildEntityRankingOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  const { periods, plottedSeries, chartType, referenceLines } = projected;
  const base = baseOption(theme, plottedSeries.length);
  const isHorizontal = chartType !== "bar";

  const maxDataVal = Math.max(
    0,
    ...plottedSeries.flatMap((s) => s.points.map((p) => (typeof p.value === "number" ? p.value : 0))),
    ...referenceLines.map((r) => r.value),
  );
  const axisMax = maxDataVal > 0 && projected.unit === "%" && maxDataVal <= 100 ? Math.min(100, Math.ceil(maxDataVal * 1.12)) : undefined;

  const refMarkLine = buildReferenceMarkLine(referenceLines, theme, isHorizontal ? "xAxis" : "yAxis");

  const seriesList: BarSeriesOption[] = plottedSeries.map((s, sIdx) => {
    const baseColor = theme.series[sIdx % theme.series.length]!;
    const dataItems = s.points.map((pt, pIdx) => {
      const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
      const barColor = plottedSeries.length === 1 && pIdx >= 3 && periods.length >= 6 ? theme.series[1]! : baseColor;
      return {
        value: pt.value,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit: s.unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        itemStyle: { color: barColor, borderRadius: 0 },
        label: {
          show: visible,
          formatter: () => formatAxisPointLabel(pt.value, s.unit),
        },
      };
    });

    return {
      id: s.key,
      name: s.label,
      type: "bar",
      universalTransition: true,
      barMaxWidth: isHorizontal ? 20 : 28,
      data: dataItems as NonNullable<BarSeriesOption["data"]>,
      label: {
        show: showLabels,
        position: isHorizontal ? "right" : "top",
        distance: 6,
        color: theme.ink,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
      ...(sIdx === 0 && refMarkLine ? { markLine: refMarkLine } : {}),
    };
  });

  if (isHorizontal) {
    return {
      ...base,
      grid: {
        left: 8,
        right: showLabels ? 72 : 28,
        top: referenceLines.length > 0 ? 32 : plottedSeries.length > 1 ? 42 : 12,
        bottom: 8,
        containLabel: true,
      },
      tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { pointerType: "shadow" }),
      xAxis: valueAxis(theme, { max: axisMax, scale: false }),
      yAxis: {
        type: "category",
        inverse: true,
        data: [...periods],
        axisLine: { lineStyle: { color: theme.borderStrong } },
        axisTick: { show: false },
        axisLabel: { color: theme.ink, fontSize: 13, fontFamily: theme.fontFamily },
      },
      series: seriesList,
    };
  }

  return {
    ...base,
    grid: {
      left: 8,
      right: 24,
      top: referenceLines.length > 0 ? 36 : plottedSeries.length > 1 ? 42 : 24,
      bottom: 8,
      containLabel: true,
    },
    tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { pointerType: "shadow" }),
    xAxis: categoryAxis(theme, [...periods], { showAllLabels: true }),
    yAxis: valueAxis(theme, { max: axisMax, scale: false }),
    series: seriesList,
  };
}

/* ==================== 4. grouped_comparison (& multi_entity_benchmark) ==================== */

function buildGroupedComparisonOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  const { periods, plottedSeries, chartType, referenceLines } = projected;
  if (chartType === "line") {
    return buildTimeSeriesOption(projected, theme, showLabels, hiddenSet);
  }
  if (chartType === "stacked_bar" || chartType === "stacked_bar_100") {
    return buildStructureChangeOption(projected, theme, showLabels, hiddenSet);
  }

  const base = baseOption(theme, plottedSeries.length);

  if (chartType === "scatter") {
    const scatterSeries: ScatterSeriesOption[] = plottedSeries.map((s, sIdx) => {
      const color = theme.series[sIdx % theme.series.length]!;
      const dataItems = s.points.map((pt) => ({
        value: pt.value,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit: s.unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        label: {
          show: isLabelVisible(showLabels, hiddenSet, s.key, pt.period),
          formatter: () => formatAxisPointLabel(pt.value, s.unit),
        },
      }));
      return {
        id: s.key,
        name: s.label,
        type: "scatter",
        universalTransition: true,
        symbolSize: 12,
        itemStyle: { color },
        data: dataItems as NonNullable<ScatterSeriesOption["data"]>,
        label: {
          show: showLabels,
          position: "top",
          distance: 5,
          color: theme.ink,
          fontSize: 11,
          fontFamily: theme.fontFamily,
        },
      };
    });
    return {
      ...base,
      tooltip: buildUnifiedAxisTooltip(theme, base.tooltip),
      xAxis: categoryAxis(theme, [...periods], { showAllLabels: true }),
      yAxis: valueAxis(theme, { scale: !projected.zeroBaseline }),
      series: scatterSeries,
    };
  }

  const isHorizontal = chartType === "horizontal_bar";
  const refMarkLine = buildReferenceMarkLine(referenceLines, theme, isHorizontal ? "xAxis" : "yAxis");

  const seriesList: BarSeriesOption[] = plottedSeries.map((s, sIdx) => {
    const color = theme.series[sIdx % theme.series.length]!;
    const dataItems = s.points.map((pt) => {
      const nonActual = pt.status !== "A";
      const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
      return {
        value: pt.value,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit: s.unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        itemStyle: nonActual
          ? { color: theme.infoBg, borderColor: color, borderWidth: 1.5, borderType: "dashed" as const, borderRadius: 0 }
          : { color, borderRadius: 0 },
        label: {
          show: visible,
          formatter: () => formatAxisPointLabel(pt.value, s.unit),
        },
      };
    });

    return {
      id: s.key,
      name: s.label,
      type: "bar",
      universalTransition: true,
      barMaxWidth: isHorizontal ? 16 : 24,
      barGap: "18%",
      data: dataItems as NonNullable<BarSeriesOption["data"]>,
      label: {
        show: showLabels,
        position: isHorizontal ? "right" : "top",
        distance: 5,
        color: theme.ink,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
      ...(sIdx === 0 && refMarkLine ? { markLine: refMarkLine } : {}),
    };
  });

  if (isHorizontal) {
    return {
      ...base,
      grid: {
        left: 8,
        right: showLabels ? 68 : 28,
        top: plottedSeries.length > 1 ? 46 : 18,
        bottom: 8,
        containLabel: true,
      },
      tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { pointerType: "shadow" }),
      xAxis: valueAxis(theme, { scale: false }),
      yAxis: {
        type: "category",
        inverse: true,
        data: [...periods],
        axisLine: { lineStyle: { color: theme.borderStrong } },
        axisTick: { show: false },
        axisLabel: { color: theme.ink, fontSize: 13, fontFamily: theme.fontFamily },
      },
      series: seriesList,
    };
  }

  return {
    ...base,
    grid: {
      left: 8,
      right: 24,
      top: plottedSeries.length > 1 ? 48 : 24,
      bottom: 8,
      containLabel: true,
    },
    tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { pointerType: "shadow" }),
    xAxis: categoryAxis(theme, [...periods], { showAllLabels: true }),
    yAxis: valueAxis(theme, { scale: false }),
    series: seriesList,
  };
}

/* ==================== 5. structure_change ==================== */

function buildStructureChangeOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  const { periods, plottedSeries, chartType } = projected;
  if (chartType === "line" || chartType === "area") {
    return buildTimeSeriesOption(projected, theme, showLabels, hiddenSet);
  }

  const base = baseOption(theme, plottedSeries.length);
  const is100 = chartType === "stacked_bar_100";
  const pctMatrix = is100 ? computeStacked100Values(plottedSeries, periods.length) : null;

  const seriesList: BarSeriesOption[] = plottedSeries.map((s, sIdx) => {
    const color = theme.series[sIdx % theme.series.length]!;
    const dataItems = s.points.map((pt, pIdx) => {
      const val = is100 ? (pctMatrix?.[sIdx]?.[pIdx] ?? 0) : pt.value;
      const unit = is100 ? "%" : s.unit;
      const visible = isLabelVisible(showLabels, hiddenSet, s.key, pt.period);
      return {
        value: val,
        seriesKey: s.key,
        seriesLabel: s.label,
        period: pt.period,
        unit,
        obsStatus: pt.status,
        statusLabel: pt.status_label,
        drillHref: pt.drill_href,
        itemStyle: { color, borderRadius: 0 },
        label: {
          show: visible && typeof val === "number" && val > 0,
          formatter: () => formatAxisPointLabel(val, unit),
        },
      };
    });

    return {
      id: s.key,
      name: s.label,
      type: "bar",
      universalTransition: true,
      stack: "structure_total",
      barMaxWidth: 36,
      data: dataItems as NonNullable<BarSeriesOption["data"]>,
      label: {
        show: showLabels,
        position: "inside",
        color: sIdx < 3 ? theme.surface : theme.ink,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
    };
  });

  return {
    ...base,
    grid: { left: 8, right: 24, top: plottedSeries.length > 1 ? 48 : 24, bottom: 8, containLabel: true },
    tooltip: buildUnifiedAxisTooltip(theme, base.tooltip, { pointerType: "shadow" }),
    xAxis: categoryAxis(theme, [...periods], { showAllLabels: true }),
    yAxis: valueAxis(theme, {
      max: is100 ? 100 : undefined,
      scale: false,
    }),
    series: seriesList,
  };
}

/* ==================== 6. share_composition ==================== */

export type PieSliceItem = {
  name: string;
  value: number;
  unit: string;
  seriesKey: string;
  period: string;
  obsStatus: ObsStatus;
  statusLabel: string;
  drillHref?: string;
};

/**
 * 环形构成图最多展示 6 个切片：当分类数 > 6 时保留前 5 项并将尾部合并为「其他」
 */
export function buildShareCompositionSlices(projected: ProjectedStatisticView): PieSliceItem[] {
  const primary = projected.plottedSeries[0];
  if (!primary) return [];

  const rawSlices: PieSliceItem[] = primary.points
    .map((pt) => ({
      name: pt.period,
      value: typeof pt.value === "number" && Number.isFinite(pt.value) ? pt.value : 0,
      unit: primary.unit,
      seriesKey: primary.key,
      period: pt.period,
      obsStatus: pt.status,
      statusLabel: pt.status_label,
      drillHref: pt.drill_href,
    }))
    .filter((item) => item.value > 0);

  if (rawSlices.length <= 6) return rawSlices;

  const head = rawSlices.slice(0, 5);
  const tailSum =
    Math.round(rawSlices.slice(5).reduce((acc, item) => acc + item.value, 0) * 100) / 100;

  return [
    ...head,
    {
      name: "其他",
      value: tailSum,
      unit: primary.unit,
      seriesKey: primary.key,
      period: "其他",
      obsStatus: "A",
      statusLabel: "尾部合并项",
    },
  ];
}

function buildShareCompositionOption(
  projected: ProjectedStatisticView,
  theme: ChartTheme,
  showLabels: boolean,
  hiddenSet: ReadonlySet<string>,
): ChartOption {
  if (projected.chartType === "horizontal_bar" || projected.chartType === "bar") {
    return buildEntityRankingOption(projected, theme, showLabels, hiddenSet);
  }

  const slices = buildShareCompositionSlices(projected);
  const base = baseOption(theme, 1);
  const palette = [...theme.series, theme.borderStrong];

  const pieData = slices.map((slice, idx) => {
    const visible = isLabelVisible(showLabels, hiddenSet, slice.seriesKey, slice.period);
    return {
      name: slice.name,
      value: slice.value,
      seriesKey: slice.seriesKey,
      seriesLabel: projected.plottedSeries[0]?.label ?? slice.name,
      period: slice.period,
      unit: slice.unit,
      obsStatus: slice.obsStatus,
      statusLabel: slice.statusLabel,
      drillHref: slice.drillHref,
      itemStyle: {
        color: palette[idx % palette.length]!,
        borderColor: theme.surface,
        borderWidth: 2,
      },
      label: {
        show: visible,
        formatter: () => `${slice.name} ${formatStatNumber(slice.value, slice.unit)}${slice.unit === "%" ? "%" : ` ${slice.unit}`}`,
      },
    };
  });

  const pieSeries: PieSeriesOption = {
    id: projected.plottedSeries[0]?.key ?? "share-pie",
    name: projected.plottedSeries[0]?.label ?? projected.title,
    type: "pie",
    universalTransition: true,
    radius: ["42%", "68%"],
    center: ["50%", "54%"],
    minShowLabelAngle: 5,
    avoidLabelOverlap: true,
    data: pieData as NonNullable<PieSeriesOption["data"]>,
    label: {
      show: showLabels,
      color: theme.ink,
      fontSize: 12,
      fontWeight: 600,
      fontFamily: theme.fontFamily,
    },
    labelLine: {
      lineStyle: { color: theme.borderStrong },
    },
  };

  return {
    ...base,
    legend: {
      show: true,
      top: 0,
      left: 0,
      itemGap: 14,
      itemWidth: 14,
      itemHeight: 10,
      textStyle: axisText(theme),
      data: slices.map((s) => s.name),
    },
    tooltip: {
      ...(typeof base.tooltip === "object" && !Array.isArray(base.tooltip) ? base.tooltip : {}),
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number; percent?: number; data?: ChartPointDatum };
        const unit = p.data?.unit ?? "%";
        const formatted = typeof p.value === "number" ? formatStatNumber(p.value, unit) : "—";
        const pctSuffix = unit === "%" ? "%" : ` ${unit}（占比 ${(p.percent ?? 0).toFixed(1)}%）`;
        return `${p.name ?? ""}：<b>${formatted}${pctSuffix}</b>`;
      },
    },
    series: [pieSeries],
  };
}

/**
 * 6 类核心视觉语法统一构建入口（与 projectStatisticView 共享单一事实源）
 */
export function buildStatisticChartOption(
  stat: Statistic,
  viewState: StatisticViewState = {},
  theme: ChartTheme,
): BuiltStatisticChart {
  const projected = projectStatisticView(stat, viewState);
  const showLabels = viewState.showLabels ?? stat.visualization.default_show_labels;
  const hiddenSet = new Set(viewState.hiddenLabelCoords ?? []);

  if (projected.metricMode === "yoy_growth" && stat.template_type !== "growth_rate") {
    return {
      projected,
      option: buildGrowthRateOption(projected, theme, showLabels, hiddenSet),
    };
  }

  let option: ChartOption;
  switch (stat.template_type) {
    case "time_series":
      option = buildTimeSeriesOption(projected, theme, showLabels, hiddenSet);
      break;
    case "growth_rate":
      option = buildGrowthRateOption(projected, theme, showLabels, hiddenSet);
      break;
    case "entity_ranking":
      option = buildEntityRankingOption(projected, theme, showLabels, hiddenSet);
      break;
    case "grouped_comparison":
    case "multi_entity_benchmark":
      option = buildGroupedComparisonOption(projected, theme, showLabels, hiddenSet);
      break;
    case "structure_change":
      option = buildStructureChangeOption(projected, theme, showLabels, hiddenSet);
      break;
    case "share_composition":
      option = buildShareCompositionOption(projected, theme, showLabels, hiddenSet);
      break;
  }

  return { option, projected };
}
