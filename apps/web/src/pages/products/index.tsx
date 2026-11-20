import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconArrowRight, IconRotate } from "@tabler/icons-react";
import { DataTable, Tag, TextLink, type DataTableColumn, type TagTone } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { controlClass, Input } from "@/components/ui/input";
import { SYSTEM_INDICATORS, type SystemIndicator } from "@/content/system-v3";
import type { ChartOption } from "@/lib/charts/echarts";
import { baseOption, categoryAxis, LazyChart, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
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

const VALID_CHANNELS = new Set<ProductChannel>(["all", "reg", "innov", "priority", "udi"]);

const CHANNEL_TONE: Record<Exclude<ProductChannel, "all">, TagTone> = {
  innov: "info",
  priority: "warning",
  reg: "neutral",
  udi: "neutral",
};

type ChartView = "trend" | "track";

function parseChannel(raw: string | null): ProductChannel {
  if (raw && VALID_CHANNELS.has(raw as ProductChannel)) {
    return raw as ProductChannel;
  }
  return "all";
}

function regTrendOption(t: ChartTheme): ChartOption {
  const periods = REG_TREND_SERIES.map((d) => d.period);
  const domestic = REG_TREND_SERIES.map((d) => d.domestic);
  const imported = REG_TREND_SERIES.map((d) => d.imported);

  return {
    ...baseOption(t, 2),
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t, { name: "首次注册（件）", scale: false }),
    series: [
      {
        type: "line",
        name: "国产三类首次注册",
        data: domestic,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: true,
        lineStyle: { width: 2.5, color: t.series[0] },
        itemStyle: { color: t.series[0] },
      },
      {
        type: "line",
        name: "进口三类首次注册",
        data: imported,
        symbol: "rect",
        symbolSize: 7,
        showSymbol: true,
        lineStyle: { width: 2, color: t.series[1] },
        itemStyle: { color: t.series[1] },
      },
    ],
  };
}

function trackDistributionOption(t: ChartTheme): ChartOption {
  const ordered = [...TRACK_DISTRIBUTION].reverse();
  const tracks = ordered.map((d) => d.track);
  const domestic = ordered.map((d) => d.domesticValid);
  const imported = ordered.map((d) => d.importedValid);

  return {
    ...baseOption(t, 2),
    xAxis: valueAxis(t, { name: "有效三类证（件）", scale: false }),
    yAxis: categoryAxis(t, tracks),
    series: [
      {
        type: "bar",
        stack: "valid",
        name: "国产有效三类证",
        data: domestic,
        barMaxWidth: 20,
        itemStyle: { color: t.series[0] },
      },
      {
        type: "bar",
        stack: "valid",
        name: "进口有效三类证",
        data: imported,
        barMaxWidth: 20,
        itemStyle: { color: t.series[3] },
      },
    ],
  };
}

