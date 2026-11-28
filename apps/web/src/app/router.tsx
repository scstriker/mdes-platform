import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  redirect,
  useLocation,
  useParams,
  type LoaderFunctionArgs,
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

function productsLegacyRedirectLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  if (channel === "reg" || channel === "innov" || channel === "priority") {
    const qs = url.searchParams.toString();
    return redirect(qs ? `/regulation/registrations?${qs}` : "/regulation/registrations");
  }
  if (url.searchParams.get("q")?.trim() === "第三类首次注册") {
    return redirect("/statistics/STAT-REG-CLASS3-TREND");
  }
  return null;
}

function reportsLegacyRedirectLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab");
  if (tab === "policies") {
    const next = new URLSearchParams(url.searchParams);
    next.delete("tab");
    const qs = next.toString();
    return redirect(qs ? `/policies?${qs}` : "/policies");
  }
  if (tab === "guidelines") {
    const next = new URLSearchParams(url.searchParams);
    next.delete("tab");
    next.set("subkind", "guideline");
    return redirect(`/regulation/registrations?${next.toString()}`);
  }
  return null;
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
          { index: true, lazy: page(() => import("@/pages/overview")), handle: { title: "产业总览" } satisfies RouteHandle },
          { path: "search", lazy: page(() => import("@/pages/search")), handle: { title: "全站检索" } satisfies RouteHandle },
          { path: "markets", lazy: page(() => import("@/pages/markets")), handle: { title: "市场" } satisfies RouteHandle },
          { path: "markets/:slug", lazy: page(() => import("@/pages/markets")), handle: { title: "市场细分" } satisfies RouteHandle },
          { path: "technologies", lazy: page(() => import("@/pages/technologies")), handle: { title: "技术" } satisfies RouteHandle },
          { path: "technologies/:slug", lazy: page(() => import("@/pages/technologies")), handle: { title: "技术路线" } satisfies RouteHandle },
          {
            path: "products",
            loader: productsLegacyRedirectLoader,
            lazy: page(() => import("@/pages/products")),
            handle: { title: "产品" } satisfies RouteHandle,
          },
          { path: "products/:slug", lazy: page(() => import("@/pages/product-detail")), handle: { title: "产品型号详情" } satisfies RouteHandle },
          { path: "enterprises", lazy: page(() => import("@/pages/enterprises")), handle: { title: "企业" } satisfies RouteHandle },
          { path: "enterprises/:slug", lazy: page(() => import("@/pages/enterprise-detail")), handle: { title: "企业研究档案" } satisfies RouteHandle },
          { path: "trade", lazy: page(() => import("@/pages/trade")), handle: { title: "进出口贸易" } satisfies RouteHandle },
          {
            path: "reports",
            loader: reportsLegacyRedirectLoader,
            lazy: page(() => import("@/pages/reports")),
            handle: { title: "研究报告" } satisfies RouteHandle,
          },
          { path: "reports/:slug", lazy: page(() => import("@/pages/report-detail")), handle: { title: "研究报告正文" } satisfies RouteHandle },
          // 七大权威资料查询页
          { path: "statistics", lazy: page(() => import("@/pages/statistics")), handle: { title: "统计成果库" } satisfies RouteHandle },
          { path: "statistics/:id", lazy: page(() => import("@/pages/statistic-detail")), handle: { title: "单项统计工作台" } satisfies RouteHandle },
          { path: "regulation/registrations", lazy: page(() => import("@/pages/registrations")), handle: { title: "注册与准入" } satisfies RouteHandle },
          { path: "institutions", lazy: page(() => import("@/pages/institutions")), handle: { title: "机构名录" } satisfies RouteHandle },
          { path: "policies", lazy: page(() => import("@/pages/policies")), handle: { title: "产业政策" } satisfies RouteHandle },
          { path: "standards", lazy: page(() => import("@/pages/standards")), handle: { title: "技术标准" } satisfies RouteHandle },
          { path: "sources", lazy: page(() => import("@/pages/sources")), handle: { title: "官方来源" } satisfies RouteHandle },
          { path: "system", lazy: page(() => import("@/pages/system")), handle: { title: "指标与口径" } satisfies RouteHandle },
          { path: "system/:seq", lazy: page(() => import("@/pages/system-detail")), handle: { title: "指标详情" } satisfies RouteHandle },
          // 历史书签零闪烁重定向
          {
            path: "topics/products/:slug",
            loader: ({ params, request }) => {
              const url = new URL(request.url);
              return redirect(`/markets/${encodeURIComponent(params.slug ?? "")}${url.search}`);
            },
            element: <PreserveParamRedirect prefix="/markets" param="slug" />,
          },
          {
            path: "topics/enterprises/:slug",
            loader: ({ params, request }) => {
              const url = new URL(request.url);
              return redirect(`/enterprises/${encodeURIComponent(params.slug ?? "")}${url.search}`);
            },
            element: <PreserveParamRedirect prefix="/enterprises" param="slug" />,
          },
          // 前后台信息架构与路由分层（生产环境访问控制由网关侧 Cloudflare Access 独立承载）
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
