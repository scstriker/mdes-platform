import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconArrowRight, IconFileSpreadsheet, IconFileText } from "@tabler/icons-react";
import {
  getTopStructureRankingByFlow,
  matchesQuery,
  type TradeCategoryStat,
  type TradeFlow,
  type TradeHsItemStat,
  type TradeOverviewPublished,
  type TradePartnerStat,
  type TradeRegimeStat,
  type TradeRegionStat,
} from "@mdes/shared";
import bannerTrade from "@/assets/visuals/banner-trade.webp";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { StatistaFigure, type StatistaTableColumn } from "@/components/layout/statista-figure";
import type { ChartOption } from "@/lib/charts/echarts";
import type { ChartTheme } from "@/lib/charts/theme";
import {
  formatBalanceYi,
  formatQtyStat,
  formatSharePct,
  formatUsdToYi,
  formatYoyPct,
} from "@/lib/trade-format";
import { cn } from "@/lib/utils";
import {
  buildCategoryDonutOption,
  buildCr3ChartOption,
  buildCr3RankingItems,
  buildStructureRankingOption,
  buildTrendChartOption,
  filterAnnualTrendByYearRange,
  type StructureRankingDimension,
  type TrendGranularity,
} from "./trade-chart-options";
import { exportTradeReportHtml, exportTradeSummaryDualCsv } from "./trade-report-export";

export {
  buildCategoryDonutOption,
  buildStructureRankingOption,
  filterAnnualTrendByYearRange,
  type StructureRankingDimension,
};

type LiveTradeTab = "categories" | "hs" | "partners" | "regimes" | "regions";
const VALID_LIVE_TABS: readonly LiveTradeTab[] = ["categories", "hs", "partners", "regimes", "regions"];

function parseLiveTab(raw: string | null): LiveTradeTab {
  if (raw && (VALID_LIVE_TABS as readonly string[]).includes(raw)) {
    return raw as LiveTradeTab;
  }
  return "categories";
}

