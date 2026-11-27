import type { TradeOverviewPublished } from "./types";

/**
 * OECD SDMX CL_OBS_STATUS 观测点状态码：
 * - A: Actual 历史实际值（默认，传输层可省略）
 * - E: Estimate 估算值
 * - F: Forecast 预测值（冻结 forecast_as_of 时点，历史预测永不自动转正）
 * - P: Provisional / Partial 非完整期间或初步累计值（如 2026Q1-Q3、2026-YTD-10）
 */
export type ObsStatus = "A" | "E" | "F" | "P";

export type ChartTypeId =
  | "line"
  | "bar"
  | "horizontal_bar"
  | "stacked_bar"
  | "stacked_bar_100"
  | "grouped_bar"
  | "area"
  | "pie"
  | "scatter";

export type TemplateType =
  | "time_series"
  | "growth_rate"
  | "entity_ranking"
  | "grouped_comparison"
  | "structure_change"
  | "share_composition"
  | "multi_entity_benchmark";

export type MetricModeKey = "absolute" | "yoy_growth" | "share_pct";

export type MethodologyBreak = {
  effective_period: string;
  short_label: string;
  explanation: string;
  comparability: "non_comparable" | "adjusted" | "expanded_scope";
  reference_href?: string;
};

export type StatisticSourceRef = {
  organization: string;
  document_title: string;
  page_or_section?: string;
  source_published_at?: string;
  document_id?: string;
  source_url?: string;
};

/**
 * OWID 列式序列定义：与 dataset.periods 等长对齐，体积较行对象缩减 60%–75%
 */
export type StatisticSeries = {
  key: string;
  label: string;
  unit: string;
  geo?: string;
  dims?: Record<string, string>;
  drill_href?: string;
  /** 与 periods 等长；null 代表缺失，禁止用 0 顶替缺失 */
  values: (number | null)[];
  /** 可选，省略时全点位视为 "A"（实际值） */
  status?: ObsStatus[];
  /** 当点位为 "F" 或 "E" 时记录作出预测/估算的冻结年月，如 "2025-12" */
  forecast_as_of?: (string | null)[];
};

export type StatisticDataset = {
  /** 横轴期间（如 ["2021","2022",...]）或横向对比分类标签（如各省市/企业名） */
  periods: string[];
  /** 首列标题，默认 "期间"（排名/分类图可设为 "省市"、"企业" 等） */
  period_label?: string;
  /** 可选逐项下钻链接（用于单序列对象排名如省域/企业/税号排行） */
  item_drill_hrefs?: (string | null)[];
  /** 可选分母补充列（如“每百家企业有效证数”对应的生产企业数分母） */
  denominators?: {
    label: string;
    unit: string;
    values: (number | null)[];
  };
  series: StatisticSeries[];
};

export type StatisticSummaryKpi = {
  headline_value: string;
  unit: string;
  period: string;
  delta_label?: string;
  sparkline?: number[];
};

export type StatisticDimensionMeta = {
  key: string;
  label: string;
  values: string[];
  filterable: boolean;
};

export type MetricModeSpec = {
  key: MetricModeKey;
  label: string;
  title_override: string;
  subtitle_override: string;
  unit: string;
};

export type ReferenceLineSpec = {
  value: number;
  label: string;
  tone?: "info" | "warning";
};

export type Statistic = {
  statistic_id: string;
  slug: string;
  version: string;
  content_hash: string;
  published_at: string;
  indicator_refs: {
    v3_seqs: string[];
    v12_codes?: string[];
  };
  entity_refs: {
    enterprises?: string[];
    product_categories?: string[];
    product_models?: string[];
    hs_codes?: string[];
    regions?: string[];
    standards?: string[];
  };
  topic_tags: string[];
  title: string;
  subtitle: string;
  insight: string;
  summary_kpi: StatisticSummaryKpi;
  template_type: TemplateType;
  dimensions: StatisticDimensionMeta[];
  dataset: StatisticDataset;
  visualization: {
    default_chart_type: ChartTypeId;
    allowed_chart_types: ChartTypeId[];
    zero_baseline: boolean;
    default_sort?: "none" | "desc" | "asc";
    default_show_labels: boolean;
    metric_modes?: MetricModeSpec[];
    reference_lines?: ReferenceLineSpec[];
  };
  methodology: {
    definition: string;
    formula?: string;
    denominator_note?: string;
    base_period_note?: string;
    methodology_breaks: MethodologyBreak[];
    prohibited_inferences: string[];
  };
  sources: StatisticSourceRef[];
  coverage: {
    time_span: string;
    geographic_scope: string;
    sample_scope: string;
    limitations?: string;
  };
  related_statistic_ids: string[];
};

