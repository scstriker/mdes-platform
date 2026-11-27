import type { Statistic, StatisticViewState } from "@mdes/shared";
import { downloadText } from "@/lib/download";
import { echarts, type ChartOption } from "../echarts";
import { buildFigureCardSvg, escapeXml } from "../figure-svg";
import { PUBLICATION_FONT_SANS, PUBLICATION_LIGHT_THEME } from "../publication-theme";
import { buildStatisticChartOption } from "../templates";
import type { ChartTheme } from "../theme";

export type SvgExportPreset = "publication" | "bare";

export type OffscreenFigureMeta = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  source: string;
  note?: string;
  preset?: SvgExportPreset;
  chartWidth?: number;
  exportHeight?: number;
};

export type OptionFigureExportInput = OffscreenFigureMeta & {
  option: (theme: ChartTheme) => ChartOption;
};

export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractInnerSvgMarkup(rawSvg: string): string {
  const withoutXmlDecl = rawSvg.replace(/^<\?xml[^>]*\?>\s*/i, "").trim();
  const match = /^<svg[^>]*>([\s\S]*?)<\/svg>\s*$/i.exec(withoutXmlDecl);
  return match ? match[1]! : withoutXmlDecl;
}

function parseSvgDimensions(svgString: string, fallbackW: number, fallbackH: number): { width: number; height: number } {
  const openTagMatch = /<svg\b[^>]*>/i.exec(svgString);
  const openTag = openTagMatch ? openTagMatch[0] : "";
  const widthMatch = /\bwidth="([\d.]+)"/i.exec(openTag);
  const heightMatch = /\bheight="([\d.]+)"/i.exec(openTag);
  const width = widthMatch ? Number.parseFloat(widthMatch[1]!) : fallbackW;
  const height = heightMatch ? Number.parseFloat(heightMatch[1]!) : fallbackH;
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : fallbackW,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : fallbackH,
  };
}

/**
 * 离屏无头渲染确定性浅色 SVG：不依赖 DOM 挂载状态，深色模式或数据表模式下仍输出纯净白底出版物图卡
 */
export function renderOffscreenOptionSvg(input: OptionFigureExportInput): string {
  const chartWidth = Math.max(480, Math.round(input.chartWidth ?? 920));
  const exportHeight = Math.max(200, Math.round(input.exportHeight ?? 400));
  const preset = input.preset ?? "publication";

  const builtOption = input.option(PUBLICATION_LIGHT_THEME);
  const chart = echarts.init(null, null, {
    renderer: "svg",
    ssr: true,
    width: chartWidth,
    height: exportHeight,
    locale: "ZH",
  });

  let rawChartSvg = "";
  try {
    chart.setOption({
      ...builtOption,
      textStyle: {
        ...(builtOption.textStyle ?? {}),
        fontFamily: PUBLICATION_FONT_SANS,
        color: PUBLICATION_LIGHT_THEME.ink,
      },
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
    });
    rawChartSvg = chart.renderToSVGString({ useViewBox: true });
  } finally {
    chart.dispose();
  }

  const innerSvgContent = extractInnerSvgMarkup(rawChartSvg);
  const viewBox = `0 0 ${chartWidth} ${exportHeight}`;

  if (preset === "bare") {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${exportHeight}" viewBox="${viewBox}" role="img" aria-label="${escapeXml(input.title)}">`,
      `  <title>${escapeXml(input.title)}</title>`,
      `  <rect x="0" y="0" width="${chartWidth}" height="${exportHeight}" fill="${escapeXml(PUBLICATION_LIGHT_THEME.surface)}" />`,
      `  ${innerSvgContent}`,
      `</svg>`,
    ].join("\n");
  }

  return buildFigureCardSvg({
    innerSvgContent,
    chartWidth,
    chartHeight: exportHeight,
    viewBox,
    eyebrow: input.eyebrow,
    title: input.title,
    subtitle: input.subtitle,
    badgeLabel: input.badgeLabel,
    source: input.source,
    note: input.note,
    theme: PUBLICATION_LIGHT_THEME,
  });
}

