import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IconArrowRight } from "@tabler/icons-react";
import { matchesQuery } from "@mdes/shared";
import bannerTrade from "@/assets/visuals/banner-trade.webp";
import { DataTable, formatNumber, Notice, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { QueryError } from "@/components/layout/query-error";
import { StatistaFigure, type StatistaTableColumn } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { ApiError, useTradeOverview, useTradePeriods } from "@/lib/api";
import type { ChartOption } from "@/lib/charts/echarts";
import {
  baseOption,
  categoryAxis,
  statistaHorizontalBarOption,
  statistaTrendWithPartialOption,
  valueAxis,
  type ChartTheme,
} from "@/lib/charts/theme";
import { cn } from "@/lib/utils";
import {
  HIGH_CONCENTRATION_HS,
  TRADE_ANNUAL_SERIES,
  TRADE_CATEGORIES,
  TRADE_CR3_RANKING,
  TRADE_KPIS,
  TRADE_PARTNER_ROWS,
  type HighConcentrationHsRow,
  type TradeCategoryRow,
  type TradePartnerRow,
} from "./data";
import { LiveTradeView } from "./live-trade-view";

type LeftFigureView = "trend" | "partners";
type TradeTableTab = "categories" | "hs" | "partners";

const VALID_TRADE_TABS: readonly TradeTableTab[] = ["categories", "hs", "partners"];
const TOP5_PARTNERS = TRADE_PARTNER_ROWS.slice(0, 5);

const TREND_TABLE_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "period", title: "统计期间", align: "left" },
  { key: "exportUsd", title: "出口额(亿美元)", align: "right" },
  { key: "importUsd", title: "进口额(亿美元)", align: "right" },
  { key: "surplusUsd", title: "贸易顺差(亿美元)", align: "right" },
  { key: "exportYoy", title: "出口同比", align: "right" },
  { key: "importYoy", title: "进口同比", align: "right" },
];

const TREND_TABLE_ROWS: readonly Record<string, string | number>[] = TRADE_ANNUAL_SERIES.map((d) => ({
  period: d.period,
  exportUsd: d.exportUsd.toFixed(1),
  importUsd: d.importUsd.toFixed(1),
  surplusUsd: d.surplusUsd.toFixed(1),
  exportYoy: d.exportYoy,
  importYoy: d.importYoy,
}));

const PARTNER_FIG_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "country", title: "伙伴国", align: "left" },
  { key: "importShare", title: "占进口份额", align: "right" },
  { key: "exportShare", title: "占出口份额", align: "right" },
  { key: "focusCategory", title: "双边核心品类", align: "left" },
];

const PARTNER_FIG_ROWS: readonly Record<string, string | number>[] = TOP5_PARTNERS.map((d) => ({
  country: `${d.country} (${d.iso})`,
  importShare: `${d.importShare.toFixed(1)}%`,
  exportShare: `${d.exportShare.toFixed(1)}%`,
  focusCategory: d.focusCategory,
}));

const CR3_TABLE_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "name", title: "关键部件或品类", align: "left" },
  { key: "tier", title: "统计层级", align: "left" },
  { key: "cr3", title: "进口 CR3", align: "right" },
  { key: "topOrigins", title: "前三大来源国", align: "left" },
];

const CR3_TABLE_ROWS: readonly Record<string, string | number>[] = TRADE_CR3_RANKING.map((d) => ({
  name: d.name,
  tier: d.tier,
  cr3: `${d.cr3.toFixed(1)}%`,
  topOrigins: d.topOrigins,
}));

function parseTradeTab(raw: string | null): TradeTableTab {
  if (raw && (VALID_TRADE_TABS as readonly string[]).includes(raw)) {
    return raw as TradeTableTab;
  }
  return "categories";
}

