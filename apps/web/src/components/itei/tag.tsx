import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TagTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONE: Record<TagTone, string> = {
  neutral: "border-border bg-surface-sunken text-ink-muted",
  info: "bg-info-bg text-link",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-brand-red",
  brand: "bg-brand-navy text-on-brand",
};

/**
 * 状态 / 分类标签（ITEI Tag，替代 shadcn Badge）：高 24px（表格内 sm 20px），2px 圆角，
 * 浅底 + 前景色 + 6px 色点；分类标签 brand 用深蓝实底、不带色点。不可点击。
 * 同一列表不超过 3 种色调；danger / warning 文案要能独立读懂。
 */
export function Tag({
  tone = "neutral",
  size = "md",
  children,
  className,
}: {
  tone?: TagTone;
  size?: "md" | "sm";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border border-transparent whitespace-nowrap",
        size === "md" ? "h-6 gap-1.5 px-2 label" : "h-5 gap-1 px-1.5 caption font-semibold",
        TONE[tone],
        className,
      )}
    >
      {tone !== "brand" && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-pill bg-current" />}
      {children}
    </span>
  );
}
