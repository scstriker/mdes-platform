import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQueryState } from "nuqs";
import {
  formatStatisticCitation,
  V2_SEED_STATISTICS,
  type StatisticListItem,
} from "@mdes/shared";
import {
  IconArrowRight,
  IconCheck,
  IconFilterOff,
  IconQuote,
  IconSearch,
} from "@tabler/icons-react";
import {
  Breadcrumbs,
  EmptyState,
  Field,
  formatNumber,
  Sparkline,
  Tag,
  TextLink,
} from "@/components/itei";
import { FilterSelect, type FilterOption } from "@/components/layout/filter-select";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_INDICATORS } from "@/content/system-v3";
import { useStatisticsList } from "@/lib/api";

const TOPIC_OPTIONS: FilterOption[] = [
  { value: "overview", label: "产业总览" },
  { value: "markets", label: "市场与招采" },
  { value: "products", label: "产品与型号" },
  { value: "enterprises", label: "企业经营与研发" },
  { value: "regulation", label: "审评注册准入" },
  { value: "trade", label: "海关进出口贸易" },
  { value: "policies", label: "产业政策与指导原则" },
  { value: "innovation", label: "技术创新与对标" },
];

const TOPIC_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TOPIC_OPTIONS.map((o) => [o.value, o.label]),
);

const V3_SEQ_OPTIONS: FilterOption[] = SYSTEM_INDICATORS.map((ind) => ({
  value: ind.seq,
  label: `${ind.seq} ${ind.name}`,
}));

const SEED_BY_ID = new Map(V2_SEED_STATISTICS.map((s) => [s.statistic_id, s]));

async function copyClipboardText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document !== "undefined") {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function buildListItemGbtCitation(item: StatisticListItem): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://mdes-web.pages.dev";
  const matched = SEED_BY_ID.get(item.statistic_id);
  if (matched && matched.version === item.version) {
    return formatStatisticCitation(matched, "gbt7714", origin);
  }
  const pubDate = item.published_at.slice(0, 10);
  const canonicalUrl = `${origin.replace(/\/$/, "")}/statistics/${encodeURIComponent(item.statistic_id)}?v=${encodeURIComponent(item.version)}`;
  return `机械工业仪器仪表综合技术经济研究所（ITEI）. ${item.title} [DB/OL]. 医疗器械产业数据平台（MDES）, 版本 ${item.version}, ${pubDate} [${pubDate}]. ${canonicalUrl}.`;
}

