import { useEffect, useRef } from "react";
import { useResolvedTheme } from "@/lib/theme";
import type { EChartsType } from "echarts/core";
import { echarts, type ChartOption } from "./echarts";
import { readChartTheme, type ChartTheme } from "./theme";

export type ChartPointClickPayload = {
  seriesName: string;
  seriesIndex: number;
  dataIndex: number;
  name: string;
  value: unknown;
  data: unknown;
  event?: unknown;
};

export type ChartProps = {
  /** 由主题生成配置；option 变更时复用现有实例增量 setOption，不销毁重建 */
  option: (theme: ChartTheme) => ChartOption;
  /** 读屏用的图表说明；图下方或切换面板保留无障碍数据表 */
  ariaLabel: string;
  height?: number;
  className?: string;
  /** 可选数据点点击回调（支持下钻导航或单点数值标签显隐切换） */
  onPointClick?: (payload: ChartPointClickPayload) => void;
};

/**
 * ECharts 6.1 容器（FR-104 三阶段生命周期）：
 * 1. 挂载 / resolvedTheme 变化：初始化 SVG 实例（locale: "ZH"），挂载带 requestAnimationFrame 节流且跳过 0×0 尺寸的 ResizeObserver，绑定点击事件。
 * 2. option 变化：复用现有实例读取当前容器 token、遵循 prefers-reduced-motion，调用 setOption(..., { replaceMerge, lazyUpdate })。
 * 3. 卸载：取消挂起帧、断开 ResizeObserver、解绑事件并 dispose 实例。
 */
export default function Chart({ option, ariaLabel, height = 280, className, onPointClick }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const onPointClickRef = useRef(onPointClick);
  onPointClickRef.current = onPointClick;

  const resolvedTheme = useResolvedTheme();

  // Phase 1 & Phase 3: 实例创建、尺寸监听、事件绑定与卸载清理（仅随 resolvedTheme 变化重建）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = echarts.init(el, null, { renderer: "svg", locale: "ZH" });
    chartRef.current = chart;

    const handleClick = (params: Record<string, unknown>) => {
      if (!onPointClickRef.current) return;
      onPointClickRef.current({
        seriesName: typeof params.seriesName === "string" ? params.seriesName : "",
        seriesIndex: typeof params.seriesIndex === "number" ? params.seriesIndex : 0,
        dataIndex: typeof params.dataIndex === "number" ? params.dataIndex : 0,
        name: typeof params.name === "string" ? params.name : "",
        value: params.value,
        data: params.data,
        event: params.event,
      });
    };
    chart.on("click", handleClick as never);

    let rafId: number | null = null;
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;

            if (rafId !== null && typeof cancelAnimationFrame === "function") {
              cancelAnimationFrame(rafId);
            }
            const flushResize = () => {
              rafId = null;
              if (!chart.isDisposed()) {
                chart.resize();
              }
            };
            if (typeof requestAnimationFrame === "function") {
              rafId = requestAnimationFrame(flushResize);
            } else {
              flushResize();
            }
          })
        : null;

    observer?.observe(el);

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
      chart.off("click", handleClick as never);
      chart.dispose();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [resolvedTheme]);

  // Phase 2: 配置增量更新（严禁在 option 变更时 dispose / 重新 init）
  useEffect(() => {
    const el = ref.current;
    const chart = chartRef.current;
    if (!el || !chart || chart.isDisposed()) return;

    const builtOption = option(readChartTheme(el));
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    const effectiveOption: ChartOption = prefersReducedMotion
      ? {
          ...builtOption,
          animation: false,
          animationDuration: 0,
          animationDurationUpdate: 0,
        }
      : builtOption;

    chart.setOption(effectiveOption, {
      replaceMerge: ["series", "xAxis", "yAxis"],
      lazyUpdate: true,
    });
  }, [option, resolvedTheme]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height }} />;
}