export type StatisticListItem = {
  statistic_id: string;
  slug: string;
  version: string;
  latest_version: string;
  content_hash: string;
  published_at: string;
  title: string;
  subtitle: string;
  insight: string;
  template_type: TemplateType;
  topic_tags: string[];
  v3_seqs: string[];
  entity_refs: Statistic["entity_refs"];
  summary_kpi: StatisticSummaryKpi;
  source_org: string;
  has_forecast: boolean;
  has_methodology_break: boolean;
};

export type StatisticVersionEntry = {
  version: string;
  content_hash: string;
  published_at: string;
};

export type StatisticVersionsResponse = {
  statistic_id: string;
  latest_version: string;
  items: StatisticVersionEntry[];
};

export type StatisticDetailResponse = {
  statistic: Statistic;
  latest_version: string;
  is_historical_version: boolean;
  related: StatisticListItem[];
};

export type StatisticListQuery = {
  q?: string;
  topic?: string;
  v3_seq?: string;
  entity?: string;
  has_forecast?: boolean;
  has_break?: boolean;
  limit?: number;
  offset?: number;
};

export type StatisticListPage = {
  items: StatisticListItem[];
  total: number;
  limit: number;
  offset: number;
};

/** 视图状态：用于图表、数据表、离屏导出与 URL 查询参数同源投影 */
export type StatisticViewState = {
  chartType?: ChartTypeId;
  metricMode?: MetricModeKey;
  sort?: "none" | "desc" | "asc";
  periodFrom?: string;
  periodTo?: string;
  selectedSeriesKeys?: string[];
  showLabels?: boolean;
  hiddenLabelCoords?: string[];
  maxPlottedSeries?: number;
};

export type ProjectedPoint = {
  period: string;
  value: number | null;
  raw_value: number | null;
  status: ObsStatus;
  status_label: string;
  forecast_as_of: string | null;
  drill_href?: string;
};

export type ProjectedSeries = {
  key: string;
  label: string;
  unit: string;
  plotted: boolean;
  drill_href?: string;
  points: ProjectedPoint[];
};

export type ProjectedTableRow = {
  period: string;
  series_key: string;
  series_label: string;
  value: number | null;
  formatted_value: string;
  unit: string;
  status: ObsStatus;
  status_label: string;
  denominator_text?: string;
  plotted: boolean;
  note?: string;
};

export type ProjectedStatisticView = {
  title: string;
  subtitle: string;
  unit: string;
  chartType: ChartTypeId;
  metricMode: MetricModeKey;
  zeroBaseline: boolean;
  periodLabel: string;
  periods: string[];
  plottedSeries: ProjectedSeries[];
  unplottedSeries: ProjectedSeries[];
  allSeries: ProjectedSeries[];
  tableRows: ProjectedTableRow[];
  methodologyBreaks: MethodologyBreak[];
  referenceLines: ReferenceLineSpec[];
};

export function describeObsStatus(status: ObsStatus, forecastAsOf?: string | null): string {
  switch (status) {
    case "F":
      return forecastAsOf ? `预测值（截至 ${forecastAsOf} 预测）` : "预测值";
    case "E":
      return forecastAsOf ? `估算值（截至 ${forecastAsOf} 估算）` : "估算值";
    case "P":
      return "非完整期累计";
    default:
      return "实际值";
  }
}

