import type { ChartOption } from "./echarts";

/**
 * 从 CSS 变量读取图表主题（ADR-002「主题从 CSS 变量读取」）。
 * 在图表容器上读取，局部 data-theme 容器同样生效；切换主题时重建实例重新读取。
 */
export type ChartTheme = {
  series: string[];
  emphasis: string;
  ink: string;
  muted: string;
  border: string;
  surface: string;
  fontFamily: string;
};

export function readChartTheme(el: Element): ChartTheme {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    series: [v("--chart-1"), v("--chart-2"), v("--chart-3"), v("--chart-4"), v("--chart-5")],
    emphasis: v("--chart-3"),
    ink: v("--ink"),
    muted: v("--ink-muted"),
    border: v("--border"),
    surface: v("--surface-raised"),
    fontFamily: v("--font-sans"),
  };
}

const axisText = (t: ChartTheme) => ({ color: t.muted, fontSize: 12, fontFamily: t.fontFamily });

/**
 * 基础配置：序列色 chart-1…5；网格线 border；坐标文字 ink-muted 12px；
 * 提示框直角、1px border、无阴影；动画 200ms；开启 aria 自动描述。
 * 单序列不显示图例；图表标题写在图表外（title-sub，左对齐）。
 */
export function baseOption(t: ChartTheme, seriesCount: number): ChartOption {
  return {
    color: t.series,
    textStyle: { fontFamily: t.fontFamily, color: t.ink },
    animationDuration: 200,
    animationDurationUpdate: 200,
    animationEasing: "cubicOut",
    aria: { enabled: true, decal: { show: false } },
    grid: { left: 8, right: 16, top: seriesCount > 1 ? 40 : 16, bottom: 8, containLabel: true },
    legend: {
      show: seriesCount > 1,
      top: 0,
      left: 0,
      icon: "rect",
      itemWidth: 12,
      itemHeight: 4,
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
      axisPointer: { type: "line", lineStyle: { color: t.border } },
    },
  };
}

export const categoryAxis = (t: ChartTheme, data: string[]) => ({
  type: "category" as const,
  data,
  axisLine: { lineStyle: { color: t.border } },
  axisTick: { show: false },
  axisLabel: axisText(t),
});

/** scale：折线图可不从 0 开始；柱状图必须从 0 开始，保持 false */
export const valueAxis = (t: ChartTheme, opts: { name?: string; scale?: boolean } = {}) => ({
  type: "value" as const,
  name: opts.name,
  scale: opts.scale ?? false,
  nameTextStyle: axisText(t),
  axisLine: { show: false },
  axisLabel: axisText(t),
  splitLine: { lineStyle: { color: t.border } },
});
