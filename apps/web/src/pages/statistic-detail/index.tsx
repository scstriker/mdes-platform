import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryState } from "nuqs";
import {
  buildCopyForAiMarkdown,
  formatStatisticCitation,
  projectStatisticView,
  type ChartTypeId,
  type CitationStyle,
  type MethodologyBreak,
  type MetricModeKey,
  type StatisticViewState,
} from "@mdes/shared";
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileCode,
  IconFileSpreadsheet,
  IconLink,
  IconPhoto,
  IconPresentation,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import {
  Breadcrumbs,
  Descriptions,
  EmptyState,
  Notice,
  Tag,
  TextLink,
  type DescriptionItem,
} from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_INDICATORS } from "@/content/system-v3";
import { ApiError, useStatisticDetail, useStatisticVersions } from "@/lib/api";
import {
  exportFigurePng,
  exportStatisticFigureSvg,
} from "@/lib/charts/exporters/export-svg-png";
import { downloadText, toCsv } from "@/lib/download";
import { cn } from "@/lib/utils";

const VALID_CHART_TYPES = new Set<ChartTypeId>([
  "line",
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "stacked_bar_100",
  "grouped_bar",
  "area",
  "pie",
  "scatter",
]);

const VALID_METRIC_MODES = new Set<MetricModeKey>(["absolute", "yoy_growth", "share_pct"]);
const VALID_SORTS = new Set<"none" | "desc" | "asc">(["none", "desc", "asc"]);

const COMPARABILITY_LABEL: Record<MethodologyBreak["comparability"], { label: string; tone: "danger" | "warning" | "info" }> = {
  non_comparable: { label: "跨断点不可直接可比", tone: "danger" },
  adjusted: { label: "分类/口径动态微调", tone: "warning" },
  expanded_scope: { label: "统计覆盖范围扩容", tone: "info" },
};

const CITATION_TABS: readonly { key: CitationStyle; label: string }[] = [
  { key: "gbt7714", label: "GB/T 7714-2015" },
  { key: "apa7", label: "APA 7" },
  { key: "brief", label: "公文简注" },
];