export function formatStatNumber(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const decimals = unit.includes("%") || unit.includes("百分点") || unit.includes("亿") ? 2 : Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: Number.isInteger(value) && decimals === 0 ? 0 : Math.min(decimals, 2),
    maximumFractionDigits: 2,
  });
}

export function resolveAllowedChartType(stat: Statistic, requested?: ChartTypeId): ChartTypeId {
  if (requested && stat.visualization.allowed_chart_types.includes(requested)) {
    return requested;
  }
  return stat.visualization.default_chart_type;
}

/**
 * 客户端单一事实源投影：确保 ECharts 图表、原地数据表、CSV、4-Sheet XLSX、原生 PPTX 与 Copy for AI 100% 数值一致
 */
export function projectStatisticView(stat: Statistic, state: StatisticViewState = {}): ProjectedStatisticView {
  const chartType = resolveAllowedChartType(stat, state.chartType);
  const requestedMode = state.metricMode ?? "absolute";
  const modeSpec = stat.visualization.metric_modes?.find((m) => m.key === requestedMode);
  const metricMode: MetricModeKey = modeSpec ? modeSpec.key : "absolute";

  const title = modeSpec ? modeSpec.title_override : stat.title;
  const subtitle = modeSpec ? modeSpec.subtitle_override : stat.subtitle;
  const fallbackUnit = stat.dataset.series[0]?.unit ?? "";
  const activeUnit = modeSpec ? modeSpec.unit : fallbackUnit;

  // 1. 期间切片索引
  const allPeriods = stat.dataset.periods;
  let indices = allPeriods.map((_, idx) => idx);
  if (state.periodFrom || state.periodTo) {
    indices = indices.filter((idx) => {
      const p = allPeriods[idx]!;
      if (state.periodFrom && p < state.periodFrom) return false;
      if (state.periodTo && p > state.periodTo) return false;
      return true;
    });
    if (indices.length === 0) {
      indices = allPeriods.map((_, idx) => idx);
    }
  }

  // 不可比口径变更集合：跨不可比断点时不强算同比增速
  const nonComparablePeriods = new Set(
    stat.methodology.methodology_breaks
      .filter((b) => b.comparability === "non_comparable")
      .map((b) => b.effective_period),
  );

  // 2. 过滤选中序列
  const candidateSeries =
    state.selectedSeriesKeys && state.selectedSeriesKeys.length > 0
      ? stat.dataset.series.filter((s) => state.selectedSeriesKeys!.includes(s.key))
      : stat.dataset.series;
  const effectiveSeries = candidateSeries.length > 0 ? candidateSeries : stat.dataset.series;

  // 3. 计算全周期派生值（先在全量时间轴算同比/占比，再按 indices 截取）
  const periodSums = allPeriods.map((_, pIdx) =>
    effectiveSeries.reduce((acc, s) => {
      const v = s.values[pIdx];
      return v !== null && v !== undefined && Number.isFinite(v) ? acc + v : acc;
    }, 0),
  );

  const derivedBySeries = effectiveSeries.map((s) => {
    const unit = modeSpec ? modeSpec.unit : s.unit;
    const fullPoints: ProjectedPoint[] = allPeriods.map((period, pIdx) => {
      const rawVal = s.values[pIdx] ?? null;
      const st: ObsStatus = s.status?.[pIdx] ?? "A";
      const asOf = s.forecast_as_of?.[pIdx] ?? null;
      let val: number | null = rawVal;

      if (metricMode === "yoy_growth") {
        if (pIdx === 0 || nonComparablePeriods.has(period)) {
          val = null;
        } else {
          const prev = s.values[pIdx - 1] ?? null;
          if (rawVal === null || prev === null || prev === 0) {
            val = null;
          } else {
            val = Math.round(((rawVal - prev) / Math.abs(prev)) * 10000) / 100;
          }
        }
      } else if (metricMode === "share_pct") {
        const sum = periodSums[pIdx] ?? 0;
        val = rawVal === null || sum <= 0 ? null : Math.round((rawVal / sum) * 10000) / 100;
      }

      const drillHref = stat.dataset.item_drill_hrefs?.[pIdx] ?? s.drill_href;
      return {
        period,
        value: val,
        raw_value: rawVal,
        status: st,
        status_label: describeObsStatus(st, asOf),
        forecast_as_of: asOf,
        drill_href: drillHref ?? undefined,
      };
    });
    return { meta: s, unit, fullPoints };
  });

  // 4. 针对单序列排名/分类比较支持按值排序
  const sortOrder = state.sort ?? stat.visualization.default_sort ?? "none";
  let orderedIndices = [...indices];
  const canSortCrossSection =
    sortOrder !== "none" &&
    (stat.template_type === "entity_ranking" ||
      stat.template_type === "share_composition" ||
      (derivedBySeries.length === 1 && chartType === "horizontal_bar"));

  if (canSortCrossSection && derivedBySeries.length > 0) {
    const primary = derivedBySeries[0]!.fullPoints;
    orderedIndices.sort((a, b) => {
      const va = primary[a]?.value ?? Number.NEGATIVE_INFINITY;
      const vb = primary[b]?.value ?? Number.NEGATIVE_INFINITY;
      return sortOrder === "desc" ? vb - va : va - vb;
    });
  }

  // 5. 多序列折线/分组比较强制执行 Top 5 绘制上限（ADR-002），超出序列保留在数据表并标注「未画出」
  const maxSeries = state.maxPlottedSeries ?? 5;
  let rankedSeries = [...derivedBySeries];
  if (rankedSeries.length > maxSeries) {
    const lastIdx = orderedIndices[orderedIndices.length - 1] ?? 0;
    rankedSeries.sort((a, b) => {
      const va = a.fullPoints[lastIdx]?.value ?? Number.NEGATIVE_INFINITY;
      const vb = b.fullPoints[lastIdx]?.value ?? Number.NEGATIVE_INFINITY;
      return vb - va;
    });
  }

  const periods = orderedIndices.map((idx) => allPeriods[idx]!);
  const allSeries: ProjectedSeries[] = rankedSeries.map((entry, sIdx) => ({
    key: entry.meta.key,
    label: entry.meta.label,
    unit: entry.unit,
    plotted: sIdx < maxSeries,
    drill_href: entry.meta.drill_href,
    points: orderedIndices.map((pIdx) => entry.fullPoints[pIdx]!),
  }));

  const plottedSeries = allSeries.filter((s) => s.plotted);
  const unplottedSeries = allSeries.filter((s) => !s.plotted);

  const periodLabel = stat.dataset.period_label ?? "期间";
  const denoms = stat.dataset.denominators;

  const tableRows: ProjectedTableRow[] = [];
  for (let pPos = 0; pPos < orderedIndices.length; pPos++) {
    const origIdx = orderedIndices[pPos]!;
    const period = periods[pPos]!;
    const denomVal = denoms?.values[origIdx] ?? null;
    const denomText =
      denoms && denomVal !== null ? `${formatStatNumber(denomVal, denoms.unit)} ${denoms.unit}` : undefined;

    for (const s of allSeries) {
      const pt = s.points[pPos]!;
      tableRows.push({
        period,
        series_key: s.key,
        series_label: s.label,
        value: pt.value,
        formatted_value: formatStatNumber(pt.value, s.unit),
        unit: s.unit,
        status: pt.status,
        status_label: pt.status_label,
        denominator_text: denomText,
        plotted: s.plotted,
        note: s.plotted ? undefined : "超出 5 条序列上限，图表未画出",
      });
    }
  }

  const isBarLike =
    chartType === "bar" ||
    chartType === "horizontal_bar" ||
    chartType === "stacked_bar" ||
    chartType === "stacked_bar_100" ||
    chartType === "grouped_bar";

  const zeroBaseline = metricMode === "yoy_growth" ? true : isBarLike ? true : stat.visualization.zero_baseline;

  return {
    title,
    subtitle,
    unit: activeUnit,
    chartType,
    metricMode,
    zeroBaseline,
    periodLabel,
    periods,
    plottedSeries,
    unplottedSeries,
    allSeries,
    tableRows,
    methodologyBreaks: stat.methodology.methodology_breaks.filter((b) => periods.includes(b.effective_period)),
    referenceLines: metricMode === "absolute" ? (stat.visualization.reference_lines ?? []) : [],
  };
}

