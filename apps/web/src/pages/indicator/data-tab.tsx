import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import type { Indicator, Observation } from "@mdes/shared";
import { DataTable, EmptyState, formatNumber, KpiTile, Notice, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { FilterSelect } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_OBSERVATIONS_MAX, useAllObservations } from "@/lib/api";
import { baseOption, categoryAxis, LazyChart, SERIES_SYMBOLS, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import { formatDateTime } from "@/lib/datetime";
import { downloadText, toCsv } from "@/lib/download";
import { formatDims, geoLabel } from "@/lib/labels";
import { buildSlice, dimensionsOf, labelOf, resolveSelection, valueOf, type SliceResult } from "@/lib/observations/slice";
import { useUrlState } from "@/lib/url-state";

/** Radix Select 不接受空字符串作为取值，「（未填）」用占位值 */
const EMPTY_TOKEN = "__empty__";
const toOption = (v: string) => (v === "" ? EMPTY_TOKEN : v);
const fromOption = (v: string) => (v === EMPTY_TOKEN ? "" : v);
const NO_SPLIT = "__none__";
const PAGE_SIZE = 50;

/**
 * 「数据」页签：先选切片再画图（ADR-002 页面迁移要求）。
 * 切片状态写进 URL（?freq=&geo=&unit=&d.<维度>=&split=），链接可分享（借鉴 OWID Grapher）。
 */
export function DataTab({ indicator }: { indicator: Indicator }) {
  const url = useUrlState();
  const all = useAllObservations({ indicator_id: indicator.id });
  const [page, setPage] = useState(0);
  const rows = useMemo(() => all.data?.items ?? [], [all.data]);

  const dims0 = useMemo(() => dimensionsOf(rows), [rows]);
  const splitParam = url.get("split");
  const splitKey = dims0.find((d) => d.key === splitParam && d.splittable && d.values.length > 1)?.key;
  const requested = Object.fromEntries(
    dims0.map((d) => [d.key, url.params.get(d.key)]).filter((e): e is [string, string] => e[1] !== null),
  );
  const requestedKey = JSON.stringify(requested);
  const { dimensions, selection, available } = useMemo(
    () => resolveSelection(rows, JSON.parse(requestedKey) as Record<string, string>, splitKey),
    [rows, requestedKey, splitKey],
  );
  const selectionKey = JSON.stringify(selection);
  const slice = useMemo(
    () => buildSlice(rows, JSON.parse(selectionKey) as Record<string, string>, splitKey),
    [rows, selectionKey, splitKey],
  );

  const unit = splitKey === "unit" ? "" : selection.unit ?? "";
  const summary = dimensions
    .filter((d) => d.key !== splitKey && selection[d.key] !== undefined && selection[d.key] !== "")
    .map((d) => (d.key.startsWith("d.") ? `${d.label}：${labelOf(d.key, selection[d.key])}` : labelOf(d.key, selection[d.key])))
    .join(" · ");
  const splitDim = dimensions.find((d) => d.key === splitKey);
  const range = slice.periods.length ? `${slice.periods[0]} 至 ${slice.periods.at(-1)}` : "";

  const chartOption = useCallback((t: ChartTheme) => chartOptionFor(t, slice, indicator.name, unit), [slice, indicator.name, unit]);

  if (all.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (all.isError) return <QueryError error={all.error} onRetry={() => all.refetch()} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="该指标还没有导入数据"
        description="导入 CSV 观测值后，这里显示图表与数据表。"
        action={
          <Button asChild>
            <Link to="/import">
              <IconUpload aria-hidden="true" />
              去导入
            </Link>
          </Button>
        }
      />
    );
  }

  const varying = dimensions.filter((d) => d.values.length > 1);
  const splittable = varying.filter((d) => d.splittable);
  const usedIds = new Set(slice.series.flatMap((s) => s.points.map((p) => p.row.id)));
  const drawn = new Set(slice.series.map((s) => s.key));
  const rowStatus = (r: Observation) =>
    r.value_num === null ? "text" : usedIds.has(r.id) ? "used" : splitKey && !drawn.has(valueOf(r, splitKey)) ? "omitted" : "duplicate";
  const columns = tableColumns(splitDim?.key, splitDim?.label, rowStatus, slice.duplicates > 0 || slice.textOnly > 0 || slice.omitted > 0);
  const pageRows = slice.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="grid gap-6">
      {(varying.length > 0 || splittable.length > 0) && (
        <div className="grid gap-4 border border-border bg-surface-sunken p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {varying
              .filter((d) => d.key !== splitKey)
              .map((d) => (
                <FilterSelect
                  key={d.key}
                  label={d.label}
                  allLabel={null}
                  value={toOption(selection[d.key] ?? "")}
                  onChange={(v) => {
                    setPage(0);
                    url.set({ [d.key]: fromOption(v) || null });
                  }}
                  options={(available[d.key] ?? []).map((v) => ({ value: toOption(v.value), label: v.label, count: v.count }))}
                />
              ))}
            {splittable.length > 0 && (
              <FilterSelect
                label="对比"
                allLabel={null}
                value={splitKey ?? NO_SPLIT}
                onChange={(v) => {
                  setPage(0);
                  url.set({ split: v === NO_SPLIT ? null : v });
                }}
                options={[
                  { value: NO_SPLIT, label: "不对比" },
                  ...splittable.map((d) => ({ value: d.key, label: `按${d.label}对比` })),
                ]}
              />
            )}
          </div>
          <p className="body-sm text-ink-muted">
            当前切片：{summary || "全部记录"}
            {splitDim && `；按${splitDim.label}对比，${slice.series.length} 条序列`}。图表不跨地域、维度、单位或周期加总。
          </p>
        </div>
      )}

      {all.data?.truncated && (
        <Notice tone="warning" title={`观测值超过 ${formatNumber(ALL_OBSERVATIONS_MAX)} 条，这里只取前 ${formatNumber(ALL_OBSERVATIONS_MAX)} 条`}>
          完整数据请到
          <TextLink inline to={`/observations?indicator_id=${indicator.id}`}>
            观测值页
          </TextLink>
          查询。
        </Notice>
      )}
      {slice.duplicates > 0 && (
        <Notice tone="info" title={`同一期间有 ${slice.duplicates} 条重复记录，图表取最近导入的一条`}>
          重复记录在下表中标为「重复」，可按批次在观测值页核对。
        </Notice>
      )}
      {slice.omitted > 0 && (
        <Notice tone="info" title={`对比序列超过 5 条，图中只显示最新值最大的 5 条`}>
          另有 {slice.omitted} 条序列未画出，数据见下表。
        </Notice>
      )}

      <section className="grid gap-2" aria-label="图表">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="title-sub text-ink">
            {indicator.name}
            {unit && `（${unit}）`}
          </h3>
          {range && <span className="caption text-ink-muted">{range}</span>}
        </div>
        {slice.series.length === 0 ? (
          <EmptyState title="当前切片没有数值数据" description="这些记录只有文本值，见下表。" />
        ) : slice.periods.length === 1 && slice.series.length === 1 ? (
          <div className="grid max-w-xs">
            <KpiTile
              label="仅一期数据"
              value={slice.series[0].points[0].value}
              unit={unit}
              delta={slice.periods[0]}
            />
          </div>
        ) : (
          <LazyChart
            option={chartOption}
            height={320}
            ariaLabel={`${indicator.name}${splitDim ? `，按${splitDim.label}对比` : ""}，${summary}，${range}`}
          />
        )}
        {slice.textOnly > 0 && <p className="caption text-ink-muted">另有 {slice.textOnly} 条文本值不进图表。</p>}
      </section>

      <section className="grid gap-3" aria-label="数据表">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="title-sub text-ink">数据表</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadText(`${indicator.id}_${summary.replace(/[\s·：]+/g, "_") || "slice"}.csv`, sliceCsv(slice.rows))}
            >
              <IconDownload aria-hidden="true" />
              导出当前切片 CSV
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/observations?indicator_id=${indicator.id}`}>在观测值页查看全部</Link>
            </Button>
          </div>
        </div>
        <DataTable
          caption={`${indicator.name}当前切片的观测值`}
          columns={columns}
          data={pageRows}
          getRowId={(r) => r.id}
          dense
          pagination={
            slice.rows.length > PAGE_SIZE
              ? { page, pageSize: PAGE_SIZE, total: slice.rows.length, onPageChange: setPage }
              : undefined
          }
        />
      </section>
    </div>
  );
}

type RowStatus = "used" | "duplicate" | "omitted" | "text";

const STATUS_TAG: Record<RowStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  used: { label: "采用", tone: "success" },
  duplicate: { label: "重复", tone: "warning" },
  omitted: { label: "未画出", tone: "neutral" },
  text: { label: "文本", tone: "neutral" },
};

function tableColumns(
  splitKey: string | undefined,
  splitLabel: string | undefined,
  statusOf: (r: Observation) => RowStatus,
  showStatus: boolean,
): DataTableColumn<Observation>[] {
  return [
    { key: "period", title: "期间", type: "code", primary: true },
    // 按地域对比时「地域」列本身就是对比维度，不再重复一列
    ...(splitKey && splitKey !== "geo"
      ? [{ key: "split", title: splitLabel ?? "", value: (r: Observation) => labelOf(splitKey, valueOf(r, splitKey)) }]
      : []),
    { key: "geo", title: "地域", value: (r) => geoLabel(r.geo) },
    { key: "dims", title: "维度", value: (r) => formatDims(r.dims) },
    {
      key: "value",
      title: "数值",
      type: "number",
      value: (r) => r.value_num,
      cell: (r) => (r.value_num === null ? <span className="text-ink-muted">{r.value_text ?? "—"}</span> : formatNumber(r.value_num)),
    },
    { key: "unit", title: "单位" },
    ...(showStatus
      ? [
          {
            key: "status",
            title: "图表",
            type: "status" as const,
            cell: (r: Observation) => {
              const s = STATUS_TAG[statusOf(r)];
              return (
                <Tag size="sm" tone={s.tone}>
                  {s.label}
                </Tag>
              );
            },
          },
        ]
      : []),
    {
      key: "batch_id",
      title: "批次",
      type: "code",
      cell: (r) => (r.batch_id ? <TextLink to={`/observations?batch_id=${r.batch_id}`}>{r.batch_id.slice(0, 8)}</TextLink> : "—"),
    },
    { key: "created_at", title: "导入时间", value: (r) => formatDateTime(r.created_at), hideOnCard: true },
  ];
}

function sliceCsv(rows: Observation[]) {
  return toCsv(
    ["indicator_id", "period", "geo", "value_num", "unit", "value_text", "dims", "batch_id"],
    rows.map((r) => [r.indicator_id, r.period, r.geo, r.value_num, r.unit, r.value_text, JSON.stringify(r.dims ?? {}), r.batch_id]),
  );
}

/** 多期：折线（单序列时最新一期用 chart-3 强调）；单期多序列：柱状对比（从 0 开始） */
function chartOptionFor(t: ChartTheme, slice: SliceResult, name: string, unit: string) {
  const fmt = (v: unknown) => (typeof v === "number" ? `${formatNumber(v)}${unit ? ` ${unit}` : ""}` : "—");
  if (slice.periods.length === 1) {
    return {
      ...baseOption(t, 1),
      tooltip: { ...baseOption(t, 1).tooltip, valueFormatter: fmt },
      xAxis: categoryAxis(t, slice.series.map((s) => s.label)),
      yAxis: valueAxis(t),
      legend: { show: false },
      series: [{ type: "bar" as const, name: slice.periods[0], data: slice.series.map((s) => s.points[0].value), barMaxWidth: 40 }],
    };
  }
  const single = slice.series.length === 1;
  return {
    ...baseOption(t, slice.series.length),
    tooltip: { ...baseOption(t, slice.series.length).tooltip, valueFormatter: fmt },
    xAxis: categoryAxis(t, slice.periods),
    yAxis: valueAxis(t, { scale: true }),
    series: slice.series.map((s, index) => {
      const byPeriod = new Map(s.points.map((p) => [p.period, p.value]));
      const data = slice.periods.map((p) => byPeriod.get(p) ?? null);
      const last = data.length - 1;
      return {
        type: "line" as const,
        name: s.label || name,
        symbol: single ? "circle" : SERIES_SYMBOLS[index % SERIES_SYMBOLS.length],
        symbolSize: single ? 6 : 7,
        lineStyle: { width: 2 },
        connectNulls: false,
        data: single ? data.map((v, i) => (i === last && v !== null ? { value: v, symbolSize: 9, itemStyle: { color: t.emphasis } } : v)) : data,
      };
    }),
  };
}
