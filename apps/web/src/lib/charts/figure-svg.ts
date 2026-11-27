import type { ChartTheme } from "./theme";

export type FigureSvgTheme = Pick<
  ChartTheme,
  "brandNavy" | "infoBg" | "surfaceSunken" | "ink" | "muted" | "border" | "surface" | "fontFamily"
>;

export type FigureSvgComposeOptions = {
  innerSvgContent: string;
  chartWidth: number;
  chartHeight: number;
  viewBox?: string | null;
  eyebrow?: string;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  source: string;
  note?: string;
  theme: FigureSvgTheme;
};

export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function charVisualUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  return code <= 0x00ff ? 0.56 : 1;
}

function measureVisualUnits(text: string): number {
  let sum = 0;
  for (const ch of text) {
    sum += charVisualUnits(ch);
  }
  return sum;
}

/**
 * 按视觉字宽对中英混排标题、副标题与来源注释自动折行，防止长文本超出 SVG 画布边界。
 */
export function wrapSvgText(raw: string, maxUnits: number): string[] {
  const clean = raw.trim();
  if (!clean) return [];
  const limit = Math.max(10, maxUnits);
  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (const ch of clean) {
    const w = charVisualUnits(ch);
    if (units + w > limit && current.length > 0) {
      lines.push(current.trimEnd());
      current = ch === " " ? "" : ch;
      units = ch === " " ? 0 : w;
    } else {
      current += ch;
      units += w;
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }
  return lines;
}

export function extractInnerSvgPayload(svg: SVGSVGElement, fallbackHeight: number) {
  const rect = svg.getBoundingClientRect();
  const attrW = Number.parseFloat(svg.getAttribute("width") ?? "");
  const attrH = Number.parseFloat(svg.getAttribute("height") ?? "");
  const vb = svg.getAttribute("viewBox");
  const vbParts = vb ? vb.trim().split(/[\s,]+/).map(Number) : [];

  const chartWidth =
    (Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 0) ||
    (Number.isFinite(attrW) && attrW > 0 ? attrW : 0) ||
    (vbParts.length === 4 && vbParts[2] > 0 ? vbParts[2] : 640);

  const chartHeight =
    (Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 0) ||
    (Number.isFinite(attrH) && attrH > 0 ? attrH : 0) ||
    (vbParts.length === 4 && vbParts[3] > 0 ? vbParts[3] : fallbackHeight);

  return {
    innerSvgContent: svg.innerHTML,
    chartWidth: Math.round(chartWidth),
    chartHeight: Math.round(chartHeight),
    viewBox: vb || `0 0 ${Math.round(chartWidth)} ${Math.round(chartHeight)}`,
  };
}

/**
 * 将 StatistaFigure 的图序眉标、结论主标题、时间/量纲副标题、极值徽标、ECharts 矢量图区、
 * 数据来源与口径注释合成为一张完整可独立传播的出版物级矢量 SVG 图卡。
 */
export function buildFigureCardSvg(options: FigureSvgComposeOptions): string {
  const {
    innerSvgContent,
    chartWidth,
    chartHeight,
    viewBox,
    eyebrow,
    title,
    subtitle,
    badgeLabel,
    source,
    note,
    theme,
  } = options;

  const padX = 24;
  const safeChartW = Math.max(Math.round(chartWidth) || 640, 480);
  const safeChartH = Math.max(Math.round(chartHeight) || 276, 160);
  const cardW = safeChartW + padX * 2;
  const resolvedViewBox = viewBox || `0 0 ${safeChartW} ${safeChartH}`;

  const fontFamily = escapeXml(theme.fontFamily || "sans-serif");
  const surface = escapeXml(theme.surface || "canvas");
  const surfaceSunken = escapeXml(theme.surfaceSunken || "canvas");
  const ink = escapeXml(theme.ink || "canvastext");
  const muted = escapeXml(theme.muted || "graytext");
  const border = escapeXml(theme.border || "graytext");
  const brandNavy = escapeXml(theme.brandNavy || "canvastext");
  const infoBg = escapeXml(theme.infoBg || "canvas");

  const badgeW = badgeLabel ? Math.ceil(measureVisualUnits(badgeLabel) * 12 + 22) : 0;
  const badgeH = 24;
  const headerTextAvailPx = cardW - padX * 2 - (badgeLabel ? badgeW + 16 : 0);

  const titleLines = wrapSvgText(title, Math.max(16, Math.floor(headerTextAvailPx / 16.5)));
  const subtitleLines = wrapSvgText(subtitle, Math.max(22, Math.floor((cardW - padX * 2) / 12.5)));

  let cursorY = 18;
  const headerNodes: string[] = [];

  if (eyebrow) {
    headerNodes.push(
      `<text x="${padX}" y="${cursorY + 12}" fill="${brandNavy}" font-family="${fontFamily}" font-size="12" font-weight="600">${escapeXml(eyebrow)}</text>`,
    );
    cursorY += 22;
  }

  if (badgeLabel) {
    const bx = cardW - padX - badgeW;
    const by = 18;
    headerNodes.push(
      `<g>` +
        `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" fill="${infoBg}" stroke="${border}" stroke-width="1" />` +
        `<text x="${bx + Math.round(badgeW / 2)}" y="${by + 16}" text-anchor="middle" fill="${brandNavy}" font-family="${fontFamily}" font-size="12" font-weight="600">${escapeXml(badgeLabel)}</text>` +
      `</g>`,
    );
  }

  for (const line of titleLines) {
    headerNodes.push(
      `<text x="${padX}" y="${cursorY + 17}" fill="${ink}" font-family="${fontFamily}" font-size="16" font-weight="700">${escapeXml(line)}</text>`,
    );
    cursorY += 23;
  }

  cursorY += 4;
  for (const line of subtitleLines) {
    headerNodes.push(
      `<text x="${padX}" y="${cursorY + 13}" fill="${muted}" font-family="${fontFamily}" font-size="12.5">${escapeXml(line)}</text>`,
    );
    cursorY += 18;
  }

  const headerBottomY = Math.max(cursorY + 12, badgeLabel ? 52 : 44);
  const plotY = headerBottomY + 14;
  const footerTopY = plotY + safeChartH + 14;

  const footerBody = note ? `${source} · 注：${note}` : source;
  const fullFooterText = `数据来源：${footerBody}`;
  const footerLines = wrapSvgText(fullFooterText, Math.max(26, Math.floor((cardW - padX * 2) / 12)));
  const footerH = 14 + footerLines.length * 18 + 10;
  const cardH = footerTopY + footerH;

  const footerTextNodes = footerLines.map((line, idx) => {
    const lineY = footerTopY + 13 + (idx + 1) * 16;
    if (idx === 0 && line.startsWith("数据来源：")) {
      const rest = line.slice("数据来源：".length);
      return (
        `<text x="${padX}" y="${lineY}" fill="${muted}" font-family="${fontFamily}" font-size="12">` +
        `<tspan fill="${ink}" font-weight="600">数据来源：</tspan>${escapeXml(rest)}` +
        `</text>`
      );
    }
    return `<text x="${padX}" y="${lineY}" fill="${muted}" font-family="${fontFamily}" font-size="12">${escapeXml(line)}</text>`;
  });

  const descText = `${subtitle} ${fullFooterText}`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" role="img" aria-label="${escapeXml(title)}">`,
    `  <title>${escapeXml(title)}</title>`,
    `  <desc>${escapeXml(descText)}</desc>`,
    `  <rect x="0" y="0" width="${cardW}" height="${cardH}" fill="${surface}" />`,
    `  <rect x="0" y="${footerTopY}" width="${cardW}" height="${footerH}" fill="${surfaceSunken}" />`,
    `  ${headerNodes.join("\n  ")}`,
    `  <line x1="0" y1="${headerBottomY}" x2="${cardW}" y2="${headerBottomY}" stroke="${border}" stroke-width="1" />`,
    `  <svg x="${padX}" y="${plotY}" width="${safeChartW}" height="${safeChartH}" viewBox="${escapeXml(resolvedViewBox)}">`,
    `    ${innerSvgContent}`,
    `  </svg>`,
    `  <line x1="0" y1="${footerTopY}" x2="${cardW}" y2="${footerTopY}" stroke="${border}" stroke-width="1" />`,
    `  ${footerTextNodes.join("\n  ")}`,
    `  <rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" fill="none" stroke="${border}" stroke-width="1" />`,
    `  <rect x="0" y="0" width="${cardW}" height="2.5" fill="${brandNavy}" />`,
    `</svg>`,
  ].join("\n");
}
