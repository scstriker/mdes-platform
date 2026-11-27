import { useMemo } from "react";
import { useQueryState } from "nuqs";
import {
  detectCatalogAliasCorrection,
  V2_SEED_CATALOG_RECORDS,
  type CatalogRecord,
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
import { useCatalogList } from "@/lib/api";

const NATURE_OPTIONS: FilterOption[] = [
  { value: "强制性行业标准", label: "强制性行业标准（YY）" },
  { value: "强制性国家标准", label: "强制性国家标准（GB）" },
];

const SEED_STANDARDS = V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "standard");

type ReferencedByItem = { label: string; href: string };

export default function StandardsQueryPage() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [subkind, setSubkind] = useQueryState("subkind", { defaultValue: "", shallow: false });

  const catalogQuery = useCatalogList({
    kind: "standard",
    q: q.trim() || undefined,
    subkind: subkind || undefined,
    limit: 100,
  });

  const aliasCorrection = useMemo(
    () => catalogQuery.data?.alias_correction ?? detectCatalogAliasCorrection(q, SEED_STANDARDS),
    [catalogQuery.data?.alias_correction, q],
  );

  const items = useMemo(() => catalogQuery.data?.items ?? [], [catalogQuery.data]);
  const hasFilters = Boolean(q.trim() || subkind);

  function resetFilters() {
    void setQ(null);
    void setSubkind(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/standards" },
            { label: "技术标准" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · V3 指标 37</p>
              <h1 className="title-page text-brand-navy">医疗器械国家标准与行业标准核验库</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 body-sm">
              <TextLink to="/institutions?subkind=检验检测">查看关联检验检测机构 →</TextLink>
              <TextLink to="/system/37">指标 37 口径规范 →</TextLink>
            </div>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            以标准编号为第一检索入口，严格核对国家标准（GB / GB/T）与医药行业标准（YY / YY/T）属性、实施日期、新旧替代链及全国标准信息公共服务平台备案记录，自动拦截并纠偏常见误写或已废止标准号。
          </p>
        </header>
      </div>

      {/* 编号优先检索栏 */}
      <section aria-label="技术标准筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="标准编号（支持旧版废止号/常见误写号自动纠偏）或器械关键词" className="md:col-span-8">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="输入标准号（如 YY 9706.233-2021、GB 9706.1-2020）或 磁共振 标准…"
                className="pl-9"
              />
            </div>
          </Field>

          <FilterSelect
            label="标准层级与强制属性"
            value={subkind}
            onChange={(val) => void setSubkind(val || null)}
            options={NATURE_OPTIONS}
            allLabel="全部标准层级"
            className="md:col-span-4"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 caption text-ink-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>常用标准核验示范：</span>
            <button
              type="button"
              onClick={() => void setQ("YY 9706.233-2021")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 code font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              YY 9706.233-2021
            </button>
            <button
              type="button"
              onClick={() => void setQ("GB 9706.1-2020")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 code font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              GB 9706.1-2020
            </button>
            <button
              type="button"
              onClick={() => void setQ("GB 9706.233-2020")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-ink hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              误写纠偏测试：GB 9706.233-2020
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>
              当前匹配 <strong className="font-semibold tabular-nums text-ink">{formatNumber(items.length)}</strong> 项标准
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

      {/* 历史废止/误写标准号纠偏横幅 */}
      {aliasCorrection && (
        <Notice
          tone="warning"
          title={`标准编号纠偏提示：您输入的「${aliasCorrection.queried}」现行规范编号为 ${aliasCorrection.canonical_code}（强制性行业标准，代替 YY 0319-2008）`}
          action={
            <Button variant="secondary" size="sm" onClick={() => void setQ(aliasCorrection.canonical_code)}>
              切换为规范编号 {aliasCorrection.canonical_code}
            </Button>
          }
        >
          {aliasCorrection.explanation}
        </Notice>
      )}

      {catalogQuery.isError ? (
        <QueryError error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : catalogQuery.isPending && items.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="未检索到匹配的技术标准条目"
          description="请核对标准编号中的点号与年代号，或输入器械品类关键词（如 磁共振、医用电气设备）。"
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                显示全部现行标准
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((std) => (
            <StandardRecordRow key={std.id} record={std} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StandardRecordRow({ record }: { record: CatalogRecord }) {
  const detail = record.detail ?? {};
  const nature = typeof detail.standard_nature === "string" ? detail.standard_nature : record.subkind ?? "技术标准";
  const status = typeof detail.status === "string" ? detail.status : "现行";
  const replaces = typeof detail.replaces === "string" ? detail.replaces : null;
  const effectiveDate = typeof detail.effective_date === "string" ? detail.effective_date : record.period ?? null;
  const referencedBy = Array.isArray(detail.referenced_by) ? (detail.referenced_by as ReferencedByItem[]) : [];

  return (
    <li data-testid={`std-row-${record.id}`} className="grid gap-3.5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {record.code && (
              <span className="bg-brand-navy px-2.5 py-0.5 code font-semibold text-on-brand">{record.code}</span>
            )}
            <Tag size="sm" tone="info">
              {nature}
            </Tag>
            <Tag size="sm" tone="success">
              {status}
            </Tag>
            {replaces && (
              <Tag size="sm" tone="neutral">
                代替 {replaces}
              </Tag>
            )}
            {effectiveDate && <span className="caption text-ink-muted">实施日期：{effectiveDate}</span>}
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
            全国标准信息公共服务平台备案
            <IconExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
        {record.summary_fields.map((f) => (
          <div key={f.label} className="grid gap-0.5">
            <dt className="caption text-ink-muted">{f.label}</dt>
            <dd className="body-sm text-ink">
              {f.href ? (
                f.href.startsWith("http") ? (
                  <a
                    href={f.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                  >
                    {f.value}
                    <IconExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : (
                  <TextLink to={f.href} className="font-semibold">
                    {f.value}
                  </TextLink>
                )
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {referencedBy.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-l-2 border-brand-navy bg-surface-sunken px-3.5 py-2.5 body-sm">
          <span className="caption font-semibold text-brand-navy">平台内关联引用实体（反向索引）：</span>
          {referencedBy.map((ref) => (
            <TextLink
              key={ref.href}
              to={ref.href}
              className="inline-flex items-center gap-1 border border-border bg-surface px-2.5 py-0.5 caption font-semibold"
            >
              {ref.label}
              <IconArrowRight size={12} aria-hidden="true" />
            </TextLink>
          ))}
        </div>
      )}
    </li>
  );
}
