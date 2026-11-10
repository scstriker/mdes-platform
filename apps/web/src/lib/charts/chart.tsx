import { useEffect, useRef } from "react";
import { useResolvedTheme } from "@/lib/theme";
import { echarts, type ChartOption } from "./echarts";
import { readChartTheme, type ChartTheme } from "./theme";

export type ChartProps = {
  /** 由主题生成配置，主题切换时重新调用 */
  option: (theme: ChartTheme) => ChartOption;
  /** 读屏用的图表说明；图下方仍需保留数据表 */
  ariaLabel: string;
  height?: number;
  className?: string;
};

/**
 * ECharts 容器：SVG 渲染，locale 中文；主题切换时销毁并重建实例，以读取新的 token 值。
 * 只通过 LazyChart 懒加载使用。
 */
export default function Chart({ option, ariaLabel, height = 280, className }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: "svg", locale: "ZH" });
    chart.setOption(optionRef.current(readChartTheme(el)));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [theme, option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height }} />;
}