export default function TradePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPeriod = searchParams.get("period")?.trim() ?? "";
  const tradeOverview = useTradeOverview(requestedPeriod || undefined);
  const tradePeriods = useTradePeriods(undefined, Boolean(requestedPeriod));

  if (tradeOverview.isError) {
    const err = tradeOverview.error;
    const isUnpublishedPeriod =
      Boolean(requestedPeriod) && err instanceof ApiError && err.status === 404;

    if (isUnpublishedPeriod) {
      const avail = tradePeriods.data?.availablePeriods ?? [];
      return (
        <section className="bg-surface">
          <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
            <PageVisualBanner
              title="医疗器械进出口贸易与供应链集中度"
              summary="按统计期间读取中国海关月度美元已发布快照，未齐备的年度或季度不提前混算发布。"
              image={bannerTrade}
              actions={
                <TextLink to="/system/38" className="inline-flex items-center gap-1 body">
                  查看海关贸易统计口径 →
                </TextLink>
              }
            />
            <div data-testid="trade-unpublished-period" className="grid gap-4">
              <Notice
                tone="warning"
                title={`所选统计期间「${requestedPeriod}」尚未齐备发布`}
              >
                该期间所需的自然月或双流向四分组原件尚未全部对账发布。请选择下方已发布的实际可用期间，或前往 38 号导入向导补齐缺失月份。
              </Notice>
              {avail.length > 0 ? (
                <div className="grid gap-2 border border-border bg-surface-sunken p-4">
                  <p className="label text-ink">当前实际可用已发布期间（共 {avail.length} 项）</p>
                  <div className="flex flex-wrap gap-2">
                    {avail.map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const next = new URLSearchParams(searchParams);
                          next.set("period", p);
                          setSearchParams(next);
                        }}
                      >
                        查看 {p}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="body-sm text-ink-muted">
                  当前库中尚无任何已发布期间，请先前往{" "}
                  <TextLink to="/admin/import?seq=38">38 号导入向导</TextLink> 导入海关月度原件。
                </p>
              )}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <PageVisualBanner
            title="医疗器械进出口贸易与供应链集中度"
            summary="基于中国海关 8 位 HS 商品编码统计，跟踪医疗器械进出口演变与关键装备原产国集中度。"
            image={bannerTrade}
          />
          <QueryError error={err} onRetry={() => tradeOverview.refetch()} />
        </div>
      </section>
    );
  }

  if (tradeOverview.data?.status === "published") {
    return <LiveTradeView snap={tradeOverview.data} />;
  }

  return <BenchmarkTradeFallback showEmptyBanner={tradeOverview.data?.status === "empty"} />;
}

