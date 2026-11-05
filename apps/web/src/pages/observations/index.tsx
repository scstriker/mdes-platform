import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { IconDownload, IconSearch, IconUpload, IconX } from "@tabler/icons-react";
import type { Observation, ObservationQuery } from "@mdes/shared";
import { DataTable, EmptyState, Field, formatNumber, Notice, TextLink, type DataTableColumn } from "@/components/itei";
import { FilterSelect } from "@/components/layout/filter-select";
import { Page } from "@/components/layout/page";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, describeError, useBatches, useIndicators, useObservations } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { downloadText, toCsv } from "@/lib/download";
import { formatDims, geoLabel } from "@/lib/labels";
import { useUrlState } from "@/lib/url-state";

const PAGE_SIZE = 50;
const EXPORT_MAX = 10_000;
const FIELDS = ["indicator_id", "period_from", "period_to", "geo", "batch_id"] as const;
type Filters = Record<(typeof FIELDS)[number], string>;

/**
 * 观测值查询：条件写进 URL（可分享、可从指标档案或导入结果直接跳来），服务端分页并给出总数。
 * 翻页与改条件时保留上一页数据，过期请求自动取消，不会出现旧结果覆盖新结果。
 */
export default function ObservationsPage() {
  const url = useUrlState();
  const applied: Filters = Object.fromEntries(FIELDS.map((k) => [k, url.get(k)])) as Filters;
  const appliedKey = JSON.stringify(applied);
  const page = Math.max(0, Number.parseInt(url.get("page") || "1", 10) - 1 || 0);
  const [draft, setDraft] = useState<Filters>(applied);
  useEffect(() => setDraft(JSON.parse(appliedKey) as Filters), [appliedKey]);

  const query: ObservationQuery = useMemo(() => {
    const f = JSON.parse(appliedKey) as Filters;
    const q: ObservationQuery = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    for (const k of FIELDS) if (f[k]) q[k] = f[k];
    return q;
  }, [appliedKey, page]);
  const result = useObservations(query);
  const indicators = useIndicators();
  const batches = useBatches();
  const [exporting, setExporting] = useState<{ error?: string; busy: boolean }>({ busy: false });

  const names = useMemo(() => new Map((indicators.data ?? []).map((i) => [i.id, i.name])), [indicators.data]);
  const anyFilter = FIELDS.some((k) => applied[k]);
  const total = result.data?.total ?? 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    url.set({ ...Object.fromEntries(FIELDS.map((k) => [k, draft[k].trim() || null])), page: null }, { push: true });
  }
  function clear() {
    url.set({ ...Object.fromEntries(FIELDS.map((k) => [k, null])), page: null }, { push: true });
  }

  async function exportCsv() {
    setExporting({ busy: true });
    try {
      const base = { ...query };
      let items: Observation[] = [];
      while (items.length < Math.min(total, EXPORT_MAX)) {
        const next = await api.observations({ ...base, limit: 500, offset: items.length });
        if (next.items.length === 0) break;
        items = items.concat(next.items);
      }
      const csv = toCsv(
        ["indicator_id", "period", "geo", "value_num", "unit", "value_text", "dims", "batch_id", "created_at"],
        items.map((r) => [r.indicator_id, r.period, r.geo, r.value_num, r.unit, r.value_text, JSON.stringify(r.dims ?? {}), r.batch_id, r.created_at]),
      );
      downloadText(`observations_${applied.indicator_id || "all"}.csv`, csv);
      setExporting({ busy: false });
    } catch (err) {
      setExporting({ busy: false, error: describeError(err) });
    }
  }

  const batchOptions = (batches.data ?? []).map((b) => ({
    value: b.id,
    label: `${b.filename} · ${formatDateTime(b.created_at)}（${formatNumber(b.row_ok)} 行）`,
  }));
  if (draft.batch_id && !batchOptions.some((o) => o.value === draft.batch_id)) {
    batchOptions.unshift({ value: draft.batch_id, label: `批次 ${draft.batch_id.slice(0, 8)}` });
  }

  return (
    <Page number="四" title="观测值" lead="按指标、期间、地域与导入批次查询已入库的观测值，可导出 CSV。">
      <div className="grid gap-5">
        <form onSubmit={submit} className="grid gap-4 border border-border bg-surface p-4" aria-label="查询条件">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              label="指标"
              allLabel="全部指标"
              value={draft.indicator_id}
              onChange={(v) => setDraft((d) => ({ ...d, indicator_id: v }))}
              options={(indicators.data ?? []).map((i) => ({
                value: i.id,
                label: `${i.id} ${i.name}`,
                count: i.obs_count || undefined,
              }))}
            />
            <Field label="起始期间" help="含当期，如 2024-01 或 2024">
              <Input value={draft.period_from} placeholder="如 2024-01" onChange={(e) => setDraft((d) => ({ ...d, period_from: e.target.value }))} />
            </Field>
            <Field label="截止期间" help="含当期；填 2024 含 2024 年各月">
              <Input value={draft.period_to} placeholder="如 2024-12" onChange={(e) => setDraft((d) => ({ ...d, period_to: e.target.value }))} />
            </Field>
            <Field label="地域" help="全国为 CN，省份用 6 位行政区划代码，如 440000">
              <Input value={draft.geo} placeholder="如 CN" onChange={(e) => setDraft((d) => ({ ...d, geo: e.target.value }))} />
            </Field>
            <FilterSelect
              className="lg:col-span-2"
              label="导入批次"
              allLabel="全部批次"
              value={draft.batch_id}
              onChange={(v) => setDraft((d) => ({ ...d, batch_id: v }))}
              options={batchOptions}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              <IconSearch aria-hidden="true" />
              查询
            </Button>
            {anyFilter && (
              <Button variant="ghost" onClick={clear}>
                <IconX aria-hidden="true" />
                清除条件
              </Button>
            )}
          </div>
        </form>

        {result.isError ? (
          <QueryError error={result.error} onRetry={() => result.refetch()} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="body" aria-live="polite">
                {result.isPending ? (
                  "查询中"
                ) : (
                  <>
                    共 <b className="tabular-nums">{formatNumber(total)}</b> 条
                    {applied.indicator_id && (
                      <span className="text-ink-muted">
                        {" "}
                        · <TextLink to={`/indicators/${applied.indicator_id}`}>{applied.indicator_id} {names.get(applied.indicator_id) ?? ""}</TextLink>
                      </span>
                    )}
                    {result.isFetching && <span className="ml-2 caption text-ink-muted">更新中</span>}
                  </>
                )}
              </p>
              <Button variant="secondary" size="sm" disabled={total === 0 || exporting.busy} onClick={exportCsv}>
                <IconDownload aria-hidden="true" />
                {exporting.busy ? "导出中" : total > EXPORT_MAX ? `导出前 ${formatNumber(EXPORT_MAX)} 条` : "导出 CSV"}
              </Button>
            </div>
            {exporting.error && <Notice tone="danger" title={`导出失败：${exporting.error}`} />}

            {!result.isPending && total === 0 ? (
              anyFilter ? (
                <EmptyState
                  title="没有符合条件的观测值"
                  description="放宽期间范围或清除条件后再试。"
                  action={
                    <Button variant="secondary" onClick={clear}>
                      清除条件
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="还没有观测值"
                  description="导入 CSV 后在这里查询。"
                  action={
                    <Button asChild>
                      <Link to="/import">
                        <IconUpload aria-hidden="true" />
                        去导入
                      </Link>
                    </Button>
                  }
                />
              )
            ) : (
              <DataTable
                caption="观测值查询结果"
                columns={columns(names, (batchId) => url.set({ batch_id: batchId, page: null }, { push: true }))}
                data={result.data?.items ?? []}
                getRowId={(r) => r.id}
                loading={result.isPending}
                dense
                pagination={{
                  page,
                  pageSize: PAGE_SIZE,
                  total,
                  onPageChange: (p) => {
                    url.set({ page: p > 0 ? p + 1 : null }, { push: true });
                    window.scrollTo({ top: 0 });
                  },
                }}
              />
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function columns(names: Map<string, string>, filterBatch: (id: string) => void): DataTableColumn<Observation>[] {
  return [
    {
      key: "indicator_id",
      title: "指标",
      primary: true,
      cell: (r) => (
        <span className="grid">
          <TextLink to={`/indicators/${r.indicator_id}`} className="code">
            {r.indicator_id}
          </TextLink>
          <span className="caption text-ink-muted">{names.get(r.indicator_id) ?? ""}</span>
        </span>
      ),
    },
    { key: "period", title: "期间", type: "code" },
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
    {
      key: "batch_id",
      title: "批次",
      type: "code",
      cell: (r) =>
        r.batch_id ? (
          <button
            type="button"
            className="cursor-pointer text-link underline-offset-4 hover:underline focus-ring"
            onClick={() => filterBatch(r.batch_id!)}
            title="只看这个批次"
          >
            {r.batch_id.slice(0, 8)}
          </button>
        ) : (
          "—"
        ),
    },
    { key: "created_at", title: "导入时间", value: (r) => formatDateTime(r.created_at), hideOnCard: true },
  ];
}
