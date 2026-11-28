import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import type { CatalogRecord } from "@mdes/shared";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconFilterOff,
  IconSearch,
} from "@tabler/icons-react";
import {
  Breadcrumbs,
  EmptyState,
  Field,
  formatNumber,
  Tag,
  TextLink,
} from "@/components/itei";
import { FilterSelect, type FilterOption } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogList } from "@/lib/api";

const REGION_OPTIONS: FilterOption[] = [
  { value: "全国", label: "国家级（国务院及各部委）" },
  { value: "上海", label: "上海" },
  { value: "北京", label: "北京" },
  { value: "广东", label: "广东" },
];

const SUBKIND_OPTIONS: FilterOption[] = [
  { value: "国家级行政规范文件", label: "国家级行政规范文件" },
  { value: "揭榜挂帅专项政策", label: "揭榜挂帅专项政策" },
];

type PolicyClauseItem = {
  clause_no: string;
  target: string;
  summary: string;
  batches?: string[];
};

export default function PoliciesQueryPage() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [region, setRegion] = useQueryState("region", { defaultValue: "", shallow: false });
  const [subkind, setSubkind] = useQueryState("subkind", { defaultValue: "", shallow: false });
  const [focusedId, setFocusedId] = useQueryState("id", { defaultValue: "", shallow: false });

  const [manualCollapsed, setManualCollapsed] = useState<Set<string>>(() => new Set());

  const catalogQuery = useCatalogList({
    kind: "policy",
    q: q.trim() || undefined,
    region: region || undefined,
    subkind: subkind || undefined,
    limit: 100,
  });

  const items = useMemo(() => catalogQuery.data?.items ?? [], [catalogQuery.data]);
  const hasFilters = Boolean(q.trim() || region || subkind || focusedId);

  function resetFilters() {
    void setQ(null);
    void setRegion(null);
    void setSubkind(null);
    void setFocusedId(null);
  }

  function toggleRow(id: string) {
    setManualCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/policies" },
            { label: "产业政策" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · V3 指标 23 / 25 / 26 / 27</p>
              <h1 className="title-page text-brand-navy">医疗器械产业政策与专项行动条款库</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 body-sm">
              <TextLink to="/regulation/registrations?subkind=guideline">查看注册审查指导原则 →</TextLink>
              <TextLink to="/reports">查看专题研究报告 →</TextLink>
            </div>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            结构化拆解国务院及工信、卫健、药监等部门发布的医疗装备产业政策文件，逐条列明发文字号、适用机构对象、核心扶持条款与后续落地实施批次。
          </p>
        </header>
      </div>

      {/* 检索与过滤区 */}
      <section aria-label="产业政策筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="发文字号 / 政策标题 / 器械赛道关键词" className="md:col-span-6">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="输入文号（如 国发〔2024〕7号）、设备更新、揭榜挂帅或手术机器人…"
                className="pl-9"
              />
            </div>
          </Field>

          <FilterSelect
            label="发文层级 / 地域"
            value={region}
            onChange={(val) => void setRegion(val || null)}
            options={REGION_OPTIONS}
            allLabel="全部层级"
            className="md:col-span-3"
          />

          <FilterSelect
            label="政策类型"
            value={subkind}
            onChange={(val) => void setSubkind(val || null)}
            options={SUBKIND_OPTIONS}
            allLabel="全部政策类型"
            className="md:col-span-3"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 caption text-ink-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>常用政策检索：</span>
            <button
              type="button"
              onClick={() => void setQ("国发〔2024〕7号")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              国发〔2024〕7号（大规模设备更新）
            </button>
            <button
              type="button"
              onClick={() => void setQ("揭榜挂帅")}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              医疗装备创新任务揭榜挂帅
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>
              共收录 <strong className="font-semibold tabular-nums text-ink">{formatNumber(items.length)}</strong> 份政策文件
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
      ) : catalogQuery.isPending && items.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="未找到符合条件的医疗器械产业政策"
          description="请尝试调整发文字号关键词或清空层级筛选。"
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                查看全部政策
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((pol) => {
            const isExpanded = focusedId === pol.id || focusedId === pol.slug || !manualCollapsed.has(pol.id);
            return (
              <PolicyRow
                key={pol.id}
                record={pol}
                expanded={isExpanded}
                onToggle={() => toggleRow(pol.id)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PolicyRow({
  record,
  expanded,
  onToggle,
}: {
  record: CatalogRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detail = record.detail ?? {};
  const clauses = Array.isArray(detail.clauses) ? (detail.clauses as PolicyClauseItem[]) : [];

  return (
    <li data-testid={`policy-row-${record.id}`} className="grid gap-3.5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {record.code && <span className="code font-semibold text-brand-navy">{record.code}</span>}
            {record.subkind && (
              <Tag size="sm" tone="info">
                {record.subkind}
              </Tag>
            )}
            {record.region && <Tag size="sm">{record.region}</Tag>}
            {record.period && <span className="caption text-ink-muted">发布日期：{record.period}</span>}
          </div>
          <h2 className="title-sub text-brand-navy">{record.title}</h2>
          <p className="body-sm text-ink-muted">{record.subtitle}</p>
        </div>

        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? (
            <>
              收起条款与实施批次
              <IconChevronUp size={15} aria-hidden="true" />
            </>
          ) : (
            <>
              展开条款与实施批次
              <IconChevronDown size={15} aria-hidden="true" />
            </>
          )}
        </Button>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        {record.summary_fields.map((f) => (
          <div key={f.label} className="grid gap-0.5">
            <dt className="caption text-ink-muted">{f.label}</dt>
            <dd className="body-sm font-semibold text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      {expanded && clauses.length > 0 && (
        <div className="grid gap-3 border border-border bg-surface-sunken p-4">
          <p className="label text-brand-navy">结构化医疗装备核心条款与项目实施批次</p>
          <ul className="divide-y divide-border border border-border bg-surface">
            {clauses.map((cl) => (
              <li key={cl.clause_no} className="grid gap-2 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="code font-bold text-brand-navy">{cl.clause_no}</span>
                  <span className="caption font-semibold text-ink-muted">适用对象：{cl.target}</span>
                </div>
                <p className="body-sm text-ink">{cl.summary}</p>
                {cl.batches && cl.batches.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="caption font-semibold text-ink-muted">关联实施批次：</span>
                    {cl.batches.map((batch) => (
                      <Tag key={batch} size="sm" tone="success">
                        {batch}
                      </Tag>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 caption text-ink-muted">
        <span>权威出处：{record.source_title}</span>
        {record.source_url && (
          <a
            href={record.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
          >
            查阅国务院/部委公报原文
            <IconExternalLink size={13} aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}
