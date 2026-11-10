import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppFooterProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
};

/**
 * 应用页脚（ITEI Footer）：高 40px 深蓝条，caption 文字；右端叠 brand-sky + brand-navy-deep 斜切装饰，
 * 宽 120px。右段文字留出 96px 内边距、并压在装饰之上，不再被斜切遮住。窄屏不显示，由 TabBar 承担。
 */
export function AppFooter({ left, center, right, className }: AppFooterProps) {
  return (
    <footer
      className={cn(
        "relative hidden h-10 items-center justify-between gap-6 overflow-hidden bg-brand-navy px-6 caption text-on-brand md:flex",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-0 right-0 w-30 bg-brand-sky clip-slash-start">
        <span className="absolute inset-y-0 right-0 w-22 bg-brand-navy-deep clip-slash-start" />
      </span>
      <span className="relative min-w-0 truncate">{left}</span>
      <span className="relative min-w-0 truncate">{center}</span>
      <span className="relative shrink-0 pr-24">{right}</span>
    </footer>
  );
}
