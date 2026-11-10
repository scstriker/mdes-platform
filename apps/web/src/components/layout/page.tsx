import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionTitle } from "@/components/itei";

type PageProps = {
  /** 一级标题（每页一处深蓝斜切标题块） */
  title: ReactNode;
  number?: string;
  /** 标题下的一句话说明 */
  lead?: ReactNode;
  /** 标题右侧的操作 */
  actions?: ReactNode;
  /** 标题上方的面包屑 */
  breadcrumbs?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * 页面内容容器：内容最大宽 content-max（1200px）居中，侧边距手机 16px、桌面 32px（ITEI 布局规则）。
 * 页面滚动交给文档本身，滚动条贴在视口右缘。
 */
export function Page({ title, number, lead, actions, breadcrumbs, children, className }: PageProps) {
  return (
    <div className={cn("mx-auto w-full max-w-content px-4 py-6 md:px-8 md:py-8", className)}>
      {breadcrumbs && <div className="mb-4">{breadcrumbs}</div>}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 justify-items-start gap-3">
          <SectionTitle level={1} number={number}>
            {title}
          </SectionTitle>
          {lead && <p className="max-w-3xl body text-ink-muted">{lead}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
