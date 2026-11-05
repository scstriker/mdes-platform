import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export type NumberedNavItem = {
  label: ReactNode;
  /** 默认用两位序号 01、02… */
  number?: string;
  href?: string;
  onSelect?: () => void;
};

type NumberedNavProps = {
  items: NumberedNavItem[];
  /** 当前项索引：整条变红，每屏只有一条红 */
  current?: number;
  /** 已完成项索引：info-bg 底 + brand-navy 字 */
  done?: number[];
  "aria-label": string;
  className?: string;
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 编号导航条（ITEI NumberedNav，来自 PPT 目录页）：左端圆头序号块 + 深蓝文字条，当前项整条变红。
 * 条高 44px、间距 12px、最大宽 520px，文字居中；超过 8 条请改用别的组件。
 */
export function NumberedNav({ items, current, done = [], className, ...aria }: NumberedNavProps) {
  return (
    <ol aria-label={aria["aria-label"]} className={cn("grid w-full max-w-130 gap-3", className)}>
      {items.map((item, index) => {
        const state = index === current ? "current" : done.includes(index) ? "done" : "default";
        const body = (
          <>
            <span
              className={cn(
                "flex w-18 shrink-0 items-center justify-center rounded-l-pill pr-2 numeral-sm clip-slash",
                state === "default" && "bg-brand-navy-deep",
                state === "current" && "bg-brand-red brightness-85",
                state === "done" && "bg-brand-navy text-on-brand",
              )}
            >
              {item.number ?? pad2(index + 1)}
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-center truncate px-4 group-hover:underline">
              {item.label}
            </span>
          </>
        );
        const rowClass = cn(
          "group flex h-11 w-full items-stretch title-nav focus-ring",
          state === "default" && "bg-brand-navy text-on-brand",
          state === "current" && "bg-brand-red text-on-brand",
          state === "done" && "bg-info-bg text-brand-navy",
        );
        const ariaCurrent = state === "current" ? ("step" as const) : undefined;
        return (
          <li key={index}>
            {item.href ? (
              <Link to={item.href} aria-current={ariaCurrent} className={rowClass}>
                {body}
              </Link>
            ) : item.onSelect ? (
              <button type="button" onClick={item.onSelect} aria-current={ariaCurrent} className={cn(rowClass, "cursor-pointer")}>
                {body}
              </button>
            ) : (
              <div aria-current={ariaCurrent} className={rowClass}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
