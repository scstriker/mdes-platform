import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { SortingState } from "@tanstack/react-table";
import { IconArrowRight, IconRotate, IconX } from "@tabler/icons-react";
import { matchesQuery } from "@mdes/shared";
import bannerProducts from "@/assets/visuals/banner-products.webp";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn, type TagTone } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { StatistaFigure, type StatistaTableColumn } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import type { ChartOption } from "@/lib/charts/echarts";
import { statistaHorizontalBarOption, statistaTrendWithPartialOption, type ChartTheme } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";
import {
  ANNUAL_RECONCILIATION,
  CATEGORY_OPTIONS,
  CHANNEL_TABS,
  ORIGIN_OPTIONS,
  PRODUCT_EXPLORER_ROWS,
  PRODUCT_KPIS,
  REG_TREND_SERIES,
  TRACK_DISTRIBUTION,
  type ProductChannel,
  type ProductExplorerRow,
} from "./data";

const PAGE_SIZE = 8;

const VALID_CHANNELS = new Set<ProductChannel>(["all", "reg", "innov", "priority", "udi"]);

const CHANNEL_TONE: Record<Exclude<ProductChannel, "all">, TagTone> = {
  innov: "info",
  priority: "warning",
  reg: "neutral",
  udi: "neutral",
};

function parseChannel(raw: string | null): ProductChannel {
  if (raw && VALID_CHANNELS.has(raw as ProductChannel)) {
    return raw as ProductChannel;
  }
  return "all";
}

const RECONCILIATION_BY_PERIOD = new Map(ANNUAL_RECONCILIATION.map((r) => [r.year, r]));

const TREND_TABLE_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "period", title: "统计期间", align: "left" },
  { key: "domestic", title: "国产首次(件)", align: "right" },
  { key: "imported", title: "进口首次(件)", align: "right" },
  { key: "total", title: "合计(件)", align: "right" },
  { key: "domesticShare", title: "国产占比", align: "right" },
  { key: "deviation", title: "年报核验偏差", align: "right" },
];

const TREND_TABLE_ROWS = REG_TREND_SERIES.map((d) => {
  const total = d.domestic + d.imported;
  const share = `${((d.domestic / total) * 100).toFixed(1)}%`;
  const rec = RECONCILIATION_BY_PERIOD.get(d.period);
  return {
    period: d.period,
    domestic: d.domestic.toLocaleString("zh-CN"),
    imported: d.imported.toLocaleString("zh-CN"),
    total: total.toLocaleString("zh-CN"),
    domesticShare: share,
    deviation: rec ? rec.deviation : "—",
  };
});

const TRACK_TABLE_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "track", title: "重点产品赛道", align: "left" },
  { key: "domesticValid", title: "国产有效证(件)", align: "right" },
  { key: "importedValid", title: "进口有效证(件)", align: "right" },
  { key: "totalValid", title: "合计(件)", align: "right" },
  { key: "sharePct", title: "存量占比", align: "right" },
];

const TRACK_TABLE_ROWS = TRACK_DISTRIBUTION.map((d) => {
  const total = d.domesticValid + d.importedValid;
  return {
    track: d.track,
    domesticValid: d.domesticValid.toLocaleString("zh-CN"),
    importedValid: d.importedValid.toLocaleString("zh-CN"),
    totalValid: total.toLocaleString("zh-CN"),
    sharePct: d.sharePct,
  };
});

function regTrendOption(t: ChartTheme): ChartOption {
  return statistaTrendWithPartialOption(t, {
    periods: REG_TREND_SERIES.map((d) => d.period),
    lastIsPartial: true,
    partialLabel: "前三季累计",
    series: [
      {
        name: "国产首次注册",
        values: REG_TREND_SERIES.map((d) => d.domestic),
        colorIndex: 0,
        showLabels: true,
      },
      {
        name: "进口首次注册",
        values: REG_TREND_SERIES.map((d) => d.imported),
        colorIndex: 1,
        showLabels: true,
      },
    ],
    yMax: 3000,
  });
}

