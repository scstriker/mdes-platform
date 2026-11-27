import { useCallback, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Link, useInRouterContext, useNavigate } from "react-router";
import {
  buildCopyForAiMarkdown,
  formatStatisticCitation,
  projectStatisticView,
  type ChartTypeId,
  type CitationStyle,
  type MetricModeKey,
  type Statistic,
  type StatisticViewState,
} from "@mdes/shared";
import {
  IconAdjustmentsHorizontal,
  IconArrowsMaximize,
  IconChartBar,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileCode,
  IconFileSpreadsheet,
  IconPhoto,
  IconPresentation,
  IconQuote,
  IconSparkles,
  IconTable,
} from "@tabler/icons-react";
import { Tag, type TagTone } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChartPointClickPayload } from "@/lib/charts/chart";
import type { ChartOption } from "@/lib/charts/echarts";
import {
  exportFigurePng,
  exportOptionFigurePng,
  exportOptionFigureSvg,
  exportStatisticFigureSvg,
} from "@/lib/charts/exporters/export-svg-png";
import { LazyChart } from "@/lib/charts/lazy-chart";
import {
  buildStatisticChartOption,
  CHART_TYPE_LABELS,
  makeLabelCoordKey,
  type ChartPointDatum,
} from "@/lib/charts/templates";
import type { ChartTheme } from "@/lib/charts/theme";
import { downloadText, toCsv } from "@/lib/download";
import { cn } from "@/lib/utils";

export type StatistaTableColumn = {
  key: string;
  title: string;
  align?: "left" | "right";
};

export type StatistaFigureProps = {
  /** 供首页研判或目录深链锚定 */
  id?: string;
  /** 图序眉标，如 "图 1 · 审评准入趋势" */
  eyebrow?: string;
  /** 结论式主标题（观点先行） */
  title: string;
  /** 明确标注时间跨度、地域口径与计量单位 */
  subtitle: string;
  /** 右上角核心趋势/极值徽标 */
  badge?: {
    label: string;
    tone?: TagTone;
  };
  /** 附加维度切换或筛选器插槽 */
  controls?: ReactNode;
  /** ECharts 配置生成函数 */
  option: (theme: ChartTheme) => ChartOption;
  /** 无障碍图表摘要 */
  ariaLabel: string;
  height?: number;
  /** 提供结构化底层行数据时，自动启用右上角「图表 / 数据表」原地切换与 CSV 导出 */
  tableColumns?: readonly StatistaTableColumn[];
  tableRows?: readonly Record<string, string | number>[];
  /** 导出文件名前缀 */
  exportName?: string;
  /** 权威数据来源说明 */
  source: string;
  /** 一句话统计口径或对账核验说明 */
  note?: string;
  className?: string;
};

/**
 * Statista 级四段式出版物信息图容器（严守 ITEI 去卡片化规则，不挂载 data-slot="card"）：
 * 升级支持在图表/数据表双视图及深色主题下离屏导出固定白底出版物 SVG 与 2x 高清 PNG。
 */
