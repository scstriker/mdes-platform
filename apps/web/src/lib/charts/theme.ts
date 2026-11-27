import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import type { ChartOption } from "./echarts";

/**
 * 从 CSS 变量读取图表主题（ADR-002「主题从 CSS 变量读取」）。
 * 在图表容器上读取，局部 data-theme 容器同样生效；切换主题时重建实例重新读取。
 */
export type ChartTheme = {
  series: string[];
  emphasis: string;
  brandNavy: string;
  brandSky: string;
  brandRed: string;
  infoBg: string;
  surfaceSunken: string;
  ink: string;
  muted: string;
  border: string;
  borderStrong: string;
  surface: string;
  fontFamily: string;
};

export function readChartTheme(el: Element): ChartTheme {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    series: [v("--chart-1"), v("--chart-2"), v("--chart-3"), v("--chart-4"), v("--chart-5")],
    emphasis: v("--chart-3"),
    brandNavy: v("--brand-navy"),
    brandSky: v("--brand-sky"),
    brandRed: v("--brand-red"),
    infoBg: v("--info-bg"),
    surfaceSunken: v("--surface-sunken"),
    ink: v("--ink"),
    muted: v("--ink-muted"),
    border: v("--border"),
    borderStrong: v("--border-strong"),
    surface: v("--surface-raised"),
    fontFamily: v("--font-sans"),
  };
}

export const axisText = (t: ChartTheme) => ({
  color: t.muted,
  fontSize: 12,
  fontFamily: t.fontFamily,
});

/**
 * 基础配置（Statista 出版物级高信噪比规范 + ITEI Token）：
 * - 序列色 chart-1…5；水平虚线浅色网格；分类轴去刻度刺；
 * - 图例左置顶且与绘图区留足呼吸间距，彻底避免与坐标轴文字挤压；
 * - 提示框直角、1px border、无阴影；动画 200ms；开启 aria 自动描述。
 */
export function baseOption(t: ChartTheme, seriesCount: number): ChartOption {
  return {
    color: t.series,
    textStyle: { fontFamily: t.fontFamily, color: t.ink },
    animationDuration: 200,
    animationDurationUpdate: 200,
    animationEasing: "cubicOut",
    aria: { enabled: true, decal: { show: false } },
    grid: {
      left: 8,
      right: 24,
      top: seriesCount > 1 ? 42 : 18,
      bottom: 8,
      containLabel: true,
    },
    legend: {
      show: seriesCount > 1,
      top: 0,
      left: 0,
      itemGap: 18,
      itemWidth: 18,
      itemHeight: 10,
      textStyle: axisText(t),
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 0,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 13, fontFamily: t.fontFamily },
      extraCssText: "box-shadow:none;border-radius:0;",
      axisPointer: { type: "line", lineStyle: { color: t.borderStrong, type: "dashed" } },
    },
  };
}

/** 多序列折线的标记形状，按序列顺序取用 */
export const SERIES_SYMBOLS = ["circle", "rect", "triangle", "diamond", "emptyCircle"] as const;

export const categoryAxis = (
  t: ChartTheme,
  data: string[],
  opts: { showAllLabels?: boolean } = {},
) => ({
  type: "category" as const,
  data,
  axisLine: { lineStyle: { color: t.borderStrong } },
  axisTick: { show: false },
  axisLabel: {
    ...axisText(t),
    ...(opts.showAllLabels ? { interval: 0 } : {}),
  },
});

/** scale：折线图可不从 0 开始；柱状图必须从 0 开始，保持 false */
export const valueAxis = (t: ChartTheme, opts: { name?: string; scale?: boolean; max?: number } = {}) => ({
  type: "value" as const,
  name: opts.name,
  nameGap: 10,
  max: opts.max,
  scale: opts.scale ?? false,
  nameTextStyle: axisText(t),
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: axisText(t),
  splitLine: { lineStyle: { color: t.border, type: "dashed" as const } },
});

/**
 * Statista 风格横向排名条形图预设：
 * 左侧整齐对齐长中文分类标签，右侧柱端直接标出精确数值（及可选占比/后缀），
 * 支持对前 N 项或指定焦点项做主色/品牌红强调。
 */
