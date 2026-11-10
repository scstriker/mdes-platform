import { cn } from "@/lib/utils";

/**
 * 进度条 / 覆盖率：ITEI 规定进度条用 brand-sky（线条色），轨道 surface-sunken + 1px 边线。
 * 数字另外写在旁边，不只靠条的长短。
 */
export function ProgressMeter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** 读屏用，如「TRD 一期覆盖率」 */
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} / ${max}`}
      className={cn("h-2 w-full border border-border bg-surface-sunken", className)}
    >
      <div className="h-full bg-brand-sky" style={{ width: `${pct}%` }} />
    </div>
  );
}