export function renderStatisticSvg(
  stat: Statistic,
  viewState: StatisticViewState = {},
  opts: {
    preset?: SvgExportPreset;
    chartWidth?: number;
    exportHeight?: number;
    eyebrow?: string;
  } = {},
): string {
  const { option, projected } = buildStatisticChartOption(stat, viewState, PUBLICATION_LIGHT_THEME);
  const firstSource = stat.sources[0];
  const sourceLine = firstSource
    ? `${firstSource.organization}《${firstSource.document_title}》${firstSource.page_or_section ? `（${firstSource.page_or_section}）` : ""} · 版本 v${stat.version}`
    : `MDES 医疗器械产业数据平台 · 版本 v${stat.version}`;

  const noteParts: string[] = [stat.methodology.definition];
  if (stat.methodology.methodology_breaks.length > 0) {
    noteParts.push(
      `口径变更：${stat.methodology.methodology_breaks.map((b) => `${b.effective_period} ${b.short_label}`).join("；")}`,
    );
  }
  const badgeText = `${stat.summary_kpi.period} ${stat.summary_kpi.headline_value}${stat.summary_kpi.headline_value.endsWith("%") ? "" : ` ${stat.summary_kpi.unit}`}`;

  return renderOffscreenOptionSvg({
    option: () => option,
    eyebrow: opts.eyebrow ?? `${stat.statistic_id} · V3 指标 ${stat.indicator_refs.v3_seqs.join("/")}`,
    title: projected.title,
    subtitle: projected.subtitle,
    badgeLabel: badgeText.trim(),
    source: sourceLine,
    note: noteParts.join(" "),
    preset: opts.preset ?? "publication",
    chartWidth: opts.chartWidth ?? 920,
    exportHeight: opts.exportHeight ?? 400,
  });
}

/**
 * 将矢量 SVG 字符串栅格化为 2x 高分屏 PNG Blob（注入系统 CJK 安全字体栈）
 */
export async function rasterizeSvgToPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const { width, height } = parseSvgDimensions(svgString, 968, 560);
  const pixelRatio = Math.max(1, scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("当前运行环境不支持 Canvas 2D 栅格化");
  }

  ctx.fillStyle = PUBLICATION_LIGHT_THEME.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve();
      };
      img.onerror = () => reject(new Error("SVG 图像解码失败"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG Blob 编码失败"));
    }, "image/png");
  });
}

export function exportOptionFigureSvg(input: OptionFigureExportInput & { filename: string }): string {
  const svg = renderOffscreenOptionSvg(input);
  downloadText(input.filename, svg, "image/svg+xml;charset=utf-8");
  return svg;
}

export async function exportOptionFigurePng(
  input: OptionFigureExportInput & { filename: string; scale?: number },
): Promise<Blob> {
  const svg = renderOffscreenOptionSvg(input);
  const blob = await rasterizeSvgToPngBlob(svg, input.scale ?? 2);
  downloadBlob(input.filename, blob);
  return blob;
}

export function exportStatisticFigureSvg(
  stat: Statistic,
  viewState: StatisticViewState = {},
  opts: { preset?: SvgExportPreset; filename?: string; eyebrow?: string } = {},
): string {
  const preset = opts.preset ?? "publication";
  const suffix = preset === "bare" ? "-bare" : "";
  const filename = opts.filename ?? `${stat.slug || stat.statistic_id}-v${stat.version}${suffix}.svg`;
  const svg = renderStatisticSvg(stat, viewState, { preset, eyebrow: opts.eyebrow });
  downloadText(filename, svg, "image/svg+xml;charset=utf-8");
  return svg;
}

export async function exportFigurePng(
  stat: Statistic,
  viewState: StatisticViewState = {},
  opts: { preset?: SvgExportPreset; scale?: number; filename?: string; eyebrow?: string } = {},
): Promise<Blob> {
  const preset = opts.preset ?? "publication";
  const filename = opts.filename ?? `${stat.slug || stat.statistic_id}-v${stat.version}-2x.png`;
  const svg = renderStatisticSvg(stat, viewState, { preset, eyebrow: opts.eyebrow });
  const blob = await rasterizeSvgToPngBlob(svg, opts.scale ?? 2);
  downloadBlob(filename, blob);
  return blob;
}
