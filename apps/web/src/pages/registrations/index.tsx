import { useMemo, useState } from "react";
import { Link } from "react-router";
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
  type TagTone,
} from "@/components/itei";
import { FilterSelect, type FilterOption } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogList } from "@/lib/api";
import { cn } from "@/lib/utils";

type SubkindTabKey = "all" | "cert" | "priority" | "guideline";

const SUBKIND_TABS: readonly { key: SubkindTabKey; label: string; desc: string }[] = [
  { key: "all", label: "全部准入与审评记录", desc: "汇总注册证书、创新获批、优先审批决定与审查指导原则" },
  { key: "cert", label: "证书（常规与创新注册证）", desc: "常规第三类注册证（reg）与创新特别审查获批证书（innov）" },
  { key: "priority", label: "优先审批", desc: "临床急需、儿童或罕见病医疗器械优先审批决定事件" },
  { key: "guideline", label: "审查指导原则", desc: "国家药监局器审中心（CMDE）技术审评指导原则" },
];

const REGION_OPTIONS: FilterOption[] = [
  { value: "上海", label: "上海" },
  { value: "北京", label: "北京" },
  { value: "广东", label: "广东" },
  { value: "江苏", label: "江苏" },
  { value: "全国", label: "全国通用（指导原则）" },
];

const SUBKIND_BADGE: Record<string, { label: string; tone: TagTone }> = {
  innov: { label: "创新医疗器械注册证", tone: "info" },
  reg: { label: "常规医疗器械注册证", tone: "success" },
  priority: { label: "优先审批通道", tone: "warning" },
  guideline: { label: "注册审查指导原则", tone: "neutral" },
};

type CoveredModelItem = { slug: string; label: string };
type BasisLinkItem = { label: string; url: string };

