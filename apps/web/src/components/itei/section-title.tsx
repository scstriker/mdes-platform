import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionTitleProps = {
  level?: 1 | 2 | 3;
  /** 编号是标题的一部分：一级「一」→「一、」，二级「1.1」，三级可空 */
  number?: string;
  children: ReactNode;
  as?: ElementType;
  className?: string;
};

const DEFAULT_TAG = { 1: "h1", 2: "h2", 3: "h3" } as const;

/**
 * 三级内容标题（ITEI SectionTitle）。
 * 一级：brand-navy 底 + on-brand 字，右端 45° 斜切，每页一次；
 * 二级：编号 brand-navy，下沿 2px brand-sky，宽度跟随文字；
 * 三级：brand-navy 字，左侧 4px brand-red（全站唯一允许左侧色条的地方）。
 */
export function SectionTitle({ level = 1, number, children, as, className }: SectionTitleProps) {
  const Tag = as ?? DEFAULT_TAG[level];
  if (level === 1) {
    return (
      <Tag
        className={cn(
          "inline-flex w-fit max-w-full items-center bg-brand-navy py-2 pr-12 pl-6 title-section text-on-brand clip-slash",
          className,
        )}
      >
        <span>
          {number && `${number}、`}
          {children}
        </span>
      </Tag>
    );
  }
  if (level === 2) {
    return (
      <Tag className={cn("inline-block w-fit max-w-full border-b-2 border-brand-sky pb-1 title-sub text-ink", className)}>
        {number && <b className="mr-2 text-brand-navy">{number}</b>}
        {children}
      </Tag>
    );
  }
  return (
    <Tag className={cn("border-l-4 border-brand-red pl-3 title-nav text-brand-navy", className)}>
      {number && <span className="mr-2">{number}</span>}
      {children}
    </Tag>
  );
}
