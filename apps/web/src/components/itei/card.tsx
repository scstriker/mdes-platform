import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  title?: ReactNode;
  titleAs?: ElementType;
  meta?: ReactNode;
  footer?: ReactNode;
  /** 只有悬浮 / 可拖动的卡片才用 shadow-raised */
  raised?: boolean;
  /** 内容区不留内边距（放表格时） */
  flush?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * 直角内容卡片（ITEI Card）：surface-raised 底 + 1px border；标题栏与页脚栏各有一条分隔线。
 * 标题是 brand-navy 的唯一位置。不要左侧彩色竖条，不要卡片套卡片。
 */
export function Card({ title, titleAs: TitleTag = "h3", meta, footer, raised, flush, children, className }: CardProps) {
  return (
    <section
      className={cn(
        "min-w-0 border border-border bg-surface-raised text-ink",
        raised && "border-transparent shadow-raised",
        className,
      )}
    >
      {(title || meta) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title && <TitleTag className="title-nav text-brand-navy">{title}</TitleTag>}
          {meta && <span className="caption text-ink-muted">{meta}</span>}
        </header>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
      {footer && <footer className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">{footer}</footer>}
    </section>
  );
}
