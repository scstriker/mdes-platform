import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { IteiLogo } from "./logo";
import type { NavItem } from "./nav";

type AppHeaderProps = {
  /** 当前页标题 */
  title: ReactNode;
  nav: NavItem[];
  /** 右侧操作区（主题切换等），窄屏仍显示 */
  actions?: ReactNode;
  /** 吸顶。/__design 里展示静态样例时关掉 */
  sticky?: boolean;
  className?: string;
};

/**
 * AppHeader 白底变体（ADR-002「页眉：白底加双线」）。
 * 高 56px：左标志、中间当前页标题、右主导航；下沿 3px brand-navy + 1px 白缝 + 2px brand-sky 双线。
 * 窄屏隐藏主导航，由 TabBar 承担。不用渐变。
 */
export function AppHeader({ title, nav, actions, sticky = true, className }: AppHeaderProps) {
  return (
    <header className={cn("bg-surface", sticky && "sticky top-0 z-(--z-header)", className)}>
      <div className="flex h-14 items-center gap-4 px-4 md:gap-6 md:px-6">
        <Link to="/" className="flex shrink-0 items-center focus-ring" aria-label="ITEI，返回概览">
          <IteiLogo />
        </Link>
        <div className="min-w-0 flex-1 truncate title-header text-brand-navy">{title}</div>
        <nav aria-label="主导航" className="hidden h-full items-center gap-6 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "border-b-2 border-transparent py-1 button whitespace-nowrap text-ink",
                "transition-colors duration-150 ease-out hover:text-brand-navy focus-ring",
                "aria-[current=page]:border-brand-navy aria-[current=page]:text-brand-navy",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div aria-hidden="true" className="h-0.75 bg-brand-navy" />
      <div aria-hidden="true" className="mt-px h-0.5 bg-brand-sky" />
    </header>
  );
}
