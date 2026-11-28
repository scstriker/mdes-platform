import { useMemo } from "react";
import { useQueryState } from "nuqs";
import type { CatalogRecord } from "@mdes/shared";
import {
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
  type TagTone,
} from "@/components/itei";
import { FilterSelect, type FilterOption } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogList } from "@/lib/api";
import { cn } from "@/lib/utils";

const SERVICE_TYPES = [
  { key: "", label: "全部服务类型" },
  { key: "检验检测", label: "检验检测" },
  { key: "临床试验", label: "临床试验" },
  { key: "研发与临床研究", label: "研发与临床研究" },
] as const;

const REGION_OPTIONS: FilterOption[] = [
  { value: "湖北", label: "湖北" },
  { value: "上海", label: "上海" },
  { value: "北京", label: "北京" },
  { value: "广东", label: "广东" },
];

const SPECIALTY_PRESETS = ["医用超声设备", "磁共振", "手术机器人", "医学影像"] as const;

const SERVICE_TONE: Record<string, TagTone> = {
  检验检测: "info",
  临床试验: "success",
  研发与临床研究: "neutral",
};

export default function InstitutionsQueryPage() {
  const [subkind, setSubkind] = useQueryState("subkind", { defaultValue: "", shallow: false });
  const [region, setRegion] = useQueryState("region", { defaultValue: "", shallow: false });
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });

  const catalogQuery = useCatalogList({
    kind: "institution",
    subkind: subkind || undefined,
    region: region || undefined,
    q: q.trim() || undefined,
    limit: 100,
  });

  const items = useMemo(() => catalogQuery.data?.items ?? [], [catalogQuery.data]);
  const hasFilters = Boolean(subkind || region || q.trim());

  function resetFilters() {
    void setSubkind(null);
    void setRegion(null);
    void setQ(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/institutions" },
            { label: "机构名录" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · V3 指标 19 / 20 / 21 / 22</p>
              <h1 className="title-page text-brand-navy">医疗器械检验检测、临床试验与研发机构名录</h1>
            </div>
            <TextLink to="/enterprises" className="body-sm">
              前往医疗器械生产与上市企业库 →
            </TextLink>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            按技术服务职能独立归集医疗器械法定检验检测院所（21 号）、GCP 临床试验备案医院（22 号）及国家级制造业创新中心与临床医学研究平台（19/20 号），与生产经营企业名录严格分库。
          </p>
        </header>
      </div>

      {/* 服务类型页签 */}
      <div
        role="tablist"
        aria-label="服务类型筛选"
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border"
      >
        {SERVICE_TYPES.map((st) => {
          const selected = subkind === st.key;
          return (
            <button
              key={st.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => void setSubkind(st.key || null)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 py-2.5 body-sm transition-colors focus-ring",
                selected
                  ? "border-brand-navy font-semibold text-brand-navy"
                  : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {st.label}
            </button>
          );
        })}
      </div>

      {/* 地区 + 专业领域检索栏 */}
      <section aria-label="机构名录筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <FilterSelect
            label="所在省市（地区）"
            value={region}
            onChange={(val) => void setRegion(val || null)}
            options={REGION_OPTIONS}
            allLabel="全部地区"
            className="md:col-span-4"
          />

          <Field label="专业方向 / 机构名称关键词" className="md:col-span-8">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="输入专业方向（如 医用超声设备、磁共振）或机构名称…"
                className="pl-9"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 caption text-ink-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>常用专业快速筛选：</span>
            {SPECIALTY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => void setQ(q === preset ? null : preset)}
                className={cn(
                  "cursor-pointer border px-2.5 py-0.5 caption font-semibold transition-colors focus-ring",
                  q === preset
                    ? "border-brand-navy bg-brand-navy text-on-brand"
                    : "border-border bg-surface text-brand-navy hover:border-brand-navy hover:bg-info-bg",
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span>
              共匹配 <strong className="font-semibold tabular-nums text-ink">{formatNumber(items.length)}</strong> 家机构
            </span>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <IconFilterOff size={15} aria-hidden="true" />
                重置筛选
              </Button>
            )}
          </div>
        </div>
      </section>

      {catalogQuery.isError ? (
        <QueryError error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : catalogQuery.isPending && items.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="当前筛选组合下暂无匹配的医疗器械技术服务机构"
          description="请尝试放宽地区、服务类型或专业关键词。"
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                清空筛选条件
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((inst) => (
            <InstitutionRow key={inst.id} record={inst} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InstitutionRow({ record }: { record: CatalogRecord }) {
  const detail = record.detail ?? {};
  const city = typeof detail.city === "string" ? detail.city : record.region ?? "—";
  const hostOrg = typeof detail.host_organization === "string" ? detail.host_organization : null;
  const specialties = Array.isArray(detail.specialties) ? (detail.specialties as string[]) : [];
  const capabilityNote = typeof detail.capability_note === "string" ? detail.capability_note : null;
  const officialUrl =
    typeof detail.official_url === "string"
      ? detail.official_url
      : record.source_url ?? null;

  return (
    <li data-testid={`inst-row-${record.id}`} className="grid gap-3 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {record.subkind && (
              <Tag size="sm" tone={SERVICE_TONE[record.subkind] ?? "neutral"}>
                {record.subkind}
              </Tag>
            )}
            <Tag size="sm" tone="neutral">
              {record.region} · {city}
            </Tag>
            {record.code && <span className="code text-ink-muted">{record.code}</span>}
          </div>
          <h2 className="title-sub text-brand-navy">{record.title}</h2>
          <p className="body-sm text-ink-muted">{record.subtitle}</p>
        </div>

        {officialUrl && (
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 border border-border bg-surface px-3 py-1.5 caption font-semibold text-link hover:border-brand-navy hover:bg-info-bg focus-ring"
          >
            主管部门公开资料核验
            <IconExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>

      {specialties.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="caption font-semibold text-ink-muted">覆盖专业方向：</span>
          {specialties.map((sp) => (
            <Tag key={sp} size="sm" tone="info">
              {sp}
            </Tag>
          ))}
        </div>
      )}

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
        {hostOrg && !record.summary_fields.some((f) => f.label.includes("主管") || f.label.includes("依托")) && (
          <div className="grid gap-0.5">
            <dt className="caption text-ink-muted">依托 / 主管部门</dt>
            <dd className="body-sm text-ink">{hostOrg}</dd>
          </div>
        )}
      </dl>

      {capabilityNote && (
        <div role="note" className="border-l-2 border-brand-navy bg-surface-sunken px-3.5 py-2.5 body-sm text-ink">
          <strong className="font-semibold text-brand-navy">职责与检验能力核验说明：</strong>
          {capabilityNote}
        </div>
      )}
    </li>
  );
}
