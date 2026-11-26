import { roundMetric, type TradeFlow } from "./trade";
import type {
  TradeAnnualTrendPoint,
  TradeCategoryStat,
  TradeNarrativeSummary,
  TradeOverviewPublished,
  TradePartnerStat,
  TradeRegimeStat,
  TradeRegionStat,
} from "./types";

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

function fmtPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "";
  return roundMetric(pct, 2).toFixed(2);
}

function fmtSignedPctDisplay(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const r = roundMetric(pct, 2);
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}%`;
}

export type TradeRankingDimension = "partners" | "regions" | "regimes";

export type RankedStructureItem = {
  code: string;
  name: string;
  importUsd: number;
  importSharePct: number | null;
  exportUsd: number;
  exportSharePct: number | null;
  selectedUsd: number;
  selectedSharePct: number | null;
  topCategory?: string;
};

/**
 * 图 3、图 3 数据表 / CSV 及 A4 分析报告共用的单边流向排序选择器：
 * 按当前所选流向（import / export）的美元额降序排列，过滤当前流向为 0 的条目，
 * 金额相同时按双边总额降序、编码字典序确定性打破平局。
 */
export function getTopStructureRankingByFlow(
  snap: Pick<TradeOverviewPublished, "partners" | "regions" | "regimes">,
  dimension: TradeRankingDimension,
  flow: TradeFlow,
  limit = 10,
): RankedStructureItem[] {
  const rawItems: RankedStructureItem[] =
    dimension === "partners"
      ? (snap.partners ?? []).map((p) => ({
          code: p.partnerCode,
          name: p.partnerName,
          importUsd: p.importUsd,
          importSharePct: p.importSharePct,
          exportUsd: p.exportUsd,
          exportSharePct: p.exportSharePct,
          selectedUsd: flow === "export" ? p.exportUsd : p.importUsd,
          selectedSharePct: flow === "export" ? p.exportSharePct : p.importSharePct,
          topCategory: p.topCategory,
        }))
      : dimension === "regions"
        ? (snap.regions ?? []).map((r) => ({
            code: r.regionCode,
            name: r.regionName,
            importUsd: r.importUsd,
            importSharePct: r.importSharePct,
            exportUsd: r.exportUsd,
            exportSharePct: r.exportSharePct,
            selectedUsd: flow === "export" ? r.exportUsd : r.importUsd,
            selectedSharePct: flow === "export" ? r.exportSharePct : r.importSharePct,
          }))
        : (snap.regimes ?? []).map((rg) => ({
            code: rg.regimeCode,
            name: rg.regimeName,
            importUsd: rg.importUsd,
            importSharePct: rg.importSharePct,
            exportUsd: rg.exportUsd,
            exportSharePct: rg.exportSharePct,
            selectedUsd: flow === "export" ? rg.exportUsd : rg.importUsd,
            selectedSharePct: flow === "export" ? rg.exportSharePct : rg.importSharePct,
          }));

  return rawItems
    .filter((item) => item.selectedUsd > 0)
    .sort((a, b) => {
      if (b.selectedUsd !== a.selectedUsd) return b.selectedUsd - a.selectedUsd;
      const bilA = a.importUsd + a.exportUsd;
      const bilB = b.importUsd + b.exportUsd;
      if (bilB !== bilA) return bilB - bilA;
      return a.code.localeCompare(b.code);
    })
    .slice(0, limit);
}

function fmtComparableYoyClause(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return "同口径基期为零或不可比";
  }
  const r = roundMetric(pct, 2);
  if (r > 0) return `同口径同比增长 ${r.toFixed(2)}%`;
  if (r < 0) return `同口径同比下降 ${Math.abs(r).toFixed(2)}%`;
  return "同口径同比持平 (0.00%)";
}

function fmtTrailingPartialClause(pt: TradeAnnualTrendPoint): string {
  let pYoy = "";
  if (pt.totalYoyPct !== null && pt.totalYoyPct !== undefined && Number.isFinite(pt.totalYoyPct)) {
    const r = roundMetric(pt.totalYoyPct, 2);
    if (r > 0) pYoy = `，较上年同窗口期同比增长 ${r.toFixed(2)}%`;
    else if (r < 0) pYoy = `，较上年同窗口期同比下降 ${Math.abs(r).toFixed(2)}%`;
    else pYoy = "，较上年同窗口期同比持平 (0.00%)";
  }
  return ` 最新 ${pt.period}（非完整年累计，覆盖 ${pt.coveredMonths} 个月）进出口总额达 ${fmtYi(pt.totalUsd)} 亿美元${pYoy}。`;
}

/**
 * 基于全库已发布 annualTrend 生成确定性跨年研判文段：
 * - 相邻完整年（gap === 1）严格复用可比税号集合的 annualTrend.totalYoyPct，不把新增税号误计为同比增长；
 * - 基期为零时显式标示“不可比”；
 * - 多年度完整年（gap >= 2）区分“累计区间增长/下降”，不与相邻年同比混称；
 * - 覆盖仅含部分月或单完整年+部分月的跨年组合，确保所有期间共享一致的全库跨年描述。
 */
export function buildMultiYearNarrativeParagraph(annualTrend: readonly TradeAnnualTrendPoint[]): string {
  const fullYears = annualTrend.filter((p) => !p.isPartial);
  const lastPoint = annualTrend[annualTrend.length - 1];
  const trailingPartial = lastPoint && lastPoint.isPartial ? lastPoint : null;

  if (fullYears.length >= 2) {
    const first = fullYears[0];
    const last = fullYears[fullYears.length - 1];
    const gap = last.year - first.year;
    let paragraph = "";
    if (gap === 1) {
      const word = fmtComparableYoyClause(last.totalYoyPct);
      paragraph = `年度对比显示，${first.year}—${last.year} 年完整年度进出口总额由 ${fmtYi(first.totalUsd)} 亿美元变化至 ${fmtYi(last.totalUsd)} 亿美元（${word}）。`;
    } else {
      const spanPct =
        first.totalUsd > 0 ? roundMetric(((last.totalUsd - first.totalUsd) / first.totalUsd) * 100, 2) : null;
      if (spanPct === null) {
        paragraph = `跨年序列显示，${first.year}—${last.year} 年完整年度进出口总额由 ${fmtYi(first.totalUsd)} 亿美元演进至 ${fmtYi(last.totalUsd)} 亿美元（基期为零，区间变化不可比）。`;
      } else if (spanPct > 0) {
        paragraph = `跨年序列显示，${first.year}—${last.year} 年完整年度进出口总额由 ${fmtYi(first.totalUsd)} 亿美元演进至 ${fmtYi(last.totalUsd)} 亿美元，累计区间增长 ${spanPct.toFixed(2)}%。`;
      } else if (spanPct < 0) {
        paragraph = `跨年序列显示，${first.year}—${last.year} 年完整年度进出口总额由 ${fmtYi(first.totalUsd)} 亿美元演进至 ${fmtYi(last.totalUsd)} 亿美元，累计区间下降 ${Math.abs(spanPct).toFixed(2)}%。`;
      } else {
        paragraph = `跨年序列显示，${first.year}—${last.year} 年完整年度进出口总额由 ${fmtYi(first.totalUsd)} 亿美元演进至 ${fmtYi(last.totalUsd)} 亿美元，区间持平 (0.00%)。`;
      }
    }
    if (trailingPartial) {
      paragraph += fmtTrailingPartialClause(trailingPartial);
    }
    return paragraph;
  }

  if (fullYears.length === 1 && annualTrend.length >= 2) {
    const onlyFull = fullYears[0];
    const firstPt = annualTrend[0];
    const lastPt = annualTrend[annualTrend.length - 1];
    let paragraph = `跨年序列已覆盖 ${firstPt.period} 至 ${lastPt.period}（共 ${annualTrend.length} 个年度），其中完整年度 ${onlyFull.period} 进出口总额 ${fmtYi(onlyFull.totalUsd)} 亿美元。`;
    if (trailingPartial && trailingPartial.year !== onlyFull.year) {
      paragraph += fmtTrailingPartialClause(trailingPartial);
    }
    return paragraph;
  }

  if (annualTrend.length >= 2) {
    const firstPt = annualTrend[0];
    const lastPt = annualTrend[annualTrend.length - 1];
    const yoyClause =
      lastPt.totalYoyPct !== null && lastPt.totalYoyPct !== undefined && Number.isFinite(lastPt.totalYoyPct)
        ? `（${fmtComparableYoyClause(lastPt.totalYoyPct)}）`
        : "（上年同窗口基期不足或不可比）";
    return `跨年非完整年度序列已覆盖 ${firstPt.period} 至 ${lastPt.period}（共 ${annualTrend.length} 个年度），最新 ${lastPt.period}（覆盖 ${lastPt.coveredMonths} 个月）进出口总额 ${fmtYi(lastPt.totalUsd)} 亿美元${yoyClause}。`;
  }

  if (annualTrend.length === 1) {
    const only = annualTrend[0];
    return `当前库内已发布 ${only.period}${only.isPartial ? `（非完整年累计 ${only.coveredMonths} 个月）` : ""} 单一年度序列，进出口总额 ${fmtYi(only.totalUsd)} 亿美元。`;
  }

  return "跨年趋势序列待更多年度发布后自动生成。";
}

export function buildTradeNarrativeSummary(input: {
  period: string;
  totals: TradeOverviewPublished["totals"];
  hasFullPrior: boolean;
  priorBalanceScaled: bigint | null;
  totalBalanceScaled: bigint;
  annualTrend: readonly TradeAnnualTrendPoint[];
  categories: readonly TradeCategoryStat[];
  partners: readonly TradePartnerStat[];
  regions: readonly TradeRegionStat[];
  regimes: readonly TradeRegimeStat[];
  concentration: TradeOverviewPublished["concentration"];
}): TradeNarrativeSummary {
  const fmtYoyWord = (pct: number | null | undefined) => {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "暂无可比基期";
    const r = roundMetric(pct, 2);
    if (r > 0) return `同比增长 ${r.toFixed(2)}%`;
    if (r < 0) return `同比下降 ${Math.abs(r).toFixed(2)}%`;
    return "同比持平 (0.00%)";
  };

  const totalUsd =
    typeof input.totals.totalUsd === "number" && Number.isFinite(input.totals.totalUsd)
      ? input.totals.totalUsd
      : roundMetric(input.totals.importUsd + input.totals.exportUsd, 4);

  const balWord = input.totals.balanceUsd >= 0 ? "贸易顺差" : "贸易逆差";
  let balanceShiftClause = "";
  if (input.hasFullPrior && input.priorBalanceScaled !== null) {
    if (input.priorBalanceScaled < 0n && input.totalBalanceScaled > 0n) {
      balanceShiftClause = "，贸易差额由上年同期逆差转为顺差";
    } else if (input.priorBalanceScaled > 0n && input.totalBalanceScaled < 0n) {
      balanceShiftClause = "，贸易差额由上年同期顺差转为逆差";
    }
  }

  const scaleParagraph = input.hasFullPrior
    ? `${input.period} 我国医疗器械进出口总额 ${fmtYi(totalUsd)} 亿美元（${fmtYoyWord(input.totals.totalYoyPct)}），其中出口 ${fmtYi(input.totals.exportUsd)} 亿美元（${fmtYoyWord(input.totals.exportYoyPct)}），进口 ${fmtYi(input.totals.importUsd)} 亿美元（${fmtYoyWord(input.totals.importYoyPct)}），实现${balWord} ${fmtYi(Math.abs(input.totals.balanceUsd))} 亿美元${balanceShiftClause}。`
    : `${input.period} 我国医疗器械进出口总额 ${fmtYi(totalUsd)} 亿美元，其中出口 ${fmtYi(input.totals.exportUsd)} 亿美元、进口 ${fmtYi(input.totals.importUsd)} 亿美元，呈${balWord} ${fmtYi(Math.abs(input.totals.balanceUsd))} 亿美元；当前期间暂无完整上年同口径同期基期，同比留空。`;

  const multiYearParagraph = buildMultiYearNarrativeParagraph(input.annualTrend);

  const sortedCats = [...input.categories].sort((a, b) => b.importUsd + b.exportUsd - (a.importUsd + a.exportUsd));
  const topCat = sortedCats[0];
  const topPartner = input.partners[0];
  const topRegion = input.regions[0];
  const topRegime = input.regimes[0];

  const structParts: string[] = [];
  if (topCat) {
    structParts.push(`第一大品类为「${topCat.category}」（双边合计 ${fmtYi(topCat.importUsd + topCat.exportUsd)} 亿美元）`);
  }
  if (topPartner) {
    structParts.push(
      `头号贸易伙伴为「${topPartner.partnerName}」（进口占比 ${topPartner.importSharePct?.toFixed(1) ?? "0.0"}%、出口占比 ${topPartner.exportSharePct?.toFixed(1) ?? "0.0"}%）`,
    );
  }
  if (topRegion) {
    structParts.push(`国内首位收发货人注册地为「${topRegion.regionName}」`);
  }
  if (topRegime) {
    structParts.push(`主导贸易方式为「${topRegime.regimeName}」`);
  }
  const structureParagraph = structParts.length > 0 ? `结构分布上，${structParts.join("；")}。` : "当前期间无明细结构数据。";

  const highImpCats = input.categories
    .filter((c) => (c.importConcentration.cr3 ?? 0) >= 70)
    .sort((a, b) => (b.importConcentration.cr3 ?? 0) - (a.importConcentration.cr3 ?? 0));
  const impCr3Str = input.concentration.import.cr3 !== null ? `${input.concentration.import.cr3.toFixed(1)}%` : "暂无";
  const expCr3Str = input.concentration.export.cr3 !== null ? `${input.concentration.export.cr3.toFixed(1)}%` : "暂无";
  const concentrationAlert =
    highImpCats.length > 0
      ? `全行业进口伙伴 CR3 为 ${impCr3Str}、出口伙伴 CR3 为 ${expCr3Str}；其中 ${highImpCats
          .slice(0, 3)
          .map((c) => `${c.category}(进口CR3 ${c.importConcentration.cr3?.toFixed(1)}%)`)
          .join("、")} 处于 CR3 ≥ 70% 高集中度区间，建议持续跟踪供应链多元化水平。`
      : `全行业进口伙伴 CR3 为 ${impCr3Str}、出口伙伴 CR3 为 ${expCr3Str}，各一级类别进口 CR3 均低于 70% 高集中度警戒线。`;

  return {
    headline: `${input.period} 医疗器械进出口态势研判摘要`,
    scaleParagraph,
    multiYearParagraph,
    structureParagraph,
    concentrationAlert,
  };
}

/**
 * 兼容升级前存量已发布快照：自动补齐缺失的 totals.totalUsd / totals.totalYoyPct、
 * annualTrend、narrativeSummary 与 hsItems[*].{importQty1YoyPct,exportQty1YoyPct}，
 * 确保 API 读取、门户渲染、A4 HTML 导出与双表 CSV 导出绝不抛异常或输出 NaN。
 */
export function normalizeTradeOverviewSnapshot(raw: TradeOverviewPublished): TradeOverviewPublished {
  const rawTotals = (raw.totals ?? {}) as Partial<TradeOverviewPublished["totals"]>;
  const importUsd = typeof rawTotals.importUsd === "number" && Number.isFinite(rawTotals.importUsd) ? rawTotals.importUsd : 0;
  const exportUsd = typeof rawTotals.exportUsd === "number" && Number.isFinite(rawTotals.exportUsd) ? rawTotals.exportUsd : 0;
  const totalUsd =
    typeof rawTotals.totalUsd === "number" && Number.isFinite(rawTotals.totalUsd)
      ? rawTotals.totalUsd
      : roundMetric(importUsd + exportUsd, 4);
  const balanceUsd =
    typeof rawTotals.balanceUsd === "number" && Number.isFinite(rawTotals.balanceUsd)
      ? rawTotals.balanceUsd
      : roundMetric(exportUsd - importUsd, 4);
  const importYoyPct =
    typeof rawTotals.importYoyPct === "number" && Number.isFinite(rawTotals.importYoyPct)
      ? rawTotals.importYoyPct
      : null;
  const exportYoyPct =
    typeof rawTotals.exportYoyPct === "number" && Number.isFinite(rawTotals.exportYoyPct)
      ? rawTotals.exportYoyPct
      : null;
  const totalYoyPct =
    typeof rawTotals.totalYoyPct === "number" && Number.isFinite(rawTotals.totalYoyPct)
      ? rawTotals.totalYoyPct
      : null;

  const totals: TradeOverviewPublished["totals"] = {
    importUsd,
    exportUsd,
    totalUsd,
    balanceUsd,
    importYoyPct,
    exportYoyPct,
    totalYoyPct,
  };

  const annualTrend = Array.isArray(raw.annualTrend) ? raw.annualTrend : [];
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const partners = Array.isArray(raw.partners) ? raw.partners : [];
  const regimes = Array.isArray(raw.regimes) ? raw.regimes : [];
  const regions = Array.isArray(raw.regions) ? raw.regions : [];
  const hsItems = (Array.isArray(raw.hsItems) ? raw.hsItems : []).map((it) => ({
    ...it,
    importQty1YoyPct:
      typeof it.importQty1YoyPct === "number" && Number.isFinite(it.importQty1YoyPct) ? it.importQty1YoyPct : null,
    exportQty1YoyPct:
      typeof it.exportQty1YoyPct === "number" && Number.isFinite(it.exportQty1YoyPct) ? it.exportQty1YoyPct : null,
  }));

  const rawSummary = (raw as { narrativeSummary?: Partial<TradeNarrativeSummary> | null }).narrativeSummary;
  const hasCompleteSummary = Boolean(
    rawSummary &&
      typeof rawSummary.headline === "string" &&
      typeof rawSummary.scaleParagraph === "string" &&
      typeof rawSummary.multiYearParagraph === "string" &&
      typeof rawSummary.structureParagraph === "string" &&
      typeof rawSummary.concentrationAlert === "string",
  );

  const narrativeSummary = hasCompleteSummary
    ? (rawSummary as TradeNarrativeSummary)
    : buildTradeNarrativeSummary({
        period: raw.period,
        totals,
        hasFullPrior: importYoyPct !== null || exportYoyPct !== null || totalYoyPct !== null,
        priorBalanceScaled: null,
        totalBalanceScaled: 0n,
        annualTrend,
        categories,
        partners,
        regions,
        regimes,
        concentration: raw.concentration,
      });

  return {
    ...raw,
    totals,
    annualTrend,
    narrativeSummary,
    categories,
    partners,
    regimes,
    regions,
    hsItems,
  };
}

/**
 * 生成对齐《我国海关平台-2024年度仪器仪表海关进出口年度数据统计.xlsx》（汇总表 + Sheet1 16列明细）
 * 的 UTF-8 BOM 双表统计汇总 CSV，支持 Excel 直接无乱码打开复核。
 */
export function buildTradeSummaryDualTableCsv(rawSnap: TradeOverviewPublished): string {
  const snap = normalizeTradeOverviewSnapshot(rawSnap);
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
  // 表二：严格保留样表《Sheet1》原 16 列位置（B=HS8商品编码、H=进口额(美元)、N=出口额(美元)），新指标追加于 Q 列之后
  lines.push("# 表二：海关8位商品编码进出口额与第一数量同比明细表（对齐样表《Sheet1》A–P 16列 + 扩展指标）");
  lines.push(
    [
      "一级类别",
      "HS8商品编码",
      "海关商品名称",
      "计量单位",
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
      "HS6编码",
      "序号",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  snap.hsItems.forEach((it, idx) => {
    const primaryUnit = it.importQty1.unit ?? it.exportQty1.unit ?? "";
    lines.push(
      [
        it.category,
        it.hs8,
        it.itemName,
        primaryUnit,
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
        it.hs6,
        idx + 1,
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

export type TradeReportHtmlOptions = {
  flow?: TradeFlow;
  rankingDimension?: TradeRankingDimension;
};

/**
 * 生成可一键打印为 A4 PDF 的自包含矢量分析报告 HTML（对齐 scstriker/customs-data 与 PDF 操作说明）。
 */
export function buildTradeReportHtml(
  rawSnap: TradeOverviewPublished,
  charts: TradeReportEmbeddedCharts = {},
  options: TradeReportHtmlOptions = {},
): string {
  const snap = normalizeTradeOverviewSnapshot(rawSnap);
  const flow: TradeFlow = options.flow === "export" ? "export" : "import";
  const rankingDim: TradeRankingDimension = options.rankingDimension ?? "partners";
  const flowShort = flow === "export" ? "出口" : "进口";
  const flowLabel = flow === "export" ? "出口目的地" : "进口来源";

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

  const rankedItems = getTopStructureRankingByFlow(snap, rankingDim, flow, 10);
  const isPartnersDim = rankingDim === "partners";
  const rankingSectionTitle =
    rankingDim === "partners"
      ? `二、前十大贸易伙伴流向与双边份额（按${flowShort}额排序）`
      : rankingDim === "regions"
        ? `二、国内收发货人注册地省市 Top 10（按${flowShort}额排序）`
        : `二、海关贸易方式构成排名（按${flowShort}额排序）`;
  const rankingNameHeader =
    rankingDim === "partners" ? "贸易伙伴" : rankingDim === "regions" ? "收发货人注册地" : "贸易方式";

  const rankingRowsHtml = rankedItems
    .map(
      (item, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(item.name)} (${escapeHtml(item.code)})</td>
        <td class="num">${fmtYi(item.importUsd)}</td>
        <td class="num">${item.importSharePct !== null ? `${item.importSharePct.toFixed(2)}%` : "—"}</td>
        <td class="num">${fmtYi(item.exportUsd)}</td>
        <td class="num">${item.exportSharePct !== null ? `${item.exportSharePct.toFixed(2)}%` : "—"}</td>
        ${isPartnersDim ? `<td>${escapeHtml(item.topCategory ?? "—")}</td>` : ""}
      </tr>`,
    )
    .join("\n");

  const rankingChartTitle =
    rankingDim === "partners"
      ? `图 3 · 前十大贸易伙伴（${flowShort}侧）`
      : rankingDim === "regions"
        ? `图 3 · 国内省市注册地 Top 10（${flowShort}侧）`
        : `图 3 · 海关贸易方式构成（${flowShort}侧）`;

  const chartBlock = (title: string, svg?: string) =>
    svg
      ? `<div class="chart-card"><h3>${escapeHtml(title)}</h3><div class="svg-wrap">${svg}</div></div>`
      : "";

  const startMonthLabel = snap.coverage.months[0] ?? snap.period;
  const endMonthLabel = snap.coverage.months[snap.coverage.months.length - 1] ?? snap.period;

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
        数据来源：中华人民共和国海关总署统计平台 (USD) · 字典版本：${escapeHtml(snap.dictVersion)} · 快照版本 releaseId：${escapeHtml(snap.releaseId)} · 覆盖月份：${escapeHtml(startMonthLabel)} 至 ${escapeHtml(endMonthLabel)}
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
      ${chartBlock(`图 2 · 11大类医疗器械${flowShort}构成结构`, charts.categorySvg)}
      ${chartBlock(rankingChartTitle, charts.rankingSvg)}
      ${chartBlock(`图 4 · 一级类别${flowLabel} CR3 集中度`, charts.cr3Svg)}
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

    <h2 class="sec-title">${escapeHtml(rankingSectionTitle)}</h2>
    <table>
      <thead>
        <tr>
          <th class="num">排名</th>
          <th>${escapeHtml(rankingNameHeader)}</th>
          <th class="num">进口额(亿美元)</th>
          <th class="num">占进口比重</th>
          <th class="num">出口额(亿美元)</th>
          <th class="num">占出口比重</th>
          ${isPartnersDim ? "<th>双边主导类别</th>" : ""}
        </tr>
      </thead>
      <tbody>${rankingRowsHtml}</tbody>
    </table>

    <footer>
      溯源校验：releaseId=${escapeHtml(snap.releaseId)} · dictVersion=${escapeHtml(snap.dictVersion)} · 原始批次=${snap.sourceBatches.length} 批（首批次 SHA-256: ${escapeHtml(snap.sourceBatches[0]?.sourceSha256 ?? "N/A")}）。
    </footer>
  </div>
</body>
</html>`;
}
