import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { IconAdjustmentsHorizontal, IconDownload, IconSearch, IconUpload, IconX } from "@tabler/icons-react";
import type { Observation, ObservationQuery } from "@mdes/shared";
import { DataTable, EmptyState, Field, formatNumber, Notice, SectionTitle, TextLink, type DataTableColumn } from "@/components/itei";
import { FilterSelect } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, describeError, useBatches, useIndicators, useObservations } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { downloadText, toCsv } from "@/lib/download";
import { formatDims, geoLabel } from "@/lib/labels";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const EXPORT_MAX = 10_000;
const FIELDS = ["indicator_id", "period_from", "period_to", "geo", "batch_id"] as const;
type Filters = Record<(typeof FIELDS)[number], string>;

const GEO_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "CN", label: "全国汇总（CN）" },
  { value: "440000", label: "广东省（440000）" },
  { value: "320000", label: "江苏省（320000）" },
  { value: "310000", label: "上海市（310000）" },
  { value: "110000", label: "北京市（110000）" },
  { value: "330000", label: "浙江省（330000）" },
  { value: "370000", label: "山东省（370000）" },
  { value: "510000", label: "四川省（510000）" },
  { value: "420000", label: "湖北省（420000）" },
  { value: "430000", label: "湖南省（430000）" },
  { value: "120000", label: "天津市（120000）" },
];

/**
 * 后台 · 原始观测值核查：按指标、期间、地域与导入批次核查已入库的观测值并支持导出 CSV。
 * 将原要求手填 6 位行政区划代码的文本框升级为中文省份下拉选择器。
 */
