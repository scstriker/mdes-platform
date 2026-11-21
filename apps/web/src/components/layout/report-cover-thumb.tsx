import pubCoverDomestic from "@/assets/visuals/pub-cover-domestic.webp";
import pubCoverQuarterly from "@/assets/visuals/pub-cover-quarterly.webp";
import bannerReports from "@/assets/visuals/banner-reports.webp";
import { cn } from "@/lib/utils";

export type ReportCoverVariant = "quarterly" | "domestic" | "supply";

const COVER_IMAGE: Record<ReportCoverVariant, string> = {
  quarterly: pubCoverQuarterly,
  domestic: pubCoverDomestic,
  supply: bannerReports,
};

type ReportCoverThumbProps = {
  variant: ReportCoverVariant;
  /** 叠加于封面的精简 4 字刊物标识（避免 AI 生图汉字失真） */
  label: string;
  className?: string;
};

/**
 * 智库「权威发布」封面缩略图（向信通院蓝皮书视觉对齐）。
 * 底层采用 Gemini 多模态生成的无文字智库封面底图，前景以 ITEI 语义 Token 叠印高对比度刊物标识，
 * 确保浅/深双主题下均达 WCAG AA 对比度。
 */
export function ReportCoverThumb({ variant, label, className }: ReportCoverThumbProps) {
  const isLightSubstrate = variant === "domestic";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-16 w-28 shrink-0 items-center overflow-hidden border border-border",
        isLightSubstrate ? "border-l-4 border-l-brand-navy bg-surface-sunken" : "border-l-4 border-l-brand-sky bg-banner-bg",
        className,
      )}
    >
      <img
        src={COVER_IMAGE[variant]}
        alt=""
        width={360}
        height={220}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span
        className={cn(
          "relative z-10 px-2.5 py-1 body font-semibold whitespace-nowrap",
          isLightSubstrate ? "bg-surface/90 text-ink" : "bg-banner-bg/85 text-on-banner",
        )}
      >
        {label}
      </span>
    </span>
  );
}
