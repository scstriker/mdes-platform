import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "./format";
import { Sparkline } from "./sparkline";

type KpiTileProps = {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: ReactNode;
  /** 说明或趋势文字；tone 为 up / down 时自动加 ▲ ▼ */
  delta?: ReactNode;
  tone?: "up" | "down" | "neutral";
  /** 顶部 4px brand-red，是 KPI 组里的「当前项」，一组至多一块 */
  highlight?: boolean;
  trend?: number[];
  loading?: boolean;
  className?: string;
};

/**
 * 统计数字卡（ITEI KpiTile）：大数字 numeral 样式 brand-navy、等宽数字、千分位；
 * 标签与说明 ink-muted。上升 success、下降 brand-red，都带箭头字符与读屏文字。
 */
export function KpiTile({ label, value, unit, delta, tone = "neutral", highlight, trend, loading, className }: KpiTileProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 content-start gap-1 border border-border bg-surface-raised p-4",
        highlight && "border-t-4 border-t-brand-red",
        className,
      )}
    >
      <span className="label text-ink-muted">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="numeral text-brand-navy tabular-nums">
          {typeof value === "number" ? formatNumber(value) : (value ?? "—")}
          {unit && <small className="ml-1 body-sm font-normal text-ink-muted">{unit}</small>}
        </span>
      )}
      {delta && (
        <span
          className={cn(
            "caption",
            tone === "up" && "text-success",
            tone === "down" && "text-brand-red",
            tone === "neutral" && "text-ink-muted",
          )}
        >
          {tone === "up" && (
            <>
              <span aria-hidden="true">▲ </span>
              <span className="sr-only">上升：</span>
            </>
          )}
          {tone === "down" && (
            <>
              <span aria-hidden="true">▼ </span>
              <span className="sr-only">下降：</span>
            </>
          )}
          {delta}
        </span>
      )}
      {trend && trend.length > 1 && <Sparkline values={trend} label={`${String(label)}趋势`} className="mt-2" />}
    </div>
  );
}