export default function ObservationsPage() {
  const url = useUrlState();
  const applied: Filters = Object.fromEntries(FIELDS.map((k) => [k, url.get(k)])) as Filters;
  const exactPeriod = url.get("period").trim();
  const keywordQ = url.get("q").trim();
  const appliedKey = JSON.stringify(applied);
  const page = Math.max(0, Number.parseInt(url.get("page") || "1", 10) - 1 || 0);
  const [draft, setDraft] = useState<Filters>(applied);
  useEffect(() => setDraft(JSON.parse(appliedKey) as Filters), [appliedKey]);

  const query: ObservationQuery = useMemo(() => {
    const f = JSON.parse(appliedKey) as Filters;
    const q: ObservationQuery = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    for (const k of FIELDS) if (f[k]) q[k] = f[k];
    if (exactPeriod) q.period = exactPeriod;
    if (keywordQ) q.q = keywordQ;
    return q;
  }, [appliedKey, exactPeriod, keywordQ, page]);

  const result = useObservations(query);
  const indicators = useIndicators();
  const batches = useBatches();
  const [exporting, setExporting] = useState<{ error?: string; busy: boolean }>({ busy: false });
  const moreActive = FIELDS.filter((k) => k !== "indicator_id" && applied[k]).length;
  const [showMore, setShowMore] = useState(moreActive > 0);

  const names = useMemo(() => new Map((indicators.data ?? []).map((i) => [i.id, i.name])), [indicators.data]);
  const anyFilter = FIELDS.some((k) => applied[k]) || Boolean(exactPeriod) || Boolean(keywordQ);
  const items = result.data?.items ?? [];
  const total = result.data?.total ?? 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    url.set({ ...Object.fromEntries(FIELDS.map((k) => [k, draft[k].trim() || null])), period: null, page: null }, { push: true });
  }
  function clear() {
    url.set({ ...Object.fromEntries(FIELDS.map((k) => [k, null])), period: null, q: null, page: null }, { push: true });
  }

  async function exportCsv() {
    setExporting({ busy: true });
    try {
      const { limit: _limit, offset: _offset, ...base } = query;
      void _limit;
      void _offset;
      let exported: Observation[] = [];
      while (exported.length < Math.min(total, EXPORT_MAX)) {
        const next = await api.observations({ ...base, limit: 500, offset: exported.length });
        if (next.items.length === 0) break;
        exported = exported.concat(next.items);
      }
      const csv = toCsv(
        ["indicator_id", "period", "geo", "value_num", "unit", "value_text", "dims", "batch_id", "created_at"],
        exported.map((r) => [
          r.indicator_id,
          r.period,
          r.geo,
          r.value_num,
          r.unit,
          r.value_text,
          JSON.stringify(r.dims ?? {}),
          r.batch_id,
          r.created_at,
        ]),
      );
      downloadText(`observations_${applied.indicator_id || "all"}.csv`, csv);
      setExporting({ busy: false });
    } catch (err) {
      setExporting({ busy: false, error: describeError(err) });
    }
  }

  const geoOptions = useMemo(() => {
    const list = [...GEO_OPTIONS];
    if (draft.geo && !list.some((o) => o.value === draft.geo)) {
      list.unshift({ value: draft.geo, label: `${geoLabel(draft.geo)}（${draft.geo}）` });
    }
    return list;
  }, [draft.geo]);

  const batchOptions = (batches.data ?? []).map((b) => ({
    value: b.id,
    label: `${b.filename} · ${formatDateTime(b.created_at)}（${formatNumber(b.row_ok)} 行）`,
  }));
  if (draft.batch_id && !batchOptions.some((o) => o.value === draft.batch_id)) {
    batchOptions.unshift({ value: draft.batch_id, label: `批次 ${draft.batch_id.slice(0, 8)}` });
  }

  return (
    <div className="grid gap-6 p-4 md:p-8">
      <div>
        <SectionTitle level={1}>原始观测值核查</SectionTitle>
        <p className="mt-2 body text-ink-muted">
          按底层工程指标编码、统计期间、地域及导入事务批次核查入库观测值，支持批量导出标准 CSV。
        </p>
      </div>

      <div className="grid gap-5">
        <form onSubmit={submit} className="grid gap-4 border border-border bg-surface p-4" aria-label="查询条件">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              className="sm:col-span-2 lg:col-span-1"
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
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start sm:hidden"
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
            >
              <IconAdjustmentsHorizontal aria-hidden="true" />
              {showMore ? "收起条件" : `更多条件${moreActive ? `（${moreActive}）` : ""}`}
            </Button>
            <div className={cn("contents", !showMore && "max-sm:hidden")}>
              <Field label="起始期间" help="含当期，如 2024-01 或 2024">
                <Input
                  value={draft.period_from}
                  placeholder="如 2024-01"
                  onChange={(e) => setDraft((d) => ({ ...d, period_from: e.target.value }))}
                />
              </Field>
              <Field label="截止期间" help="含当期；填 2024 含 2024 年各月">
                <Input
                  value={draft.period_to}
                  placeholder="如 2024-12"
                  onChange={(e) => setDraft((d) => ({ ...d, period_to: e.target.value }))}
                />
              </Field>
              <FilterSelect
                label="地域"
                allLabel="全部地域"
                value={draft.geo}
                onChange={(v) => setDraft((d) => ({ ...d, geo: v }))}
                options={geoOptions}
              />
              <FilterSelect
                className="lg:col-span-2"
                label="导入批次"
                allLabel="全部批次"
                value={draft.batch_id}
                onChange={(v) => setDraft((d) => ({ ...d, batch_id: v }))}
                options={batchOptions}
              />
            </div>
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
                        ·{" "}
                        <TextLink inline to={`/admin/indicators/${applied.indicator_id}`}>
                          {applied.indicator_id} {names.get(applied.indicator_id) ?? ""}
                        </TextLink>
                      </span>
                    )}
                    {keywordQ && (
                      <span className="text-ink-muted">
                        {" "}
                        · 关键词「<span className="font-semibold text-ink">{keywordQ}</span>」
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
                  description="请尝试放宽统计期间、切换地域或清除条件后重试。"
                  action={
                    <Button variant="secondary" onClick={clear}>
                      清除条件
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="还没有观测值"
                  description="前往「新建导入」上传标准 CSV 数据后，可在此按指标与事务批次核查。"
                  action={
                    <Button asChild>
                      <Link to="/admin/import">
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
                data={items}
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
    </div>
  );
}

function columns(names: Map<string, string>, filterBatch: (id: string) => void): DataTableColumn<Observation>[] {
  return [
    {
      key: "indicator_id",
      title: "工程指标",
      primary: true,
      cell: (r) => (
        <span className="grid">
          <TextLink to={`/admin/indicators/${r.indicator_id}`} className="code">
            {r.indicator_id}
          </TextLink>
          <span className="caption text-ink-muted">{names.get(r.indicator_id) ?? ""}</span>
        </span>
      ),
    },
    { key: "period", title: "期间", type: "code" },
    { key: "geo", title: "地域", value: (r) => geoLabel(r.geo) },
    { key: "dims", title: "切片维度", value: (r) => formatDims(r.dims) },
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
      title: "事务批次",
      type: "code",
      cell: (r) =>
        r.batch_id ? (
          <button
            type="button"
            className="cursor-pointer text-link underline-offset-4 hover:underline focus-ring"
            onClick={() => filterBatch(r.batch_id!)}
            title="只看该批次观测值"
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
