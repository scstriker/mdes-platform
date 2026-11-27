import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useQueryState } from "nuqs";
import {
  toStatisticListItem,
  V2_SEED_STATISTICS,
  type CatalogRecord,
  type StatisticListItem,
} from "@mdes/shared";
import {
  IconArrowRight,
  IconExternalLink,
  IconFilterOff,
  IconSearch,
} from "@tabler/icons-react";
import {
  Breadcrumbs,
  EmptyState,
  Field,
  formatNumber,
  Notice,
  Tag,
  TextLink,
} from "@/components/itei";
import { FilterSelect, type FilterOption } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogList, useStatisticsList } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: FilterOption[] = [
  { value: "监管年报", label: "官方监管统计年报" },
  { value: "上市公司财报", label: "上市公司经审计年报" },
];

const AGENCY_OPTIONS: FilterOption[] = [
  { value: "国家药品监督管理局", label: "国家药品监督管理局（NMPA）" },
  { value: "联影医疗", label: "上海联影医疗（688271.SH）" },
];

const PERIOD_OPTIONS: FilterOption[] = [
  { value: "2026-04", label: "2026-04" },
  { value: "2026-02", label: "2026-02" },
];

const FALLBACK_STAT_MAP = new Map<string, StatisticListItem>(
  V2_SEED_STATISTICS.map((s) => [s.statistic_id, toStatisticListItem(s)]),
);