async function copyText(text: string): Promise<void> {
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

export default function StatisticDetailPage() {
  const { id = "" } = useParams();

  // nuqs URL 状态双向同步：确保「复制当前视角链接」在新标签页 100% 复现完全一致的视角与版本
  const [vParam, setVParam] = useQueryState("v", { defaultValue: "", shallow: false });
  const [chartParam, setChartParam] = useQueryState("chart", { defaultValue: "", history: "replace" });
  const [modeParam, setModeParam] = useQueryState("mode", { defaultValue: "", history: "replace" });
  const [sortParam, setSortParam] = useQueryState("sort", { defaultValue: "", history: "replace" });
  const [fromParam, setFromParam] = useQueryState("from", { defaultValue: "", history: "replace" });
  const [toParam, setToParam] = useQueryState("to", { defaultValue: "", history: "replace" });
  const [labelsParam, setLabelsParam] = useQueryState("labels", { defaultValue: "", history: "replace" });
  const [seriesParam, setSeriesParam] = useQueryState("series", { defaultValue: "", history: "replace" });
  const [hiddenParam, setHiddenParam] = useQueryState("hidden", { defaultValue: "", history: "replace" });

  const detailQuery = useStatisticDetail(id, vParam || undefined);
  const versionsQuery = useStatisticVersions(id);

  const [citationStyle, setCitationStyle] = useState<CitationStyle>("gbt7714");
  const [copyFeedback, setCopyFeedback] = useState<"url" | "citation" | "ai" | null>(null);
  const [exportBusy, setExportBusy] = useState<"png" | "xlsx" | "pptx" | null>(null);

  const viewState = useMemo<StatisticViewState>(() => {
    const chartType = VALID_CHART_TYPES.has(chartParam as ChartTypeId) ? (chartParam as ChartTypeId) : undefined;
    const metricMode = VALID_METRIC_MODES.has(modeParam as MetricModeKey) ? (modeParam as MetricModeKey) : undefined;
    const sort = VALID_SORTS.has(sortParam as "none" | "desc" | "asc")
      ? (sortParam as "none" | "desc" | "asc")
      : undefined;
    const showLabels = labelsParam === "1" ? true : labelsParam === "0" ? false : undefined;
    const selectedSeriesKeys = seriesParam
      ? seriesParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const hiddenLabelCoords = hiddenParam
      ? hiddenParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    return {
      chartType,
      metricMode,
      sort,
      periodFrom: fromParam || undefined,
      periodTo: toParam || undefined,
      showLabels,
      selectedSeriesKeys,
      hiddenLabelCoords,
    };
  }, [chartParam, modeParam, sortParam, fromParam, toParam, labelsParam, seriesParam, hiddenParam]);

  const stat = detailQuery.data?.statistic;

  const handleViewStateChange = useCallback(
    (next: StatisticViewState) => {
      if (!stat) return;
      const defaultChart = stat.visualization.default_chart_type;
      const defaultSort = stat.visualization.default_sort ?? "none";
      const defaultLabels = stat.visualization.default_show_labels;

      void setChartParam(next.chartType && next.chartType !== defaultChart ? next.chartType : null);
      void setModeParam(next.metricMode && next.metricMode !== "absolute" ? next.metricMode : null);
      void setSortParam(next.sort && next.sort !== defaultSort ? next.sort : null);
      void setFromParam(next.periodFrom || null);
      void setToParam(next.periodTo || null);
      void setLabelsParam(
        next.showLabels === undefined || next.showLabels === defaultLabels ? null : next.showLabels ? "1" : "0",
      );
      void setSeriesParam(
        next.selectedSeriesKeys && next.selectedSeriesKeys.length > 0 ? next.selectedSeriesKeys.join(",") : null,
      );
      void setHiddenParam(
        next.hiddenLabelCoords && next.hiddenLabelCoords.length > 0 ? next.hiddenLabelCoords.join(",") : null,
      );
    },
    [
      stat,
      setChartParam,
      setModeParam,
      setSortParam,
      setFromParam,
      setToParam,
      setLabelsParam,
      setSeriesParam,
      setHiddenParam,
    ],
  );

  function resetViewParams() {
    void setChartParam(null);
    void setModeParam(null);
    void setSortParam(null);
    void setFromParam(null);
    void setToParam(null);
    void setLabelsParam(null);
    void setSeriesParam(null);
    void setHiddenParam(null);
  }

  function showCopied(kind: "url" | "citation" | "ai") {
    setCopyFeedback(kind);
    setTimeout(() => {
      setCopyFeedback((prev) => (prev === kind ? null : prev));
    }, 2400);
  }

  if (detailQuery.isError) {
    if (detailQuery.error instanceof ApiError && detailQuery.error.status === 404) {
      return (
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
          <EmptyState
            title={`未找到统计成果「${id}」${vParam ? `（版本 ${vParam}）` : ""}`}
            description="该统计编号不存在，或所请求的历史归档版本尚未发布。"
            action={
              <div className="flex flex-wrap justify-center gap-3">
                {vParam && (
                  <Button variant="secondary" size="sm" onClick={() => void setVParam(null)}>
                    切换至该统计最新发布版
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link to="/statistics">返回标准统计成果库</Link>
                </Button>
              </div>
            }
          />
        </div>
      );
    }
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
        <QueryError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
      </div>
    );
  }

  if (detailQuery.isPending || !detailQuery.data || !stat) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const { latest_version: latestVersion, is_historical_version: isHistoricalVersion, related } = detailQuery.data;
  const projected = projectStatisticView(stat, viewState);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://mdes-web.pages.dev";
  const currentCitation = formatStatisticCitation(stat, citationStyle, origin);

  const versions = versionsQuery.data?.items ?? [
    {
      version: stat.version,
      content_hash: stat.content_hash,
      published_at: stat.published_at,
    },
  ];

  const v3Indicators = stat.indicator_refs.v3_seqs
    .map((seq) => SYSTEM_INDICATORS.find((ind) => ind.seq === seq))
    .filter((ind): ind is NonNullable<typeof ind> => Boolean(ind));

  const hasCustomView = Boolean(
    chartParam || modeParam || sortParam || fromParam || toParam || labelsParam || seriesParam || hiddenParam,
  );

  const kpiHeadline = stat.summary_kpi.headline_value.endsWith("%")
    ? stat.summary_kpi.headline_value
    : `${stat.summary_kpi.headline_value} ${stat.summary_kpi.unit}`;

  const methodologyItems: DescriptionItem[] = [
    { term: "统计定义", value: stat.methodology.definition, full: true },
    ...(stat.methodology.formula ? [{ term: "计算公式", value: stat.methodology.formula, full: true }] : []),
    ...(stat.methodology.denominator_note
      ? [{ term: "分母口径说明", value: stat.methodology.denominator_note, full: true }]
      : []),
    ...(stat.methodology.base_period_note
      ? [{ term: "比较基期说明", value: stat.methodology.base_period_note, full: true }]
      : []),
    { term: "时间跨度", value: stat.coverage.time_span },
    { term: "地域范围", value: stat.coverage.geographic_scope },
    { term: "样本覆盖范围", value: stat.coverage.sample_scope, full: true },
    ...(stat.coverage.limitations ? [{ term: "样本边界与局限", value: stat.coverage.limitations, full: true }] : []),
  ];

  async function handleCopyPerspectiveUrl() {
    if (typeof window === "undefined") return;
    await copyText(window.location.href);
    showCopied("url");
  }

  async function handleCopyCitation() {
    await copyText(currentCitation);
    showCopied("citation");
  }

  async function handleCopyForAi() {
    const md = buildCopyForAiMarkdown(stat!, viewState, origin);
    await copyText(md);
    showCopied("ai");
  }

  function handleExportCsv() {
    if (!stat) return;
    const denom = stat.dataset.denominators;
    const headers = [
      projected.periodLabel,
      "序列/对象",
      "数值",
      "单位",
      "数据性质",
      ...(denom ? [denom.label] : []),
      "备注",
    ];
    const rows = projected.tableRows.map((r) => [
      r.period,
      r.series_label,
      r.value ?? "",
      r.unit,
      r.status_label,
      ...(denom ? [r.denominator_text ?? ""] : []),
      r.note ?? "",
    ]);
    downloadText(`${stat.slug || stat.statistic_id}-v${stat.version}.csv`, toCsv(headers, rows));
  }

  function handleExportJson() {
    if (!stat) return;
    downloadText(
      `${stat.slug || stat.statistic_id}-v${stat.version}.json`,
      JSON.stringify({ statistic: stat, view_state: viewState, projected_view: projected }, null, 2),
      "application/json;charset=utf-8",
    );
  }

  async function handleExportPng() {
    if (!stat) return;
    setExportBusy("png");
    try {
      await exportFigurePng(stat, viewState, { scale: 2 });
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportXlsx() {
    if (!stat) return;
    setExportBusy("xlsx");
    try {
      const { exportStatisticXlsx } = await import("@/lib/charts/exporters/export-xlsx");
      await exportStatisticXlsx(stat, viewState);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportPptx() {
    if (!stat) return;
    setExportBusy("pptx");
    try {
      const { exportStatisticPptx } = await import("@/lib/charts/exporters/export-pptx");
      await exportStatisticPptx(stat, viewState);
    } finally {
      setExportBusy(null);
    }
  }

  const allPeriods = stat.dataset.periods;
  const isTimeSeriesLike =
    stat.template_type === "time_series" ||
    stat.template_type === "growth_rate" ||
    stat.template_type === "grouped_comparison" ||
    stat.template_type === "structure_change";

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <Breadcrumbs
        items={[
          { label: "产业总览", href: "/" },
          { label: "统计成果库", href: "/statistics" },
          { label: stat.statistic_id },
        ]}
      />

      {isHistoricalVersion && (
        <Notice
          tone="info"
          title={`您正在查看历史归档版本 ${stat.version}，最新已发布版本为 ${latestVersion}`}
          action={
            <Button variant="secondary" size="sm" onClick={() => void setVParam(null)}>
              切换至最新版本 {latestVersion}
            </Button>
          }
        >
          历史归档快照的数据序列、版本号（{stat.version}）及内容哈希已永久冻结，确保既有研究报告与公文引文读数在后续年度修订后仍可精确核验。
        </Notice>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* 左侧主出版内容区 (8 列) */}
        <div className="grid min-w-0 content-start gap-8 lg:col-span-8">
          <header className="grid gap-3 border-b-2 border-brand-navy pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand-navy px-2.5 py-0.5 code font-semibold text-on-brand">{stat.statistic_id}</span>
              <Tag size="sm" tone={isHistoricalVersion ? "warning" : "info"}>
                版本 v{stat.version}
              </Tag>
              <span className="caption text-ink-muted">发布日期：{stat.published_at.slice(0, 10)}</span>
              {stat.indicator_refs.v3_seqs.map((seq) => (
                <Link
                  key={seq}
                  to={`/system/${seq}`}
                  className="border border-border bg-surface-sunken px-2 py-0.5 caption font-semibold text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
                >
                  V3 指标 {seq}
                </Link>
              ))}
            </div>

            <h1 className="title-page text-brand-navy">{stat.title}</h1>
            <p className="body text-ink-muted">{stat.subtitle}</p>

            <div className="border-l-4 border-brand-navy bg-surface-sunken px-4 py-3 body text-ink">
              <strong className="font-semibold text-brand-navy">核心研判读数：</strong>
              {stat.insight}
            </div>
          </header>

          {/* 核心摘要 KPI 与覆盖口径条 */}
          <section
            aria-label="核心统计摘要"
            className="grid grid-cols-1 divide-y divide-border border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            <div className="grid content-start gap-1 p-4">
              <span className="caption text-ink-muted">{stat.summary_kpi.period}</span>
              <span className="numeral-sm tabular-nums text-brand-navy">{kpiHeadline}</span>
              {stat.summary_kpi.delta_label && (
                <span className="caption font-semibold text-ink-muted">{stat.summary_kpi.delta_label}</span>
              )}
            </div>
            <div className="grid content-start gap-1 p-4">
              <span className="caption text-ink-muted">统计时间与地域范围</span>
              <span className="body-sm font-semibold text-ink">{stat.coverage.time_span}</span>
              <span className="caption text-ink-muted">{stat.coverage.geographic_scope}</span>
            </div>
            <div className="grid content-start gap-1 p-4">
              <span className="caption text-ink-muted">样本覆盖与数据哈希</span>
              <span className="body-sm text-ink">{stat.coverage.sample_scope}</span>
              <span className="code text-ink-muted">{stat.content_hash}</span>
            </div>
          </section>

          {/* 期间切片与视角复位控制条 */}
          {(isTimeSeriesLike && allPeriods.length > 2) || hasCustomView ? (
            <section
              aria-label="期间区间与视角控制"
              className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-2.5"
            >
              {isTimeSeriesLike && allPeriods.length > 2 ? (
                <div className="flex flex-wrap items-center gap-2 body-sm">
                  <span className="caption font-semibold text-ink-muted">期间区间切片：</span>
                  <Select
                    value={fromParam || "__start__"}
                    onValueChange={(val) => void setFromParam(val === "__start__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-32 bg-surface" aria-label="起始期间">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__start__">起：{allPeriods[0]}</SelectItem>
                      {allPeriods.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="caption text-ink-muted">至</span>
                  <Select
                    value={toParam || "__end__"}
                    onValueChange={(val) => void setToParam(val === "__end__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-36 bg-surface" aria-label="截止期间">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__end__">止：{allPeriods[allPeriods.length - 1]}</SelectItem>
                      {allPeriods.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="caption text-ink-muted">当前已应用自定义图表视角参数</span>
              )}

              {hasCustomView && (
                <Button variant="ghost" size="sm" onClick={resetViewParams}>
                  <IconRefresh size={14} aria-hidden="true" />
                  恢复默认发布视角
                </Button>
              )}
            </section>
          ) : null}

          {/* 标准统计图表与内联数据表容器 */}
          <StatisticFigure
            statistic={stat}
            viewState={viewState}
            onViewStateChange={handleViewStateChange}
            titleHref={false}
            height={336}
          />

          {/* 统计口径、公式与分母说明 */}
          <section aria-labelledby="sec-methodology" className="grid gap-3">
            <div className="border-b border-border-strong pb-2">
              <h2 id="sec-methodology" className="title-sub text-brand-navy">
                统计口径、计算公式与样本范围
              </h2>
            </div>
            <Descriptions items={methodologyItems} columns={2} />
          </section>

          {/* 统计口径断点（如有） */}
          {stat.methodology.methodology_breaks.length > 0 && (
            <section aria-labelledby="sec-breaks" className="grid gap-3">
              <div className="border-b border-border-strong pb-2">
                <h2 id="sec-breaks" className="title-sub text-brand-navy">
                  历史统计口径变更与可比性说明
                </h2>
              </div>
              <ul className="divide-y divide-border border border-border bg-warning-bg/40">
                {stat.methodology.methodology_breaks.map((brk) => {
                  const comp = COMPARABILITY_LABEL[brk.comparability];
                  return (
                    <li key={`${brk.effective_period}-${brk.short_label}`} className="grid gap-1.5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="code font-bold text-brand-navy">{brk.effective_period}</span>
                          <span className="body-sm font-semibold text-ink">{brk.short_label}</span>
                        </div>
                        <Tag size="sm" tone={comp.tone}>
                          {comp.label}
                        </Tag>
                      </div>
                      <p className="body-sm text-ink">{brk.explanation}</p>
                      {brk.reference_href && (
                        <div>
                          <TextLink to={brk.reference_href} className="caption font-semibold">
                            查阅关联指标规范说明 →
                          </TextLink>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* 禁止推断红线 */}
          <section aria-labelledby="sec-prohibited" className="grid gap-3">
            <div className="border-b border-border-strong pb-2">
              <h2 id="sec-prohibited" className="title-sub text-brand-navy">
                使用限制与禁止推断红线
              </h2>
            </div>
            <div role="note" className="border border-border border-l-4 border-l-danger bg-surface-sunken p-4">
              <ul className="grid gap-2.5">
                {stat.methodology.prohibited_inferences.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 body-sm text-ink">
                    <span className="shrink-0 border border-border-strong bg-surface px-1.5 py-0.5 caption font-semibold text-brand-navy">
                      红线 {idx + 1}
                    </span>
                    <span>
                      <strong className="font-semibold text-ink">禁止推断：</strong>
                      {rule}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 原始权威出处与页码定位 */}
          <section aria-labelledby="sec-sources" className="grid gap-3">
            <div className="border-b border-border-strong pb-2">
              <h2 id="sec-sources" className="title-sub text-brand-navy">
                原始权威来源与页码定位
              </h2>
            </div>
            <ul className="divide-y divide-border border border-border bg-surface">
              {stat.sources.map((src, idx) => (
                <li key={idx} className="grid gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <span className="label text-brand-navy">{src.organization}</span>
                      <p className="body font-semibold text-ink">《{src.document_title}》</p>
                    </div>
                    {src.page_or_section && (
                      <Tag size="sm" tone="info">
                        定位：{src.page_or_section}
                      </Tag>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 caption text-ink-muted">
                    <span>
                      {src.source_published_at ? `原始发布日期：${src.source_published_at}` : "官方公开披露文献"}
                    </span>
                    <div className="flex flex-wrap items-center gap-4">
                      {src.document_id && (
                        <TextLink to={`/sources?id=${encodeURIComponent(src.document_id)}`} className="caption font-semibold">
                          在官方来源库查看全部引用 →
                        </TextLink>
                      )}
                      {src.source_url && (
                        <a
                          href={src.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
                        >
                          打开原始出处{src.page_or_section ? `（${src.page_or_section}）` : ""}
                          <IconExternalLink size={13} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* 关联协同研判统计成果 */}
          {related.length > 0 && (
            <section aria-labelledby="sec-related-stats" className="grid gap-3">
              <div className="border-b border-border-strong pb-2">
                <h2 id="sec-related-stats" className="title-sub text-brand-navy">
                  关联统计成果
                </h2>
              </div>
              <ul className="divide-y divide-border border-y border-border">
                {related.map((rel) => (
                  <li key={rel.statistic_id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="code text-brand-navy">{rel.statistic_id}</span>
                        <Tag size="sm">v{rel.version}</Tag>
                      </div>
                      <Link
                        to={`/statistics/${encodeURIComponent(rel.statistic_id)}`}
                        className="body font-semibold text-brand-navy hover:underline focus-ring"
                      >
                        {rel.title}
                      </Link>
                      <span className="caption text-ink-muted">{rel.subtitle}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="body-sm font-semibold tabular-nums text-brand-navy">
                        {rel.summary_kpi.headline_value.endsWith("%")
                          ? rel.summary_kpi.headline_value
                          : `${rel.summary_kpi.headline_value} ${rel.summary_kpi.unit}`}
                      </span>
                      <IconArrowRight size={16} className="text-ink-muted" aria-hidden="true" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* 右侧出版、导出、引用与版本工作台栏 (4 列) */}
        <aside aria-label="统计出版与导出工具栏" className="grid w-full content-start gap-5 lg:sticky lg:top-20 lg:col-span-4">
          {/* 1. 视角链接与 AI 数据包 */}
          <section className="grid gap-3 border border-border border-t-2 border-t-brand-navy bg-surface p-4">
            <h2 className="label text-brand-navy">视角复现与 AI 引用</h2>
            <p className="caption text-ink-muted">
              当前图表类型、量纲切换、期间切片与固定版本号已实时编码至地址栏，复制链接即可在任意终端完整复现当前视图。
            </p>
            <div className="grid gap-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full justify-center"
                onClick={() => void handleCopyPerspectiveUrl()}
              >
                {copyFeedback === "url" ? (
                  <>
                    <IconCheck size={16} aria-hidden="true" />
                    已复制当前视角链接
                  </>
                ) : (
                  <>
                    <IconLink size={16} aria-hidden="true" />
                    复制当前视角链接
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={() => void handleCopyForAi()}
              >
                {copyFeedback === "ai" ? (
                  <>
                    <IconCheck size={16} aria-hidden="true" />
                    已复制 9 要素 AI 数据包
                  </>
                ) : (
                  <>
                    <IconSparkles size={16} aria-hidden="true" />
                    Copy for AI（含口径红线）
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* 2. 多格式出版级导出 */}
          <section className="grid gap-3 border border-border bg-surface p-4">
            <h2 className="label text-brand-navy">多格式出版物与底稿导出</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportStatisticFigureSvg(stat, viewState, { preset: "publication" })}
              >
                <IconDownload size={15} aria-hidden="true" />
                出版图卡 SVG
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportStatisticFigureSvg(stat, viewState, { preset: "bare" })}
              >
                <IconDownload size={15} aria-hidden="true" />
                纯图 SVG
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={exportBusy !== null}
                onClick={() => void handleExportPng()}
              >
                <IconPhoto size={15} aria-hidden="true" />
                {exportBusy === "png" ? "生成中…" : "高清 PNG (2x)"}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportCsv}>
                <IconFileSpreadsheet size={15} aria-hidden="true" />
                切片 CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="col-span-2 justify-center"
                disabled={exportBusy !== null}
                onClick={() => void handleExportXlsx()}
              >
                <IconFileSpreadsheet size={15} aria-hidden="true" />
                {exportBusy === "xlsx" ? "正在生成 Excel…" : "导出 4-Sheet 标准统计底稿 (.xlsx)"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="col-span-2 justify-center"
                disabled={exportBusy !== null}
                onClick={() => void handleExportPptx()}
              >
                <IconPresentation size={15} aria-hidden="true" />
                {exportBusy === "pptx" ? "正在生成 PPT…" : "导出 16:9 原生可编辑图表幻灯片 (.pptx)"}
              </Button>
              <Button variant="ghost" size="sm" className="col-span-2 justify-center" onClick={handleExportJson}>
                <IconFileCode size={15} aria-hidden="true" />
                下载结构化 JSON 快照
              </Button>
            </div>
          </section>

          {/* 3. 标准文献与公文引用切换器 */}
          <section className="grid gap-3 border border-border bg-surface p-4">
            <h2 className="label text-brand-navy">学术与公文标准引用</h2>
            <div role="tablist" aria-label="文献引用格式选择" className="grid grid-cols-3 border border-border bg-surface-sunken p-0.5">
              {CITATION_TABS.map((tab) => {
                const active = citationStyle === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCitationStyle(tab.key)}
                    className={cn(
                      "cursor-pointer py-1 text-center caption font-semibold transition-colors focus-ring",
                      active ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <p className="border border-border bg-surface-sunken p-3 caption text-ink break-all">
              {currentCitation}
            </p>
            <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => void handleCopyCitation()}>
              {copyFeedback === "citation" ? (
                <>
                  <IconCheck size={15} aria-hidden="true" />
                  已复制引用文本
                </>
              ) : (
                <>
                  <IconCopy size={15} aria-hidden="true" />
                  复制当前引用格式
                </>
              )}
            </Button>
          </section>

          {/* 4. 发布版本选择器 */}
          <section className="grid gap-3 border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="label text-brand-navy">历史版本与快照归档</h2>
              <span className="caption text-ink-muted">共 {versions.length} 个版本</span>
            </div>
            <ul className="divide-y divide-border border border-border">
              {versions.map((ver) => {
                const isSelected = ver.version === stat.version;
                const isLatest = ver.version === latestVersion;
                return (
                  <li key={ver.version}>
                    <button
                      type="button"
                      onClick={() => void setVParam(isLatest ? null : ver.version)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors focus-ring",
                        isSelected ? "bg-info-bg font-semibold text-brand-navy" : "hover:bg-surface-sunken",
                      )}
                    >
                      <div className="grid gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="code font-semibold">v{ver.version}</span>
                          {isLatest && (
                            <Tag size="sm" tone="success">
                              最新
                            </Tag>
                          )}
                          {isSelected && !isLatest && (
                            <Tag size="sm" tone="warning">
                              当前查看
                            </Tag>
                          )}
                        </div>
                        <span className="caption text-ink-muted">发布于 {ver.published_at.slice(0, 10)}</span>
                      </div>
                      <span className="code text-ink-muted">{ver.content_hash.slice(0, 12)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 5. 关联 V3 指标体系与实体链接 */}
          <section className="grid gap-3 border border-border bg-surface p-4">
            <h2 className="label text-brand-navy">关联指标规范与实体档案</h2>
            <div className="grid gap-2">
              {v3Indicators.map((ind) => (
                <Link
                  key={ind.seq}
                  to={`/system/${ind.seq}`}
                  className="flex items-center justify-between gap-2 border border-border bg-surface-sunken px-3 py-2 body-sm text-ink transition-colors hover:border-brand-navy hover:bg-info-bg focus-ring"
                >
                  <span>
                    <strong className="code text-brand-navy">{ind.seq}</strong> {ind.name}
                  </span>
                  <IconArrowRight size={14} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              ))}
              {stat.entity_refs.enterprises?.map((entSlug) => (
                <TextLink key={entSlug} to={`/enterprises/${encodeURIComponent(entSlug)}`} className="body-sm">
                  查看关联企业研究档案（{entSlug}） →
                </TextLink>
              ))}
              {stat.entity_refs.product_models?.map((mdlSlug) => (
                <TextLink key={mdlSlug} to={`/products/${encodeURIComponent(mdlSlug)}`} className="body-sm">
                  查看关联产品型号档案（{mdlSlug}） →
                </TextLink>
              ))}
              {stat.entity_refs.hs_codes && stat.entity_refs.hs_codes.length > 0 && (
                <TextLink
                  to={`/trade?q=${encodeURIComponent(stat.entity_refs.hs_codes[0]!)}`}
                  className="body-sm"
                >
                  查看海关税号明细（{stat.entity_refs.hs_codes.join(" / ")}） →
                </TextLink>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