function BenchmarkTradeFallback({ showEmptyBanner }: { showEmptyBanner?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryText = searchParams.get("q") ?? "";
  const normalizedQ = queryText.trim().toLowerCase();
  const explicitTab = searchParams.get("tab");
  const requestedTab = parseTradeTab(explicitTab);
  const [leftView, setLeftView] = useState<LeftFigureView>("trend");

  const setActiveTab = useCallback(
    (nextTab: TradeTableTab) => {
      const next = new URLSearchParams(searchParams);
      if (nextTab === "categories" && !normalizedQ) next.delete("tab");
      else next.set("tab", nextTab);
      setSearchParams(next, { replace: true });
    },
    [normalizedQ, searchParams, setSearchParams],
  );

  const filteredCategories = useMemo(() => {
    if (!normalizedQ) return TRADE_CATEGORIES;
    return TRADE_CATEGORIES.filter((row) =>
      matchesQuery(`${row.category} ${row.hsRange} ${row.topOrigins} ${row.importCr3}`, normalizedQ),
    );
  }, [normalizedQ]);

  const filteredHsRows = useMemo(() => {
    if (!normalizedQ) return HIGH_CONCENTRATION_HS;
    return HIGH_CONCENTRATION_HS.filter((row) =>
      matchesQuery(
        `${row.hsCode} ${row.itemName} ${row.category} ${row.topOrigins} ${row.supplyNote} ${row.cr3}`,
        normalizedQ,
      ),
    );
  }, [normalizedQ]);

  const filteredPartners = useMemo(() => {
    if (!normalizedQ) return TRADE_PARTNER_ROWS;
    return TRADE_PARTNER_ROWS.filter((row) =>
      matchesQuery(`${row.country} ${row.iso} ${row.focusCategory}`, normalizedQ),
    );
  }, [normalizedQ]);

  const tableTabs: { key: TradeTableTab; label: string; count: number }[] = [
    { key: "categories", label: "五大医疗器械品类结构", count: filteredCategories.length },
    { key: "hs", label: "高集中度整机与核心部件税号", count: filteredHsRows.length },
    { key: "partners", label: "主要贸易伙伴国流向", count: filteredPartners.length },
  ];

  // 若 URL 未显式指定 tab（如从全站搜索深链进入 /trade?q=CT+9022.3000）且默认分栏无结果时，自动激活有命中的分栏
  const activeTab: TradeTableTab =
    !explicitTab && normalizedQ && (tableTabs.find((t) => t.key === requestedTab)?.count ?? 0) === 0
      ? (tableTabs.find((t) => t.count > 0)?.key ?? requestedTab)
      : requestedTab;

  const activeTabMeta = tableTabs.find((t) => t.key === activeTab) ?? tableTabs[0];
  const fallbackTab = useMemo(() => {
    if (!normalizedQ || activeTabMeta.count > 0) return null;
    return tableTabs.find((t) => t.key !== activeTab && t.count > 0) ?? null;
  }, [normalizedQ, activeTabMeta.count, activeTab, tableTabs]);

  const categoryColumns: DataTableColumn<TradeCategoryRow>[] = useMemo(
    () => [
      {
        key: "category",
        title: "医疗器械五大品类",
        primary: true,
        cell: (r) => <span className="font-semibold text-ink">{r.category}</span>,
      },
      { key: "hsRange", title: "海关 HS 编码范围", type: "code", colClassName: "w-44" },
      { key: "exportUsd", title: "出口额(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-36" },
      { key: "importUsd", title: "进口额(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-36" },
      {
        key: "surplusUsd",
        title: "顺逆差(亿美元)",
        type: "number",
        digits: 1,
        sortable: true,
        colClassName: "w-36",
        cell: (r) => (
          <span className="tabular-nums text-ink">
            {r.surplusUsd >= 0 ? `+${r.surplusUsd.toFixed(1)}` : r.surplusUsd.toFixed(1)}
          </span>
        ),
      },
      {
        key: "importCr3",
        title: "进口来源 CR3",
        align: "right",
        colClassName: "w-32",
        cell: (r) => <span className="font-semibold text-brand-navy tabular-nums">{r.importCr3}</span>,
      },
      {
        key: "yoy",
        title: "出口同比",
        align: "right",
        colClassName: "w-28",
        cell: (r) => <span className="whitespace-nowrap text-ink-muted tabular-nums">{r.yoy}</span>,
      },
      { key: "topOrigins", title: "前三位原产国", colClassName: "w-40" },
    ],
    [],
  );

  const hsColumns: DataTableColumn<HighConcentrationHsRow>[] = useMemo(
    () => [
      { key: "hsCode", title: "8位 HS 税号", type: "code", colClassName: "w-32" },
      {
        key: "itemName",
        title: "装备与关键核心部件名称",
        primary: true,
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{r.itemName}</span>
            <span className="caption text-ink-muted">{r.supplyNote}</span>
          </div>
        ),
      },
      { key: "category", title: "归属海关品类", colClassName: "w-44" },
      { key: "importUsd", title: "进口额(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-36" },
      {
        key: "cr3",
        title: "进口 CR3",
        type: "status",
        align: "right",
        colClassName: "w-28",
        cell: (r) => (
          <Tag size="sm" tone={parseFloat(r.cr3) >= 70 ? "warning" : "info"}>
            {r.cr3}
          </Tag>
        ),
      },
      { key: "topOrigins", title: "前三大来源国", colClassName: "w-44" },
    ],
    [],
  );

  const partnerColumns: DataTableColumn<TradePartnerRow>[] = useMemo(
    () => [
      {
        key: "country",
        title: "贸易伙伴国家/地区",
        primary: true,
        colClassName: "w-44",
        cell: (r) => (
          <span className="font-semibold text-ink">
            {r.country} <span className="code text-ink-muted">{r.iso}</span>
          </span>
        ),
      },
      { key: "exportUsd", title: "对华市场出口(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-40", value: (r) => r.importUsd },
      { key: "importShare", title: "占我国进口(%)", type: "number", digits: 1, sortable: true, colClassName: "w-36" },
      { key: "cnExportUsd", title: "自华进口额(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-40", value: (r) => r.exportUsd },
      { key: "exportShare", title: "占我国出口(%)", type: "number", digits: 1, sortable: true, colClassName: "w-36" },
      { key: "focusCategory", title: "双边核心贸易品类" },
    ],
    [],
  );

  return (
    <div>
      {/* Band 1: Header & Open 4-Column Rule-Line KPI Strip */}
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <PageVisualBanner
            title="医疗器械进出口贸易与供应链集中度"
            summary="基于中国海关 8 位 HS 商品编码统计，跟踪五大医疗器械品类进出口演变与关键装备原产国集中度（CR3）。"
            image={bannerTrade}
            actions={
              <TextLink to="/system/38" className="inline-flex items-center gap-1 body">
                查看海关贸易统计口径 →
              </TextLink>
            }
          />

          {showEmptyBanner && (
            <div data-testid="trade-empty-status">
              <Notice
                tone="info"
                title="当前尚无已发布的海关月度统计快照（status: empty）"
                action={
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/admin/import?seq=38">前往 38 号导入向导</Link>
                  </Button>
                }
              >
                下方展示行业历史基准参考视图；在 38 号向导完成任一自然月双流向四分组原件对账发布后，本页将自动切换至正式发布快照。
              </Notice>
            </div>
          )}

          <div
            aria-label="进出口贸易核心指标"
            className="grid grid-cols-2 border-t-2 border-brand-navy border-b border-border md:grid-cols-4 md:divide-x md:divide-border"
          >
            {TRADE_KPIS.map((kpi, idx) => (
              <div
                key={kpi.id}
                className={cn(
                  "grid content-start gap-1 px-4 py-4 first:md:pl-0 last:md:pr-0",
                  idx < 2 && "max-md:border-b max-md:border-border",
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
        </div>
      </section>

      {/* Band 2: Dual-Column StatistaFigure Flagship Infographics（关键词筛选态自动收起，避免图表压住查询表） */}
      {!normalizedQ && (
        <section className="border-y border-border bg-surface-sunken" aria-labelledby="trade-figures-heading">
          <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
            <h2 id="trade-figures-heading" className="sr-only">
              进出口规模走势与供应链集中度图表
            </h2>

            <div className="grid gap-6 lg:grid-cols-2">
              <StatistaFigure
                id="fig-trade-trend"
                eyebrow={
                  leftView === "trend"
                    ? "图 1 · 进出口规模与顺差演变"
                    : "图 1 · 前五大伙伴国双边份额"
                }
                title={
                  leftView === "trend"
                    ? "医疗器械贸易顺差持续走阔，2026 前三季出口同比增长 6.6%"
                    : "美德日稳居前三大贸易伙伴，对美双边进出口份额均超两成"
                }
                subtitle={
                  leftView === "trend"
                    ? "2021—2026年前三季度 · 中国海关医疗器械进出口额与顺差（单位：亿美元）"
                    : "2026年前三季度 · 前五大贸易伙伴占中国医疗器械进口与出口比重（单位：%）"
                }
                badge={
                  leftView === "trend"
                    ? { label: "前三季顺差 44.2 亿美元", tone: "info" }
                    : { label: "前五进口合计 66.9%", tone: "info" }
                }
                controls={
                  <div
                    role="group"
                    aria-label="切换贸易趋势或伙伴国份额视图"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <button
                      type="button"
                      aria-pressed={leftView === "trend"}
                      onClick={() => setLeftView("trend")}
                      className={cn(
                        "cursor-pointer rounded-sm border px-3 py-1 caption font-semibold transition-colors focus-ring",
                        leftView === "trend"
                          ? "border-brand-navy bg-brand-navy text-on-brand"
                          : "border-border bg-surface text-ink-muted hover:text-ink",
                      )}
                    >
                      进出口规模演变
                    </button>
                    <button
                      type="button"
                      aria-pressed={leftView === "partners"}
                      onClick={() => setLeftView("partners")}
                      className={cn(
                        "cursor-pointer rounded-sm border px-3 py-1 caption font-semibold transition-colors focus-ring",
                        leftView === "partners"
                          ? "border-brand-navy bg-brand-navy text-on-brand"
                          : "border-border bg-surface text-ink-muted hover:text-ink",
                      )}
                    >
                      前五大伙伴国份额
                    </button>
                  </div>
                }
                option={leftView === "trend" ? tradeTrendPartialOption : partnerShareBarOption}
                ariaLabel={
                  leftView === "trend"
                    ? "2021至2026年前三季度中国海关医疗器械出口额、进口额与贸易顺差演变折线图，末尾前三季度以虚线与浅底色带区分非完整年度"
                    : "2026年前三季度前五大贸易伙伴占我国医疗器械进口与出口比重分组柱状图"
                }
                height={292}
                tableColumns={leftView === "trend" ? TREND_TABLE_COLUMNS : PARTNER_FIG_COLUMNS}
                tableRows={leftView === "trend" ? TREND_TABLE_ROWS : PARTNER_FIG_ROWS}
                exportName={leftView === "trend" ? "mdes-trade-trend" : "mdes-trade-partners"}
                source="中国海关总署统计快讯（8 位 HS 编码归并）"
                note={
                  leftView === "trend"
                    ? "2021—2025 年为全年报关值，2026Q1-Q3 为 1—9 月累计值"
                    : "进口按申报原产国统计，出口按最终目的国统计"
                }
              />

              <StatistaFigure
                id="fig-trade-concentration"
                eyebrow="图 2 · 供应链来源国集中度"
                title="高端影像与内镜核心部件进口高度集中，前三来源国占比均逾七成"
                subtitle="2026年前三季度 · 关键整机零部件与五大品类进口来源国 CR3（单位：%）"
                badge={{ label: "核心组件 CR3 最高 83.6%", tone: "warning" }}
                option={tradeConcentrationBarOption}
                ariaLabel="2026年前三季度关键整机零部件与五大品类进口来源国集中度 CR3 横向排名条形图"
                height={328}
                tableColumns={CR3_TABLE_COLUMNS}
                tableRows={CR3_TABLE_ROWS}
                exportName="mdes-trade-cr3"
                source="中国海关 8 位 HS 商品编码原产国统计"
                note="CR3 指前三位进口原产国金额占同类进口总额比重"
              />
            </div>
          </div>
        </section>
      )}

      {/* Band 3: Full-Width 1200px Trade Structure & Key HS Tariff Directory */}
      <section className="bg-surface" aria-labelledby="trade-directory-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <h2 id="trade-directory-heading" className="title-sub text-brand-navy">
                医疗器械贸易品类结构与关键税号查询台
              </h2>
              <p className="caption text-ink-muted">
                2026 年前三季度海关 8 位 HS 编码汇总；海关报关离岸与到岸统计口径不同于上市企业年报境外本地产销营业收入。
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
                onChange={(e) => {
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value.trim()) next.set("q", e.target.value);
                  else next.delete("q");
                  setSearchParams(next, { replace: true });
                }}
                placeholder="筛选本表品类、HS税号或国家…"
                className="h-9 w-56 rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink outline-none focus:border-brand-navy"
              />
              <span className="caption text-ink-muted tabular-nums">
                当前栏目共 {formatNumber(activeTabMeta.count)} 条记录
              </span>
            </div>
          </div>

          {/* 3 Clean Full-Width Underline Tabs */}
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

          {/* Cross-Tab Search Hit Prompt */}
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
                caption="五大医疗器械品类进出口结构及来源集中度明细表"
                columns={categoryColumns}
                data={filteredCategories}
                getRowId={(r) => r.id}
                empty="没有匹配当前检索词的医疗器械贸易品类"
                fixedLayout
                dense
              />
            </div>
          )}

          {activeTab === "hs" && (
            <div id="trade-dir-panel-hs" role="tabpanel" aria-labelledby="trade-dir-tab-hs">
              <DataTable
                caption="高集中度医疗装备整机与关键核心部件海关税号表"
                columns={hsColumns}
                data={filteredHsRows}
                getRowId={(r) => r.hsCode}
                empty="没有匹配当前检索词的高集中度关键税号"
                fixedLayout
                dense
              />
            </div>
          )}

          {activeTab === "partners" && (
            <div id="trade-dir-panel-partners" role="tabpanel" aria-labelledby="trade-dir-tab-partners">
              <DataTable
                caption="中国医疗器械主要贸易伙伴国进出口流向表"
                columns={partnerColumns}
                data={filteredPartners}
                getRowId={(r) => r.iso}
                empty="没有匹配当前检索词的贸易伙伴国家或地区"
                fixedLayout
                dense
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function tradeTrendPartialOption(t: ChartTheme): ChartOption {
  return statistaTrendWithPartialOption(t, {
    periods: TRADE_ANNUAL_SERIES.map((d) => d.period),
    lastIsPartial: true,
    partialLabel: "前三季累计",
    yMax: 600,
    series: [
      {
        name: "出口额",
        values: TRADE_ANNUAL_SERIES.map((d) => d.exportUsd),
        colorIndex: 0,
        showLabels: true,
      },
      {
        name: "进口额",
        values: TRADE_ANNUAL_SERIES.map((d) => d.importUsd),
        colorIndex: 1,
        showLabels: false,
      },
      {
        name: "贸易顺差",
        values: TRADE_ANNUAL_SERIES.map((d) => d.surplusUsd),
        colorIndex: 2,
        showLabels: true,
      },
    ],
  });
}

function partnerShareBarOption(t: ChartTheme): ChartOption {
  const countries = TOP5_PARTNERS.map((d) => d.country);
  const base = baseOption(t, 2);
  return {
    ...base,
    xAxis: categoryAxis(t, countries, { showAllLabels: true }),
    yAxis: valueAxis(t, { max: 30, scale: false }),
    series: [
      {
        type: "bar",
        name: "占我国进口份额 (%)",
        data: TOP5_PARTNERS.map((d) => d.importShare),
        barMaxWidth: 22,
        itemStyle: { color: t.series[0], borderRadius: 0 },
        label: {
          show: true,
          position: "top",
          distance: 4,
          color: t.ink,
          fontSize: 12,
          fontFamily: t.fontFamily,
          formatter: "{c}%",
        },
      },
      {
        type: "bar",
        name: "占我国出口份额 (%)",
        data: TOP5_PARTNERS.map((d) => d.exportShare),
        barMaxWidth: 22,
        itemStyle: { color: t.series[1], borderRadius: 0 },
        label: {
          show: true,
          position: "top",
          distance: 4,
          color: t.muted,
          fontSize: 12,
          fontFamily: t.fontFamily,
          formatter: "{c}%",
        },
      },
    ],
  };
}

function tradeConcentrationBarOption(t: ChartTheme): ChartOption {
  return statistaHorizontalBarOption(t, {
    categories: TRADE_CR3_RANKING.map((d) => d.name),
    values: TRADE_CR3_RANKING.map((d) => d.cr3),
    labels: TRADE_CR3_RANKING.map((d) => `${d.cr3.toFixed(1)}%`),
    emphasizeIndex: 0,
    highlightTopN: 3,
    max: 100,
    rightPadding: 72,
    referenceLine: { value: 70, label: "70% 高集中度线" },
  });
}