export default function SourcesQueryPage() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [category, setCategory] = useQueryState("category", { defaultValue: "", shallow: false });
  const [agency, setAgency] = useQueryState("agency", { defaultValue: "", shallow: false });
  const [period, setPeriod] = useQueryState("period", { defaultValue: "", shallow: false });
  const [focusedId, setFocusedId] = useQueryState("id", { defaultValue: "", shallow: false });

  const catalogQuery = useCatalogList({
    kind: "source",
    q: q.trim() || undefined,
    category: category || undefined,
    period: period || undefined,
    limit: 100,
  });

  const statsListQuery = useStatisticsList({ limit: 100 });

  const statById = useMemo(() => {
    const map = new Map<string, StatisticListItem>(FALLBACK_STAT_MAP);
    for (const item of statsListQuery.data?.items ?? []) {
      map.set(item.statistic_id, item);
    }
    return map;
  }, [statsListQuery.data]);

  const filteredItems = useMemo(() => {
    const raw = catalogQuery.data?.items ?? [];
    const byAgency = agency
      ? raw.filter((r) => {
          const text = `${r.title} ${r.subtitle} ${r.source_title} ${r.summary_fields.map((f) => f.value).join(" ")}`;
          return text.includes(agency);
        })
      : raw;

    if (!focusedId) return byAgency;
    const idx = byAgency.findIndex((r) => r.id === focusedId || r.slug === focusedId || r.code === focusedId);
    if (idx <= 0) return byAgency;
    const ordered = [...byAgency];
    const [target] = ordered.splice(idx, 1);
    ordered.unshift(target!);
    return ordered;
  }, [catalogQuery.data, agency, focusedId]);

  const focusedRecord = useMemo(
    () =>
      focusedId
        ? filteredItems.find((r) => r.id === focusedId || r.slug === focusedId || r.code === focusedId) ?? null
        : null,
    [filteredItems, focusedId],
  );

  useEffect(() => {
    if (!focusedRecord || typeof document === "undefined") return;
    const el = document.getElementById(`source-entry-${focusedRecord.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedRecord]);

  const hasFilters = Boolean(q.trim() || category || agency || period || focusedId);

  function resetFilters() {
    void setQ(null);
    void setCategory(null);
    void setAgency(null);
    void setPeriod(null);
    void setFocusedId(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/sources" },
            { label: "官方来源" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · V3 指标 28 / 29 / 30 / 32</p>
              <h1 className="title-page text-brand-navy">官方统计年报与权威文献来源库</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 body-sm">
              <TextLink to="/statistics">查看全部标准统计成果 →</TextLink>
              <TextLink to="/system/28">指标 28 年报对账规范 →</TextLink>
            </div>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            统一归档国家药监局、工信部、国家医保局、海关总署及重点上市企业发布的权威年度公报与定期财报，建立「原始文献页码 ↔ 平台标准统计成果」双向可核验引文索引。
          </p>
        </header>
      </div>

      {/* 定位提示横幅（当通过 ?id=rep-ann-28 等直达时呈现） */}
      {focusedRecord && (
        <Notice
          tone="info"
          title={`已定位官方来源文献：${focusedRecord.title}（${focusedRecord.id}）`}
          action={
            <Button variant="secondary" size="sm" onClick={() => void setFocusedId(null)}>
              取消单独高亮
            </Button>
          }
        >
          下方已置顶展示该权威文献的原始发布信息及全部引用本来源的标准统计成果（共{" "}
          {Array.isArray(focusedRecord.detail?.cited_statistics) ? focusedRecord.detail.cited_statistics.length : 0}{" "}
          项）。
        </Notice>
      )}

      {/* 筛选工具栏 */}
      <section aria-label="官方来源筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="来源标题 / 文献编码检索" className="md:col-span-5">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="输入报告名称、机构或编码（如 rep-ann-28）…"
                className="pl-9"
              />
            </div>
          </Field>

          <FilterSelect
            label="文献类别"
            value={category}
            onChange={(val) => void setCategory(val || null)}
            options={CATEGORY_OPTIONS}
            allLabel="全部类别"
            className="md:col-span-3"
          />

          <FilterSelect
            label="发布机构 / 披露主体"
            value={agency}
            onChange={(val) => void setAgency(val || null)}
            options={AGENCY_OPTIONS}
            allLabel="全部机构"
            className="md:col-span-2"
          />

          <FilterSelect
            label="发布期次"
            value={period}
            onChange={(val) => void setPeriod(val || null)}
            options={PERIOD_OPTIONS}
            allLabel="全部期次"
            className="md:col-span-2"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 caption text-ink-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>高频核验年报：</span>
            <button
              type="button"
              onClick={() => void setFocusedId("rep-ann-28")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              2025 年度医疗器械注册工作报告 (rep-ann-28)
            </button>
            <button
              type="button"
              onClick={() => void setFocusedId("src-uih-ar-2025")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              联影医疗 2025 年年度报告（第 87 页）
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>
              共收录 <strong className="font-semibold tabular-nums text-ink">{formatNumber(filteredItems.length)}</strong> 份权威文献
            </span>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <IconFilterOff size={15} aria-hidden="true" />
                重置条件
              </Button>
            )}
          </div>
        </div>
      </section>

      {catalogQuery.isError ? (
        <QueryError error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : catalogQuery.isPending && filteredItems.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="未找到匹配的官方来源文献"
          description="请尝试放宽发布机构、类别或期次筛选条件。"
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                查看全部官方来源
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filteredItems.map((src) => (
            <SourceRecordRow
              key={src.id}
              record={src}
              highlighted={focusedRecord?.id === src.id}
              statById={statById}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceRecordRow({
  record,
  highlighted,
  statById,
}: {
  record: CatalogRecord;
  highlighted: boolean;
  statById: ReadonlyMap<string, StatisticListItem>;
}) {
  const detail = record.detail ?? {};
  const citedIds = Array.isArray(detail.cited_statistics) ? (detail.cited_statistics as string[]) : [];
  const citedStats = citedIds
    .map((id) => statById.get(id))
    .filter((s): s is StatisticListItem => Boolean(s));

  return (
    <li
      id={`source-entry-${record.id}`}
      data-testid={`source-row-${record.id}`}
      className={cn(
        "grid gap-4 py-5 transition-colors",
        highlighted && "border-l-4 border-l-brand-navy bg-info-bg/40 px-4",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code font-semibold text-brand-navy">{record.code ?? record.id}</span>
            <Tag size="sm" tone="neutral">
              标识 {record.id}
            </Tag>
            {record.category && (
              <Tag size="sm" tone="info">
                {record.category}
              </Tag>
            )}
            {record.period && <span className="caption text-ink-muted">发布期：{record.period}</span>}
            {record.source_page && (
              <Tag size="sm" tone="success">
                关键定位：{record.source_page}
              </Tag>
            )}
          </div>
          <h2 className="title-sub text-brand-navy">{record.title}</h2>
          <p className="body-sm text-ink-muted">{record.subtitle}</p>
        </div>

        {record.source_url && (
          <a
            href={record.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 border border-border bg-surface px-3 py-1.5 caption font-semibold text-link hover:border-brand-navy hover:bg-info-bg focus-ring"
          >
            打开原始公报 / 年报出处
            <IconExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {record.summary_fields.map((f) => (
          <div key={f.label} className="grid gap-0.5">
            <dt className="caption text-ink-muted">{f.label}</dt>
            <dd className="body-sm text-ink">
              {f.href ? (
                <TextLink to={f.href} className="font-semibold">
                  {f.value}
                </TextLink>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {citedStats.length > 0 && (
        <div className="grid gap-2.5 border border-border bg-surface p-3.5">
          <p className="caption font-semibold text-brand-navy">
            引用本权威来源的标准统计成果（共 {citedStats.length} 项）
          </p>
          <ul className="divide-y divide-border">
            {citedStats.map((st) => {
              const kpiText = st.summary_kpi.headline_value.endsWith("%")
                ? st.summary_kpi.headline_value
                : `${st.summary_kpi.headline_value} ${st.summary_kpi.unit}`;
              return (
                <li key={st.statistic_id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="code text-brand-navy">{st.statistic_id}</span>
                    <Link
                      to={`/statistics/${encodeURIComponent(st.statistic_id)}`}
                      className="body-sm font-semibold text-brand-navy hover:underline focus-ring"
                    >
                      {st.title}
                    </Link>
                    <Tag size="sm">v{st.version}</Tag>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="caption font-semibold tabular-nums text-ink-muted">
                      {st.summary_kpi.period} · {kpiText}
                    </span>
                    <IconArrowRight size={14} className="text-ink-muted" aria-hidden="true" />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
