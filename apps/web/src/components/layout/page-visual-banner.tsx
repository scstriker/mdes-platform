import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageVisualBannerProps = {
  /** 页面主标题（唯一 H1） */
  title: string;
  /** 1 句精炼定位说明（严控字数，不堆砌长段） */
  summary: string;
  /** 对应业务子页的 Gemini 多模态智库视觉图 */
  image: string;
  /** 图片替代文本（空串表示纯氛围配图） */
  imageAlt?: string;
  /** 标题下方轻量化快捷链接区 */
  actions?: ReactNode;
  titleId?: string;
  className?: string;
};

/**
 * 业务子页统一极简页头（左文右图 8:4）：
 * 严格遵循单字体与两档字号纪律，右侧嵌入克制的部委智库专题配图，不增加纵向认知负担。
 */
export function PageVisualBanner({
  title,
  summary,
  image,
  imageAlt = "",
  actions,
  titleId,
  className,
}: PageVisualBannerProps) {
  return (
    <header className={cn("grid items-center gap-6 lg:grid-cols-12 lg:gap-8", className)}>
      <div className="grid content-start gap-2.5 lg:col-span-8">
        <h1 id={titleId} className="title-section text-brand-navy">
          {title}
        </h1>
        <p className="body text-ink-muted">{summary}</p>
        {actions && <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-0.5 body">{actions}</div>}
      </div>

      <div className="hidden overflow-hidden border border-border bg-surface-sunken lg:col-span-4 lg:block">
        <img
          src={image}
          alt={imageAlt}
          width={640}
          height={320}
          className="h-32 w-full object-cover"
        />
      </div>
    </header>
  );
}
