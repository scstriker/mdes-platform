import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell, type RouteHandle } from "./app-shell";
import { RouteError } from "./route-error";

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    // 首次进入时懒加载页面代码，期间显示空白底色，避免闪出无样式内容
    hydrateFallbackElement: <div className="min-h-dvh bg-surface" aria-busy="true" />,
    children: [
      {
        // 无路径的错误边界：页面出错时外框保留
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: page(() => import("@/pages/overview")), handle: { title: "概览" } satisfies RouteHandle },
          {
            path: "indicators",
            handle: { title: "指标目录" } satisfies RouteHandle,
            children: [
              { index: true, lazy: page(() => import("@/pages/catalog")) },
              { path: ":id", lazy: page(() => import("@/pages/indicator")), handle: { title: "指标档案" } satisfies RouteHandle },
            ],
          },
          { path: "observations", lazy: page(() => import("@/pages/observations")), handle: { title: "观测值" } satisfies RouteHandle },
          { path: "import", lazy: page(() => import("@/pages/import")), handle: { title: "数据导入" } satisfies RouteHandle },
          { path: "__design", lazy: page(() => import("@/pages/design")), handle: { title: "组件验收" } satisfies RouteHandle },
          { path: "*", lazy: page(() => import("@/pages/not-found")), handle: { title: "页面不存在" } satisfies RouteHandle },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