const DOMAIN_INDICATORS: readonly SystemIndicator[] = SYSTEM_INDICATORS.filter((item) => {
  const n = Number(item.seq);
  return n >= 1 && n <= 8;
});

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const channel = parseChannel(searchParams.get("channel"));

  const [chartView, setChartView] = useState<ChartView>("trend");
  const [origin, setOrigin] = useState<string>("");
  const [category, setCategory] = useState<string>("");

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

  const normalizedQuery = q.trim().toLowerCase();

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
      if (normalizedQuery) {
        const hay = `${row.certOrCode} ${row.productName} ${row.specAndScope} ${row.registrant} ${row.category} ${row.originRegion}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) continue;
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
      const hay = `${row.certOrCode} ${row.productName} ${row.specAndScope} ${row.registrant} ${row.category} ${row.originRegion}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [channel, origin, category, normalizedQuery]);

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
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{row.productName}</span>
            <span className="caption text-ink-muted">{row.specAndScope}</span>
          </div>
        ),
      },
      {
        key: "channelLabel",
        title: "通道类型",
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
        colClassName: "w-36",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="text-ink">{row.registrant}</span>
            <span className="caption text-ink-muted">
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

  const ledgerColumns = useMemo<DataTableColumn<SystemIndicator>[]>(
    () => [
      {
        key: "seq",
        title: "序号",
        type: "code",
        colClassName: "w-16",
      },
      {
        key: "name",
        title: "三级指标",
        primary: true,
        colClassName: "w-56",
        cell: (row) => (
          <div className="grid gap-0.5">
            <TextLink to={`/system/${row.seq}`} className="font-semibold">
              {row.name}
            </TextLink>
            <span className="caption text-ink-muted">{row.level2}</span>
          </div>
        ),
      },
      {
        key: "grain",
        title: "记录粒度",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="text-ink">{row.grain}</span>
            <span className="caption text-ink-muted">关联主键：{row.entityKeys}</span>
          </div>
        ),
      },
      {
        key: "source",
        title: "数据来源",
        colClassName: "w-40",
        cell: (row) => (
          <span className="text-ink">
            {row.source}
            <span className="ml-1 caption text-ink-muted">（{row.frequency}）</span>
          </span>
        ),
      },
      {
        key: "phase",
        title: "建设阶段",
        type: "status",
        colClassName: "w-28",
        cell: (row) =>
          row.phase1 ? (
            <Tag size="sm" tone="info">
              一期已纳入
            </Tag>
          ) : (
            <Tag size="sm" tone="neutral">
              二期规划
            </Tag>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      {/* Band 1: Page Header & Open 5-Column Rule-Line KPI Strip */}
      <section className="bg-surface" aria-labelledby="products-page-title">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid max-w-3xl gap-2">
              <p className="label text-brand-navy">一、审评注册与上市准入 · 二、产品档案与招采</p>
              <h1 id="products-page-title" className="title-page text-brand-navy">
                注册准入与产品数据库
              </h1>
              <p className="body text-ink-muted">
                贯通第三类医疗器械注册证（01）、创新特别审查获批（02）、优先审批通道（03）与唯一标识 UDI
                规格型号明细（05），并与国家药监局年度统计报告（28）交叉核验口径一致性。
              </p>
            </div>
            <TextLink to="/system#l1-reg" className="inline-flex items-center gap-1 body-sm font-semibold">
              查看指标体系释义（01–08）
              <IconArrowRight size={15} aria-hidden="true" />
            </TextLink>
          </header>

          <div
            role="region"
            aria-label="注册与产品核心指标通栏"
            className="grid grid-cols-2 gap-y-5 border-t-2 border-brand-navy border-b border-border py-4 md:grid-cols-5 md:gap-y-0 md:divide-x md:divide-border md:py-0"
          >
            {PRODUCT_KPIS.map((kpi) => (
              <div key={kpi.label} className="grid content-start gap-1 pr-3 md:px-4 md:py-4 md:first:pl-0 md:last:pr-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="label text-ink-muted">{kpi.label}</span>
                  <TextLink to={`/system/${kpi.seq}`} className="code text-link">
                    {kpi.seq}
                  </TextLink>
                </div>
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

      {/* Band 2: Registration Structure Chart & Official Annual-Report Reconciliation */}
      <section className="border-y border-border bg-surface-sunken" aria-labelledby="reg-structure-heading">
        <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
            {/* Left: Open Canvas ECharts with 2 Underline Tabs */}
            <div className="grid content-start gap-4 lg:col-span-7 lg:pr-8">
              <div className="grid gap-1">
                <h2 id="reg-structure-heading" className="title-sub text-brand-navy">
                  注册准入结构与重点赛道分布
                </h2>
                <p className="caption text-ink-muted">
                  对比历年国产与进口三类首次注册增量走势，以及六大重点产品赛道期末有效三类证存量构成
                </p>
              </div>

              <div role="tablist" aria-label="注册统计图表切换" className="flex flex-wrap gap-6 border-b border-border">
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartView === "trend"}
                  onClick={() => setChartView("trend")}
                  className={cn(
                    "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                    chartView === "trend"
                      ? "border-brand-navy font-semibold text-brand-navy"
                      : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  2021–2026 国产与进口三类首次注册趋势
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartView === "track"}
                  onClick={() => setChartView("track")}
                  className={cn(
                    "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                    chartView === "track"
                      ? "border-brand-navy font-semibold text-brand-navy"
                      : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  六大重点产品赛道注册证分布
                </button>
              </div>

              {chartView === "trend" ? (
                <div className="grid gap-3">
                  <p className="caption text-ink-muted">
                    2021–2025 全年及 2026 年前三季度第三类首次注册批件趋势（国产占比由 2021 年 65.8% 提升至 2026 前三季 82.2%）
                  </p>
                  <LazyChart
                    option={regTrendOption}
                    ariaLabel="2021至2026年前三季度国产与进口第三类医疗器械首次注册数量趋势折线图"
                    height={272}
                  />
                </div>
              ) : (
                <div className="grid gap-3">
                  <p className="caption text-ink-muted">
                    覆盖赛道：体外诊断 / 医学影像 / 无源植介入 / 有源手术与机器人 / 医用软件 / 康复护理（合计有效存量 24,680 件）
                  </p>
                  <LazyChart
                    option={trackDistributionOption}
                    ariaLabel="六大重点医疗器械产品赛道国产与进口有效三类注册证分布条形图"
                    height={272}
                  />
                </div>
              )}

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                统计来源：国家药监局医疗器械注册数据库（01号，截至 2026-09-30 快照）。首次注册反映当期获批新增供给，赛道分布反映期末有效持证存量。
              </p>
            </div>

            {/* Right: Official Annual-Report Cross-Reconciliation Three-Line Table */}
            <div className="grid content-start gap-4 lg:col-span-5 lg:pl-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="title-sub text-brand-navy">与药监年度统计报告（28号）交叉对账</h2>
                <TextLink to="/system/28" className="caption">
                  查看对账规范
                </TextLink>
              </div>

              <div className="overflow-x-auto focus-ring" tabIndex={0}>
                <table className="w-full border-collapse border-t-2 border-brand-navy border-b border-border body-sm">
                  <caption className="sr-only">本库三类首次注册与国家药监局年度报告公布值交叉对账表</caption>
                  <thead>
                    <tr className="border-b-2 border-brand-sky">
                      <th scope="col" className="py-2 pr-2 text-left label font-bold text-brand-navy">
                        年度
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        本库首次注册
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        药监年报值
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        口径偏差
                      </th>
                      <th scope="col" className="py-2 pl-2 text-left label font-bold text-brand-navy">
                        核验说明
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ANNUAL_RECONCILIATION.map((row) => (
                      <tr key={row.year}>
                        <td className="py-2 pr-2 code whitespace-nowrap text-ink">{row.year}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold text-ink">{row.dbInitialCount}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{row.officialReportCount}</td>
                        <td className="px-2 py-2 text-right code whitespace-nowrap text-brand-navy">{row.deviation}</td>
                        <td className="py-2 pl-2 caption text-ink-muted">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                口径边界：期末有效存量与年度首次注册不可直接相加；进入创新特别审查公示不等于正式获批上市，两阶段须分层披露且日常公开采集数与药监年报官方统计数双列并存。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Band 3: Interactive Registration, Innovation & UDI Explorer */}
      <section className="bg-surface" aria-labelledby="product-explorer-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 id="product-explorer-heading" className="title-sub text-brand-navy">
                注册批件、创新优先通道与 UDI 规格样本检索
              </h2>
              <p className="caption text-ink-muted">
                按准入通道（01 / 02 / 03 / 05）、国产或进口来源、重点产品赛道及关键词联合筛选代表性样本明细
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="body-sm tabular-nums text-ink-muted">
                当前匹配 <strong className="font-semibold text-brand-navy">{filteredRows.length}</strong> / {PRODUCT_EXPLORER_ROWS.length} 条样本
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

          {/* Interactive Form Controls Bar */}
          <div className="grid gap-3 md:grid-cols-12">
            <div className="grid gap-1 md:col-span-3">
              <label htmlFor="product-origin-select" className="caption font-semibold text-ink-muted">
                产品来源
              </label>
              <select
                id="product-origin-select"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className={cn(controlClass, "h-11 md:h-10")}
              >
                <option value="">全部来源</option>
                {ORIGIN_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 md:col-span-4">
              <label htmlFor="product-category-select" className="caption font-semibold text-ink-muted">
                器械品类赛道
              </label>
              <select
                id="product-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={cn(controlClass, "h-11 md:h-10")}
              >
                <option value="">全部品类</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 md:col-span-5">
              <label htmlFor="product-keyword-input" className="caption font-semibold text-ink-muted">
                关键词检索（同步 URL 参数 q）
              </label>
              <Input
                id="product-keyword-input"
                type="search"
                value={q}
                onChange={(e) => updateSearchParam("q", e.target.value)}
                placeholder="输入注册证号、UDI-DI、产品名称、规格或注册人…"
              />
            </div>
          </div>

          <DataTable
            caption="医疗器械注册批件、创新优先审查与UDI规格样本明细表"
            columns={explorerColumns}
            data={filteredRows}
            getRowId={(r) => r.id}
            fixedLayout
            dense
            empty="未找到符合当前通道、来源或关键词条件的记录。"
          />

          <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
            实体关联说明（01 ↔ 05）：医疗器械唯一标识（UDI-DI）与注册证号为多对一映射关系（单张高值耗材或吻合器注册证常涵盖数十至数百个规格包装层级），严禁将 UDI 条目数等同于注册证张数。
          </p>
        </div>
      </section>

      {/* Band 4: Domain Indicator Coverage Ledger (01–08) */}
      <section className="border-t border-border bg-surface-sunken" aria-labelledby="product-ledger-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 id="product-ledger-heading" className="title-sub text-brand-navy">
                本域三级指标覆盖台账（01–08）
              </h2>
              <p className="caption text-ink-muted">
                完整对齐《指标体系 V3.0》「一、审评注册与上市准入」及「二、产品」共 8 项三级指标的数据粒度与分期建设计划
              </p>
            </div>
            <TextLink to="/system#l1-reg" className="inline-flex items-center gap-1 body-sm">
              在指标总目录中查看全部 33 项
              <IconArrowRight size={14} aria-hidden="true" />
            </TextLink>
          </div>

          <DataTable
            caption="审评注册与产品领域三级指标覆盖台账"
            columns={ledgerColumns}
            data={DOMAIN_INDICATORS}
            getRowId={(r) => r.seq}
            fixedLayout
            dense
          />
        </div>
      </section>
    </div>
  );
}