export function StatistaFigure({
  id,
  eyebrow,
  title,
  subtitle,
  badge,
  controls,
  option,
  ariaLabel,
  height = 276,
  tableColumns,
  tableRows,
  exportName = "mdes-figure",
  source,
  note,
  className,
}: StatistaFigureProps) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const hasTable = Boolean(tableColumns && tableColumns.length > 0 && tableRows && tableRows.length > 0);

  function handleExportSvg() {
    exportOptionFigureSvg({
      option,
      exportHeight: height,
      eyebrow,
      title,
      subtitle,
      badgeLabel: badge?.label,
      source,
      note,
      filename: `${exportName}.svg`,
      preset: "publication",
    });
  }

  function handleExportPng() {
    void exportOptionFigurePng({
      option,
      exportHeight: height,
      eyebrow,
      title,
      subtitle,
      badgeLabel: badge?.label,
      source,
      note,
      filename: `${exportName}-2x.png`,
      preset: "publication",
      scale: 2,
    });
  }

  function handleExportCsv() {
    if (!tableColumns || !tableRows) return;
    const headers = tableColumns.map((c) => c.title);
    const rows = tableRows.map((r) => tableColumns.map((c) => r[c.key] ?? ""));
    downloadText(`${exportName}.csv`, toCsv(headers, rows));
  }

  return (
    <figure
      id={id}
      className={cn(
        "flex flex-col justify-between border border-border border-t-2 border-t-brand-navy bg-surface",
        className,
      )}
    >
      <div>
        {/* 1. Header Zone */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
          <div className="grid min-w-0 flex-1 gap-1">
            {eyebrow && <p className="label text-brand-navy">{eyebrow}</p>}
            <h3 className="title-sub text-ink">{title}</h3>
            <p className="body-sm text-ink-muted">{subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {badge && (
              <Tag size="sm" tone={badge.tone ?? "info"}>
                {badge.label}
              </Tag>
            )}
            {hasTable && (
              <div
                role="group"
                aria-label="图表与数据表视图切换"
                className="inline-flex border border-border bg-surface-sunken p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={mode === "chart"}
                  onClick={() => setMode("chart")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                    mode === "chart" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <IconChartBar size={14} aria-hidden="true" />
                  图表
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "table"}
                  onClick={() => setMode("table")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                    mode === "table" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <IconTable size={14} aria-hidden="true" />
                  数据表
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Optional Slice / Sub-dimension Controls */}
        {controls && <div className="border-b border-border bg-surface-sunken px-4 py-2 md:px-5">{controls}</div>}

        {/* 3. Plot Canvas / Accessible Inline Table */}
        <div data-slot="figure-canvas" className="px-4 py-3.5 md:px-5">
          {mode === "chart" || !hasTable ? (
            <LazyChart option={option} ariaLabel={ariaLabel} height={height} />
          ) : (
            <Table dense>
              <TableCaption className="sr-only">{title}底层统计数据表</TableCaption>
              <TableHeader>
                <TableRow>
                  {tableColumns!.map((col) => (
                    <TableHead key={col.key} className={col.align === "right" ? "text-right" : "text-left"}>
                      {col.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows!.map((row, idx) => (
                  <TableRow key={idx}>
                    {tableColumns!.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(col.align === "right" ? "text-right tabular-nums" : "text-left")}
                      >
                        {row[col.key] ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 4. Source & Export Footer Strip */}
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border bg-surface-sunken px-4 py-2.5 caption text-ink-muted md:px-5">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-ink">数据来源：</span>
          <span>{source}</span>
          {note && <span> · 注：{note}</span>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportSvg}
            className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
          >
            <IconDownload size={14} aria-hidden="true" />
            导出图卡(SVG)
          </button>
          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
          >
            <IconPhoto size={14} aria-hidden="true" />
            导出高清图(PNG)
          </button>
          {hasTable && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
            >
              <IconFileSpreadsheet size={14} aria-hidden="true" />
              导出数据(CSV)
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

/* ============================================================================
 * StatisticFigure 2.0：一等公民标准统计成果容器
 * ============================================================================ */

function RouterNavigateBridge({ navRef }: { navRef: MutableRefObject<((to: string) => void) | null> }) {
  const navigate = useNavigate();
  navRef.current = (to: string) => {
    void navigate(to);
  };
  return null;
}

async function copyTextToClipboard(text: string): Promise<void> {
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

export type StatisticFigureProps = {
  id?: string;
  eyebrow?: string;
  statistic: Statistic;
  viewState?: StatisticViewState;
  defaultViewState?: StatisticViewState;
  onViewStateChange?: (next: StatisticViewState) => void;
  /** 标题链接目标；默认链向 /statistics/{statistic_id}，传 null 或 false 时纯文本展示 */
  titleHref?: string | null | false;
  height?: number;
  compact?: boolean;
  className?: string;
};

export function StatisticFigure({
  id,
  eyebrow,
  statistic,
  viewState,
  defaultViewState,
  onViewStateChange,
  titleHref,
  height,
  compact = false,
  className,
}: StatisticFigureProps) {
  const inRouter = useInRouterContext();
  const navRef = useRef<((to: string) => void) | null>(null);

  const [mode, setMode] = useState<"chart" | "table">("chart");
  const [internalViewState, setInternalViewState] = useState<StatisticViewState>(() => defaultViewState ?? {});
  const [copiedFeedback, setCopiedFeedback] = useState<"ai" | "citation" | null>(null);
  const [exportBusy, setExportBusy] = useState<"xlsx" | "pptx" | "png" | null>(null);
  const [drillPrompt, setDrillPrompt] = useState<{ label: string; href: string } | null>(null);

  const effectiveViewState = viewState ?? internalViewState;

  const updateViewState = useCallback(
    (updater: Partial<StatisticViewState> | ((prev: StatisticViewState) => StatisticViewState)) => {
      const next = typeof updater === "function" ? updater(effectiveViewState) : { ...effectiveViewState, ...updater };
      if (viewState === undefined) {
        setInternalViewState(next);
      }
      onViewStateChange?.(next);
    },
    [effectiveViewState, onViewStateChange, viewState],
  );

  const projected = useMemo(
    () => projectStatisticView(statistic, effectiveViewState),
    [statistic, effectiveViewState],
  );

  const chartOptionBuilder = useCallback(
    (theme: ChartTheme) => buildStatisticChartOption(statistic, effectiveViewState, theme).option,
    [statistic, effectiveViewState],
  );

  const resolvedHeight = height ?? (compact ? 236 : 304);
  const resolvedEyebrow =
    eyebrow ?? (!compact ? `${statistic.statistic_id} · V3 指标 ${statistic.indicator_refs.v3_seqs.join("/")}` : undefined);

  const resolvedTitleHref =
    titleHref === undefined
      ? `/statistics/${encodeURIComponent(statistic.statistic_id)}`
      : titleHref || null;

  const showLabels = effectiveViewState.showLabels ?? statistic.visualization.default_show_labels;
  const hiddenCoords = effectiveViewState.hiddenLabelCoords ?? [];
  const sortOrder = effectiveViewState.sort ?? statistic.visualization.default_sort ?? "none";
  const metricModes = statistic.visualization.metric_modes ?? [];

  const nonActualSummary = useMemo(() => {
    const labels = new Set<string>();
    for (const s of projected.plottedSeries) {
      for (const pt of s.points) {
        if (pt.status !== "A") {
          labels.add(pt.status_label);
        }
      }
    }
    return Array.from(labels);
  }, [projected.plottedSeries]);

  const handlePointClick = useCallback(
    (payload: ChartPointClickPayload) => {
      const datum = (payload.data ?? null) as Partial<ChartPointDatum> | null;
      const seriesKey = datum?.seriesKey;
      const period = datum?.period ?? payload.name;
      const drillHref = datum?.drillHref;

      if (showLabels && seriesKey && period) {
        const key = makeLabelCoordKey(seriesKey, period);
        updateViewState((prev) => {
          const current = new Set(prev.hiddenLabelCoords ?? []);
          if (current.has(key)) {
            current.delete(key);
          } else {
            current.add(key);
          }
          return { ...prev, hiddenLabelCoords: Array.from(current) };
        });
        if (drillHref) {
          setDrillPrompt({
            label: `${datum?.seriesLabel ?? payload.seriesName} · ${period}`,
            href: drillHref,
          });
        }
        return;
      }

      if (drillHref) {
        if (navRef.current) {
          navRef.current(drillHref);
        } else if (typeof window !== "undefined") {
          window.location.assign(drillHref);
        }
      }
    },
    [showLabels, updateViewState],
  );

  function triggerFeedback(kind: "ai" | "citation") {
    setCopiedFeedback(kind);
    setTimeout(() => {
      setCopiedFeedback((prev) => (prev === kind ? null : prev));
    }, 2200);
  }

  async function handleCopyForAi() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mdes-web.pages.dev";
    const markdown = buildCopyForAiMarkdown(statistic, effectiveViewState, origin);
    await copyTextToClipboard(markdown);
    triggerFeedback("ai");
  }

  async function handleCopyCitation(style: CitationStyle) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mdes-web.pages.dev";
    const text = formatStatisticCitation(statistic, style, origin);
    await copyTextToClipboard(text);
    triggerFeedback("citation");
  }

  function handleExportCsv() {
    const denom = statistic.dataset.denominators;
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
    downloadText(`${statistic.slug || statistic.statistic_id}-v${statistic.version}.csv`, toCsv(headers, rows));
  }

  function handleExportJson() {
    const snapshot = {
      statistic,
      view_state: effectiveViewState,
      projected_view: projected,
    };
    downloadText(
      `${statistic.slug || statistic.statistic_id}-v${statistic.version}.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json;charset=utf-8",
    );
  }

  async function handleExportPng() {
    setExportBusy("png");
    try {
      await exportFigurePng(statistic, effectiveViewState, { eyebrow: resolvedEyebrow, scale: 2 });
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportXlsx() {
    setExportBusy("xlsx");
    try {
      const { exportStatisticXlsx } = await import("@/lib/charts/exporters/export-xlsx");
      await exportStatisticXlsx(statistic, effectiveViewState);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportPptx() {
    setExportBusy("pptx");
    try {
      const { exportStatisticPptx } = await import("@/lib/charts/exporters/export-pptx");
      await exportStatisticPptx(statistic, effectiveViewState);
    } finally {
      setExportBusy(null);
    }
  }

  const firstSource = statistic.sources[0];
  const kpiHeadline = statistic.summary_kpi.headline_value.endsWith("%")
    ? statistic.summary_kpi.headline_value
    : `${statistic.summary_kpi.headline_value} ${statistic.summary_kpi.unit}`;

  const renderDataTable = (denseTable = true) => {
    const denom = statistic.dataset.denominators;
    const showNoteCol = projected.unplottedSeries.length > 0;
    return (
      <div className="grid gap-2">
        <Table dense={denseTable}>
          <TableCaption className="sr-only">{projected.title}统计数据表</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{projected.periodLabel}</TableHead>
              <TableHead>序列/对象</TableHead>
              <TableHead className="text-right">数值</TableHead>
              <TableHead>单位</TableHead>
              <TableHead>数据性质</TableHead>
              {denom && <TableHead className="text-right">{denom.label}</TableHead>}
              {showNoteCol && <TableHead>说明</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projected.tableRows.map((row) => (
              <TableRow key={`${row.period}-${row.series_key}`}>
                <TableCell className="font-semibold">{row.period}</TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>{row.series_label}</span>
                    {!row.plotted && (
                      <Tag size="sm" tone="warning">
                        未画出
                      </Tag>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{row.formatted_value}</TableCell>
                <TableCell className="text-ink-muted">{row.unit}</TableCell>
                <TableCell>
                  <Tag size="sm" tone={row.status === "A" ? "success" : row.status === "P" ? "warning" : "info"}>
                    {row.status_label}
                  </Tag>
                </TableCell>
                {denom && <TableCell className="text-right tabular-nums">{row.denominator_text ?? "—"}</TableCell>}
                {showNoteCol && <TableCell className="text-ink-muted">{row.note ?? "—"}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {projected.unplottedSeries.length > 0 && (
          <p className="caption text-ink-muted">
            注：为保障图表清晰可读，画布至多同时绘制前 5 条序列；其余 {projected.unplottedSeries.length} 条序列已在数据表中完整保留并标注「未画出」。
          </p>
        )}
      </div>
    );
  };

  const hasAnnotationStrip =
    nonActualSummary.length > 0 ||
    projected.methodologyBreaks.length > 0 ||
    projected.unplottedSeries.length > 0 ||
    drillPrompt !== null;

  return (
    <figure
      id={id ?? statistic.slug}
      data-statistic-id={statistic.statistic_id}
      className={cn(
        "flex flex-col justify-between border border-border border-t-2 border-t-brand-navy bg-surface",
        className,
      )}
    >
      {inRouter && <RouterNavigateBridge navRef={navRef} />}

      <div>
        {/* 1. Header Zone */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
          <div className="grid min-w-0 flex-1 gap-1">
            {resolvedEyebrow && <p className="label text-brand-navy">{resolvedEyebrow}</p>}
            <h3 className="title-sub text-ink">
              {resolvedTitleHref ? (
                inRouter ? (
                  <Link to={resolvedTitleHref} className="hover:text-brand-navy hover:underline focus-ring">
                    {projected.title}
                  </Link>
                ) : (
                  <a href={resolvedTitleHref} className="hover:text-brand-navy hover:underline focus-ring">
                    {projected.title}
                  </a>
                )
              ) : (
                projected.title
              )}
            </h3>
            <p className="body-sm text-ink-muted">{projected.subtitle}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Tag size="sm" tone="info">
              {statistic.summary_kpi.period} · {kpiHeadline}
            </Tag>
            <Tag size="sm">v{statistic.version}</Tag>

            {/* 图表 / 数据表切换 */}
            <div
              role="group"
              aria-label="图表与数据表视图切换"
              className="inline-flex border border-border bg-surface-sunken p-0.5"
            >
              <button
                type="button"
                aria-pressed={mode === "chart"}
                onClick={() => setMode("chart")}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                  mode === "chart" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                )}
              >
                <IconChartBar size={14} aria-hidden="true" />
                图表
              </button>
              <button
                type="button"
                aria-pressed={mode === "table"}
                onClick={() => setMode("table")}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                  mode === "table" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                )}
              >
                <IconTable size={14} aria-hidden="true" />
                数据表
              </button>
            </div>

            {/* 图表设置 Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" aria-label="图表设置">
                  <IconAdjustmentsHorizontal size={15} aria-hidden="true" />
                  图表设置
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="grid gap-3.5">
                  <div className="grid gap-1.5">
                    <span className="label text-brand-navy">允许图表形态</span>
                    <div className="flex flex-wrap gap-1.5">
                      {statistic.visualization.allowed_chart_types.map((ct: ChartTypeId) => (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => updateViewState({ chartType: ct })}
                          className={cn(
                            "cursor-pointer border px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                            projected.chartType === ct
                              ? "border-brand-navy bg-brand-navy text-on-brand"
                              : "border-border bg-surface text-ink hover:bg-info-bg",
                          )}
                        >
                          {CHART_TYPE_LABELS[ct]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {metricModes.length > 0 && (
                    <div className="grid gap-1.5 border-t border-border pt-2.5">
                      <span className="label text-brand-navy">统计量纲切换</span>
                      <div className="flex flex-wrap gap-1.5">
                        {metricModes.map((mm) => (
                          <button
                            key={mm.key}
                            type="button"
                            onClick={() => updateViewState({ metricMode: mm.key })}
                            className={cn(
                              "cursor-pointer border px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                              projected.metricMode === mm.key
                                ? "border-brand-navy bg-brand-navy text-on-brand"
                                : "border-border bg-surface text-ink hover:bg-info-bg",
                            )}
                          >
                            {mm.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-1.5 border-t border-border pt-2.5">
                    <span className="label text-brand-navy">排序方式</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["none", "原始顺序"],
                          ["desc", "降序排列"],
                          ["asc", "升序排列"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateViewState({ sort: val })}
                          className={cn(
                            "cursor-pointer border px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                            sortOrder === val
                              ? "border-brand-navy bg-brand-navy text-on-brand"
                              : "border-border bg-surface text-ink hover:bg-info-bg",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 border-t border-border pt-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`toggle-labels-${statistic.statistic_id}`}
                        className="caption font-semibold text-ink"
                      >
                        显示数据点数值标签
                      </label>
                      <Checkbox
                        id={`toggle-labels-${statistic.statistic_id}`}
                        checked={showLabels}
                        onCheckedChange={(checked) => updateViewState({ showLabels: checked === true })}
                      />
                    </div>
                    <p className="caption text-ink-muted">点击图中任意数据点可单独隐藏或恢复该点数值标签。</p>
                    {hiddenCoords.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start px-0"
                        onClick={() => updateViewState({ hiddenLabelCoords: [] })}
                      >
                        恢复已隐藏的单点标签（{hiddenCoords.length} 处）
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* 全屏查看 Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="全屏查看统计图表">
                  <IconArrowsMaximize size={16} aria-hidden="true" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl">
                <DialogHeader>
                  <DialogTitle>{projected.title}</DialogTitle>
                  <DialogDescription>{projected.subtitle}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="border-l-4 border-brand-navy bg-surface-sunken px-3.5 py-2.5 body-sm text-ink">
                    {statistic.insight}
                  </div>
                  <div className="border border-border bg-surface p-3">
                    {mode === "chart" ? (
                      <LazyChart
                        option={chartOptionBuilder}
                        ariaLabel={`${projected.title}全屏图表`}
                        height={420}
                        onPointClick={handlePointClick}
                      />
                    ) : (
                      renderDataTable(false)
                    )}
                  </div>
                  <div className="grid gap-1.5 border-t border-border pt-3 caption text-ink-muted">
                    <p>
                      <span className="font-semibold text-ink">统计定义：</span>
                      {statistic.methodology.definition}
                    </p>
                    {statistic.methodology.prohibited_inferences.map((rule, idx) => (
                      <p key={idx} className="text-danger">
                        <span className="font-semibold">禁止推断：</span>
                        {rule}
                      </p>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 2. Metric Mode Quick Switch Bar (when metric_modes > 1) */}
        {!compact && metricModes.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken px-4 py-2 md:px-5">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="统计量纲快捷切换">
              <span className="caption font-semibold text-ink-muted">量纲口径：</span>
              {metricModes.map((mm: { key: MetricModeKey; label: string }) => (
                <button
                  key={mm.key}
                  type="button"
                  onClick={() => updateViewState({ metricMode: mm.key })}
                  className={cn(
                    "cursor-pointer border px-2.5 py-0.5 caption font-semibold transition-colors focus-ring",
                    projected.metricMode === mm.key
                      ? "border-brand-navy bg-brand-navy text-on-brand"
                      : "border-border bg-surface text-ink-muted hover:text-ink",
                  )}
                >
                  {mm.label}
                </button>
              ))}
            </div>
            {statistic.visualization.allowed_chart_types.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {statistic.visualization.allowed_chart_types.map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => updateViewState({ chartType: ct })}
                    className={cn(
                      "cursor-pointer px-2 py-0.5 caption transition-colors focus-ring",
                      projected.chartType === ct
                        ? "font-semibold text-brand-navy underline underline-offset-4"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {CHART_TYPE_LABELS[ct]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Plot Canvas / Accessible Inline Table */}
        <div data-slot="figure-canvas" className="px-4 py-3.5 md:px-5">
          {mode === "chart" ? (
            <div className="grid gap-2.5">
              <LazyChart
                option={chartOptionBuilder}
                ariaLabel={`${projected.title}（${projected.subtitle}）`}
                height={resolvedHeight}
                onPointClick={handlePointClick}
              />

              {hasAnnotationStrip && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 caption text-ink-muted">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {nonActualSummary.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-4 border border-dashed border-brand-navy bg-info-bg" />
                        <span>虚线/浅底标注：{nonActualSummary.join("、")}</span>
                      </span>
                    )}
                    {projected.methodologyBreaks.map((brk) => (
                      <span key={brk.effective_period} className="inline-flex items-center gap-1 text-danger">
                        <span className="font-semibold">口径断点（{brk.effective_period}）：</span>
                        <span>{brk.short_label}</span>
                      </span>
                    ))}
                    {projected.unplottedSeries.length > 0 && (
                      <span>
                        另有 {projected.unplottedSeries.length} 条序列超出 5 条绘制上限未画出（切换「数据表」查看全量）
                      </span>
                    )}
                  </div>

                  {drillPrompt && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-ink-muted">已选点位：{drillPrompt.label}</span>
                      {inRouter ? (
                        <Link to={drillPrompt.href} className="font-semibold text-link hover:underline focus-ring">
                          查看关联详情 →
                        </Link>
                      ) : (
                        <a href={drillPrompt.href} className="font-semibold text-link hover:underline focus-ring">
                          查看关联详情 →
                        </a>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            renderDataTable(true)
          )}
        </div>
      </div>

      {/* 4. Source, Citation, Copy for AI & Multi-Format Export Footer */}
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-surface-sunken px-4 py-2.5 caption text-ink-muted md:px-5">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-ink">数据来源：</span>
          {firstSource ? (
            <span>
              {firstSource.organization}《{firstSource.document_title}》
              {firstSource.page_or_section ? `（${firstSource.page_or_section}）` : ""}
            </span>
          ) : (
            <span>MDES 医疗器械产业数据平台</span>
          )}
          <span> · 版本 v{statistic.version}</span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* 复制引用 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 border border-border bg-surface px-2.5 py-1 caption font-semibold text-ink hover:bg-info-bg hover:text-brand-navy focus-ring"
              >
                {copiedFeedback === "citation" ? (
                  <>
                    <IconCheck size={14} aria-hidden="true" />
                    已复制引用
                  </>
                ) : (
                  <>
                    <IconQuote size={14} aria-hidden="true" />
                    复制引用
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>选择学术与公文引用格式</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleCopyCitation("gbt7714")}>
                <IconCopy size={15} />
                GB/T 7714 标准引用
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyCitation("apa7")}>
                <IconCopy size={15} />
                APA 7 国际格式引用
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyCitation("brief")}>
                <IconCopy size={15} />
                公文简短出处说明
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Copy for AI */}
          <button
            type="button"
            data-testid={`copy-for-ai-${statistic.statistic_id}`}
            onClick={() => void handleCopyForAi()}
            className="inline-flex cursor-pointer items-center gap-1 border border-brand-navy bg-surface px-2.5 py-1 caption font-semibold text-brand-navy hover:bg-info-bg focus-ring"
          >
            {copiedFeedback === "ai" ? (
              <>
                <IconCheck size={14} aria-hidden="true" />
                已复制 AI 数据包
              </>
            ) : (
              <>
                <IconSparkles size={14} aria-hidden="true" />
                Copy for AI
              </>
            )}
          </button>

          {/* 多格式导出 DropdownMenu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={exportBusy !== null}
                className="inline-flex cursor-pointer items-center gap-1 border border-brand-navy bg-brand-navy px-2.5 py-1 caption font-semibold text-on-brand hover:bg-brand-navy-deep disabled:cursor-not-allowed disabled:opacity-60 focus-ring"
              >
                <IconDownload size={14} aria-hidden="true" />
                {exportBusy === "xlsx"
                  ? "生成 Excel..."
                  : exportBusy === "pptx"
                    ? "生成 PPT..."
                    : exportBusy === "png"
                      ? "导出 PNG..."
                      : "导出"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel>图像导出（固定白底出版级）</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  exportStatisticFigureSvg(statistic, effectiveViewState, {
                    preset: "publication",
                    eyebrow: resolvedEyebrow,
                  })
                }
              >
                <IconDownload size={15} />
                出版物 SVG
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  exportStatisticFigureSvg(statistic, effectiveViewState, {
                    preset: "bare",
                    eyebrow: resolvedEyebrow,
                  })
                }
              >
                <IconDownload size={15} />
                纯图 SVG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportPng()}>
                <IconPhoto size={15} />
                高清 PNG (2x)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>底稿与演示文稿导出</DropdownMenuLabel>
              <DropdownMenuItem onSelect={handleExportCsv}>
                <IconFileSpreadsheet size={15} />
                CSV 数据
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportXlsx()}>
                <IconFileSpreadsheet size={15} />
                Excel 底稿 (4-Sheet .xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExportPptx()}>
                <IconPresentation size={15} />
                可编辑 PPT (.pptx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportJson}>
                <IconFileCode size={15} />
                JSON 快照
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </figcaption>
    </figure>
  );
}