export function toStatisticListItem(stat: Statistic, latestVersion = stat.version): StatisticListItem {
  const hasForecast = stat.dataset.series.some((s) => s.status?.some((st) => st === "F" || st === "E"));
  return {
    statistic_id: stat.statistic_id,
    slug: stat.slug,
    version: stat.version,
    latest_version: latestVersion,
    content_hash: stat.content_hash,
    published_at: stat.published_at,
    title: stat.title,
    subtitle: stat.subtitle,
    insight: stat.insight,
    template_type: stat.template_type,
    topic_tags: stat.topic_tags,
    v3_seqs: stat.indicator_refs.v3_seqs,
    entity_refs: stat.entity_refs,
    summary_kpi: stat.summary_kpi,
    source_org: stat.sources.map((s) => s.organization).join("、"),
    has_forecast: hasForecast,
    has_methodology_break: stat.methodology.methodology_breaks.length > 0,
  };
}

export type CitationStyle = "gbt7714" | "apa7" | "brief";

export function formatStatisticCitation(
  stat: Statistic,
  style: CitationStyle,
  baseOrigin = "https://mdes-web.pages.dev",
  accessDate = stat.published_at.slice(0, 10),
): string {
  const pubDate = stat.published_at.slice(0, 10);
  const year = pubDate.slice(0, 4);
  const canonicalUrl = `${baseOrigin.replace(/\/$/, "")}/statistics/${encodeURIComponent(stat.statistic_id)}?v=${encodeURIComponent(stat.version)}`;
  const firstSource = stat.sources[0];

  if (style === "apa7") {
    return `ITEI. (${year}). ${stat.title} [Statistic, Version ${stat.version}]. MDES Platform. ${canonicalUrl}`;
  }
  if (style === "brief") {
    const srcPart = firstSource
      ? `${firstSource.organization}《${firstSource.document_title}》${firstSource.page_or_section ? `（${firstSource.page_or_section}）` : ""}`
      : "MDES 权威数据源";
    return `数据来源：${srcPart}，由机械工业仪器仪表综合技术经济研究所（MDES 平台，版本 ${stat.version}）整理发布。永久核验链接：${canonicalUrl}`;
  }
  return `机械工业仪器仪表综合技术经济研究所（ITEI）. ${stat.title} [DB/OL]. 医疗器械产业数据平台（MDES）, 版本 ${stat.version}, ${pubDate} [${accessDate}]. ${canonicalUrl}.`;
}

