import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  useLocation,
  useParams,
  type RouteObject,
} from "react-router";
import { AdminShell } from "./admin-shell";
import { AppShell, type RouteHandle } from "./app-shell";
import { RouteError } from "./route-error";

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

function PreserveQueryRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

function PreserveParamRedirect({ prefix, param }: { prefix: string; param: string }) {
  const params = useParams();
  const { search, hash } = useLocation();
  const val = params[param] ?? "";
  return <Navigate to={`${prefix}/${encodeURIComponent(val)}${search}${hash}`} replace />;
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    hydrateFallbackElement: <div className="min-h-dvh bg-surface" aria-busy="true" />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: page(() => import("@/pages/overview")), handle: { title: "首页" } satisfies RouteHandle },
          { path: "search", lazy: page(() => import("@/pages/search")), handle: { title: "全站检索" } satisfies RouteHandle },
          { path: "products", lazy: page(() => import("@/pages/products")), handle: { title: "注册与产品" } satisfies RouteHandle },
          { path: "enterprises", lazy: page(() => import("@/pages/enterprises")), handle: { title: "企业与机构" } satisfies RouteHandle },
          { path: "trade", lazy: page(() => import("@/pages/trade")), handle: { title: "进出口贸易" } satisfies RouteHandle },
          { path: "reports", lazy: page(() => import("@/pages/reports")), handle: { title: "政策与报告" } satisfies RouteHandle },
          { path: "system", lazy: page(() => import("@/pages/system")), handle: { title: "指标目录" } satisfies RouteHandle },
          { path: "system/:seq", lazy: page(() => import("@/pages/system-detail")), handle: { title: "指标详情" } satisfies RouteHandle },
          // 工程底座与原始观测值路由已收归 /admin/* 治理闭环，旧路径保留参数平滑跳转
          { path: "indicators", element: <PreserveQueryRedirect to="/admin/indicators" /> },
          { path: "indicators/:id", element: <PreserveParamRedirect prefix="/admin/indicators" param="id" /> },
          { path: "observations", element: <PreserveQueryRedirect to="/admin/observations" /> },
          { path: "monitoring", element: <Navigate to="/trade" replace /> },
          { path: "regions", element: <Navigate to="/enterprises" replace /> },
          { path: "research", element: <Navigate to="/reports" replace /> },
          { path: "import", element: <PreserveQueryRedirect to="/admin/import" /> },
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
          { index: true, lazy: page(() => import("@/pages/admin/overview")), handle: { title: "入库概况" } satisfies RouteHandle },
          { path: "import", lazy: page(() => import("@/pages/admin/import")), handle: { title: "新建导入" } satisfies RouteHandle },
          { path: "batches", lazy: page(() => import("@/pages/admin/batches")), handle: { title: "导入记录" } satisfies RouteHandle },
          {
            path: "indicators",
            handle: { title: "工程指标库" } satisfies RouteHandle,
            children: [
              { index: true, lazy: page(() => import("@/pages/catalog")) },
              { path: ":id", lazy: page(() => import("@/pages/indicator")), handle: { title: "工程指标档案" } satisfies RouteHandle },
            ],
          },
          { path: "observations", lazy: page(() => import("@/pages/observations")), handle: { title: "观测值核查" } satisfies RouteHandle },
          { path: "*", lazy: page(() => import("@/pages/not-found")), handle: { title: "页面不存在" } satisfies RouteHandle },
        ],
      },
    ],
  },
];

export const router = import.meta.env.MODE === "demo" ? createHashRouter(routes) : createBrowserRouter(routes);
