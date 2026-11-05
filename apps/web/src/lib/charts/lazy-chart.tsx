import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartProps } from "./chart";

const Chart = lazy(() => import("./chart"));

/** 懒加载的图表：ECharts 只在用到图表的页面下载 */
export function LazyChart(props: ChartProps) {
  const height = props.height ?? 280;
  return (
    <Suspense fallback={<Skeleton className={props.className} style={{ height }} />}>
      <Chart {...props} />
    </Suspense>
  );
}

export { baseOption, categoryAxis, valueAxis, type ChartTheme } from "./theme";
