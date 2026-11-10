import { useMemo, useState } from "react";
import { Link } from "react-router";
import { IconAdjustmentsHorizontal, IconLayoutGrid, IconTable, IconX } from "@tabler/icons-react";
import type { Cluster, IndicatorListItem } from "@mdes/shared";
import { DataTable, EmptyState, Field, formatNumber, pad2, Tag, TextLink, Tree, type DataTableColumn, type TreeNode } from "@/components/itei";
import { FilterSelect } from "@/components/layout/filter-select";
import { Page } from "@/components/layout/page";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useClusters, useIndicators } from "@/lib/api";
import { PHASE_LABELS, SOURCE_KIND_LABELS } from "@/lib/labels";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import {
  automationOf,
  dataStatusOf,
  facetCounts,
  filterIndicators,
  FILTER_KEYS,
  shortClusterName,
  type CatalogFilters,
} from "./filter";

const ALL_CLUSTERS = "__all__";

export default function CatalogPage() {
  const url = useUrlState();
  const indicators = useIndicators();
  const clusters = useClusters();
  const filters: CatalogFilters = {
    cluster: url.get("cluster"),
    phase: url.get("phase"),
    source: url.get("source"),
    automation: url.get("automation"),
    data: url.get("data"),
    q: url.get("q"),
  };
  const view = url.get("view") === "matrix" ? "matrix" : "table";
  const advancedActive = [filters.phase, filters.source, filters.automation, filters.data].filter(Boolean).length;
  const [showAdvanced, setShowAdvanced] = useState(advancedActive > 0);

  const items = useMemo(() => indicators.data ?? [], [indicators.data]);
  const clusterList = useMemo(() => clusters.data ?? [], [clusters.data]);
  const clusterName = useMemo(
    () => new Map(clusterList.map((c) => [c.code, shortClusterName(c.name)])),
    [clusterList],
  );
  // 99 项，直接在前端筛选
  const result = filterIndicators(items, filters);

  const count = (key: keyof CatalogFilters, valueOf: (i: IndicatorListItem) => string) => facetCounts(items, filters, key, valueOf);
  const clusterCounts = count("cluster", (i) => i.cluster_code);
  const phaseCounts = count("phase", (i) => i.phase);
  const sourceCounts = count("source", (i) => i.source_kind);
  const automationCounts = count("automation", automationOf);
  const dataCounts = count("data", dataStatusOf);
  const automationValues = useMemo(() => [...new Set(items.map(automationOf))].sort((a, b) => a.localeCompare(b, "zh-CN")), [items]);
  const sourceValues = useMemo(() => [...new Set(items.map((i) => i.source_kind))], [items]);

  const anyFilter = FILTER_KEYS.some((k) => filters[k]);
  const clearAll = () => url.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const loading = indicators.isPending || clusters.isPending;
  const error = indicators.error ?? clusters.error;

  const treeNodes: TreeNode[] = [
    { id: ALL_CLUSTERS, label: "全部指标簇", count: [...clusterCounts.values()].reduce((a, b) => a + b, 0) },
    ...clusterList.map((c, i) => ({
      id: c.code,
      number: pad2(i + 1),
      label: shortClusterName(c.name),
      count: clusterCounts.get(c.code) ?? 0,
    })),
  ];

  return (
    <Page number="二" title="指标目录" lead="V12 指标体系 7 簇 99 项。按簇、阶段、来源与采集方式筛选，点编号进入指标档案。">
      {error ? (
        <QueryError error={error} onRetry={() => (indicators.refetch(), clusters.refetch())} />
      ) : (
        <div className="lg:flex lg:items-start lg:gap-8">
          <aside className="hidden shrink-0 border border-border bg-surface-sunken py-2 lg:sticky lg:top-20 lg:block lg:w-60">
            <p className="px-4 pt-1 pb-2 caption text-ink-muted">指标簇</p>
            {loading ? (
              <div className="grid gap-2 px-4 pb-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full bg-border" />
                ))}
              </div>
            ) : (
              <Tree
                aria-label="指标簇"
                nodes={treeNodes}
                selectedId={filters.cluster || ALL_CLUSTERS}
                onSelect={(id) => url.set({ cluster: id === ALL_CLUSTERS ? null : id })}
              />
            )}
          </aside>

          <div className="grid min-w-0 flex-1 gap-5">
            <div className="grid gap-4 border border-border bg-surface p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="搜索">
                  <Input
                    type="search"
                    value={filters.q}
                    placeholder="指标编号或名称，如 TRD-001、进口"
                    onChange={(e) => url.set({ q: e.target.value })}
                  />
                </Field>
                <FilterSelect
                  className="lg:hidden"
                  label="指标簇"
                  allLabel="全部指标簇"
                  value={filters.cluster}
                  onChange={(v) => url.set({ cluster: v })}
                  options={clusterList.map((c) => ({ value: c.code, label: c.name, count: clusterCounts.get(c.code) ?? 0 }))}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="justify-self-start lg:hidden"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <IconAdjustmentsHorizontal aria-hidden="true" />
                {showAdvanced ? "收起筛选" : `更多筛选${advancedActive ? `（${advancedActive}）` : ""}`}
              </Button>
              <div className={cn("gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-4", showAdvanced ? "grid" : "hidden")}>
                <FilterSelect
                  label="阶段"
                  value={filters.phase}
                  onChange={(v) => url.set({ phase: v })}
                  options={(["phase1", "later"] as const).map((p) => ({ value: p, label: PHASE_LABELS[p], count: phaseCounts.get(p) ?? 0 }))}
                />
                <FilterSelect
                  label="来源类型"
                  value={filters.source}
                  onChange={(v) => url.set({ source: v })}
                  options={sourceValues.map((s) => ({ value: s, label: SOURCE_KIND_LABELS[s] ?? s, count: sourceCounts.get(s) ?? 0 }))}
                />
                <FilterSelect
                  label="采集方式"
                  value={filters.automation}
                  onChange={(v) => url.set({ automation: v })}
                  options={automationValues.map((a) => ({ value: a, label: a, count: automationCounts.get(a) ?? 0 }))}
                />
                <FilterSelect
                  label="数据状态"
                  value={filters.data}
                  onChange={(v) => url.set({ data: v })}
                  options={[
                    { value: "with", label: "已入库", count: dataCounts.get("with") ?? 0 },
                    { value: "without", label: "未入库", count: dataCounts.get("without") ?? 0 },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="body text-ink" aria-live="polite">
                {loading ? "加载中" : <>共 <b className="tabular-nums">{formatNumber(result.length)}</b> 项</>}
                {anyFilter && !loading && (
                  <Button variant="ghost" size="sm" className="ml-2" onClick={clearAll}>
                    <IconX aria-hidden="true" />
                    清除筛选
                  </Button>
                )}
              </p>
              <div className="flex gap-2" role="group" aria-label="视图">
                <Button
                  size="sm"
                  variant={view === "table" ? "primary" : "secondary"}
                  aria-pressed={view === "table"}
                  onClick={() => url.set({ view: null })}
                >
                  <IconTable aria-hidden="true" />
                  表格
                </Button>
                <Button
                  size="sm"
                  variant={view === "matrix" ? "primary" : "secondary"}
                  aria-pressed={view === "matrix"}
                  onClick={() => url.set({ view: "matrix" })}
                >
                  <IconLayoutGrid aria-hidden="true" />
                  矩阵
                </Button>
              </div>
            </div>

            {!loading && result.length === 0 ? (
              <EmptyState
                title="没有符合条件的指标"
                description="放宽或清除筛选条件后再试。"
                action={
                  <Button variant="secondary" onClick={clearAll}>
                    清除筛选
                  </Button>
                }
              />
            ) : view === "table" ? (
              <DataTable
                caption="指标目录"
                columns={tableColumns(clusterName, Boolean(filters.cluster))}
                data={result}
                getRowId={(i) => i.id}
                loading={loading}
                stickyFirstColumn
              />
            ) : (
              <Matrix clusters={clusterList} items={result} loading={loading} />
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

function tableColumns(clusterName: Map<string, string>, hideCluster: boolean): DataTableColumn<IndicatorListItem>[] {
  return [
    {
      key: "id",
      title: "编号",
      type: "code",
      sortable: true,
      cell: (i) => <TextLink to={`/indicators/${i.id}`}>{i.id}</TextLink>,
    },
    {
      key: "name",
      title: "名称",
      primary: true,
      sortable: true,
      cell: (i) => <TextLink to={`/indicators/${i.id}`} className="text-ink">{i.name}</TextLink>,
    },
    ...(hideCluster
      ? []
      : [{ key: "cluster_code", title: "簇", value: (i: IndicatorListItem) => clusterName.get(i.cluster_code) ?? i.cluster_code, sortable: true }]),
    { key: "phase", title: "阶段", value: (i) => PHASE_LABELS[i.phase], sortable: true },
    { key: "automation", title: "采集方式", value: automationOf, sortable: true },
    { key: "obs_count", title: "观测值", type: "number", sortable: true },
    { key: "latest_period", title: "最近期间", type: "code", sortable: true },
    {
      key: "status",
      title: "数据状态",
      type: "status",
      value: dataStatusOf,
      cell: (i) => (i.obs_count > 0 ? <Tag size="sm" tone="success">已入库</Tag> : <Tag size="sm">未入库</Tag>),
    },
  ];
}

/** 矩阵：簇 × 阶段，每格是指标小块；圆点表示是否已入库 */
function Matrix({ clusters, items, loading }: { clusters: Cluster[]; items: IndicatorListItem[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  const byCell = (code: string, phase: string) => items.filter((i) => i.cluster_code === code && i.phase === phase);
  const rows = clusters.filter((c) => items.some((i) => i.cluster_code === c.code));
  return (
    <div className="grid gap-3">
      <p className="flex flex-wrap gap-4 caption text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-pill bg-success" />
          已入库
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-pill border border-border-strong" />
          未入库
        </span>
      </p>
      <div className="border-t-2 border-brand-sky" role="table" aria-label="指标矩阵：簇 × 阶段">
        <div role="row" className="hidden border-b border-border bg-surface-sunken md:grid md:grid-cols-5">
          <span role="columnheader" className="px-3 py-2 label font-bold text-brand-navy">指标簇</span>
          <span role="columnheader" className="col-span-2 px-3 py-2 label font-bold text-brand-navy">一期</span>
          <span role="columnheader" className="col-span-2 px-3 py-2 label font-bold text-brand-navy">后期</span>
        </div>
        {rows.map((c) => (
          <div key={c.code} role="row" className="grid gap-2 border-b border-border py-3 md:grid-cols-5 md:gap-0">
            <span role="rowheader" className="px-3 title-nav text-brand-navy">
              {shortClusterName(c.name)}
              <span className="ml-1 code font-normal text-ink-muted">{c.code}</span>
            </span>
            {(["phase1", "later"] as const).map((phase) => {
              const cell = byCell(c.code, phase);
              return (
                <div key={phase} role="cell" className="px-3 md:col-span-2">
                  <span className="mb-1 block caption text-ink-muted md:hidden">{PHASE_LABELS[phase]}</span>
                  {cell.length === 0 ? (
                    <span className="body-sm text-ink-muted">—</span>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {cell.map((i) => (
                        <li key={i.id}>
                          <Link
                            to={`/indicators/${i.id}`}
                            title={`${i.id} ${i.name}${i.obs_count ? `（${i.obs_count} 条观测值）` : "（未入库）"}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 body-sm text-ink transition-colors duration-150 hover:border-brand-navy hover:text-brand-navy focus-ring"
                          >
                            <span
                              aria-hidden="true"
                              className={cn("size-2 shrink-0 rounded-pill", i.obs_count ? "bg-success" : "border border-border-strong")}
                            />
                            <span className="code">{i.id}</span>
                            <span className="sr-only">{i.obs_count ? "已入库" : "未入库"}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