/**
 * 生成 9 要素齐全的结构化 Copy for AI Markdown 数据包（含明确禁止推断红线）
 */
export function buildCopyForAiMarkdown(
  stat: Statistic,
  state: StatisticViewState = {},
  baseOrigin = "https://mdes-web.pages.dev",
): string {
  const proj = projectStatisticView(stat, state);
  const canonicalUrl = `${baseOrigin.replace(/\/$/, "")}/statistics/${encodeURIComponent(stat.statistic_id)}?v=${encodeURIComponent(stat.version)}`;

  const lines: string[] = [
    `# ${proj.title}`,
    `> ${proj.subtitle}`,
    "",
    "## 1. 统计范围与当前筛选",
    `- **统计编号**：\`${stat.statistic_id}\`（发布版本：\`${stat.version}\`，发布时间：\`${stat.published_at.slice(0, 10)}\`）`,
    `- **关联指标**：V3 序号 \`${stat.indicator_refs.v3_seqs.join(", ")}\`${stat.indicator_refs.v12_codes?.length ? ` · V12 编码 \`${stat.indicator_refs.v12_codes.join(", ")}\`` : ""}`,
    `- **时间跨度**：${proj.periods[0] ?? ""} 至 ${proj.periods[proj.periods.length - 1] ?? ""}（原始覆盖：${stat.coverage.time_span}）`,
    `- **地域与样本范围**：${stat.coverage.geographic_scope} · ${stat.coverage.sample_scope}`,
    `- **计量单位**：${proj.unit}`,
    `- **永久引用地址**：${canonicalUrl}`,
    "",
    "## 2. 规范化统计数据表",
    `| ${proj.periodLabel} | 序列/对象 | 数值 | 单位 | 数据性质 |${stat.dataset.denominators ? ` ${stat.dataset.denominators.label} |` : ""}`,
    `| --- | --- | ---: | --- | --- |${stat.dataset.denominators ? " ---: |" : ""}`,
  ];

  for (const row of proj.tableRows) {
    lines.push(
      `| ${row.period} | ${row.series_label} | ${row.formatted_value} | ${row.unit} | ${row.status_label} |${stat.dataset.denominators ? ` ${row.denominator_text ?? "—"} |` : ""}`,
    );
  }

  lines.push(
    "",
    "## 3. 统计口径与计算规则",
    `- **定义**：${stat.methodology.definition}`,
  );
  if (stat.methodology.formula) {
    lines.push(`- **计算公式**：${stat.methodology.formula}`);
  }
  if (stat.methodology.denominator_note) {
    lines.push(`- **分母说明**：${stat.methodology.denominator_note}`);
  }

  if (stat.methodology.methodology_breaks.length > 0) {
    lines.push("", "## 4. 口径变更说明");
    for (const brk of stat.methodology.methodology_breaks) {
      lines.push(`- **${brk.effective_period}**（${brk.short_label}）：${brk.explanation}（可比性：\`${brk.comparability}\`）`);
    }
  }

  lines.push("", "## 5. 权威数据来源与原文定位");
  for (const src of stat.sources) {
    lines.push(
      `- ${src.organization}：《${src.document_title}》${src.page_or_section ? `，${src.page_or_section}` : ""}${src.source_url ? ` (${src.source_url})` : ""}`,
    );
  }

  lines.push("", "## 6. 使用限制与禁止推断红线（AI 写作必须严格遵守）");
  for (const rule of stat.methodology.prohibited_inferences) {
    lines.push(`- **禁止推断**：${rule}`);
  }

  return lines.join("\n");
}

