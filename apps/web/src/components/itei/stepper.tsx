import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { pad2 } from "./numbered-nav";

type StepperProps = {
  steps: string[];
  /** 当前步骤索引；之前的步骤视为已完成 */
  current: number;
  "aria-label": string;
  className?: string;
};

/**
 * 步骤条（基于 NumberedNav，用于导入向导）。桌面横排、窄屏竖排。
 * 已完成：info-bg + brand-navy 字，序号块带对勾；当前：brand-red 整条；
 * 未开始：surface-sunken + ink-muted。按 ITEI「同屏深蓝实色块两块以上时其余降为浅底」，未开始项不用深蓝实底。
 */
export function Stepper({ steps, current, className, ...aria }: StepperProps) {
  return (
    <ol
      aria-label={aria["aria-label"]}
      className={cn("grid gap-3 md:auto-cols-fr md:grid-flow-col", className)}
    >
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex h-11 items-stretch title-nav",
              state === "done" && "bg-info-bg text-brand-navy",
              state === "current" && "bg-brand-red text-on-brand",
              state === "upcoming" && "bg-surface-sunken text-ink-muted",
            )}
          >
            <span
              className={cn(
                "flex w-18 shrink-0 items-center justify-center rounded-l-pill pr-2 numeral-sm clip-slash",
                state === "done" && "bg-brand-navy text-on-brand",
                state === "current" && "bg-brand-red brightness-85",
                state === "upcoming" && "bg-border",
              )}
            >
              {state === "done" ? <IconCheck className="size-5" stroke={3} aria-hidden="true" /> : pad2(index + 1)}
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-center truncate px-3">
              {label}
              {state === "done" && <span className="sr-only">（已完成）</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
