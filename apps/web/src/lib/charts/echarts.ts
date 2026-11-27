/**
 * ECharts 6.1 按需引入（ADR-002「ECharts 使用规范」 + FR-104）：
 * 只引入 core 与实际用到的图表、组件及 UniversalTransition / LabelLayout / LegacyGridContainLabel 特性，渲染器统一用 SVG。
 * 本模块只经由懒加载入口与离屏导出器按需加载，不进入首屏同步包。
 */
import * as echartsCore from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from "echarts/components";
import {
  LabelLayout,
  LegacyGridContainLabel,
  UniversalTransition,
} from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import type {
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";
import type {
  AriaComponentOption,
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  MarkPointComponentOption,
  TooltipComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";

echartsCore.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkPointComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  AriaComponent,
  LabelLayout,
  LegacyGridContainLabel,
  UniversalTransition,
  SVGRenderer,
]);

export type ChartOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | PieSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | MarkPointComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | DataZoomComponentOption
  | AriaComponentOption
>;

export const echarts: typeof echartsCore = { ...echartsCore };
