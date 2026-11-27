import { useState } from "react";
import { Link } from "react-router";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

export type TabBarDrawerGroup = {
  title: string;
  items: NavItem[];
};

type TabBarProps = {
  nav: NavItem[];
  /** 可选：第 5 项「全部」打开的完整导航分组抽屉 */
  drawerGroups?: TabBarDrawerGroup[];
  /** 固定在视口底部。/__design 里展示静态样例时关掉 */
  fixed?: boolean;
  className?: string;
};

/**
 * 窄屏底部 TabBar（ITEI platforms.md 手机端）：5 项以内，当前项 brand-navy 图标 + 文字，
 * 非当前 ink-muted，不用红。md 及以上隐藏，由页眉主导航承担。
 */
export function TabBar({ nav, drawerGroups, fixed = true, className }: TabBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        {nav.map(({ href, label, icon: Icon, current }) => {
          if (href === "#all" && drawerGroups && drawerGroups.length > 0) {
            return (
              <li key={href}>
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      aria-expanded={drawerOpen}
                      className={cn(
                        "flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-0.5 caption text-ink-muted focus-ring-inset",
                        current && "font-semibold text-brand-navy",
                      )}
                    >
                      <Icon className="size-6" aria-hidden="true" />
                      {label}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-4/5 overflow-y-auto p-0">
                    <SheetHeader className="border-b border-border bg-surface px-4 py-3.5">
                      <SheetTitle>全站导航目录</SheetTitle>
                      <SheetDescription>覆盖 7 大产业研究栏目与 7 类权威资料查询</SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-5 px-4 py-4 pb-8">
                      {drawerGroups.map((group) => (
                        <section key={group.title} className="grid gap-2">
                          <h3 className="label text-brand-navy">{group.title}</h3>
                          <ul className="grid grid-cols-2 gap-2">
                            {group.items.map((gItem) => {
                              const GIcon = gItem.icon;
                              return (
                                <li key={gItem.href}>
                                  <Link
                                    to={gItem.href}
                                    aria-current={gItem.current ? "page" : undefined}
                                    onClick={() => setDrawerOpen(false)}
                                    className={cn(
                                      "flex items-center gap-2 border border-border bg-surface px-3 py-2.5 body-sm text-ink transition-colors hover:border-brand-navy hover:bg-info-bg focus-ring",
                                      "aria-[current=page]:border-brand-navy aria-[current=page]:bg-info-bg aria-[current=page]:font-semibold aria-[current=page]:text-brand-navy",
                                    )}
                                  >
                                    <GIcon className="size-4 shrink-0 text-brand-navy" aria-hidden="true" />
                                    <span className="truncate">{gItem.label}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </li>
            );
          }

          return (
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
          );
        })}
      </ul>
    </nav>
  );
}
