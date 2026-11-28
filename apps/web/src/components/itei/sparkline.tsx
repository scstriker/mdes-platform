import { cn } from "@/lib/utils";

/**
 * 迷你趋势线：纯 SVG，不加载 ECharts（ADR-002「ECharts 使用规范 · 懒加载」）。
 * 线用 chart-1，最新一期的点用 chart-3 强调。
 */
export function Sparkline({ values, label, className }: { values: number[]; label: string; className?: string }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 32;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("h-8 w-full overflow-visible", className)}
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className="stroke-chart-1"
      />
      <circle cx={last[0]} cy={last[1]} r={3} className="fill-chart-3" />
    </svg>
  );
}
