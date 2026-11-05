import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { IconTable } from "@tabler/icons-react";
import { Breadcrumbs, EmptyState, KpiTile } from "@/components/itei";
import { Page } from "@/components/layout/page";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, useClusters, useIndicator } from "@/lib/api";
import { PHASE_LABELS, SOURCE_KIND_LABELS } from "@/lib/labels";
import { useUrlState } from "@/lib/url-state";
import { shortClusterName } from "../catalog/filter";
import { DataTab } from "./data-tab";
import { RelatedTab } from "./related-tab";
import { SpecTab } from "./spec-tab";

const TABS = ["data", "spec", "related"] as const;
type Tab = (typeof TABS)[number];

/**
 * 指标档案：「数据 / 规格 / 关联指标」三个页签，当前页签与图表切片都写进 URL
 * （借鉴 open-sdg 的数据 / 元数据页签与 OWID Grapher 的可分享状态）。
 */
export default function IndicatorPage() {
  const { id = "" } = useParams();
  const url = useUrlState();
  const indicator = useIndicator(id);
  const clusters = useClusters();
  const clusterNames = useMemo(
    () => new Map((clusters.data ?? []).map((c) => [c.code, shortClusterName(c.name)])),
    [clusters.data],
  );
  const tab: Tab = (TABS as readonly string[]).includes(url.get("tab")) ? (url.get("tab") as Tab) : "data";
  const catalogCrumb = { label: "指标目录", href: "/indicators" };

  if (indicator.isError) {
    const notFound = indicator.error instanceof ApiError && indicator.error.code === "NOT_FOUND";
    return (
      <Page title={notFound ? "未找到指标" : "指标档案"} breadcrumbs={<Breadcrumbs items={[catalogCrumb, { label: id }]} />}>
        {notFound ? (
          <EmptyState
            title={`指标目录中没有编号 ${id}`}
            description="请确认编号是否正确，或回到指标目录查找。"
            action={
              <Button asChild>
                <Link to="/indicators">返回指标目录</Link>
              </Button>
            }
          />
        ) : (
          <QueryError error={indicator.error} onRetry={() => indicator.refetch()} />
        )}
      </Page>
    );
  }

  const ind = indicator.data;
  if (!ind) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8" aria-busy="true">
        <span className="sr-only">指标加载中</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const clusterName = clusterNames.get(ind.cluster_code) ?? ind.cluster_code;
  return (
    <Page
      breadcrumbs={
        <Breadcrumbs items={[catalogCrumb, { label: clusterName, href: `/indicators?cluster=${ind.cluster_code}` }, { label: ind.id }]} />
      }
      title={ind.name}
      lead={
        <>
          <span className="code">{ind.id}</span> · {clusterName} · {PHASE_LABELS[ind.phase]} · 更新频率 {ind.update_freq || "未填写"}
        </>
      }
      actions={
        <Button variant="secondary" asChild>
          <Link to={`/observations?indicator_id=${ind.id}`}>
            <IconTable aria-hidden="true" />
            查看全部观测值
          </Link>
        </Button>
      }
    >
      <div className="grid gap-8">
        <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3">
          <KpiTile label="观测值" value={ind.obs_count} unit="条" delta={ind.obs_count > 0 ? "已入库" : "未入库"} />
          <KpiTile label="最近期间" value={ind.latest_period ?? "—"} delta={ind.latest_period ? undefined : "尚无数据"} />
          <KpiTile
            label="采集方式"
            value={ind.automation ?? "—"}
            delta={`来源类型：${SOURCE_KIND_LABELS[ind.source_kind] ?? ind.source_kind}`}
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === "data" ? null : v })}>
          <TabsList aria-label="指标档案内容">
            <TabsTrigger value="data">数据</TabsTrigger>
            <TabsTrigger value="spec">规格</TabsTrigger>
            <TabsTrigger value="related">关联指标</TabsTrigger>
          </TabsList>
          <TabsContent value="data">
            <DataTab indicator={ind} />
          </TabsContent>
          <TabsContent value="spec">
            <SpecTab indicator={ind} clusterName={clusterName} />
          </TabsContent>
          <TabsContent value="related">
            <RelatedTab indicator={ind} clusterNames={clusterNames} />
          </TabsContent>
        </Tabs>
      </div>
    </Page>
  );
}
