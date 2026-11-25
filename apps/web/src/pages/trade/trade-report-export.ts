import {
  buildTradeReportHtml,
  buildTradeSummaryDualTableCsv,
  type TradeOverviewPublished,
  type TradeReportEmbeddedCharts,
} from "@mdes/shared";
import { downloadText } from "@/lib/download";

function readFigureSvg(figureId: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const svgEl = document.querySelector(`#${figureId} [data-slot="figure-canvas"] svg`);
  return svgEl ? svgEl.outerHTML : undefined;
}

export function collectRenderedTradeFigureSvgs(): TradeReportEmbeddedCharts {
  return {
    trendSvg: readFigureSvg("fig-trade-trend"),
    categorySvg: readFigureSvg("fig-trade-category-donut"),
    rankingSvg: readFigureSvg("fig-trade-structure-ranking"),
    cr3Svg: readFigureSvg("fig-trade-concentration"),
  };
}

export function exportTradeReportHtml(snap: TradeOverviewPublished) {
  const charts = collectRenderedTradeFigureSvgs();
  const html = buildTradeReportHtml(snap, charts);
  downloadText(`mdes-trade-report-${snap.period}.html`, html, "text/html;charset=utf-8");
}

export function exportTradeSummaryDualCsv(snap: TradeOverviewPublished) {
  const csv = buildTradeSummaryDualTableCsv(snap);
  downloadText(`mdes-trade-summary-${snap.period}.csv`, csv, "text/csv;charset=utf-8");
}
