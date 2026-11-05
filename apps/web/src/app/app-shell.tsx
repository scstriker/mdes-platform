import { Suspense } from "react";
import { Outlet, ScrollRestoration, useLocation, useMatches } from "react-router";
import { AppFooter, AppHeader, TabBar } from "@/components/itei";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/lib/theme";
import { NAV, isCurrent } from "./nav";
import { ThemeMenu } from "./theme-menu";

export type RouteHandle = { title?: string };

/**
 * 页面外框：白底页眉（吸顶）+ 内容 + 深蓝页脚（桌面）/ 底部 TabBar（窄屏）。
 * 解决旧外框的四个问题：
 * 1. 窄屏没有导航 → 窄屏显示 TabBar；
 * 2. 页脚文字被斜切装饰遮住 → 右段文字留出装饰宽度；
 * 3. 宽屏滚动条跑到屏幕中间 → 滚动交给文档本身，内容区只限宽不自带滚动；
 * 4. 深色主题下标志落在深蓝底上 → 页眉白底，深色主题标志换成文字「ITEI」。
 */
export function AppShell() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;
  useDocumentTitle(title?.title);
  const nav = NAV.map((item) => ({ ...item, current: isCurrent(item.href, pathname) }));

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only z-(--z-toast) bg-surface px-4 py-2 button text-link focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-ring"
      >
        跳到主要内容
      </a>
      <AppHeader title={title?.title ?? "医疗器械产业数据系统"} nav={nav} actions={<ThemeMenu />} />
      <main id="main" tabIndex={-1} className="flex-1 pb-tabbar outline-none md:pb-0">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <AppFooter
        left="医疗器械产业数据系统（MDES）"
        center="机械工业仪器仪表综合技术经济研究所（ITEI）"
        right="一期演示"
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
