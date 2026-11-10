import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/layout/page";
import { describeError } from "@/lib/api";

/** 路由级错误：留在外框里显示，说明原因和下一步 */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `页面加载失败（HTTP ${error.status}），请刷新后重试`
    : error instanceof Error && error.name === "ChunkLoadError"
      ? "页面资源已更新，请刷新后重试"
      : describeError(error);
  return (
    <Page title="页面出错">
      <div role="alert" className="flex items-start gap-3 border border-border bg-danger-bg p-4 body text-ink">
        <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <p>
          <span className="font-semibold text-danger">错误：</span>
          {message}
        </p>
      </div>
      <div className="mt-6 flex gap-3">
        <Button onClick={() => window.location.reload()}>刷新页面</Button>
        <Button variant="secondary" asChild>
          <Link to="/">返回概览</Link>
        </Button>
      </div>
    </Page>
  );
}