export function LiveTradeView({ snap }: { snap: TradeOverviewPublished }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryText = searchParams.get("q") ?? "";
  const normalizedQ = queryText.trim().toLowerCase();
  const explicitTab = searchParams.get("tab");
  const requestedTab = parseLiveTab(explicitTab);
  const selectedFlow: TradeFlow = searchParams.get("flow") === "export" ? "export" : "import";

  const availableYears = useMemo(
    () => (snap.annualTrend ?? []).map((p) => p.year),
    [snap.annualTrend],
  );
  const minYear = availableYears[0] ?? Number(snap.period.slice(0, 4));
  const maxYear = availableYears[availableYears.length - 1] ?? minYear;

  const [trendMode, setTrendMode] = useState<TrendGranularity>(() =>
    (snap.annualTrend?.length ?? 0) >= 2 ? "annual" : "monthly",
  );
  const [startYear, setStartYear] = useState<number>(minYear);
  const [endYear, setEndYear] = useState<number>(maxYear);
  const [rankingDim, setRankingDim] = useState<StructureRankingDimension>("partners");

  useEffect(() => {
    setStartYear(minYear);
    setEndYear(maxYear);
    setTrendMode((snap.annualTrend?.length ?? 0) >= 2 ? "annual" : "monthly");
  }, [minYear, maxYear, snap.annualTrend?.length]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setActiveTab = useCallback(
    (nextTab: LiveTradeTab) => {
      const next = new URLSearchParams(searchParams);
      if (nextTab === "categories" && !normalizedQ) next.delete("tab");
      else next.set("tab", nextTab);
      setSearchParams(next, { replace: true });
    },
    [normalizedQ, searchParams, setSearchParams],
  );

  const activeConc = selectedFlow === "export" ? snap.concentration.export : snap.concentration.import;
  const flowLabel = selectedFlow === "export" ? "出口目的地" : "进口来源";
  const flowShort = selectedFlow === "export" ? "出口" : "进口";

  const filteredCategories = useMemo(() => {
    if (!normalizedQ) return snap.categories;
    return snap.categories.filter((r) =>
      matchesQuery(`${r.category} ${r.hsRange} ${r.topImportPartners.join(" ")} ${r.topExportPartners.join(" ")}`, normalizedQ),
    );
  }, [normalizedQ, snap.categories]);

  const filteredHs = useMemo(() => {
    if (!normalizedQ) return snap.hsItems;
    return snap.hsItems.filter((r) =>
      matchesQuery(
        `${r.hs8} ${r.hs6} ${r.itemName} ${r.category} ${r.topImportPartners.join(" ")} ${r.topExportPartners.join(" ")}`,
        normalizedQ,
      ),
    );
  }, [normalizedQ, snap.hsItems]);

  const filteredPartners = useMemo(() => {
    if (!normalizedQ) return snap.partners;
    return snap.partners.filter((r) =>
      matchesQuery(`${r.partnerCode} ${r.partnerName} ${r.topCategory}`, normalizedQ),
    );
  }, [normalizedQ, snap.partners]);

  const filteredRegimes = useMemo(() => {
    if (!normalizedQ) return snap.regimes;
    return snap.regimes.filter((r) => matchesQuery(`${r.regimeCode} ${r.regimeName}`, normalizedQ));
  }, [normalizedQ, snap.regimes]);

  const filteredRegions = useMemo(() => {
    if (!normalizedQ) return snap.regions;
    return snap.regions.filter((r) => matchesQuery(`${r.regionCode} ${r.regionName}`, normalizedQ));
  }, [normalizedQ, snap.regions]);

  const tableTabs: { key: LiveTradeTab; label: string; count: number }[] = [
    { key: "categories", label: `医疗器械品类结构 (${snap.categories.length}类)`, count: filteredCategories.length },
    { key: "hs", label: `HS8 税号与双数量 (${snap.hsItems.length}项)`, count: filteredHs.length },
    { key: "partners", label: "贸易伙伴流向", count: filteredPartners.length },
    { key: "regimes", label: "贸易方式结构", count: filteredRegimes.length },
    { key: "regions", label: "收发货人注册地", count: filteredRegions.length },
  ];

  const activeTab: LiveTradeTab =
    !explicitTab && normalizedQ && (tableTabs.find((t) => t.key === requestedTab)?.count ?? 0) === 0
      ? (tableTabs.find((t) => t.count > 0)?.key ?? requestedTab)
      : requestedTab;

  const activeTabMeta = tableTabs.find((t) => t.key === activeTab) ?? tableTabs[0];
  const fallbackTab = useMemo(() => {
    if (!normalizedQ || activeTabMeta.count > 0) return null;
    return tableTabs.find((t) => t.key !== activeTab && t.count > 0) ?? null;
  }, [normalizedQ, activeTabMeta.count, activeTab, tableTabs]);

  const totalUsdValue = snap.totals.totalUsd ?? snap.totals.importUsd + snap.totals.exportUsd;

  const kpis = [
    {
      id: "total",
      label: `${snap.period} 进出口总额`,
      value: formatUsdToYi(totalUsdValue, 4),
      unit: "亿美元",
      subline: `原额 ${totalUsdValue.toLocaleString("zh-CN")} 美元 · 同比 ${formatYoyPct(snap.totals.totalYoyPct ?? null)}`,
    },
    {
      id: "export",
      label: `${snap.period} 出口额`,
      value: formatUsdToYi(snap.totals.exportUsd, 4),
      unit: "亿美元",
      subline: `原额 ${snap.totals.exportUsd.toLocaleString("zh-CN")} 美元 · 同比 ${formatYoyPct(snap.totals.exportYoyPct)}`,
    },
    {
      id: "import",
      label: `${snap.period} 进口额`,
      value: formatUsdToYi(snap.totals.importUsd, 4),
      unit: "亿美元",
      subline: `原额 ${snap.totals.importUsd.toLocaleString("zh-CN")} 美元 · 同比 ${formatYoyPct(snap.totals.importYoyPct)}`,
    },
    {
      id: "balance",
      label: "贸易顺逆差",
      value: formatBalanceYi(snap.totals.balanceUsd, 4),
      unit: "亿美元",
      subline: `原额 ${snap.totals.balanceUsd.toLocaleString("zh-CN")} 美元 · 出口减进口`,
    },
    {
      id: "concentration",
      label: `${flowLabel}集中度 CR3`,
      value: formatSharePct(activeConc.cr3),
      subline: `CR1 ${formatSharePct(activeConc.cr1)} · CR5 ${formatSharePct(activeConc.cr5)} · HHI ${activeConc.hhi ?? "暂无数据"}`,
    },
  ];

  const filteredAnnualPoints = useMemo(
    () => filterAnnualTrendByYearRange(snap.annualTrend ?? [], startYear, endYear),
    [snap.annualTrend, startYear, endYear],
  );

  const activeTrendRows = useMemo(() => {
    if (trendMode === "annual" && filteredAnnualPoints.length > 0) {
      return filteredAnnualPoints.map((pt) => ({
        period: pt.period,
        totalYi: formatUsdToYi(pt.totalUsd, 4),
        exportYi: formatUsdToYi(pt.exportUsd, 4),
        importYi: formatUsdToYi(pt.importUsd, 4),
        balanceYi: formatBalanceYi(pt.balanceUsd, 4),
        exportRawUsd: pt.exportUsd,
        importRawUsd: pt.importUsd,
        exportYoy: formatYoyPct(pt.exportYoyPct),
        importYoy: formatYoyPct(pt.importYoyPct),
      }));
    }
    return snap.trend.map((pt) => ({
      period: pt.period,
      totalYi: formatUsdToYi(pt.importUsd + pt.exportUsd, 4),
      exportYi: formatUsdToYi(pt.exportUsd, 4),
      importYi: formatUsdToYi(pt.importUsd, 4),
      balanceYi: formatBalanceYi(pt.balanceUsd, 4),
      exportRawUsd: pt.exportUsd,
      importRawUsd: pt.importUsd,
      exportYoy: formatYoyPct(pt.exportYoyPct),
      importYoy: formatYoyPct(pt.importYoyPct),
    }));
  }, [filteredAnnualPoints, snap.trend, trendMode]);

  const trendColumns: readonly StatistaTableColumn[] = [
    { key: "period", title: "统计期间", align: "left" },
    { key: "totalYi", title: "总额(亿美元)", align: "right" },
    { key: "exportYi", title: "出口额(亿美元)", align: "right" },
    { key: "importYi", title: "进口额(亿美元)", align: "right" },
    { key: "balanceYi", title: "差额(亿美元)", align: "right" },
    { key: "exportRawUsd", title: "出口原额(美元)", align: "right" },
    { key: "importRawUsd", title: "进口原额(美元)", align: "right" },
  ];

  const categoryDonutColumns: readonly StatistaTableColumn[] = [
    { key: "category", title: "一级类别", align: "left" },
    { key: "hs8Count", title: "税号数", align: "right" },
    { key: "amountYi", title: `${flowShort}额(亿美元)`, align: "right" },
    { key: "sharePct", title: `占${flowShort}比重`, align: "right" },
    { key: "yoyPct", title: `${flowShort}同比`, align: "right" },
  ];

  const categoryDonutRows = useMemo(() => {
    const denom = selectedFlow === "export" ? snap.totals.exportUsd : snap.totals.importUsd;
    return [...snap.categories]
      .sort((a, b) =>
        selectedFlow === "export" ? b.exportUsd - a.exportUsd : b.importUsd - a.importUsd,
      )
      .map((c) => {
        const amt = selectedFlow === "export" ? c.exportUsd : c.importUsd;
        const pct = denom > 0 ? (amt / denom) * 100 : null;
        const yoy = selectedFlow === "export" ? c.exportYoyPct : c.importYoyPct;
        return {
          category: c.category,
          hs8Count: c.hs8Count,
          amountYi: formatUsdToYi(amt, 4),
          sharePct: formatSharePct(pct),
          yoyPct: formatYoyPct(yoy),
        };
      });
  }, [selectedFlow, snap.categories, snap.totals.exportUsd, snap.totals.importUsd]);

  const rankingColumns: readonly StatistaTableColumn[] = [
    { key: "name", title: rankingDim === "partners" ? "贸易伙伴" : rankingDim === "regions" ? "收发货人注册地" : "贸易方式", align: "left" },
    { key: "importYi", title: "进口额(亿美元)", align: "right" },
    { key: "importShare", title: "占进口比重", align: "right" },
    { key: "exportYi", title: "出口额(亿美元)", align: "right" },
    { key: "exportShare", title: "占出口比重", align: "right" },
  ];

  const rankingRows = useMemo(() => {
    const ranked = getTopStructureRankingByFlow(snap, rankingDim, selectedFlow, 10);
    return ranked.map((item) => ({
      name: `${item.name} (${item.code})`,
      importYi: formatUsdToYi(item.importUsd, 4),
      importShare: formatSharePct(item.importSharePct),
      exportYi: formatUsdToYi(item.exportUsd, 4),
      exportShare: formatSharePct(item.exportSharePct),
    }));
  }, [rankingDim, selectedFlow, snap]);

  const cr3RankingItems = useMemo(
    () => buildCr3RankingItems(snap.categories, selectedFlow),
    [selectedFlow, snap.categories],
  );

  const cr3Columns: readonly StatistaTableColumn[] = [
    { key: "name", title: "医疗器械一级类别", align: "left" },
    { key: "cr3Text", title: `${flowLabel} CR3`, align: "right" },
    { key: "hhi", title: "HHI 指数", align: "right" },
    { key: "topPartners", title: "前三位伙伴", align: "left" },
  ];

  const trendOption = useCallback(
    (t: ChartTheme): ChartOption => buildTrendChartOption(t, snap, { trendMode, startYear, endYear }),
    [endYear, snap, startYear, trendMode],
  );

  const donutOption = useCallback(
    (t: ChartTheme): ChartOption => buildCategoryDonutOption(t, snap.categories, selectedFlow),
    [selectedFlow, snap.categories],
  );

  const structureRankingOption = useCallback(
    (t: ChartTheme): ChartOption => buildStructureRankingOption(t, snap, rankingDim, selectedFlow),
    [rankingDim, selectedFlow, snap],
  );

  const cr3Option = useCallback(
    (t: ChartTheme): ChartOption => buildCr3ChartOption(t, snap.categories, selectedFlow),
    [selectedFlow, snap.categories],
  );

  const categoryColumns: DataTableColumn<TradeCategoryStat>[] = useMemo(
    () => [
      {
        key: "category",
        title: "一级类别",
        primary: true,
        cell: (r) => <span className="font-semibold text-ink">{r.category}</span>,
      },
      { key: "hs8Count", title: "税号数", type: "number", digits: 0, colClassName: "w-24" },
      {
        key: "exportUsd",
        title: "出口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.exportUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.exportUsd, 4)}</span>,
      },
      {
        key: "importUsd",
        title: "进口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.importUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.importUsd, 4)}</span>,
      },
      {
        key: "balanceUsd",
        title: "差额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.balanceUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatBalanceYi(r.balanceUsd, 4)}</span>,
      },
      {
        key: "cr3",
        title: `${flowLabel} CR3`,
        align: "right",
        colClassName: "w-28",
        cell: (r) => {
          const c = selectedFlow === "export" ? r.exportConcentration : r.importConcentration;
          return <span className="font-semibold text-brand-navy tabular-nums">{formatSharePct(c.cr3)}</span>;
        },
      },
      {
        key: "yoy",
        title: selectedFlow === "export" ? "出口同比" : "进口同比",
        align: "right",
        colClassName: "w-28",
        cell: (r) => (
          <span className="whitespace-nowrap text-ink-muted tabular-nums">
            {formatYoyPct(selectedFlow === "export" ? r.exportYoyPct : r.importYoyPct)}
          </span>
        ),
      },
      {
        key: "tops",
        title: "前三位伙伴",
        colClassName: "w-44",
        cell: (r) => (
          <span className="body-sm text-ink-muted">
            {(selectedFlow === "export" ? r.topExportPartners : r.topImportPartners).join(" / ") || "暂无数据"}
          </span>
        ),
      },
    ],
    [flowLabel, selectedFlow],
  );

  const hsColumns: DataTableColumn<TradeHsItemStat>[] = useMemo(
    () => [
      { key: "hs8", title: "8位 HS 税号", type: "code", colClassName: "w-28" },
      {
        key: "itemName",
        title: "海关商品名称与计量数量（含数量同比）",
        primary: true,
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{r.itemName}</span>
            <span className="caption text-ink-muted">
              进口量：{formatQtyStat(r.importQty1)}
              {r.importQty2.value !== null ? ` / ${formatQtyStat(r.importQty2)}` : ""}
              {r.importQty1YoyPct !== null && r.importQty1YoyPct !== undefined
                ? `（量同比 ${formatYoyPct(r.importQty1YoyPct)}）`
                : ""}{" "}
              · 出口量：{formatQtyStat(r.exportQty1)}
              {r.exportQty1YoyPct !== null && r.exportQty1YoyPct !== undefined
                ? `（量同比 ${formatYoyPct(r.exportQty1YoyPct)}）`
                : ""}
            </span>
          </div>
        ),
      },
      { key: "category", title: "一级类别", colClassName: "w-36" },
      {
        key: "importUsd",
        title: "进口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.importUsd,
        cell: (r) => (
          <div className="grid gap-0.5 text-right tabular-nums">
            <span className="text-ink">{formatUsdToYi(r.importUsd, 4)}</span>
            <span className="caption text-ink-muted">
              {r.importUsd.toLocaleString("zh-CN")} USD · {formatYoyPct(r.importYoyPct)}
            </span>
          </div>
        ),
      },
      {
        key: "exportUsd",
        title: "出口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.exportUsd,
        cell: (r) => (
          <div className="grid gap-0.5 text-right tabular-nums">
            <span className="text-ink">{formatUsdToYi(r.exportUsd, 4)}</span>
            <span className="caption text-ink-muted">
              {r.exportUsd.toLocaleString("zh-CN")} USD · {formatYoyPct(r.exportYoyPct)}
            </span>
          </div>
        ),
      },
      {
        key: "cr3",
        title: `${flowLabel} CR3`,
        align: "right",
        colClassName: "w-28",
        cell: (r) => {
          const c = selectedFlow === "export" ? r.exportConcentration : r.importConcentration;
          const v = c.cr3;
          return (
            <Tag size="sm" tone={v !== null && v >= 70 ? "warning" : "info"}>
              {formatSharePct(v)}
            </Tag>
          );
        },
      },
    ],
    [flowLabel, selectedFlow],
  );

  const partnerColumns: DataTableColumn<TradePartnerStat>[] = useMemo(
    () => [
      {
        key: "partnerName",
        title: "贸易伙伴（海关原码）",
        primary: true,
        colClassName: "w-44",
        cell: (r) => (
          <span className="font-semibold text-ink">
            {r.partnerName} <span className="code text-ink-muted">{r.partnerCode}</span>
          </span>
        ),
      },
      {
        key: "importUsd",
        title: "进口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.importUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.importUsd, 4)}</span>,
      },
      {
        key: "importSharePct",
        title: "占我国进口",
        align: "right",
        colClassName: "w-28",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.importSharePct)}</span>,
      },
      {
        key: "exportUsd",
        title: "出口额(亿美元)",
        align: "right",
        sortable: true,
        colClassName: "w-36",
        value: (r) => r.exportUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.exportUsd, 4)}</span>,
      },
      {
        key: "exportSharePct",
        title: "占我国出口",
        align: "right",
        colClassName: "w-28",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.exportSharePct)}</span>,
      },
      { key: "topCategory", title: "双边主导类别" },
    ],
    [],
  );

  const regimeColumns: DataTableColumn<TradeRegimeStat>[] = useMemo(
    () => [
      {
        key: "regimeName",
        title: "贸易方式（海关代码）",
        primary: true,
        cell: (r) => (
          <span className="font-semibold text-ink">
            {r.regimeName} <span className="code text-ink-muted">{r.regimeCode}</span>
          </span>
        ),
      },
      {
        key: "importUsd",
        title: "进口额(亿美元)",
        align: "right",
        value: (r) => r.importUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.importUsd, 4)}</span>,
      },
      {
        key: "importSharePct",
        title: "占进口比重",
        align: "right",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.importSharePct)}</span>,
      },
      {
        key: "exportUsd",
        title: "出口额(亿美元)",
        align: "right",
        value: (r) => r.exportUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.exportUsd, 4)}</span>,
      },
      {
        key: "exportSharePct",
        title: "占出口比重",
        align: "right",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.exportSharePct)}</span>,
      },
    ],
    [],
  );

  const regionColumns: DataTableColumn<TradeRegionStat>[] = useMemo(
    () => [
      {
        key: "regionName",
        title: "收发货人注册地（海关代码）",
        primary: true,
        cell: (r) => (
          <span className="font-semibold text-ink">
            {r.regionName} <span className="code text-ink-muted">{r.regionCode}</span>
          </span>
        ),
      },
      {
        key: "importUsd",
        title: "进口额(亿美元)",
        align: "right",
        value: (r) => r.importUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.importUsd, 4)}</span>,
      },
      {
        key: "importSharePct",
        title: "占进口比重",
        align: "right",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.importSharePct)}</span>,
      },
      {
        key: "exportUsd",
        title: "出口额(亿美元)",
        align: "right",
        value: (r) => r.exportUsd,
        cell: (r) => <span className="tabular-nums text-ink">{formatUsdToYi(r.exportUsd, 4)}</span>,
      },
      {
        key: "exportSharePct",
        title: "占出口比重",
        align: "right",
        cell: (r) => <span className="tabular-nums text-ink-muted">{formatSharePct(r.exportSharePct)}</span>,
      },
    ],
    [],
  );

  const rankingTitleMap: Record<StructureRankingDimension, string> = {
    partners: `前十大贸易伙伴${flowShort}额与双边比重`,
    regions: `国内收发货人注册地省市${flowShort} Top 10`,
    regimes: `海关贸易方式${flowShort}构成排名`,
  };

  return (
    <div>
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <PageVisualBanner
            title="医疗器械进出口贸易与供应链集中度"
            summary={`中国海关月度美元已发布快照 · 期间 ${snap.period} · 字典版本 ${snap.dictVersion}（共覆盖 ${snap.coverage.coveredHs8Count} 项适用 HS8、${snap.coverage.coveredMonths} 个自然月）。`}
            image={bannerTrade}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="btn-export-trade-report"
                  onClick={() => {
                    void exportTradeReportHtml(snap, {
                      flow: selectedFlow,
                      rankingDimension: rankingDim,
                      trendMode,
                      startYear,
                      endYear,
                    });
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-brand-navy bg-brand-navy px-3 py-1.5 body-sm font-semibold text-on-brand transition-colors focus-ring"
                >
                  <IconFileText size={16} aria-hidden="true" />
                  导出 A4 分析报告
                </button>
                <button
                  type="button"
                  data-testid="btn-export-trade-summary-csv"
                  onClick={() => exportTradeSummaryDualCsv(snap)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 py-1.5 body-sm font-semibold text-brand-navy transition-colors hover:border-brand-navy focus-ring"
                >
                  <IconFileSpreadsheet size={16} aria-hidden="true" />
                  导出年度统计汇总 CSV
                </button>
                <TextLink to={`/system/38?period=${encodeURIComponent(snap.period)}`} className="inline-flex items-center gap-1 body">
                  查看 38 号指标同版详情 →
                </TextLink>
                <TextLink
                  to={`/admin/observations?indicator_id=TRD-001&period=${encodeURIComponent(snap.period)}`}
                  className="inline-flex items-center gap-1 body"
                >
                  核查同版后台观测值 →
                </TextLink>
              </div>
            }
          />

          {/* 发布溯源与期间/流向筛选栏 */}
          <div
            data-testid="trade-release-meta"
            className="flex flex-wrap items-center justify-between gap-3 border border-border bg-info-bg px-4 py-3 body-sm text-ink"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                统计期间：<strong className="code text-brand-navy">{snap.period}</strong>
              </span>
              <span>
                字典版本：<strong className="code">{snap.dictVersion}</strong>
              </span>
              <span>
                发布版本 <span className="code text-brand-navy">{snap.releaseId}</span>
              </span>
              <span className="caption text-ink-muted">
                来源批次 {snap.sourceBatches.length} 批 · 覆盖月份 {snap.coverage.months[0]} 至{" "}
                {snap.coverage.months[snap.coverage.months.length - 1]}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 body-sm">
                <span className="text-ink-muted">已发布期间</span>
                <select
                  aria-label="选择已发布统计期间"
                  value={snap.period}
                  onChange={(e) => updateParam("period", e.target.value)}
                  className="h-8 rounded-sm border border-border-strong bg-surface px-2 body-sm text-ink focus-ring"
                >
                  {snap.availablePeriods.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <div role="group" aria-label="切换集中度流向" className="inline-flex items-center gap-1">
                {(["import", "export"] as const).map((fl) => {
                  const active = selectedFlow === fl;
                  return (
                    <button
                      key={fl}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateParam("flow", fl === "import" ? null : "export")}
                      className={cn(
                        "cursor-pointer rounded-sm border px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                        active
                          ? "border-brand-navy bg-brand-navy text-on-brand"
                          : "border-border-strong bg-surface text-ink hover:border-brand-navy",
                      )}
                    >
                      {fl === "import" ? "进口侧" : "出口侧"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            aria-label="进出口贸易核心指标"
            className="grid grid-cols-2 border-t-2 border-brand-navy border-b border-border md:grid-cols-5 md:divide-x md:divide-border"
          >
            {kpis.map((kpi, idx) => (
              <div
                key={kpi.id}
                className={cn(
                  "grid content-start gap-1 px-4 py-4 first:md:pl-0 last:md:pr-0",
                  idx < 4 && "max-md:border-b max-md:border-border",
                  idx % 2 === 0 && "max-md:border-r max-md:border-border",
                )}
              >
                <p className="label text-ink-muted">{kpi.label}</p>
                <p className="numeral text-brand-navy tabular-nums">
                  {kpi.value}
                  {kpi.unit && <span className="ml-1.5 body font-normal text-ink-muted">{kpi.unit}</span>}
                </p>
                <p className="caption text-ink-muted">{kpi.subline}</p>
              </div>
            ))}
          </div>

          {snap.narrativeSummary && (
            <div
              data-testid="trade-narrative-summary"
              className="grid gap-1.5 border border-border border-l-2 border-l-brand-navy bg-surface-sunken px-4 py-3.5 md:px-5"
            >
              <h2 className="title-sub text-brand-navy">{snap.narrativeSummary.headline}</h2>
              <p className="body-sm text-ink">{snap.narrativeSummary.scaleParagraph}</p>
              <p className="body-sm text-ink">{snap.narrativeSummary.multiYearParagraph}</p>
              <p className="body-sm text-ink-muted">{snap.narrativeSummary.structureParagraph}</p>
              <p className="caption font-semibold text-brand-navy">{snap.narrativeSummary.concentrationAlert}</p>
            </div>
          )}
        </div>
      </section>

      {!normalizedQ && (
        <section className="border-y border-border bg-surface-sunken" aria-labelledby="trade-figures-heading">
          <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
            <h2 id="trade-figures-heading" className="sr-only">
              进出口规模走势、产品构成与供应链集中度四维图表矩阵
            </h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <StatistaFigure
                id="fig-trade-trend"
                eyebrow={trendMode === "annual" ? "图 1 · 近3–5年跨年年度规模演变" : "图 1 · 已发布期间月度规模走势"}
                title={
                  trendMode === "annual"
                    ? `${startYear}—${endYear} 年海关医疗器械进出口与差额年度序列`
                    : `${snap.period} 海关医疗器械进出口与差额月度序列`
                }
                subtitle={`字典 ${snap.dictVersion} · 发布版本 ${snap.releaseId.slice(0, 8)} · 单位：亿美元`}
                badge={{ label: `release ${snap.releaseId.slice(0, 8)}`, tone: "success" }}
                controls={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div role="group" aria-label="切换跨年年度或期内月度走势" className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={trendMode === "annual"}
                        onClick={() => setTrendMode("annual")}
                        className={cn(
                          "cursor-pointer rounded-sm border px-3 py-1 caption font-semibold transition-colors focus-ring",
                          trendMode === "annual"
                            ? "border-brand-navy bg-brand-navy text-on-brand"
                            : "border-border bg-surface text-ink-muted hover:text-ink",
                        )}
                      >
                        跨年年度走势
                      </button>
                      <button
                        type="button"
                        aria-pressed={trendMode === "monthly"}
                        onClick={() => setTrendMode("monthly")}
                        className={cn(
                          "cursor-pointer rounded-sm border px-3 py-1 caption font-semibold transition-colors focus-ring",
                          trendMode === "monthly"
                            ? "border-brand-navy bg-brand-navy text-on-brand"
                            : "border-border bg-surface text-ink-muted hover:text-ink",
                        )}
                      >
                        期内月度序列
                      </button>
                    </div>

                    {trendMode === "annual" && availableYears.length >= 2 && (
                      <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                        <label className="inline-flex items-center gap-1">
                          <span>起始年</span>
                          <select
                            aria-label="选择跨年趋势起始年份"
                            value={startYear}
                            onChange={(e) => setStartYear(Number(e.target.value))}
                            className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 caption text-ink focus-ring"
                          >
                            {availableYears.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <span>截止年</span>
                          <select
                            aria-label="选择跨年趋势截止年份"
                            value={endYear}
                            onChange={(e) => setEndYear(Number(e.target.value))}
                            className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 caption text-ink focus-ring"
                          >
                            {availableYears.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                }
                option={trendOption}
                ariaLabel={`${snap.period}海关医疗器械贸易统计趋势图`}
                height={292}
                tableColumns={trendColumns}
                tableRows={activeTrendRows}
                exportName={`mdes-trade-trend-${snap.period}`}
                source={`中国海关月度美元统计 · 字典 ${snap.dictVersion} · releaseId ${snap.releaseId}`}
                note="非完整年度自动以虚线及背景带区分，同比按上年同窗口期可比税号集计算"
              />

              <StatistaFigure
                id="fig-trade-category-donut"
                eyebrow={`图 2 · 医疗器械一级类别${flowShort}构成`}
                title={`${snap.period} 医疗器械 ${snap.categories.length} 大类${flowShort}产品结构环形图`}
                subtitle={`总额 ${formatUsdToYi(selectedFlow === "export" ? snap.totals.exportUsd : snap.totals.importUsd, 4)} 亿美元 · 随右上角「进口侧 / 出口侧」联动`}
                badge={{ label: `${snap.categories.length} 大类构成`, tone: "info" }}
                option={donutOption}
                ariaLabel={`${snap.period}医疗器械一级类别${flowShort}构成环形饼图`}
                height={292}
                tableColumns={categoryDonutColumns}
                tableRows={categoryDonutRows}
                exportName={`mdes-trade-categories-${selectedFlow}-${snap.period}`}
                source={`中国海关 8 位 HS 商品编码统计 · releaseId ${snap.releaseId}`}
                note="对齐海关统计平台操作说明产品构成饼图与年度分类汇总表"
              />

              <StatistaFigure
                id="fig-trade-structure-ranking"
                eyebrow={`图 3 · 多维流向与注册地 Top 10`}
                title={`${snap.period} ${rankingTitleMap[rankingDim]}`}
                subtitle={`按当前所选「${flowShort}侧」金额降序排列 · 单位：亿美元（括号内为占全国${flowShort}比重）`}
                badge={{ label: `${flowShort}侧排名`, tone: "info" }}
                controls={
                  <div role="group" aria-label="切换贸易结构排名维度" className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ["partners", "贸易伙伴 Top 10"],
                        ["regions", "国内省市 Top 10"],
                        ["regimes", "贸易方式结构"],
                      ] as const
                    ).map(([dimKey, label]) => (
                      <button
                        key={dimKey}
                        type="button"
                        aria-pressed={rankingDim === dimKey}
                        onClick={() => setRankingDim(dimKey)}
                        className={cn(
                          "cursor-pointer rounded-sm border px-3 py-1 caption font-semibold transition-colors focus-ring",
                          rankingDim === dimKey
                            ? "border-brand-navy bg-brand-navy text-on-brand"
                            : "border-border bg-surface text-ink-muted hover:text-ink",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
                option={structureRankingOption}
                ariaLabel={`${snap.period}${rankingTitleMap[rankingDim]}横向条形图`}
                height={316}
                tableColumns={rankingColumns}
                tableRows={rankingRows}
                exportName={`mdes-trade-${rankingDim}-${selectedFlow}-${snap.period}`}
                source={`中国海关分组明细对账快照 · releaseId ${snap.releaseId}`}
                note="支持伙伴国（地区）、国内收发货人注册省市（31省市关区）与贸易方式三维原地切换"
              />

              <StatistaFigure
                id="fig-trade-concentration"
                eyebrow={`图 4 · ${flowLabel}集中度`}
                title={`${snap.period} 医疗器械一级类别${flowLabel} CR3 集中度`}
                subtitle={`全篮子 CR3 ${formatSharePct(activeConc.cr3)} · HHI ${activeConc.hhi ?? "暂无数据"}（0–10,000 刻度）`}
                badge={{ label: `全篮子 CR3 ${formatSharePct(activeConc.cr3)}`, tone: "warning" }}
                option={cr3Option}
                ariaLabel={`${snap.period}医疗器械${flowLabel}集中度 CR3 横向条形图`}
                height={316}
                tableColumns={cr3Columns}
                tableRows={cr3RankingItems}
                exportName={`mdes-trade-cr3-${snap.period}`}
                source={`中国海关 8 位 HS 商品编码统计 · releaseId ${snap.releaseId}`}
                note="跨月期间先合并同一伙伴美元金额再计算份额、CR1/CR3/CR5 与 HHI"
              />
            </div>
          </div>
        </section>
      )}

      <section className="bg-surface" aria-labelledby="trade-directory-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <h2 id="trade-directory-heading" className="title-sub text-brand-navy">
                医疗器械贸易结构与税号明细查询台（{snap.period}）
              </h2>
              <p className="caption text-ink-muted">
                四种分组（全国商品 {snap.groupingTotals.product.importUsd.toLocaleString("zh-CN")} 美元 / 伙伴{" "}
                {snap.groupingTotals.partner.importUsd.toLocaleString("zh-CN")} 美元 / 方式{" "}
                {snap.groupingTotals.regime.importUsd.toLocaleString("zh-CN")} 美元 / 注册地{" "}
                {snap.groupingTotals.region.importUsd.toLocaleString("zh-CN")} 美元）已逐码对账一致。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="trade-local-filter" className="sr-only">
                本表关键词筛选
              </label>
              <input
                id="trade-local-filter"
                type="search"
                value={queryText}
                onChange={(e) => updateParam("q", e.target.value.trim() ? e.target.value : null)}
                placeholder="筛选品类、HS8税号、伙伴、方式或注册地…"
                className="h-9 w-64 rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink outline-none focus:border-brand-navy"
              />
              <span className="caption text-ink-muted tabular-nums">
                当前栏目共 {formatNumber(activeTabMeta.count)} 条记录
              </span>
              <TextLink inline to={`/admin/import?seq=38`} className="caption">
                38号向导导入 →
              </TextLink>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="贸易结构与关键税号目录切换"
            className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border"
          >
            {tableTabs.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={`trade-dir-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={selected ? `trade-dir-panel-${tab.key}` : undefined}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "cursor-pointer border-b-2 pb-3 body transition-colors focus-ring",
                    selected
                      ? "border-brand-navy font-semibold text-brand-navy"
                      : "border-transparent text-ink-muted hover:text-brand-navy",
                  )}
                >
                  {tab.label}
                  {normalizedQ && (
                    <span className="ml-1.5 caption text-ink-muted tabular-nums">({formatNumber(tab.count)})</span>
                  )}
                </button>
              );
            })}
          </div>

          {fallbackTab && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 border border-border border-l-2 border-l-brand-navy bg-info-bg px-4 py-3"
            >
              <p className="body-sm text-ink">
                当前「{activeTabMeta.label}」未命中「{queryText.trim()}」，但在「{fallbackTab.label}」中匹配到{" "}
                <span className="font-semibold text-brand-navy tabular-nums">{formatNumber(fallbackTab.count)}</span> 条。
              </p>
              <button
                type="button"
                onClick={() => setActiveTab(fallbackTab.key)}
                className="inline-flex cursor-pointer items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
              >
                点击切换至{fallbackTab.label}
                <IconArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          {activeTab === "categories" && (
            <div id="trade-dir-panel-categories" role="tabpanel" aria-labelledby="trade-dir-tab-categories">
              <DataTable
                caption="医疗器械一级类别进出口与集中度明细表"
                columns={categoryColumns}
                data={filteredCategories}
                getRowId={(r) => r.categoryId}
                empty="没有匹配当前检索词的医疗器械类别"
                fixedLayout
                dense
              />
            </div>
          )}

          {activeTab === "hs" && (
            <div id="trade-dir-panel-hs" role="tabpanel" aria-labelledby="trade-dir-tab-hs">
              <DataTable
                caption="海关 8 位商品编码进出口额与双数量明细表"
                columns={hsColumns}
                data={filteredHs}
                getRowId={(r) => r.hs8}
                empty="没有匹配当前检索词的 8 位海关税号"
                fixedLayout
                dense
              />
            </div>
          )}

          {activeTab === "partners" && (
            <div id="trade-dir-panel-partners" role="tabpanel" aria-labelledby="trade-dir-tab-partners">
              <DataTable
                caption="中国医疗器械贸易伙伴流向与份额表"
                columns={partnerColumns}
                data={filteredPartners}
                getRowId={(r) => r.partnerCode}
                empty="没有匹配当前检索词的贸易伙伴"
                fixedLayout
                dense
              />
            </div>
          )}

          {activeTab === "regimes" && (
            <div id="trade-dir-panel-regimes" role="tabpanel" aria-labelledby="trade-dir-tab-regimes">
              <DataTable
                caption="中国医疗器械贸易方式结构表"
                columns={regimeColumns}
                data={filteredRegimes}
                getRowId={(r) => r.regimeCode}
                empty="没有匹配当前检索词的贸易方式"
                dense
              />
            </div>
          )}

          {activeTab === "regions" && (
            <div id="trade-dir-panel-regions" role="tabpanel" aria-labelledby="trade-dir-tab-regions">
              <DataTable
                caption="中国医疗器械收发货人注册地结构表"
                columns={regionColumns}
                data={filteredRegions}
                getRowId={(r) => r.regionCode}
                empty="没有匹配当前检索词的收发货人注册地"
                dense
              />
            </div>
          )}

          <div className="border-t border-border pt-3 caption text-ink-muted">
            可追溯批次（共 {snap.sourceBatches.length} 批，首尾示例）：
            {snap.sourceBatches.slice(0, 2).map((b) => (
              <span key={b.batchId} className="ml-2 code">
                [{b.month} {b.flow}/{b.grouping} sha256:{b.sourceSha256.slice(0, 12)}…]
              </span>
            ))}
            {" · "}
            <TextLink inline to="/admin/batches">
              查看全部导入批次
            </TextLink>
          </div>
        </div>
      </section>
    </div>
  );
}
