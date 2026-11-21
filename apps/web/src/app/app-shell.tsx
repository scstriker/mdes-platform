import { Suspense } from "react";
import { Link, Outlet, ScrollRestoration, useLocation, useMatches } from "react-router";
import { AppFooter, AppHeader, TabBar } from "@/components/itei";
import { PublicationFooter } from "@/components/layout/publication-footer";
import { ScopedSearchBar } from "@/components/layout/scoped-search-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/lib/theme";
import { MOBILE_NAV, PRODUCT_NAME, PUBLIC_NAV, isCurrent } from "./nav";
import { ThemeMenu } from "./theme-menu";

export type RouteHandle = { title?: string };

/**
 * 前台外框（部委智库门户态）：
 * - 白底页眉（1200px 居中轴线 + 双色底线）+ 紧贴页眉的全站同轴分域检索带 + 内容区 + 编制说明与深蓝页脚 / 窄屏 TabBar。
 * - 「数据管理」从顶栏移除并下沉至页脚右侧工具链接，保持公开智库门户纯净庄重。
 */
export function AppShell() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;
  useDocumentTitle(title?.title ? `${title.title} · ${PRODUCT_NAME}` : PRODUCT_NAME);
  const nav = PUBLIC_NAV.map((item) => ({ ...item, current: isCurrent(item.href, pathname) }));
  const mobileNav = MOBILE_NAV.map((item) => ({ ...item, current: isCurrent(item.href, pathname) }));

  return (
    <div className="flex min-h-dvh flex-col bg-surface pb-tabbar text-ink md:pb-0">
      <a
        href="#main"
        className="sr-only z-(--z-toast) bg-surface px-4 py-2 button text-link focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-ring"
      >
        跳到主要内容
      </a>
      <AppHeader title={PRODUCT_NAME} nav={nav} actions={<ThemeMenu />} />
      {import.meta.env.MODE === "demo" && (
        <p role="note" className="border-b border-border bg-info-bg px-4 py-1.5 text-center caption text-ink md:px-6">
          离线演示版：采用本所标准样例序列运行，数据变更暂存于当前浏览器会话。
        </p>
      )}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {pathname !== "/__design" && <ScopedSearchBar mode="public" />}
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      {pathname !== "/__design" && pathname !== "/" && <PublicationFooter />}
      <AppFooter
        left={PRODUCT_NAME}
        center="机械工业仪器仪表综合技术经济研究所（ITEI）"
        right={
          <>
            <Link to="/system" className="text-on-brand underline-offset-4 hover:underline focus-ring">
              统计口径
            </Link>
            {" · "}
            <Link to="/admin" className="text-on-brand underline-offset-4 hover:underline focus-ring">
              数据管理
            </Link>
          </>
        }
      />
      <TabBar nav={mobileNav} />
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
