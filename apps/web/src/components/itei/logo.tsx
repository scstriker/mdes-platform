import logoUrl from "../../../design/itei/itei-design-system/assets/Logo/itei-logo.png";
import { cn } from "@/lib/utils";

/**
 * ITEI 标志。浅色主题用彩色 PNG（高 28px，直接放在白底上）；
 * 深色主题按 ITEI 规定不把彩色标志放在深色底上，换成 ink 色文字「ITEI」。
 * 切换由 itei-components.css 里的主题变量驱动，局部 data-theme 容器同样生效。
 */
export function IteiLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img src={logoUrl} alt="ITEI" width={48} height={28} className="itei-logo-image h-7 w-auto" />
      <span className="itei-logo-text title-header tracking-widest text-ink">ITEI</span>
    </span>
  );
}