export function statistaHorizontalBarOption(
  t: ChartTheme,
  opts: {
    categories: readonly string[];
    values: readonly number[];
    /** 柱端自定义文本标签（如 "412 件（19.6%）"），不传则格式化数值 + unitSuffix */
    labels?: readonly string[];
    unitSuffix?: string;
    /** 高亮前 N 项用主深蓝，其余降为亮蓝/灰蓝以体现二八集中度；默认全部主深蓝 */
    highlightTopN?: number;
    /** 指定某一项用品牌红（--chart-3）做风险/极值警示（每屏至多一处） */
    emphasizeIndex?: number;
    /** 可选均值/阈值参考虚线 */
    referenceLine?: { value: number; label: string };
    rightPadding?: number;
    max?: number;
  },
): ChartOption {
  const {
    categories,
    values,
    labels,
    unitSuffix = "",
    highlightTopN,
    emphasizeIndex,
    referenceLine,
    rightPadding = 84,
    max,
  } = opts;

  const barData = values.map((val, idx) => {
    let color = t.series[0];
    if (typeof highlightTopN === "number" && idx >= highlightTopN) {
      color = t.series[3];
    }
    if (emphasizeIndex === idx) {
      color = t.emphasis;
    }
    return {
      value: val,
      itemStyle: { color, borderRadius: 0 },
      label: {
        formatter: () => (labels?.[idx] ? labels[idx] : `${val.toLocaleString("zh-CN")}${unitSuffix}`),
      },
    };
  });

  const series: BarSeriesOption = {
    type: "bar",
    data: barData,
    barMaxWidth: 18,
    label: {
      show: true,
      position: "right",
      distance: 8,
      color: t.ink,
      fontSize: 12,
      fontWeight: 600,
      fontFamily: t.fontFamily,
    },
    labelLayout: { hideOverlap: true },
    ...(referenceLine
      ? {
          markLine: {
            symbol: ["none", "none"],
            silent: true,
            lineStyle: { color: t.emphasis, type: "dashed", width: 1.5 },
            label: {
              show: true,
              position: "start",
              distance: 6,
              formatter: referenceLine.label,
              color: t.emphasis,
              fontSize: 12,
              fontFamily: t.fontFamily,
            },
            data: [{ xAxis: referenceLine.value }],
          },
        }
      : {}),
  };

  return {
    ...baseOption(t, 1),
    grid: { left: 8, right: rightPadding, top: referenceLine ? 30 : 10, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(t, 1).tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    xAxis: {
      type: "value",
      max,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisText(t),
      splitLine: { lineStyle: { color: t.border, type: "dashed" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: [...categories],
      axisLine: { lineStyle: { color: t.borderStrong } },
      axisTick: { show: false },
      axisLabel: { color: t.ink, fontSize: 13, fontFamily: t.fontFamily },
    },
    series: [series],
  };
}

/**
 * Statista 风格含「非完整年度（如 2026Q1–Q3）」严谨区分的多序列折线图预设：
 * - 前 N-1 个完整年度点用实线连接；
 * - 最后一个非完整年度区间自动叠浅色背景带（MarkArea）并以虚线段连接，
 *   从根源消除“把 9 个月累计值与 12 个月全年值实线直连导致的断崖暴跌视觉假象”；
 * - 强制显示全部横轴年份标签（不漏末点），并在起点、峰值/倒数第二点与末点直接标数。
 */
export function statistaTrendWithPartialOption(
  t: ChartTheme,
  opts: {
    periods: readonly string[];
    /** 最后一个点是否为非完整年度（如 Q1-Q3），默认 true */
    lastIsPartial?: boolean;
    partialLabel?: string;
    series: readonly {
      name: string;
      values: readonly number[];
      colorIndex?: number;
      dashed?: boolean;
      showLabels?: boolean;
    }[];
    yMax?: number;
    scale?: boolean;
  },
): ChartOption {
  const { periods, lastIsPartial = true, partialLabel = "非完整年累计", series, yMax, scale = false } = opts;
  const n = periods.length;
  const builtSeries: LineSeriesOption[] = [];

  series.forEach((s, idx) => {
    const color = t.series[s.colorIndex ?? idx % t.series.length];
    const symbol = SERIES_SYMBOLS[idx % SERIES_SYMBOLS.length];
    const showPointLabel = s.showLabels ?? idx === 0;

    if (!lastIsPartial || n < 2 || s.dashed) {
      builtSeries.push({
        name: s.name,
        type: "line",
        symbol,
        symbolSize: 7,
        data: [...s.values],
        itemStyle: { color },
        lineStyle: { width: 2.5, color, type: s.dashed ? "dashed" : "solid" },
        label: showPointLabel
          ? {
              show: true,
              position: "top",
              distance: 6,
              color: t.ink,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: t.fontFamily,
              formatter: (p) => {
                if (p.dataIndex === 0 || p.dataIndex === n - 2 || p.dataIndex === n - 1) {
                  return typeof p.value === "number" ? p.value.toLocaleString("zh-CN") : String(p.value ?? "");
                }
                return "";
              },
            }
          : undefined,
        labelLayout: { hideOverlap: true },
      });
      return;
    }

    // 完整年度实线段（0 .. n-2，最后一位填 null）
    const fullData: (number | null)[] = s.values.map((v, i) => (i < n - 1 ? v : null));
    // 非完整年虚线衔接段（0 .. n-3 为 null，保留 n-2 与 n-1 连成虚线）
    const partialData: (number | null)[] = s.values.map((v, i) => (i >= n - 2 ? v : null));

    builtSeries.push({
      name: s.name,
      type: "line",
      symbol,
      symbolSize: 7,
      data: fullData,
      itemStyle: { color },
      lineStyle: { width: 2.5, color, type: "solid" },
      label: showPointLabel
        ? {
            show: true,
            position: "top",
            distance: 6,
            color: t.ink,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: t.fontFamily,
            formatter: (p) => {
              if (p.dataIndex === 0 || p.dataIndex === n - 2) {
                return typeof p.value === "number" ? p.value.toLocaleString("zh-CN") : "";
              }
              return "";
            },
          }
        : undefined,
      labelLayout: { hideOverlap: true },
      ...(idx === 0
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: t.infoBg, opacity: 0.65 },
              label: {
                show: true,
                position: "top",
                distance: 4,
                color: t.brandNavy,
                fontSize: 12,
                fontFamily: t.fontFamily,
                formatter: partialLabel,
              },
              data: [[{ xAxis: periods[n - 2] }, { xAxis: periods[n - 1] }]],
            },
          }
        : {}),
    });

    builtSeries.push({
      name: s.name,
      type: "line",
      symbol: "emptyCircle",
      symbolSize: 8,
      data: partialData,
      itemStyle: { color },
      lineStyle: { width: 2, color, type: "dashed" },
      tooltip: { show: true },
      label: showPointLabel
        ? {
            show: true,
            position: "top",
            distance: 6,
            color: t.brandNavy,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: t.fontFamily,
            formatter: (p) =>
              p.dataIndex === n - 1 && typeof p.value === "number" ? p.value.toLocaleString("zh-CN") : "",
          }
        : undefined,
      labelLayout: { hideOverlap: true },
    });
  });

  // 去除重复同名序列在 tooltip 中的双行显示
  const base = baseOption(t, series.length);
  return {
    ...base,
    grid: { left: 8, right: 28, top: series.length > 1 ? 52 : 34, bottom: 8, containLabel: true },
    legend: {
      ...base.legend,
      show: series.length > 1,
      data: series.map((s) => s.name),
    },
    tooltip: {
      ...base.tooltip,
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [];
        if (list.length === 0) return "";
        const seen = new Set<string>();
        const header = String((list[0] as { axisValueLabel?: string }).axisValueLabel ?? "");
        const lines = [header];
        for (const item of list as { seriesName?: string; value?: unknown; marker?: string }[]) {
          const name = item.seriesName ?? "";
          if (item.value === null || item.value === undefined || seen.has(name)) continue;
          seen.add(name);
          const formatted =
            typeof item.value === "number" ? item.value.toLocaleString("zh-CN") : String(item.value);
          lines.push(`${item.marker ?? ""} ${name}：<b>${formatted}</b>`);
        }
        return lines.join("<br/>");
      },
    },
    xAxis: categoryAxis(t, [...periods], { showAllLabels: true }),
    yAxis: valueAxis(t, { max: yMax, scale }),
    series: builtSeries,
  };
}