export default function StatisticsLibraryPage() {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [topic, setTopic] = useQueryState("topic", { defaultValue: "", shallow: false });
  const [v3Seq, setV3Seq] = useQueryState("v3_seq", { defaultValue: "", shallow: false });
  const [forecast, setForecast] = useQueryState("forecast", { defaultValue: "", shallow: false });
  const [hasBreak, setHasBreak] = useQueryState("break", { defaultValue: "", shallow: false });
  const [entity, setEntity] = useQueryState("entity", { defaultValue: "", shallow: false });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      q: q.trim() || undefined,
      topic: topic || undefined,
      v3_seq: v3Seq || undefined,
      entity: entity || undefined,
      has_forecast: forecast === "1" ? true : undefined,
      has_break: hasBreak === "1" ? true : undefined,
      limit: 100,
    }),
    [q, topic, v3Seq, entity, forecast, hasBreak],
  );

  const listQuery = useStatisticsList(queryParams);
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? items.length;

  const hasActiveFilters = Boolean(q.trim() || topic || v3Seq || forecast || hasBreak || entity);

  function resetAllFilters() {
    void setQ(null);
    void setTopic(null);
    void setV3Seq(null);
    void setForecast(null);
    void setHasBreak(null);
    void setEntity(null);
  }

  async function handleQuickCopyCitation(item: StatisticListItem) {
    const text = buildListItemGbtCitation(item);
    await copyClipboardText(text);
    setCopiedId(item.statistic_id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === item.statistic_id ? null : prev));
    }, 2200);
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-3">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "资料查询", href: "/statistics" },
            { label: "统计成果库" },
          ]}
        />

        <header className="grid gap-2 border-b-2 border-brand-navy pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="grid gap-1">
              <p className="label text-brand-navy">资料查询 · 一等公民标准统计对象</p>
              <h1 className="title-page text-brand-navy">标准统计成果库</h1>
            </div>
            <p className="body-sm text-ink-muted">
              当前共收录{" "}
              <strong className="font-semibold tabular-nums text-ink">{formatNumber(total)}</strong>{" "}
              项带版本锁定、完整口径红线与原始页码出处的独立统计成果
            </p>
          </div>
          <p className="max-w-4xl body text-ink-muted">
            每项统计成果均具备唯一编号、不可变发布版本号、计算分母说明、禁止推断红线及原始公报/年报页码定位，支持一键导出出版级矢量图、4-Sheet Excel 底稿与原生可编辑 PPT。
          </p>
        </header>
      </div>

      {/* 筛选工具栏 */}
      <section aria-label="统计成果筛选条件" className="grid gap-4 border border-border bg-surface-sunken p-4">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="关键词检索" className="md:col-span-5">
            <div className="relative flex items-center">
              <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-muted" />
              <Input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value || null)}
                placeholder="检索统计标题、核心读数、编码或来源机构…"
                className="pl-9"
              />
            </div>
          </Field>

          <FilterSelect
            label="所属研究主题"
            value={topic}
            onChange={(val) => void setTopic(val || null)}
            options={TOPIC_OPTIONS}
            allLabel="全部主题"
            className="md:col-span-3"
          />

          <FilterSelect
            label="关联 V3 指标序号"
            value={v3Seq}
            onChange={(val) => void setV3Seq(val || null)}
            options={V3_SEQ_OPTIONS}
            allLabel="全部 V3 指标"
            className="md:col-span-4"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-5">
            <label className="inline-flex cursor-pointer items-center gap-2 body-sm text-ink">
              <Checkbox
                checked={forecast === "1"}
                onCheckedChange={(checked) => void setForecast(checked === true ? "1" : null)}
              />
              <span>仅看含预测/估算序列（F/E）</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 body-sm text-ink">
              <Checkbox
                checked={hasBreak === "1"}
                onCheckedChange={(checked) => void setHasBreak(checked === true ? "1" : null)}
              />
              <span>仅看含统计口径断点说明</span>
            </label>
            {entity && (
              <Tag size="sm" tone="info">
                关联实体：{entity}
              </Tag>
            )}
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetAllFilters}>
              <IconFilterOff size={15} aria-hidden="true" />
              重置筛选条件
            </Button>
          )}
        </div>
      </section>

      {/* 结果列表（严格去卡片化，采用部委智库台账分隔流） */}
      {listQuery.isError ? (
        <QueryError error={listQuery.error} onRetry={() => void listQuery.refetch()} />
      ) : listQuery.isPending && items.length === 0 ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="未找到符合筛选条件的标准统计成果"
          description="请尝试放宽主题、V3 指标序号或关键词条件，查看全量已发布统计成果。"
          action={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={resetAllFilters}>
                清空全部筛选
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((item) => {
            const kpiValueText = item.summary_kpi.headline_value.endsWith("%")
              ? item.summary_kpi.headline_value
              : `${item.summary_kpi.headline_value} ${item.summary_kpi.unit}`;
            const isCopied = copiedId === item.statistic_id;

            return (
              <li
                key={item.statistic_id}
                data-testid={`stat-row-${item.statistic_id}`}
                className="grid gap-4 py-5 transition-colors hover:bg-surface-sunken/50 md:grid-cols-12 md:px-3"
              >
                <div className="grid content-start gap-2 md:col-span-8 lg:col-span-9">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="code font-semibold text-brand-navy">{item.statistic_id}</span>
                    <Tag size="sm" tone="neutral">
                      版本 v{item.version}
                    </Tag>
                    {item.v3_seqs.map((seq) => (
                      <Link
                        key={seq}
                        to={`/system/${seq}`}
                        className="border border-border bg-surface px-2 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
                      >
                        V3-{seq}
                      </Link>
                    ))}
                    {item.topic_tags.map((t) => (
                      <Tag key={t} size="sm" tone="info">
                        {TOPIC_LABEL_MAP[t] ?? t}
                      </Tag>
                    ))}
                    {item.has_forecast && (
                      <Tag size="sm" tone="info">
                        含预测/估算
                      </Tag>
                    )}
                    {item.has_methodology_break && (
                      <Tag size="sm" tone="warning">
                        含口径断点
                      </Tag>
                    )}
                  </div>

                  <h2 className="title-sub text-brand-navy">
                    <Link
                      to={`/statistics/${encodeURIComponent(item.statistic_id)}`}
                      className="hover:underline focus-ring"
                    >
                      {item.title}
                    </Link>
                  </h2>

                  <p className="body-sm text-ink-muted">{item.subtitle}</p>
                  <p className="body-sm text-ink">{item.insight}</p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 caption text-ink-muted">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>权威来源：{item.source_org}</span>
                      <span aria-hidden="true">·</span>
                      <span>发布日期：{item.published_at.slice(0, 10)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleQuickCopyCitation(item)}
                        className="inline-flex cursor-pointer items-center gap-1 border border-border bg-surface px-2.5 py-1 caption font-semibold text-ink hover:border-brand-navy hover:bg-info-bg hover:text-brand-navy focus-ring"
                      >
                        {isCopied ? (
                          <>
                            <IconCheck size={14} aria-hidden="true" />
                            已复制 GB/T 7714 引用
                          </>
                        ) : (
                          <>
                            <IconQuote size={14} aria-hidden="true" />
                            复制引用 (GB/T 7714)
                          </>
                        )}
                      </button>

                      <TextLink
                        to={`/statistics/${encodeURIComponent(item.statistic_id)}`}
                        className="inline-flex items-center gap-1 caption font-semibold"
                      >
                        打开统计工作台
                        <IconArrowRight size={14} aria-hidden="true" />
                      </TextLink>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-2 border-t border-border pt-3 md:col-span-4 md:border-t-0 md:border-l md:pt-0 md:pl-4 lg:col-span-3">
                  <div className="grid gap-1">
                    <span className="caption text-ink-muted">{item.summary_kpi.period}</span>
                    <span className="numeral-sm tabular-nums text-brand-navy">{kpiValueText}</span>
                    {item.summary_kpi.delta_label && (
                      <span className="caption font-semibold text-ink-muted">{item.summary_kpi.delta_label}</span>
                    )}
                  </div>
                  {item.summary_kpi.sparkline && item.summary_kpi.sparkline.length >= 2 && (
                    <div className="pt-1">
                      <Sparkline values={item.summary_kpi.sparkline} label={`${item.title}趋势微图`} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
