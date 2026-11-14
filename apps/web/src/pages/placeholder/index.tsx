import { Link, useLocation, useMatches } from "react-router";
import { Notice, SectionTitle } from "@/components/itei";
import { Button } from "@/components/ui/button";
import type { RouteHandle } from "@/app/app-shell";

/** 前台暂缓栏目：运行监测 / 区域画像 / 研究发布 */
export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const title =
    ([...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as RouteHandle | undefined)
      ?.title ?? "栏目";
  const body =
    pathname === "/research"
      ? "报告与政策原文将在此按类型归档（监测报告、专题简报、指导原则等）。首页「态势总览」仅在延伸阅读中展示与本期监测相关的摘要与下钻链接，不设资讯滚动。"
      : "示意导航已保留入口。本轮优先落地态势总览、指标体系与数据后台；此处暂不展开内容。";

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
      <SectionTitle level={1}>{title}</SectionTitle>
      <Notice tone="info" title="本栏目建设中">
        {body}
      </Notice>
      <Button variant="secondary" className="justify-self-start" asChild>
        <Link to="/">返回态势总览</Link>
      </Button>
    </div>
  );
}
