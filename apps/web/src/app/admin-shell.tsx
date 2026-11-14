import { Suspense } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import { AppFooter, AppHeader } from "@/components/itei";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/theme";
import { ADMIN_NAV } from "./admin-nav";
import { PRODUCT_NAME } from "./nav";
import { ThemeMenu } from "./theme-menu";

/**
 * 数据后台外框：白底页眉「数据后台」+ 左侧导航 + 细深蓝页脚。
 * 当前项浅蓝底 + 左侧深蓝竖线；红色留给内容区。
 */
export function AdminShell() {
  useDocumentTitle(`数据后台 · ${PRODUCT_NAME}`);
  const { pathname } = useLocation();
  const groups = [...new Set(ADMIN_NAV.map((i) => i.group))];

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only z-(--z-toast) bg-surface px-4 py-2 button text-link focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-ring"
      >
        跳到主要内容
      </a>
      <AppHeader
        title="数据后台"
        nav={[]}
        actions={
          <>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 border-b-2 border-transparent py-1 button text-ink transition-colors duration-150 hover:text-brand-navy focus-ring"
            >
              <IconArrowLeft size={18} aria-hidden="true" />
              返回前台
            </Link>
            <span className="hidden caption text-ink-muted sm:inline">（示意）数据管理员</span>
            <ThemeMenu />
          </>
        }
      />
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-border bg-surface-sunken md:w-56 md:border-r md:border-b-0">
          <nav aria-label="数据后台导航" className="flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible md:py-6">
            {groups.map((group) => (
              <div key={group} className="flex shrink-0 flex-col gap-0.5 md:mb-4">
                <p className="hidden px-3 pb-1 caption text-ink-muted md:block">{group}</p>
                {ADMIN_NAV.filter((i) => i.group === group).map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  if (item.disabled) {
                    return (
                      <span
                        key={item.href}
                        title="本轮未开放"
                        className="flex items-center justify-between gap-2 rounded-none px-3 py-2 body text-ink-disabled"
                      >
                        {item.label}
                        <span className="caption">未开放</span>
                      </span>
                    );
                  }
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      end={item.href === "/admin"}
                      className={cn(
                        "flex items-center justify-between gap-2 border-l-2 border-transparent px-3 py-2 body transition-colors duration-150 focus-ring-inset",
                        active
                          ? "border-l-brand-navy bg-info-bg font-semibold text-brand-navy"
                          : "text-ink hover:bg-surface hover:text-brand-navy",
                      )}
                    >
                      {item.label}
                      {item.count != null && <span className="caption tabular-nums text-ink-muted">{item.count}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <Suspense fallback={<AdminFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <AppFooter left={PRODUCT_NAME} center="仅限本所内部使用" right="数据后台" />
      <ScrollRestoration />
    </div>
  );
}

function AdminFallback() {
  return (
    <div className="grid gap-6 p-4 md:p-8" aria-busy="true">
      <span className="sr-only">页面加载中</span>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