/**
 * 将已发布海关贸易快照零拷贝适配为标准单项统计对象，供 /statistics、品类页与报告直接引用
 */
export function adaptTradeSnapshotToStatistics(snap: TradeOverviewPublished): Statistic[] {
  const pubVersion = `${snap.period}.${snap.releaseId.slice(0, 8)}`;
  const results: Statistic[] = [];

  if (snap.annualTrend.length > 0) {
    const periods = snap.annualTrend.map((p) => p.period);
    const statuses: ObsStatus[] = snap.annualTrend.map((p) => (p.isPartial ? "P" : "A"));
    results.push({
      statistic_id: "STAT-TRD-OVERALL-ANNUAL",
      slug: "china-medtech-customs-annual-scale",
      version: pubVersion,
      content_hash: `trd-annual-${snap.releaseId}`,
      published_at: `${snap.period.slice(0, 4)}-11-27T00:00:00Z`,
      indicator_refs: { v3_seqs: ["38"], v12_codes: ["TRD-001", "TRD-002"] },
      entity_refs: { regions: ["CN"] },
      topic_tags: ["overview", "trade"],
      title: "中国医疗器械海关进出口年度总额与顺逆差走势",
      subtitle: `中国海关 ${snap.dictVersion} 字典 164 项 HS8 汇总 · 单位：亿美元`,
      insight: snap.narrativeSummary.multiYearParagraph || snap.narrativeSummary.headline,
      summary_kpi: {
        headline_value: (snap.totals.totalUsd / 1e8).toFixed(2),
        unit: "亿美元",
        period: snap.period,
        delta_label:
          snap.totals.totalYoyPct !== null
            ? `同比 ${snap.totals.totalYoyPct >= 0 ? "+" : ""}${snap.totals.totalYoyPct.toFixed(2)}%`
            : undefined,
        sparkline: snap.annualTrend.map((p) => Math.round((p.totalUsd / 1e8) * 100) / 100),
      },
      template_type: "time_series",
      dimensions: [],
      dataset: {
        periods,
        period_label: "统计期",
        series: [
          {
            key: "export_usd_100m",
            label: "出口额",
            unit: "亿美元",
            values: snap.annualTrend.map((p) => Math.round((p.exportUsd / 1e8) * 100) / 100),
            status: statuses,
          },
          {
            key: "import_usd_100m",
            label: "进口额",
            unit: "亿美元",
            values: snap.annualTrend.map((p) => Math.round((p.importUsd / 1e8) * 100) / 100),
            status: statuses,
          },
        ],
      },
      visualization: {
        default_chart_type: "line",
        allowed_chart_types: ["line", "bar", "grouped_bar"],
        zero_baseline: true,
        default_show_labels: true,
        metric_modes: [
          {
            key: "absolute",
            label: "绝对规模",
            title_override: "中国医疗器械海关进出口年度总额走势",
            subtitle_override: `中国海关 ${snap.dictVersion} 字典 · 单位：亿美元`,
            unit: "亿美元",
          },
          {
            key: "yoy_growth",
            label: "年度同比",
            title_override: "中国医疗器械海关进出口年度同比增速",
            subtitle_override: "以相邻完整年度为比较基期 · 单位：%",
            unit: "%",
          },
        ],
      },
      methodology: {
        definition: "按中国海关统计在线查询平台 8 位商品编码（164 项医疗器械相关税号）美元值汇总。",
        methodology_breaks: [
          {
            effective_period: "2023",
            short_label: "2023起增设手术机器人税号",
            explanation: "2023 版税则新增 90189080（内窥镜辅助手术设备），2022 年适用税号为 163 项，2023 年起为 164 项。",
            comparability: "expanded_scope",
          },
        ],
        prohibited_inferences: [
          "海关报关进出口金额按货物跨境清关统计，严禁直接等同于国内终端市场销售额或上市企业境外合并营业收入。",
          "部分 8 位税号含通用零部件，严禁在无注册证/型号佐证时推断单一品牌市场占有率。",
        ],
      },
      sources: [
        {
          organization: "中华人民共和国海关总署",
          document_title: `海关统计数据在线查询平台（MDES 发布批次 ${snap.releaseId.slice(0, 8)}）`,
          page_or_section: `覆盖期间 ${snap.period}`,
          source_url: "http://stats.customs.gov.cn/",
        },
      ],
      coverage: {
        time_span: `${periods[0]} – ${periods[periods.length - 1]}`,
        geographic_scope: "中国大陆关境",
        sample_scope: `${snap.coverage.coveredHs8Count}/${snap.coverage.applicableHs8Count} 项适用 8 位 HS 税号`,
      },
      related_statistic_ids: ["STAT-TRD-MRI-HS8", "STAT-TRD-PARTNER-CR3"],
    });
  }

  return results;
}

