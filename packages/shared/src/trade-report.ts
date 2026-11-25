import { roundMetric } from "./trade";
import type { TradeOverviewPublished } from "./types";

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtYi(usd: number, digits = 4): string {
  return (usd / 100_000_000).toFixed(digits);
}

function fmtWan(usd: number, digits = 2): string {
  return (usd / 10_000).toFixed(digits);
}

function fmtPct(pct: number | null): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "";
  return roundMetric(pct, 2).toFixed(2);
}

function fmtSignedPctDisplay(pct: number | null): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const r = roundMetric(pct, 2);
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}%`;
}

/**
 * 生成对齐《我国海关平台-2024年度仪器仪表海关进出口年度数据统计.xlsx》（汇总表 + Sheet1 16列明细）
 * 的 UTF-8 BOM 双表统计汇总 CSV，支持 Excel 直接无乱码打开复核。
 */
export function buildTradeSummaryDualTableCsv(snap: TradeOverviewPublished): string {
  const lines: string[] = [];

  lines.push(
    [
      `# 中国海关医疗器械进出口年度/期间统计汇总表`,
      `统计期间=${snap.period}`,
      `字典版本=${snap.dictVersion}`,
      `releaseId=${snap.releaseId}`,
    ]
      .map(escapeCsvCell)
      .join(","),
  );
  lines.push("");

  // 表一：对齐样表《汇总表》（同时提供亿美元、万美元与精确美元整数）
  lines.push("# 表一：医疗器械一级类别进出口汇总表（对齐样表《汇总表》）");
  lines.push(
    [
      "统计期间",
      "一级类别",
      "适用税号数",
      "进口额(亿美元)",
      "进口额(万美元)",
      "进口额(美元)",
      "进口同比(%)",
      "出口额(亿美元)",
      "出口额(万美元)",
      "出口额(美元)",
      "出口同比(%)",
      "进出口总额(亿美元)",
      "进出口总额(万美元)",
      "进出口总额(美元)",
      "贸易差额(亿美元)",
      "贸易差额(美元)",
      "进口CR3(%)",
      "出口CR3(%)",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  for (const cat of snap.categories) {
    const catTotal = cat.importUsd + cat.exportUsd;
    lines.push(
      [
        snap.period,
        cat.category,
        cat.hs8Count,
        fmtYi(cat.importUsd),
        fmtWan(cat.importUsd),
        cat.importUsd,
        fmtPct(cat.importYoyPct),
        fmtYi(cat.exportUsd),
        fmtWan(cat.exportUsd),
        cat.exportUsd,
        fmtPct(cat.exportYoyPct),
        fmtYi(catTotal),
        fmtWan(catTotal),
        catTotal,
        fmtYi(cat.balanceUsd),
        cat.balanceUsd,
        fmtPct(cat.importConcentration.cr3),
        fmtPct(cat.exportConcentration.cr3),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  lines.push(
    [
      snap.period,
      "全行业合计",
      snap.coverage.applicableHs8Count,
      fmtYi(snap.totals.importUsd),
      fmtWan(snap.totals.importUsd),
      snap.totals.importUsd,
      fmtPct(snap.totals.importYoyPct),
      fmtYi(snap.totals.exportUsd),
      fmtWan(snap.totals.exportUsd),
      snap.totals.exportUsd,
      fmtPct(snap.totals.exportYoyPct),
      fmtYi(snap.totals.totalUsd),
      fmtWan(snap.totals.totalUsd),
      snap.totals.totalUsd,
      fmtYi(snap.totals.balanceUsd),
      snap.totals.balanceUsd,
      fmtPct(snap.concentration.import.cr3),
      fmtPct(snap.concentration.export.cr3),
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  lines.push("");
  // 表二：对齐样表《Sheet1》8位商品编码金额+第一数量及同比明细
  lines.push("# 表二：海关8位商品编码进出口额与第一数量同比明细表（对齐样表《Sheet1》）");
  lines.push(
    [
      "序号",
      "一级类别",
      "HS6编码",
      "HS8商品编码",
      "海关商品名称",
      "进口第一数量",
      "进口第一计量单位",
      "进口数量同比(%)",
      "进口额(美元)",
      "进口额(亿美元)",
      "进口金额同比(%)",
      "出口第一数量",
      "出口第一计量单位",
      "出口数量同比(%)",
      "出口额(美元)",
      "出口额(亿美元)",
      "出口金额同比(%)",
      "贸易差额(美元)",
      "进口CR3(%)",
      "出口CR3(%)",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  snap.hsItems.forEach((it, idx) => {
    lines.push(
      [
        idx + 1,
        it.category,
        it.hs6,
        it.hs8,
        it.itemName,
        it.importQty1.value ?? "",
        it.importQty1.unit ?? "",
        fmtPct(it.importQty1YoyPct),
        it.importUsd,
        fmtYi(it.importUsd),
        fmtPct(it.importYoyPct),
        it.exportQty1.value ?? "",
        it.exportQty1.unit ?? "",
        fmtPct(it.exportQty1YoyPct),
        it.exportUsd,
        fmtYi(it.exportUsd),
        fmtPct(it.exportYoyPct),
        it.balanceUsd,
        fmtPct(it.importConcentration.cr3),
        fmtPct(it.exportConcentration.cr3),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  });

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export type TradeReportEmbeddedCharts = {
  trendSvg?: string;
  categorySvg?: string;
  rankingSvg?: string;
  cr3Svg?: string;
};

/**
 * 生成可一键打印为 A4 PDF 的自包含矢量分析报告 HTML（对齐 scstriker/customs-data 与 PDF 操作说明）。
 */
export function buildTradeReportHtml(
  snap: TradeOverviewPublished,
  charts: TradeReportEmbeddedCharts = {},
): string {
  const catRows = snap.categories
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.category)}</td>
        <td class="num">${c.hs8Count}</td>
        <td class="num">${fmtYi(c.exportUsd)}</td>
        <td class="num">${fmtSignedPctDisplay(c.exportYoyPct)}</td>
        <td class="num">${fmtYi(c.importUsd)}</td>
        <td class="num">${fmtSignedPctDisplay(c.importYoyPct)}</td>
        <td class="num">${fmtYi(c.balanceUsd)}</td>
        <td class="num">${c.importConcentration.cr3 !== null ? `${c.importConcentration.cr3.toFixed(1)}%` : "—"}</td>
      </tr>`,
    )
    .join("\n");

  const partnerRows = snap.partners
    .slice(0, 10)
    .map(
      (p, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(p.partnerName)} (${escapeHtml(p.partnerCode)})</td>
        <td class="num">${fmtYi(p.importUsd)}</td>
        <td class="num">${p.importSharePct !== null ? `${p.importSharePct.toFixed(2)}%` : "—"}</td>
        <td class="num">${fmtYi(p.exportUsd)}</td>
        <td class="num">${p.exportSharePct !== null ? `${p.exportSharePct.toFixed(2)}%` : "—"}</td>
        <td>${escapeHtml(p.topCategory)}</td>
      </tr>`,
    )
    .join("\n");

  const chartBlock = (title: string, svg?: string) =>
    svg
      ? `<div class="chart-card"><h3>${escapeHtml(title)}</h3><div class="svg-wrap">${svg}</div></div>`
      : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>中国医疗器械海关进出口态势研判报告 (${escapeHtml(snap.period)})</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 20px; font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
      color: #111827; background: #ffffff; line-height: 1.55; font-size: 12px;
    }
    .report-container { max-width: 960px; margin: 0 auto; }
    header { border-bottom: 2.5px solid #0b3a6e; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0 0 6px 0; font-size: 20px; color: #0b3a6e; }
    .meta { font-size: 11px; color: #475569; font-family: ui-monospace, Consolas, monospace; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
    .kpi-box { border: 1px solid #cbd5e1; padding: 8px 10px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #475569; }
    .kpi-val { font-size: 16px; font-weight: 700; color: #0b3a6e; margin: 2px 0; }
    .kpi-sub { font-size: 10px; color: #64748b; }
    .summary-card { border: 1px solid #cbd5e1; border-left: 4px solid #0b3a6e; background: #f8fafc; padding: 12px 14px; margin-bottom: 16px; }
    .summary-card h2 { margin: 0 0 6px 0; font-size: 14px; color: #0b3a6e; }
    .summary-card p { margin: 4px 0; }
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .chart-card { border: 1px solid #cbd5e1; padding: 10px; page-break-inside: avoid; }
    .chart-card h3 { margin: 0 0 8px 0; font-size: 13px; color: #0b3a6e; }
    .svg-wrap svg { width: 100% !important; height: auto !important; max-height: 240px; }
    h2.sec-title { font-size: 14px; color: #0b3a6e; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 16px 0 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
    th { background: #f1f5f9; color: #0b3a6e; font-weight: 700; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    footer { border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 10px; color: #64748b; margin-top: 16px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="no-print" style="margin-bottom:12px; display:flex; justify-content:flex-end;">
      <button onclick="window.print()" style="background:#0b3a6e;color:#fff;border:none;padding:6px 14px;font-weight:700;cursor:pointer;">打印 / 另存为 A4 PDF</button>
    </div>
    <header>
      <h1>中国医疗器械海关进出口与供应链集中度态势研判报告（${escapeHtml(snap.period)}）</h1>
      <div class="meta">
        数据来源：中华人民共和国海关总署统计平台 (USD) · 字典版本：${escapeHtml(snap.dictVersion)} · 快照版本 releaseId：${escapeHtml(snap.releaseId)} · 覆盖月份：${escapeHtml(snap.coverage.months[0])} 至 ${escapeHtml(snap.coverage.months[snap.coverage.months.length - 1])}
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">进出口总额</div>
        <div class="kpi-val">${fmtYi(snap.totals.totalUsd)} 亿美元</div>
        <div class="kpi-sub">同比 ${fmtSignedPctDisplay(snap.totals.totalYoyPct)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">出口总额</div>
        <div class="kpi-val">${fmtYi(snap.totals.exportUsd)} 亿美元</div>
        <div class="kpi-sub">同比 ${fmtSignedPctDisplay(snap.totals.exportYoyPct)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">进口总额</div>
        <div class="kpi-val">${fmtYi(snap.totals.importUsd)} 亿美元</div>
        <div class="kpi-sub">同比 ${fmtSignedPctDisplay(snap.totals.importYoyPct)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">贸易差额</div>
        <div class="kpi-val">${fmtYi(snap.totals.balanceUsd)} 亿美元</div>
        <div class="kpi-sub">${snap.totals.balanceUsd >= 0 ? "贸易顺差" : "贸易逆差"}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">进口/出口 CR3</div>
        <div class="kpi-val">${snap.concentration.import.cr3 !== null ? `${snap.concentration.import.cr3.toFixed(1)}%` : "—"}</div>
        <div class="kpi-sub">出口 CR3 ${snap.concentration.export.cr3 !== null ? `${snap.concentration.export.cr3.toFixed(1)}%` : "—"}</div>
      </div>
    </section>

    <section class="summary-card">
      <h2>${escapeHtml(snap.narrativeSummary.headline)}</h2>
      <p>${escapeHtml(snap.narrativeSummary.scaleParagraph)}</p>
      <p>${escapeHtml(snap.narrativeSummary.multiYearParagraph)}</p>
      <p>${escapeHtml(snap.narrativeSummary.structureParagraph)}</p>
      <p><strong>供应链集中度提示：</strong>${escapeHtml(snap.narrativeSummary.concentrationAlert)}</p>
    </section>

    <section class="charts-grid">
      ${chartBlock("图 1 · 跨年/月度进出口规模走势", charts.trendSvg)}
      ${chartBlock("图 2 · 11大类医疗器械构成结构", charts.categorySvg)}
      ${chartBlock("图 3 · 核心贸易伙伴 / 国内省市排名", charts.rankingSvg)}
      ${chartBlock("图 4 · 一级类别供应链 CR3 集中度", charts.cr3Svg)}
    </section>

    <h2 class="sec-title">一、医疗器械一级类别进出口汇总表（亿美元）</h2>
    <table>
      <thead>
        <tr>
          <th>一级类别</th>
          <th class="num">税号数</th>
          <th class="num">出口额(亿美元)</th>
          <th class="num">出口同比</th>
          <th class="num">进口额(亿美元)</th>
          <th class="num">进口同比</th>
          <th class="num">贸易差额(亿美元)</th>
          <th class="num">进口 CR3</th>
        </tr>
      </thead>
      <tbody>${catRows}</tbody>
    </table>

    <h2 class="sec-title">二、前十大贸易伙伴流向与双边份额</h2>
    <table>
      <thead>
        <tr>
          <th class="num">排名</th>
          <th>贸易伙伴</th>
          <th class="num">进口额(亿美元)</th>
          <th class="num">占进口比重</th>
          <th class="num">出口额(亿美元)</th>
          <th class="num">占出口比重</th>
          <th>双边主导类别</th>
        </tr>
      </thead>
      <tbody>${partnerRows}</tbody>
    </table>

    <footer>
      溯源校验：releaseId=${escapeHtml(snap.releaseId)} · dictVersion=${escapeHtml(snap.dictVersion)} · 原始批次=${snap.sourceBatches.length} 批（首批次 SHA-256: ${escapeHtml(snap.sourceBatches[0]?.sourceSha256 ?? "N/A")}）。
    </footer>
  </div>
</body>
</html>`;
}
