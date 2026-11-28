import type { ReactNode } from "react";
import { Link } from "react-router";
import { IconChevronDown } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { IteiLogo } from "./logo";
import type { NavItem } from "./nav";

type AppHeaderProps = {
  /** 当前页标题 */
  title: ReactNode;
  nav: NavItem[];
  /** 页眉「资料查询」下拉菜单项（桌面端呈现） */
  referenceNav?: NavItem[];
  /** 右侧操作区（主题切换等），窄屏仍显示 */
  actions?: ReactNode;
  /** 吸顶。/__design 里展示静态样例时关掉 */
  sticky?: boolean;
  className?: string;
};

/**
 * AppHeader 白底变体（ADR-002「页眉：白底加双线」）。
 * 高 56px：左标志、中间当前页标题、右主导航 + 「资料查询」下拉；下沿 3px brand-navy + 1px 白缝 + 2px brand-sky 双线。
 * 窄屏隐藏主导航，由 TabBar 承担。不用渐变。
 */
export function AppHeader({ title, nav, referenceNav, actions, sticky = true, className }: AppHeaderProps) {
  const hasNav = nav.length > 0 || Boolean(referenceNav && referenceNav.length > 0);
  const isRefActive = Boolean(referenceNav?.some((item) => item.current));

  return (
    <header className={cn("bg-surface", sticky && "sticky top-0 z-(--z-header)", className)}>
      <div className="mx-auto flex h-14 w-full max-w-content items-center gap-3 px-4 md:gap-4 md:px-8">
        <Link to="/" className="flex shrink-0 items-center focus-ring" aria-label="ITEI，返回首页">
          <IteiLogo />
        </Link>
        <div className="min-w-0 flex-1 truncate title-header text-brand-navy">{title}</div>
        {hasNav && (
          <nav aria-label="主导航" className="hidden h-full items-center gap-3.5 lg:gap-5 md:flex">
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
            {referenceNav && referenceNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-current={isRefActive ? "page" : undefined}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 border-b-2 border-transparent py-1 button whitespace-nowrap text-ink",
                      "transition-colors duration-150 ease-out hover:text-brand-navy focus-ring",
                      "aria-[current=page]:border-brand-navy aria-[current=page]:text-brand-navy",
                    )}
                  >
                    <span>资料查询</span>
                    <IconChevronDown size={15} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuLabel>权威资料与规范查询</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {referenceNav.map((refItem) => {
                    const RefIcon = refItem.icon;
                    return (
                      <DropdownMenuItem key={refItem.href} asChild>
                        <Link
                          to={refItem.href}
                          aria-current={refItem.current ? "page" : undefined}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5",
                            refItem.current && "bg-info-bg font-semibold text-brand-navy",
                          )}
                        >
                          <RefIcon size={16} aria-hidden="true" className="shrink-0 text-brand-navy" />
                          <span>{refItem.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        )}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div aria-hidden="true" className="h-0.75 bg-brand-navy" />
      <div aria-hidden="true" className="mt-px h-0.5 bg-brand-sky" />
    </header>
  );
}