// ==================== 一等公民目录实体与关系图谱契约 ====================

export type CatalogKind =
  | "model"
  | "registration"
  | "enterprise"
  | "institution"
  | "policy"
  | "standard"
  | "source"
  | "market_deal"
  | "technology"
  | "report";

export type UdiPackageSpec = {
  udi_di: string;
  package_level: string;
  quantity_per_pack: number;
  spec_note: string;
};

export type ModelParameterItem = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  source_label: string;
  source_url?: string;
};

export type ClinicalActivationItem = {
  hospital: string;
  city: string;
  activated_date: string;
  notice_date: string;
  summary: string;
  source_title: string;
  source_url: string;
};

export type ReportChapterSpec = {
  chapter_no: string;
  title: string;
  judgment: string;
  body: string;
  pinned_statistics: {
    statistic_id: string;
    version: string;
  }[];
  source_refs: {
    label: string;
    href: string;
  }[];
};

export type CatalogRecord = {
  id: string;
  kind: CatalogKind;
  slug: string;
  title: string;
  subtitle: string;
  /** 证书号、标准编号、政策文号、证券代码或项目编号 */
  code?: string;
  region?: string;
  period?: string;
  category?: string;
  /** 子分类或通道，如 reg / innov / priority / testing / gcp / rd / ashare / hk */
  subkind?: string;
  tags: string[];
  /** 旧版别名或历史废止/误写词（如 GB 9706.233-2020 -> YY 9706.233-2021），命中时返回纠偏提示 */
  legacy_aliases?: string[];
  summary_fields: { label: string; value: string; href?: string }[];
  detail: Record<string, unknown>;
  source_title: string;
  source_page?: string;
  source_url?: string;
  updated_at: string;
};

