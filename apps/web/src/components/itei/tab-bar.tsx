import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

type TabBarProps = {
  nav: NavItem[];
  /** 固定在视口底部。/__design 里展示静态样例时关掉 */
  fixed?: boolean;
  className?: string;
};

/**
 * 窄屏底部 TabBar（ITEI platforms.md 手机端）：5 项以内，当前项 brand-navy 图标 + 文字，
 * 非当前 ink-muted，不用红。md 及以上隐藏，由页眉主导航承担。
 */
export function TabBar({ nav, fixed = true, className }: TabBarProps) {
  return (
    <nav
      aria-label="主导航"
      className={cn(
        "border-t border-border bg-surface pb-safe md:hidden",
        fixed && "fixed inset-x-0 bottom-0 z-(--z-header)",
        className,
      )}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {nav.map(({ href, label, icon: Icon, current }) => (
          <li key={href}>
            <Link
              to={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 caption text-ink-muted focus-ring-inset",
                "aria-[current=page]:font-semibold aria-[current=page]:text-brand-navy",
              )}
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