function trackDistributionOption(t: ChartTheme): ChartOption {
  const categories = TRACK_DISTRIBUTION.map((d) => d.track);
  const values = TRACK_DISTRIBUTION.map((d) => d.domesticValid + d.importedValid);
  const labels = TRACK_DISTRIBUTION.map((d) => {
    const total = d.domesticValid + d.importedValid;
    return `${total.toLocaleString("zh-CN")} 件（${d.sharePct}）`;
  });

  return statistaHorizontalBarOption(t, {
    categories,
    values,
    labels,
    highlightTopN: 2,
    rightPadding: 132,
  });
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const trimmedQuery = q.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const channel = parseChannel(searchParams.get("channel"));

  const [origin, setOrigin] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: "", page: 0 });

  const updateSearchParam = (key: "q" | "channel", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || (key === "channel" && value === "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setOrigin("");
    setCategory("");
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("channel");
    setSearchParams(next, { replace: true });
  };

  const channelCounts = useMemo(() => {
    const counts: Record<ProductChannel, number> = {
      all: 0,
      reg: 0,
      innov: 0,
      priority: 0,
      udi: 0,
    };
    for (const row of PRODUCT_EXPLORER_ROWS) {
      if (origin && row.origin !== origin) continue;
      if (category && row.category !== category) continue;
      if (
        normalizedQuery &&
        !matchesQuery(
          `${row.certOrCode} ${row.productName} ${row.specAndScope} ${row.registrant} ${row.category} ${row.origin} ${row.originRegion} ${row.channelLabel}`,
          normalizedQuery,
        )
      ) {
        continue;
      }
      counts.all += 1;
      counts[row.channel] += 1;
    }
    return counts;
  }, [origin, category, normalizedQuery]);

  const filteredRows = useMemo(() => {
    return PRODUCT_EXPLORER_ROWS.filter((row) => {
      if (channel !== "all" && row.channel !== channel) return false;
      if (origin && row.origin !== origin) return false;
      if (category && row.category !== category) return false;
      if (!normalizedQuery) return true;
      return matchesQuery(
        `${row.certOrCode} ${row.productName} ${row.specAndScope} ${row.registrant} ${row.category} ${row.origin} ${row.originRegion} ${row.channelLabel}`,
        normalizedQuery,
      );
    });
  }, [channel, origin, category, normalizedQuery]);

  const sortedRows = useMemo(() => {
    const activeSort = sorting[0];
    if (!activeSort || activeSort.id !== "approvalDate") return filteredRows;
    const dir = activeSort.desc ? -1 : 1;
    return [...filteredRows].sort((a, b) => a.approvalDate.localeCompare(b.approvalDate) * dir);
  }, [filteredRows, sorting]);

  const filterKey = `${channel}|${origin}|${category}|${normalizedQuery}|${sorting.map((s) => `${s.id}:${s.desc ? "d" : "a"}`).join(",")}`;
  const rawPage = pageState.key === filterKey ? pageState.page : 0;
  const maxPage = Math.max(0, Math.ceil(sortedRows.length / PAGE_SIZE) - 1);
  const safePage = Math.min(rawPage, maxPage);
  const pagedRows = useMemo(
    () => sortedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [sortedRows, safePage],
  );

  const hasActiveFilter = channel !== "all" || Boolean(origin) || Boolean(category) || Boolean(normalizedQuery);

  const explorerColumns = useMemo<DataTableColumn<ProductExplorerRow>[]>(
    () => [
      {
        key: "certOrCode",
        title: "编号/注册证号",
        type: "code",
        colClassName: "w-44",
      },
      {
        key: "productName",
        title: "产品名称与规格",
        primary: true,
        cell: (row) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-semibold text-ink" title={row.productName}>
              {row.productName}
            </span>
            <span className="truncate caption text-ink-muted" title={row.specAndScope}>
              {row.specAndScope}
            </span>
          </div>
        ),
      },
      {
        key: "channelLabel",
        title: "准入通道",
        type: "status",
        colClassName: "w-28",
        cell: (row) => (
          <Tag size="sm" tone={CHANNEL_TONE[row.channel]}>
            {row.channelLabel}
          </Tag>
        ),
      },
      {
        key: "category",
        title: "器械品类",
        colClassName: "w-32",
      },
      {
        key: "registrant",
        title: "注册人/产地",
        colClassName: "w-40",
        cell: (row) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-ink" title={row.registrant}>
              {row.registrant}
            </span>
            <span className="truncate caption text-ink-muted">
              {row.origin} · {row.originRegion}
            </span>
          </div>
        ),
      },
      {
        key: "approvalDate",
        title: "批准/公示日期",
        type: "code",
        sortable: true,
        colClassName: "w-28",
      },
    ],
    [],
  );

  return (
    <div>
      {/* Band 1: Page Header & Open 5-Column Rule-Line KPI Strip */}
      <section className="bg-surface" aria-labelledby="products-page-title">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <PageVisualBanner
            titleId="products-page-title"
            title="注册准入与产品数据库"
            summary="贯通第三类医疗器械注册证、创新特别审查、优先审批通道与唯一标识（UDI）规格档案，并与国家药监局统计年报交叉核验。"
            image={bannerProducts}
            actions={
              <TextLink to="/system" className="inline-flex items-center gap-1 body">
                查看审评与产品统计口径
                <IconArrowRight size={15} aria-hidden="true" />
              </TextLink>
            }
          />

          <div
            role="region"
            aria-label="注册与产品核心指标通栏"
            className="grid grid-cols-2 gap-y-5 border-t-2 border-brand-navy border-b border-border py-4 md:grid-cols-5 md:gap-y-0 md:divide-x md:divide-border md:py-0"
          >
            {PRODUCT_KPIS.map((kpi) => (
              <div key={kpi.label} className="grid content-start gap-1 pr-3 md:px-4 md:py-4 md:first:pl-0 md:last:pr-0">
                <span className="label text-ink-muted">{kpi.label}</span>
                <p className="numeral tabular-nums text-brand-navy">
                  {kpi.value}
                  <span className="ml-1 body-sm font-normal text-ink-muted">{kpi.unit}</span>
                </p>
                <p className="caption text-ink-muted">{kpi.subnote}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Band 2: Side-by-Side Flagship Statista Infographics（仅在未执行关键词筛选的总览态展示，避免检索时图表压住结果表） */}
      {!trimmedQuery && (
        <section className="border-y border-border bg-surface-sunken" aria-labelledby="reg-structure-heading">
          <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
            <h2 id="reg-structure-heading" className="sr-only">
              审评准入趋势与重点赛道存量结构分析
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <StatistaFigure
                id="fig-products-trend"
                eyebrow="图 1 · 审评准入趋势"
                title="国产第三类医疗器械首次注册占比五年跃升至 71.2%"
                subtitle="2021—2026年前三季度 · 境内与进口首次注册获批数量（单位：件）"
                badge={{ label: "2026Q1-Q3 同比 +9.6%", tone: "info" }}
                option={regTrendOption}
                ariaLabel="2021至2026年前三季度国产与进口第三类医疗器械首次注册数量趋势折线图"
                height={280}
                tableColumns={TREND_TABLE_COLUMNS}
                tableRows={TREND_TABLE_ROWS}
                exportName="products-first-registration-trend"
                source="国家药监局医疗器械批准证明文件库"
                note="2026Q1-Q3 为 1–9 月累计值；历年数据与药监统计年报交叉核验偏差均小于 0.5%"
              />

              <StatistaFigure
                id="fig-products-tracks"
                eyebrow="图 2 · 重点赛道存量结构"
                title="无源植介入与体外诊断领跑有效三类注册证存量"
                subtitle="截至 2026年9月末 · 六大重点赛道有效三类注册证规模及占比（单位：件）"
                badge={{ label: "国产存量占 74.2%", tone: "info" }}
                option={trackDistributionOption}
                ariaLabel="六大重点医疗器械产品赛道有效三类注册证规模及占比横向条形图"
                height={280}
                tableColumns={TRACK_TABLE_COLUMNS}
                tableRows={TRACK_TABLE_ROWS}
                exportName="products-track-distribution"
                source="国家药监局注册数据库"
                note="六大赛道合计有效三类注册证 24,680 件，其中境内注册证 18,315 件、进口注册证 6,365 件"
              />
            </div>
          </div>
        </section>
      )}

      {/* Band 3: Representative Approvals, Innovation & UDI Directory */}
      <section className="bg-surface" aria-labelledby="product-explorer-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 id="product-explorer-heading" className="title-sub text-brand-navy">
                代表性注册批件、创新优先通道与 UDI 规格名录
              </h2>
              <p className="caption text-ink-muted">
                按审评准入通道、境内外来源及重点产品赛道联合筛选；支持通过页面顶部检索栏按注册证号、UDI 编码、产品或注册人实时过滤
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="body-sm tabular-nums text-ink-muted">
                精选代表性获批与 UDI 档案（共{" "}
                <strong className="font-semibold text-brand-navy">{formatNumber(filteredRows.length)}</strong> 条）
              </span>
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <IconRotate size={14} aria-hidden="true" />
                  重置筛选
                </Button>
              )}
            </div>
          </div>

          {/* Channel Underline Tabs */}
          <div role="tablist" aria-label="准入与产品通道筛选" className="flex flex-wrap gap-5 border-b border-border">
            {CHANNEL_TABS.map((tab) => {
              const active = channel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => updateSearchParam("channel", tab.id)}
                  className={cn(
                    "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                    active
                      ? "border-brand-navy font-semibold text-brand-navy"
                      : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="caption tabular-nums text-ink-muted">({channelCounts[tab.id]})</span>
                </button>
              );
            })}
          </div>

          {/* Filter Controls Bar (URL ?q= driven by top ScopedSearchBar) */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid w-40 gap-1 sm:w-44">
                <label htmlFor="product-origin-select" className="caption font-semibold text-ink-muted">
                  产品来源
                </label>
                <select
                  id="product-origin-select"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className={cn(controlClass, "h-10")}
                >
                  <option value="">全部来源</option>
                  {ORIGIN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid w-52 gap-1 sm:w-60">
                <label htmlFor="product-category-select" className="caption font-semibold text-ink-muted">
                  器械品类赛道
                </label>
                <select
                  id="product-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={cn(controlClass, "h-10")}
                >
                  <option value="">全部品类</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid w-56 gap-1 sm:w-64">
                <label htmlFor="product-local-filter" className="caption font-semibold text-ink-muted">
                  本表关键词筛选
                </label>
                <input
                  id="product-local-filter"
                  type="search"
                  value={q}
                  onChange={(e) => updateSearchParam("q", e.target.value)}
                  placeholder="筛选证号、器械名称或企业…"
                  className={cn(controlClass, "h-10")}
                />
              </div>
            </div>

            {trimmedQuery && (
              <div className="flex flex-wrap items-center gap-2 border border-border bg-info-bg px-3 py-1.5">
                <span className="body-sm text-ink">
                  当前检索词：<strong className="font-semibold text-brand-navy">「{trimmedQuery}」</strong>
                </span>
                <Button variant="secondary" size="sm" onClick={() => updateSearchParam("q", "")}>
                  <IconX size={14} aria-hidden="true" />
                  清除检索词
                </Button>
              </div>
            )}
          </div>

          <DataTable
            caption="医疗器械代表性注册批件、创新优先审查与UDI规格档案表"
            columns={explorerColumns}
            data={pagedRows}
            getRowId={(r) => r.id}
            fixedLayout
            dense
            sorting={sorting}
            onSortingChange={setSorting}
            pagination={
              sortedRows.length > 0
                ? {
                    page: safePage,
                    pageSize: PAGE_SIZE,
                    total: sortedRows.length,
                    onPageChange: (nextPage) => setPageState({ key: filterKey, page: nextPage }),
                  }
                : undefined
            }
            empty="未找到符合当前准入通道、来源、品类或检索词条件的档案记录。"
          />

          <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
            统计口径说明：医疗器械唯一标识（UDI-DI）赋码至最小销售与包装单元，与注册证号呈多对一映射关系（单张高值耗材或吻合器注册证常涵盖数十个规格型号），阅读时请区分产品规格条目数与注册证张数。
          </p>
        </div>
      </section>
    </div>
  );
}