export type EntityRelation = {
  from_id: string;
  to_id: string;
  rel_type: string;
  note?: string;
};

export type CatalogQuery = {
  kind?: CatalogKind;
  q?: string;
  region?: string;
  period?: string;
  category?: string;
  subkind?: string;
  tag?: string;
  limit?: number;
  offset?: number;
};

export type CatalogPage = {
  items: CatalogRecord[];
  total: number;
  limit: number;
  offset: number;
  /** 当查询词命中 legacy_aliases 时返回的明确纠偏提示 */
  alias_correction?: {
    queried: string;
    canonical_code: string;
    canonical_title: string;
    canonical_slug: string;
    explanation: string;
  } | null;
};

export type CatalogDetailResponse = {
  record: CatalogRecord;
  related_records: CatalogRecord[];
  related_statistics: StatisticListItem[];
};

export type UnifiedSearchHit = {
  id: string;
  group: "statistics" | CatalogKind;
  title: string;
  subtitle: string;
  code?: string;
  region?: string;
  period?: string;
  href: string;
  source_label: string;
  alias_note?: string;
};

export function buildCatalogRecordHref(record: Pick<CatalogRecord, "kind" | "slug" | "code" | "title">): string {
  switch (record.kind) {
    case "model":
      return `/products/${encodeURIComponent(record.slug)}`;
    case "enterprise":
      return `/enterprises/${encodeURIComponent(record.slug)}`;
    case "report":
      return `/reports/${encodeURIComponent(record.slug)}`;
    case "registration":
      return `/regulation/registrations?q=${encodeURIComponent(record.code ?? record.slug)}`;
    case "standard":
      return `/standards?q=${encodeURIComponent(record.code ?? record.slug)}`;
    case "institution":
      return `/institutions?q=${encodeURIComponent(record.title)}`;
    case "policy":
      return `/policies?q=${encodeURIComponent(record.code ?? record.slug)}`;
    case "market_deal":
      return `/markets?q=${encodeURIComponent(record.code ?? record.slug)}`;
    case "technology":
      return `/technologies?q=${encodeURIComponent(record.slug)}`;
    case "source":
      return `/sources?q=${encodeURIComponent(record.code ?? record.slug)}`;
  }
}

export function normalizeAliasKey(raw: string): string {
  return raw.replace(/[\s\u3000]+/g, "").toLowerCase();
}

export function detectCatalogAliasCorrection(
  rawQuery: string | null | undefined,
  records: readonly CatalogRecord[],
): CatalogPage["alias_correction"] {
  const trimmed = rawQuery?.trim() ?? "";
  if (!trimmed) return null;
  const normQ = normalizeAliasKey(trimmed);
  if (!normQ) return null;

  for (const record of records) {
    const canonicalNorm = record.code ? normalizeAliasKey(record.code) : "";
    if (canonicalNorm && normQ === canonicalNorm) continue;
    for (const alias of record.legacy_aliases ?? []) {
      const normAlias = normalizeAliasKey(alias);
      if (!normAlias) continue;
      if (normQ === normAlias || (normAlias.length >= 6 && normQ.includes(normAlias))) {
        const notice =
          typeof record.detail?.correction_notice === "string" && record.detail.correction_notice.trim()
            ? record.detail.correction_notice.trim()
            : `检索词“${trimmed}”对应历史旧称或废止/误引编号，现行规范条目为 ${record.code ?? record.id}（${record.title}）。`;
        return {
          queried: trimmed,
          canonical_code: record.code ?? record.id,
          canonical_title: record.title,
          canonical_slug: record.slug,
          explanation: notice,
        };
      }
    }
  }
  return null;
}
