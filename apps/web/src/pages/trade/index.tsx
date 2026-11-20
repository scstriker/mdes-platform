import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconArrowRight, IconSearch, IconUpload, IconX } from "@tabler/icons-react";
import type { Observation } from "@mdes/shared";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIndicators, useObservations } from "@/lib/api";
import type { ChartOption } from "@/lib/charts/echarts";
import { baseOption, categoryAxis, LazyChart, SERIES_SYMBOLS, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import { formatDims, geoLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  HIGH_CONCENTRATION_HS,
  TRADE_ANNUAL_SERIES,
  TRADE_CATEGORIES,
  TRADE_KPIS,
  TRADE_PARTNER_ROWS,
  type TradeAnnualPoint,
  type TradeCategoryRow,
  type TradePartnerRow,
} from "./data";

type ChartTab = "trend" | "partners";

export default function TradePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryText = searchParams.get("q") ?? "";
  const selectedIndicator = searchParams.get("indicator") ?? "";
  const [chartTab, setChartTab] = useState<ChartTab>("trend");

  const updateParams = useCallback(
    (patch: { q?: string | null; indicator?: string | null }) => {
      const next = new URLSearchParams(searchParams);
      if ("q" in patch) {
        const trimmed = patch.q ?? "";
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
      }
      if ("indicator" in patch) {
        const ind = patch.indicator?.trim() ?? "";
        if (ind) next.set("indicator", ind);
        else next.delete("indicator");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Live D1 TRD indicators & observations
  const indicatorsQuery = useIndicators({ cluster: "TRD" });
  const trdIndicators = useMemo(
    () =>
      (indicatorsQuery.data ?? []).filter(
        (item) => item.cluster_code === "TRD" || item.id.startsWith("TRD-"),
      ),
    [indicatorsQuery.data],
  );

  const indicatorNameMap = useMemo(
    () => new Map(trdIndicators.map((item) => [item.id, item.name])),
    [trdIndicators],
  );

  const observationsQuery = useObservations(
    selectedIndicator ? { indicator_id: selectedIndicator, limit: 100 } : { limit: 200 },
  );

  const normalizedQ = queryText.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!normalizedQ) return TRADE_CATEGORIES;
    return TRADE_CATEGORIES.filter((row) =>
      `${row.category} ${row.hsRange} ${row.topOrigins}`.toLowerCase().includes(normalizedQ),
    );
  }, [normalizedQ]);

  const liveTradeRows = useMemo(() => {
    const raw = (observationsQuery.data?.items ?? []).filter(
      (obs) => obs.indicator_id.startsWith("TRD-") || indicatorNameMap.has(obs.indicator_id),
    );
    if (!normalizedQ) return raw;
    return raw.filter((obs) => {
      const indName = indicatorNameMap.get(obs.indicator_id) ?? "";
      const dimsText = formatDims(obs.dims);
      const hay = `${obs.indicator_id} ${indName} ${obs.period} ${obs.geo} ${geoLabel(obs.geo)} ${dimsText} ${obs.unit}`.toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [observationsQuery.data?.items, indicatorNameMap, normalizedQ]);

  const totalLiveTrdCount = useMemo(
    () => trdIndicators.reduce((acc, item) => acc + (item.obs_count || 0), 0),
    [trdIndicators],
  );

  const categoryColumns: DataTableColumn<TradeCategoryRow>[] = useMemo(
    () => [
      {
        key: "category",
        title: "医疗器械五大品类",
        primary: true,
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{r.category}</span>
            <span className="caption text-ink-muted">主要来源：{r.topOrigins}</span>
          </div>
        ),
      },
      { key: "hsRange", title: "HS 编码范围", type: "code", colClassName: "w-36" },
      { key: "exportUsd", title: "出口(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-28" },
      { key: "importUsd", title: "进口(亿美元)", type: "number", digits: 1, sortable: true, colClassName: "w-28" },
      { key: "importCr3", title: "进口 CR3", align: "right", colClassName: "w-24", cell: (r) => <span className="tabular-nums font-semibold text-brand-navy">{r.importCr3}</span> },
      { key: "yoy", title: "出口同比", align: "right", colClassName: "w-24", cell: (r) => <span className="tabular-nums text-ink-muted">{r.yoy}</span> },
    ],
    [],
  );

  const annualColumns: DataTableColumn<TradeAnnualPoint>[] = useMemo(
    () => [
      { key: "period", title: "统计期间", type: "code", primary: true, colClassName: "w-28" },
      { key: "exportUsd", title: "出口额(亿美元)", type: "number", digits: 1 },
      { key: "importUsd", title: "进口额(亿美元)", type: "number", digits: 1 },
      { key: "surplusUsd", title: "贸易顺差(亿美元)", type: "number", digits: 1 },
      { key: "exportYoy", title: "出口同比", align: "right", colClassName: "w-24" },
    ],
    [],
  );

  const partnerColumns: DataTableColumn<TradePartnerRow>[] = useMemo(
    () => [
      {
        key: "country",
        title: "伙伴国家/地区",
        primary: true,
        colClassName: "w-28",
        cell: (r) => (
          <span className="font-semibold text-ink">
            {r.country} <span className="code text-ink-muted">{r.iso}</span>
          </span>
        ),
      },
      { key: "importShare", title: "占我国进口(%)", type: "number", digits: 1, colClassName: "w-28" },
      { key: "exportShare", title: "占我国出口(%)", type: "number", digits: 1, colClassName: "w-28" },
      { key: "focusCategory", title: "双边核心贸易品类" },
    ],
    [],
  );

  const observationColumns: DataTableColumn<Observation>[] = useMemo(
    () => [
      {
        key: "indicator_id",
        title: "工程指标编码与名称",
        primary: true,
        cell: (r) => (
          <div className="grid gap-0.5">
            <TextLink to={`/indicators/${r.indicator_id}`} className="code font-semibold">
              {r.indicator_id}
            </TextLink>
            <span className="caption text-ink-muted">{indicatorNameMap.get(r.indicator_id) ?? "进出口贸易指标"}</span>
          </div>
        ),
      },
      { key: "period", title: "期间", type: "code", colClassName: "w-28" },
      { key: "geo", title: "地域", colClassName: "w-24", value: (r) => geoLabel(r.geo) },
      { key: "dims", title: "方向 / 伙伴 / 口径维度", colClassName: "w-48", value: (r) => formatDims(r.dims) },
      {
        key: "value_num",
        title: "观测数值",
        type: "number",
        colClassName: "w-32",
        value: (r) => r.value_num,
        cell: (r) =>
          r.value_num === null ? (
            <span className="text-ink-muted">{r.value_text ?? "—"}</span>
          ) : (
            <span className="font-semibold text-brand-navy tabular-nums">{formatNumber(r.value_num)}</span>
          ),
      },
      { key: "unit", title: "计量单位", colClassName: "w-24", value: (r) => r.unit || "比例/指数" },
      {
        key: "batch_id",
        title: "导入批次",
        type: "code",
        colClassName: "w-28",
        cell: (r) =>
          r.batch_id ? (
            <TextLink to={`/observations?batch_id=${r.batch_id}`} className="code">
              {r.batch_id.slice(0, 8)}
            </TextLink>
          ) : (
            "—"
          ),
      },
    ],
    [indicatorNameMap],
  );

  return (
    <div>
      {/* Band 1: Header & Open 4-Column Rule-Line KPI Strip */}
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <header className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label text-brand-navy">六、进出口贸易 · 海关 HS 编码与伙伴集中度</p>
              <div className="flex flex-wrap items-center gap-4 body-sm">
                <TextLink to="/system/38">
                  38 号三级指标口径与释义
                  <IconArrowRight size={14} className="ml-1 inline" aria-hidden="true" />
                </TextLink>
                <TextLink to="/indicators?cluster=TRD" className="text-ink-muted">
                  TRD 工程指标簇
                </TextLink>
              </div>
            </div>

            <h1 className="title-page text-brand-navy">医疗器械进出口贸易与供应链集中度</h1>
            <p className="max-w-4xl body-lg text-ink-muted">
              基于中国海关 8 位 HS 商品编码与联合国 UN Comtrade 双边贸易统计，跟踪五大医疗器械品类进出口规模、贸易顺逆差演变及高端医疗装备原产国集中度（CR3）。
            </p>
          </header>

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

      {/* Band 2: Trade Trend Chart & 5-Category / Partner Concentration Three-Line Tables */}
      <section className="border-y border-border bg-surface-sunken">
        <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
            {/* Left Column: ECharts + Underline Tabs */}
            <div className="grid content-start gap-5 lg:col-span-6 lg:pr-8">
              <div className="grid gap-2">
                <h2 className="title-sub text-brand-navy">贸易规模演变与伙伴国流向结构</h2>
                <div
                  role="tablist"
                  aria-label="贸易统计图表切换"
                  className="flex flex-wrap gap-6 border-b border-border"
                >
                  <button
                    id="trade-tab-trend"
                    type="button"
                    role="tab"
                    aria-selected={chartTab === "trend"}
                    aria-controls="trade-panel-trend"
                    onClick={() => setChartTab("trend")}
                    className={cn(
                      "cursor-pointer border-b-2 pb-2.5 text-left body-sm transition-colors focus-ring",
                      chartTab === "trend"
                        ? "border-brand-navy font-semibold text-brand-navy"
                        : "border-transparent text-ink-muted hover:text-brand-navy",
                    )}
                  >
                    2021–2026 医疗器械出口与进口规模走势
                  </button>
                  <button
                    id="trade-tab-partners"
                    type="button"
                    role="tab"
                    aria-selected={chartTab === "partners"}
                    aria-controls="trade-panel-partners"
                    onClick={() => setChartTab("partners")}
                    className={cn(
                      "cursor-pointer border-b-2 pb-2.5 text-left body-sm transition-colors focus-ring",
                      chartTab === "partners"
                        ? "border-brand-navy font-semibold text-brand-navy"
                        : "border-transparent text-ink-muted hover:text-brand-navy",
                    )}
                  >
                    前五大贸易伙伴进口与出口占比结构
                  </button>
                </div>
              </div>

              {chartTab === "trend" ? (
                <div id="trade-panel-trend" role="tabpanel" aria-labelledby="trade-tab-trend" className="grid gap-4">
                  <LazyChart
                    option={tradeTrendOption}
                    ariaLabel="2021至2026年前三季度中国医疗器械出口额、进口额与贸易顺差折线走势图"
                    height={272}
                  />
                  <p className="caption text-ink-muted">
                    注：2021—2025 年为全年海关报关统计值，2026Q1-Q3 为 1—9 月累计值；三条折线分别采用圆点、方块与三角标记区分出口、进口与顺差。
                  </p>
                  <DataTable
                    caption="2021至2026年前三季度医疗器械进出口规模数据表"
                    columns={annualColumns}
                    data={TRADE_ANNUAL_SERIES}
                    getRowId={(r) => r.period}
                    fixedLayout
                    dense
                  />
                </div>
              ) : (
                <div id="trade-panel-partners" role="tabpanel" aria-labelledby="trade-tab-partners" className="grid gap-4">
                  <LazyChart
                    option={partnerStructureOption}
                    ariaLabel="前五大贸易伙伴国家占我国医疗器械进口与出口份额对比柱状图"
                    height={272}
                  />
                  <p className="caption text-ink-muted">
                    注：进口按海关申报原产国统计来源份额，出口按最终目的国统计市场份额（对应工程指标 TRD-005）。
                  </p>
                  <DataTable
                    caption="前五大贸易伙伴进口与出口占比结构表"
                    columns={partnerColumns}
                    data={TRADE_PARTNER_ROWS}
                    getRowId={(r) => r.iso}
                    fixedLayout
                    dense
                  />
                </div>
              )}
            </div>

            {/* Right Column: 5-Category Structure & Concentration Table + Boundary Marginalia */}
            <div className="grid content-start gap-5 lg:col-span-6 lg:pl-8">
              <div className="grid gap-1">
                <h2 className="title-sub text-brand-navy">五大医疗器械品类进出口结构及来源集中度</h2>
                <p className="caption text-ink-muted">
                  2026 年前三季度海关 8 位 HS 编码归并汇总 · 按原产国核算前三位来源集中度（CR3）
                </p>
              </div>

              <DataTable
                caption="五大医疗器械品类进出口结构及来源集中度"
                columns={categoryColumns}
                data={filteredCategories}
                getRowId={(r) => r.id}
                empty="没有匹配当前检索词的医疗器械贸易品类"
                dense
              />

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                K06/K07 口径边界：海关 HS 商品编码与药监分类目录为多对多映射，跨簇关联须锁定《分类目录—HS 编码对照表》版本；海关出口额按境内报关离岸价统计，不等于上市企业年报境外营业收入（16号，含海外并购工厂本地产销）。
              </p>

              <div className="grid gap-2 pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title-nav text-brand-navy">高集中度整机与关键部件税号观察</h3>
                  <TextLink to="/indicators/TRD-006" className="caption">
                    查看进口来源集中度（TRD-006）
                  </TextLink>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {HIGH_CONCENTRATION_HS.map((row) => (
                    <li key={row.hsCode} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0 grid gap-0.5">
                        <p className="body-sm font-medium text-ink">
                          <span className="code mr-2 text-brand-navy">{row.hsCode}</span>
                          {row.itemName}
                        </p>
                        <p className="caption text-ink-muted">前三大来源国：{row.topOrigins}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Tag size="sm" tone="warning">
                          CR3 {row.cr3}
                        </Tag>
                        <TextLink to={`/indicators/${row.linkedCode}`} className="code">
                          {row.linkedCode}
                        </TextLink>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 3: Live Database Trade Observations Explorer (/api/observations) */}
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <p className="label text-brand-navy">实时数据库联动 · /api/observations</p>
              <h2 className="title-sub text-brand-navy">海关贸易观测值实时检索（TRD 指标簇）</h2>
              <p className="caption text-ink-muted">
                直连底层观测值数据库，支持按 TRD 工程指标切片与关键词过滤；已导入批次实时同步展示。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 body-sm">
              <TextLink
                to={selectedIndicator ? `/observations?indicator_id=${selectedIndicator}` : "/observations"}
              >
                进入全库跨簇观测值查询与导出
                <IconArrowRight size={14} className="ml-1 inline" aria-hidden="true" />
              </TextLink>
              <TextLink to="/admin/import?seq=38" className="text-ink-muted">
                导入 38 号海关 CSV
              </TextLink>
            </div>
          </div>

          {/* Indicator Underline Bar + Keyword Filter */}
          <div className="grid gap-4 border-b border-border pb-4 lg:flex lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="选择 TRD 工程指标">
              <button
                type="button"
                aria-pressed={selectedIndicator === ""}
                onClick={() => updateParams({ indicator: null })}
                className={cn(
                  "cursor-pointer border-b-2 py-1 body-sm transition-colors focus-ring",
                  selectedIndicator === ""
                    ? "border-brand-navy font-semibold text-brand-navy"
                    : "border-transparent text-ink-muted hover:text-brand-navy",
                )}
              >
                全部贸易指标
                <span className="ml-1 caption tabular-nums text-ink-muted">({formatNumber(totalLiveTrdCount)})</span>
              </button>
              {trdIndicators.map((ind) => {
                const active = selectedIndicator === ind.id;
                return (
                  <button
                    key={ind.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateParams({ indicator: ind.id })}
                    className={cn(
                      "cursor-pointer border-b-2 py-1 body-sm transition-colors focus-ring",
                      active
                        ? "border-brand-navy font-semibold text-brand-navy"
                        : "border-transparent text-ink-muted hover:text-brand-navy",
                    )}
                  >
                    <span className="code mr-1">{ind.id}</span>
                    {ind.name}
                    <span className="ml-1 caption tabular-nums text-ink-muted">({formatNumber(ind.obs_count)})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 lg:w-72">
              <div className="relative flex-1">
                <IconSearch
                  size={16}
                  className="pointer-events-none absolute top-2.5 left-2.5 text-ink-muted"
                  aria-hidden="true"
                />
                <Input
                  value={queryText}
                  onChange={(e) => updateParams({ q: e.target.value })}
                  placeholder="筛选期间、伙伴国(如 美国/US)…"
                  aria-label="筛选贸易观测值与品类"
                  className="pl-8"
                />
              </div>
              {queryText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateParams({ q: null })}
                  aria-label="清除搜索词"
                >
                  <IconX size={16} aria-hidden="true" />
                  清除
                </Button>
              )}
            </div>
          </div>

          {observationsQuery.isError ? (
            <QueryError error={observationsQuery.error} onRetry={() => observationsQuery.refetch()} />
          ) : (
            <DataTable
              caption="海关进出口贸易实时观测值明细表"
              columns={observationColumns}
              data={liveTradeRows}
              getRowId={(r) => r.id}
              loading={observationsQuery.isPending}
              fixedLayout
              dense
              empty={
                <div className="grid justify-items-center gap-2 py-4 text-center">
                  <p className="body font-medium text-ink">
                    {selectedIndicator
                      ? `当前库中暂无 ${selectedIndicator} 的已导入观测值`
                      : normalizedQ
                        ? `未找到匹配「${queryText.trim()}」的贸易观测记录`
                        : "当前实时数据库尚未导入 TRD 进出口贸易观测值"}
                  </p>
                  <p className="max-w-lg caption text-ink-muted">
                    您可前往数据管理后台选择「38 医疗器械进出口贸易」上传标准观测值 CSV（如样例文件 data/samples/trd_sample.csv），或进入全库观测值页面做跨簇检索。
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-4 body-sm">
                    <TextLink to="/admin/import?seq=38" className="inline-flex items-center gap-1 font-semibold">
                      <IconUpload size={15} aria-hidden="true" />
                      前往 /admin/import 导入贸易数据
                    </TextLink>
                    <TextLink to="/observations">进入 /observations 全库查询</TextLink>
                  </div>
                </div>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

function tradeTrendOption(t: ChartTheme): ChartOption {
  const periods = TRADE_ANNUAL_SERIES.map((d) => d.period);
  return {
    ...baseOption(t, 3),
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t, { name: "亿美元", scale: false }),
    series: [
      {
        type: "line",
        name: "出口额",
        data: TRADE_ANNUAL_SERIES.map((d) => d.exportUsd),
        symbol: SERIES_SYMBOLS[0],
        symbolSize: 7,
        lineStyle: { width: 2 },
      },
      {
        type: "line",
        name: "进口额",
        data: TRADE_ANNUAL_SERIES.map((d) => d.importUsd),
        symbol: SERIES_SYMBOLS[1],
        symbolSize: 7,
        lineStyle: { width: 2 },
      },
      {
        type: "line",
        name: "贸易顺差",
        data: TRADE_ANNUAL_SERIES.map((d) => d.surplusUsd),
        symbol: SERIES_SYMBOLS[2],
        symbolSize: 8,
        lineStyle: { width: 2, type: "dashed" },
      },
    ],
  };
}

function partnerStructureOption(t: ChartTheme): ChartOption {
  const countries = TRADE_PARTNER_ROWS.map((d) => d.country);
  return {
    ...baseOption(t, 2),
    xAxis: categoryAxis(t, countries),
    yAxis: valueAxis(t, { name: "份额 (%)", scale: false }),
    series: [
      {
        type: "bar",
        name: "占我国进口份额 (%)",
        data: TRADE_PARTNER_ROWS.map((d) => d.importShare),
        barMaxWidth: 24,
        itemStyle: { color: t.series[0] },
      },
      {
        type: "bar",
        name: "占我国出口份额 (%)",
        data: TRADE_PARTNER_ROWS.map((d) => d.exportShare),
        barMaxWidth: 24,
        itemStyle: { color: t.series[1] },
      },
    ],
  };
}
