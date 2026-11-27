import { projectStatisticView, type Statistic, type StatisticViewState } from "@mdes/shared";
import {
  PUBLICATION_LIGHT_THEME,
  PUBLICATION_LIGHT_TOKENS,
  PUBLICATION_PPTX_FONT_FACE,
} from "../publication-theme";
import { buildShareCompositionSlices } from "../templates";
import { downloadBlob } from "./export-svg-png";

function stripHexPrefix(tokenColor: string): string {
  return (tokenColor.startsWith("#") ? tokenColor.slice(1) : tokenColor).toUpperCase();
}

/**
 * 生成 16:9 宽屏原生可编辑 OOXML 图表幻灯片（.pptx）：
 * 本模块仅通过动态 import() 按需加载，确保 pptxgenjs 与 jszip 不会进入首屏入口包。
 */
export async function buildPptxBlob(
  stat: Statistic,
  viewState: StatisticViewState = {},
): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const proj = projectStatisticView(stat, viewState);
  const showLabels = viewState.showLabels ?? stat.visualization.default_show_labels;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "机械工业仪器仪表综合技术经济研究所 (ITEI)";
  pptx.company = "MDES 医疗器械产业数据平台";
  pptx.subject = `${stat.statistic_id} v${stat.version}`;
  pptx.title = proj.title;
  pptx.theme = {
    headFontFace: PUBLICATION_PPTX_FONT_FACE,
    bodyFontFace: PUBLICATION_PPTX_FONT_FACE,
  };

  const navy = stripHexPrefix(PUBLICATION_LIGHT_THEME.brandNavy);
  const sky = stripHexPrefix(PUBLICATION_LIGHT_THEME.brandSky);
  const surface = stripHexPrefix(PUBLICATION_LIGHT_THEME.surface);
  const sunken = stripHexPrefix(PUBLICATION_LIGHT_THEME.surfaceSunken);
  const infoBg = stripHexPrefix(PUBLICATION_LIGHT_THEME.infoBg);
  const ink = stripHexPrefix(PUBLICATION_LIGHT_THEME.ink);
  const muted = stripHexPrefix(PUBLICATION_LIGHT_THEME.muted);
  const border = stripHexPrefix(PUBLICATION_LIGHT_THEME.border);
  const seriesPalette = [
    ...PUBLICATION_LIGHT_THEME.series.map(stripHexPrefix),
    stripHexPrefix(PUBLICATION_LIGHT_THEME.borderStrong),
  ];

  const slide = pptx.addSlide();
  slide.background = { color: surface };

  // 1. 顶部 ITEI 深蓝标尺线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.055,
    fill: { color: navy },
    line: { type: "none" },
  });

  // 2. 眉标 + 主标题 + 量纲副标题
  slide.addText(`${stat.statistic_id} · V3-${stat.indicator_refs.v3_seqs.join("/")} · 版本 v${stat.version}`, {
    x: 0.42,
    y: 0.14,
    w: 6.9,
    h: 0.22,
    fontFace: PUBLICATION_PPTX_FONT_FACE,
    fontSize: 9,
    bold: true,
    color: navy,
    margin: 0,
  });

  slide.addText(proj.title, {
    x: 0.42,
    y: 0.36,
    w: 6.9,
    h: 0.38,
    fontFace: PUBLICATION_PPTX_FONT_FACE,
    fontSize: 15,
    bold: true,
    color: ink,
    margin: 0,
  });

  slide.addText(proj.subtitle, {
    x: 0.42,
    y: 0.74,
    w: 6.9,
    h: 0.24,
    fontFace: PUBLICATION_PPTX_FONT_FACE,
    fontSize: 10,
    color: muted,
    margin: 0,
  });

  // 3. 右上角核心 KPI 徽标框
  const kpiValueText = stat.summary_kpi.headline_value.endsWith("%")
    ? stat.summary_kpi.headline_value
    : `${stat.summary_kpi.headline_value} ${stat.summary_kpi.unit}`;

  slide.addShape(pptx.ShapeType.rect, {
    x: 7.45,
    y: 0.18,
    w: 2.13,
    h: 0.76,
    fill: { color: infoBg },
    line: { color: border, width: 0.75 },
  });

  slide.addText(
    [
      {
        text: `${stat.summary_kpi.period}\n`,
        options: { fontSize: 8.5, color: muted, bold: false },
      },
      {
        text: kpiValueText,
        options: { fontSize: 14, color: navy, bold: true },
      },
    ],
    {
      x: 7.52,
      y: 0.22,
      w: 1.99,
      h: 0.68,
      fontFace: PUBLICATION_PPTX_FONT_FACE,
      align: "right",
      valign: "middle",
      margin: 0,
    },
  );

  // Header 下分割线
  slide.addShape(pptx.ShapeType.line, {
    x: 0.42,
    y: 1.04,
    w: 9.16,
    h: 0,
    line: { color: border, width: 0.75 },
  });

  // 4. 原生可编辑 OOXML 图表区
  const activeChartType = proj.chartType;
  if (activeChartType === "pie") {
    const slices = buildShareCompositionSlices(proj);
    slide.addChart(
      pptx.ChartType.pie,
      [
        {
          name: proj.plottedSeries[0]?.label ?? proj.title,
          labels: slices.map((s) => s.name),
          values: slices.map((s) => s.value),
        },
      ],
      {
        x: 0.45,
        y: 1.14,
        w: 9.1,
        h: 3.74,
        chartColors: slices.map((_, idx) => seriesPalette[idx % seriesPalette.length]!),
        showLegend: true,
        legendPos: "r",
        legendFontFace: PUBLICATION_PPTX_FONT_FACE,
        legendFontSize: 9.5,
        legendColor: ink,
        showValue: showLabels,
        showLabel: false,
        dataLabelFontFace: PUBLICATION_PPTX_FONT_FACE,
        dataLabelFontSize: 9,
        dataLabelColor: ink,
      },
    );
  } else {
    const chartData = proj.plottedSeries.map((s) => ({
      name: s.label,
      labels: [...proj.periods],
      values: s.points.map((pt) => (typeof pt.value === "number" && Number.isFinite(pt.value) ? pt.value : 0)),
    }));

    const pptChartType =
      activeChartType === "line" || activeChartType === "scatter"
        ? pptx.ChartType.line
        : activeChartType === "area"
          ? pptx.ChartType.area
          : pptx.ChartType.bar;

    const barDir = activeChartType === "horizontal_bar" ? "bar" : "col";
    const barGrouping =
      activeChartType === "stacked_bar"
        ? "stacked"
        : activeChartType === "stacked_bar_100"
          ? "percentStacked"
          : "clustered";

    const isGrowth = stat.template_type === "growth_rate" || proj.metricMode === "yoy_growth";

    slide.addChart(pptChartType, chartData, {
      x: 0.45,
      y: 1.14,
      w: 9.1,
      h: 3.74,
      chartColors: proj.plottedSeries.map((_, idx) => seriesPalette[idx % seriesPalette.length]!),
      ...(isGrowth ? { invertedColors: [stripHexPrefix(PUBLICATION_LIGHT_TOKENS["chart-4"])] } : {}),
      ...(pptChartType === pptx.ChartType.bar ? { barDir, barGrouping, barGapWidthPct: 90 } : {}),
      ...(pptChartType === pptx.ChartType.line ? { lineSize: 2.25, lineDataSymbol: "circle", lineDataSymbolSize: 6 } : {}),
      showLegend: proj.plottedSeries.length > 1,
      legendPos: "t",
      legendFontFace: PUBLICATION_PPTX_FONT_FACE,
      legendFontSize: 9.5,
      legendColor: ink,
      showValue: showLabels,
      dataLabelFontFace: PUBLICATION_PPTX_FONT_FACE,
      dataLabelFontSize: 8.5,
      dataLabelColor: ink,
      catAxisLabelFontFace: PUBLICATION_PPTX_FONT_FACE,
      catAxisLabelFontSize: 9,
      catAxisLabelColor: muted,
      catAxisLineColor: sky,
      catGridLine: { style: "none" },
      valAxisLabelFontFace: PUBLICATION_PPTX_FONT_FACE,
      valAxisLabelFontSize: 9,
      valAxisLabelColor: muted,
      valAxisLineShow: false,
      valGridLine: { color: border, style: "dash", size: 0.75 },
    });
  }

  // 5. 底部数据来源、版本与红线提示条
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.02,
    w: 10,
    h: 0.605,
    fill: { color: sunken },
    line: { color: border, width: 0.5 },
  });

  const firstSource = stat.sources[0];
  const sourceLine = firstSource
    ? `数据来源：${firstSource.organization}《${firstSource.document_title}》${firstSource.page_or_section ? `（${firstSource.page_or_section}）` : ""} · MDES 版本 v${stat.version}`
    : `数据来源：MDES 医疗器械产业数据平台 · 版本 v${stat.version}`;
  const cautionLine = stat.methodology.prohibited_inferences[0]
    ? `口径红线：${stat.methodology.prohibited_inferences[0]}`
    : `统计口径：${stat.methodology.definition}`;

  slide.addText(`${sourceLine}\n${cautionLine}`, {
    x: 0.42,
    y: 5.07,
    w: 9.16,
    h: 0.5,
    fontFace: PUBLICATION_PPTX_FONT_FACE,
    fontSize: 8,
    color: muted,
    valign: "middle",
    margin: 0,
  });

  const rawOutput = await pptx.write({ outputType: "blob" });
  if (rawOutput instanceof Blob) {
    return rawOutput;
  }
  return new Blob([rawOutput as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

export async function exportStatisticPptx(
  stat: Statistic,
  viewState: StatisticViewState = {},
  filename?: string,
): Promise<Blob> {
  const blob = await buildPptxBlob(stat, viewState);
  const targetName = filename ?? `${stat.slug || stat.statistic_id}-v${stat.version}.pptx`;
  downloadBlob(targetName, blob);
  return blob;
}
