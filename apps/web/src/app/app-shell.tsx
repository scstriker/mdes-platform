import { Suspense } from "react";
import { Link, Outlet, ScrollRestoration, useLocation, useMatches } from "react-router";
import { IconDatabase } from "@tabler/icons-react";
import { AppFooter, AppHeader, TabBar } from "@/components/itei";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/lib/theme";
import { PRODUCT_NAME, PUBLIC_NAV, isCurrent } from "./nav";
import { IndicatorSearch } from "@/components/layout/indicator-search";
import { ThemeMenu } from "./theme-menu";

export type RouteHandle = { title?: string };

/**
 * 前台外框：白底页眉（产品名 + 发布物导航）+ 内容 + 深蓝页脚 / 窄屏 TabBar。
 * 「数据后台」放右侧工具区，不进主导航。
 */
export function AppShell() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;
  useDocumentTitle(title?.title ? `${title.title} · ${PRODUCT_NAME}` : PRODUCT_NAME);
  const nav = PUBLIC_NAV.map((item) => ({ ...item, current: isCurrent(item.href, pathname) }));

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only z-(--z-toast) bg-surface px-4 py-2 button text-link focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-ring"
      >
        跳到主要内容
      </a>
      <AppHeader
        title={PRODUCT_NAME}
        nav={nav}
        actions={
          <>
            <IndicatorSearch variant="button" className="hidden lg:inline-flex" />
            <Link
              to="/admin"
              className="hidden items-center gap-1.5 border-b-2 border-transparent py-1 button text-ink transition-colors duration-150 hover:text-brand-navy focus-ring md:inline-flex"
            >
              <IconDatabase size={18} aria-hidden="true" />
              数据后台
            </Link>
            <ThemeMenu />
          </>
        }
      />
      {import.meta.env.MODE === "demo" && (
        <p role="note" className="border-b border-border bg-info-bg px-4 py-1.5 text-center caption text-ink md:px-6">
          演示版：不连后端，数据为 README 样例与虚构演示数据，保存在浏览器内存中，刷新即重置。
        </p>
      )}
      <main id="main" tabIndex={-1} className="flex-1 pb-tabbar outline-none md:pb-0">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <AppFooter
        left={PRODUCT_NAME}
        center="机械工业仪器仪表综合技术经济研究所（ITEI）"
        right="方法说明 · 引用格式"
      />
      <TabBar nav={nav} />
      <ScrollRestoration />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8" aria-busy="true">
      <span className="sr-only">页面加载中</span>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