export default function RegistrationsQueryPage() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [subkindParam, setSubkindParam] = useQueryState("subkind", { defaultValue: "", shallow: false });
  const [channelParam, setChannelParam] = useQueryState("channel", { defaultValue: "", shallow: false });
  const [region, setRegion] = useQueryState("region", { defaultValue: "", shallow: false });
  const [focusedId, setFocusedId] = useQueryState("id", { defaultValue: "", shallow: false });

  const [manualExpanded, setManualExpanded] = useState<Set<string>>(() => new Set());

  // 兼容旧参数 ?channel=reg|innov|priority 与新参数 ?subkind=cert|priority|guideline
  const activeTab: SubkindTabKey = useMemo(() => {
    const raw = subkindParam || channelParam;
    if (raw === "cert" || raw === "reg" || raw === "innov") return "cert";
    if (raw === "priority") return "priority";
    if (raw === "guideline") return "guideline";
    return "all";
  }, [subkindParam, channelParam]);

  const serverSubkind =
    subkindParam === "priority" || subkindParam === "guideline"
      ? subkindParam
      : channelParam === "priority"
        ? "priority"
        : undefined;

  const catalogQuery = useCatalogList({
    kind: "registration",
    q: q.trim() || undefined,
    region: region || undefined,
    subkind: serverSubkind,
    limit: 100,
  });

  const filteredItems = useMemo(() => {
    const rawItems = catalogQuery.data?.items ?? [];
    return rawItems.filter((item) => {
      if (channelParam === "reg" && item.subkind !== "reg") return false;
      if (channelParam === "innov" && item.subkind !== "innov") return false;
      if (activeTab === "cert") {
        return item.subkind === "reg" || item.subkind === "innov";
      }
      if (activeTab === "priority") {
        return item.subkind === "priority";
      }
      if (activeTab === "guideline") {
        return item.subkind === "guideline";
      }
      return true;
    });
  }, [catalogQuery.data, activeTab, channelParam]);

  const hasFilters = Boolean(q.trim() || subkindParam || channelParam || region || focusedId);

  function selectTab(next: SubkindTabKey) {
    void setChannelParam(null);
    void setSubkindParam(next === "all" ? null : next);
  }

  function resetFilters() {
    void setQ(null);
    void setSubkindParam(null);
    void setChannelParam(null);
    void setRegion(null);
    void setFocusedId(null);
  }

  function toggleRow(id: string) {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const autoExpandAll = filteredItems.length > 0 && (filteredItems.length <= 3 || Boolean(q.trim()));

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/regulation/registrations" },
            { label: "注册与准入" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · V3 指标 01 / 02 / 03 / 24</p>
              <h1 className="title-page text-brand-navy">医疗器械注册与准入核验库</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 body-sm">
              <TextLink to="/statistics/STAT-REG-CLASS3-TREND">查看三类首次注册趋势统计 →</TextLink>
              <TextLink to="/products">前往产品与型号库 →</TextLink>
            </div>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            严格区分「注册证书」、「器审中心受理号」、「优先审批审查事件」与「注册审查指导原则」四类记录实体；单张注册证与所覆盖的具体产品型号保持一对多关联，不混写同一编码列。
          </p>
        </header>
      </div>

      {/* 子类别切换页签 */}
      <div
        role="tablist"
        aria-label="注册与准入记录分类"
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border"
      >
        {SUBKIND_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(tab.key)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 py-2.5 body-sm transition-colors focus-ring",
                selected
                  ? "border-brand-navy font-semibold text-brand-navy"
                  : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 检索与地区筛选栏 */}
      <section aria-label="注册与准入筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="证号 / 产品名 / 注册人 / 器审受理号" className="md:col-span-8">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="输入注册证号（如 国械注准20223061141）、受理号（CQZ2200057）、产品名或注册人…"
                className="pl-9"
              />
            </div>
          </Field>

          <FilterSelect
            label="所属省市 / 适用地域"
            value={region}
            onChange={(val) => void setRegion(val || null)}
            options={REGION_OPTIONS}
            allLabel="全部地区"
            className="md:col-span-4"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 caption text-ink-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>快捷核验样本：</span>
            <button
              type="button"
              onClick={() => {
                void setSubkindParam(null);
                void setChannelParam(null);
                void setQ("国械注准20223061141");
              }}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              国械注准20223061141（联影 5T 磁共振）
            </button>
            <button
              type="button"
              onClick={() => {
                void setSubkindParam("guideline");
                void setChannelParam(null);
                void setQ("磁共振");
              }}
              className="cursor-pointer border border-border bg-surface px-2.5 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              磁共振审查指导原则
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>
              当前匹配 <strong className="font-semibold tabular-nums text-ink">{formatNumber(filteredItems.length)}</strong> 条记录
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

      {/* 结果列表 */}
      {catalogQuery.isError ? (
        <QueryError error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      ) : catalogQuery.isPending && filteredItems.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="未找到匹配的注册证、审批决定或审查指导原则"
          description="请核对注册证编号、器审受理号或切换上方记录类别页签。"
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                显示全部记录
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filteredItems.map((rec) => (
            <RegistrationRecordRow
              key={rec.id}
              record={rec}
              expanded={autoExpandAll || focusedId === rec.id || focusedId === rec.slug || manualExpanded.has(rec.id)}
              onToggle={() => toggleRow(rec.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RegistrationRecordRow({
  record,
  expanded,
  onToggle,
}: {
  record: CatalogRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge = SUBKIND_BADGE[record.subkind ?? ""] ?? { label: record.subkind ?? "准入记录", tone: "neutral" as const };
  const detail = record.detail ?? {};
  const registrant = typeof detail.registrant === "string" ? detail.registrant : null;
  const registrantSlug = typeof detail.registrant_slug === "string" ? detail.registrant_slug : null;
  const acceptanceNo = typeof detail.acceptance_no === "string" ? detail.acceptance_no : null;
  const reviewReportPage = typeof detail.review_report_page === "string" ? detail.review_report_page : "第 4 页";
  const reviewReportUrl = typeof detail.review_report_url === "string" ? detail.review_report_url : null;
  const statusText = typeof detail.status === "string" ? detail.status : "现行有效";
  const coveredModels = Array.isArray(detail.covered_models) ? (detail.covered_models as CoveredModelItem[]) : [];
  const basisLinks = Array.isArray(detail.basis_links) ? (detail.basis_links as BasisLinkItem[]) : [];

  return (
    <li data-testid={`reg-row-${record.id}`} className="py-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {record.code && <span className="code font-semibold text-brand-navy">{record.code}</span>}
              <Tag size="sm" tone={badge.tone}>
                {badge.label}
              </Tag>
              <Tag size="sm" tone="success">
                {statusText}
              </Tag>
              {record.region && <span className="caption text-ink-muted">地域：{record.region}</span>}
              {record.period && <span className="caption text-ink-muted">批准/发布期：{record.period}</span>}
            </div>

            <h2 className="title-sub text-brand-navy">{record.title}</h2>
            <p className="body-sm text-ink-muted">{record.subtitle}</p>
          </div>

          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? (
              <>
                收起核验档案
                <IconChevronUp size={15} aria-hidden="true" />
              </>
            ) : (
              <>
                展开核验档案
                <IconChevronDown size={15} aria-hidden="true" />
              </>
            )}
          </Button>
        </div>

        {/* 核心关键字段行：注册人、独立器审受理号与覆盖型号清单 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-l-2 border-brand-navy bg-surface-sunken px-3.5 py-2.5 body-sm">
          {registrant && (
            <span>
              <span className="text-ink-muted">注册人：</span>
              {registrantSlug ? (
                <TextLink to={`/enterprises/${encodeURIComponent(registrantSlug)}`} className="font-semibold">
                  {registrant}
                </TextLink>
              ) : (
                <strong className="font-semibold text-ink">{registrant}</strong>
              )}
            </span>
          )}

          {acceptanceNo && (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                <span className="text-ink-muted">器审受理号：</span>
                <strong className="code font-semibold text-brand-navy">{acceptanceNo}</strong>
              </span>
              {reviewReportUrl && (
                <a
                  href={reviewReportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
                >
                  审评报告{reviewReportPage}
                  <IconExternalLink size={13} aria-hidden="true" />
                </a>
              )}
            </span>
          )}

          {coveredModels.length > 0 && (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-ink-muted">覆盖型号（{coveredModels.length} 项）：</span>
              {coveredModels.map((mdl, idx) => (
                <span key={mdl.slug} className="inline-flex items-center gap-1">
                  <Link
                    to={`/products/${encodeURIComponent(mdl.slug)}`}
                    className="font-semibold text-link hover:underline focus-ring"
                  >
                    {mdl.label}
                  </Link>
                  {idx < coveredModels.length - 1 && <span className="text-ink-muted">、</span>}
                </span>
              ))}
            </span>
          )}
        </div>

        {expanded && (
          <div className="grid gap-4 border border-border bg-surface p-4">
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
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

            {basisLinks.length > 0 && (
              <div className="grid gap-2 border-t border-border pt-3">
                <p className="caption font-semibold text-brand-navy">交叉核验原始公文与审评报告出处</p>
                <ul className="grid gap-1.5">
                  {basisLinks.map((b) => (
                    <li key={b.url} className="body-sm">
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-link hover:underline focus-ring"
                      >
                        {b.label}
                        <IconExternalLink size={13} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 caption text-ink-muted">
              <span>
                权威来源：{record.source_title}
                {record.source_page ? `（${record.source_page}）` : ""}
              </span>
              {record.source_url && (
                <a
                  href={record.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                >
                  查阅官方发布原件
                  <IconExternalLink size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
