import { createBrowserRouter, createHashRouter, Navigate, type RouteObject } from "react-router";
import { AdminShell } from "./admin-shell";
import { AppShell, type RouteHandle } from "./app-shell";
import { RouteError } from "./route-error";

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    hydrateFallbackElement: <div className="min-h-dvh bg-surface" aria-busy="true" />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: page(() => import("@/pages/overview")), handle: { title: "态势总览" } satisfies RouteHandle },
          { path: "monitoring", lazy: page(() => import("@/pages/placeholder")), handle: { title: "运行监测" } satisfies RouteHandle },
          { path: "regions", lazy: page(() => import("@/pages/placeholder")), handle: { title: "区域画像" } satisfies RouteHandle },
          { path: "research", lazy: page(() => import("@/pages/placeholder")), handle: { title: "研究发布" } satisfies RouteHandle },
          { path: "system", lazy: page(() => import("@/pages/system")), handle: { title: "指标体系" } satisfies RouteHandle },
          { path: "system/:seq", lazy: page(() => import("@/pages/system-detail")), handle: { title: "三级指标" } satisfies RouteHandle },
          {
            path: "indicators",
            handle: { title: "指标目录" } satisfies RouteHandle,
            children: [
              { index: true, lazy: page(() => import("@/pages/catalog")) },
              { path: ":id", lazy: page(() => import("@/pages/indicator")), handle: { title: "指标档案" } satisfies RouteHandle },
            ],
          },
          { path: "observations", lazy: page(() => import("@/pages/observations")), handle: { title: "观测值" } satisfies RouteHandle },
          { path: "import", element: <Navigate to="/admin/import" replace /> },
          { path: "__design", lazy: page(() => import("@/pages/design")), handle: { title: "组件验收" } satisfies RouteHandle },
          { path: "*", lazy: page(() => import("@/pages/not-found")), handle: { title: "页面不存在" } satisfies RouteHandle },
        ],
      },
    ],
  },
  {
    path: "/admin",
    element: <AdminShell />,
    hydrateFallbackElement: <div className="min-h-dvh bg-surface" aria-busy="true" />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: page(() => import("@/pages/admin/overview")), handle: { title: "概况" } satisfies RouteHandle },
          { path: "import", lazy: page(() => import("@/pages/admin/import")), handle: { title: "新建导入" } satisfies RouteHandle },
          { path: "batches", lazy: page(() => import("@/pages/admin/batches")), handle: { title: "导入记录" } satisfies RouteHandle },
          { path: "*", lazy: page(() => import("@/pages/not-found")), handle: { title: "页面不存在" } satisfies RouteHandle },
        ],
      },
    ],
  },
];

export const router = import.meta.env.MODE === "demo" ? createHashRouter(routes) : createBrowserRouter(routes);
