import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { IconArrowDown, IconArrowRight, IconArrowUp, IconMinus, IconSearch } from "@tabler/icons-react";
import { formatNumber, Sparkline, TextLink } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { ISSUE, type ArchiveCategory, type KpiDirection } from "@/content/issue";
import { DATA_FORM_LABEL, LEVEL1_SECTIONS, SYSTEM_INDICATORS, type IndicatorPhase } from "@/content/system-v3";
import type { ChartOption } from "@/lib/charts/echarts";
import { baseOption, categoryAxis, LazyChart, SERIES_SYMBOLS, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import { cn } from "@/lib/utils";

type TrendTabKey = "reg" | "trade" | "innov";
type ArchiveFilterKey = "all" | ArchiveCategory;

const TREND_TABS: readonly {
  key: TrendTabKey;
  label: string;
  title: string;
  subtitle: string;
  ariaLabel: string;
  note: string;
  option: (t: ChartTheme) => ChartOption;
}[] = [
  {
    key: "reg",
    label: "国产与进口三类注册趋势",
    title: "第三类医疗器械首次注册国产与进口结构演变（2021—2026Q3）",
    subtitle: "统计口径：年度及前三季度首次注册批准件数（不含延续与变更注册）；对应指标 01",
    ariaLabel: "国产与进口第三类医疗器械首次注册件数堆叠柱状图",
    note: "口径与来源：国家药监局医疗器械注册批件公开库汇总；2026Q1-Q3 共批准第三类首次注册 2,814 件，其中境内注册 2,004 件（占比 71.2%）、进口注册 810 件（占比 28.8%）。",
    option: buildRegTrendOption,
  },
  {
    key: "trade",
    label: "海关进出口规模走势",
    title: "医疗器械季度海关出口额与进口额运行序列（2025Q1—2026Q3）",
    subtitle: "统计口径：海关 HS 标准税则号映射汇总（当季亿美元）；对应指标 38",
    ariaLabel: "医疗器械季度出口额与进口额双序列折线图",
    note: "口径与来源：海关总署月度统计归并；2026 年前三季度累计出口 312.6 亿美元（同比 +6.6%），累计进口 268.4 亿美元（同比 -2.1%），不含上市企业海外本地产销收入（16 号）。",
    option: buildTradeTrendOption,
  },
  {
    key: "innov",
    label: "创新器械获批赛道结构",
    title: "国家药监局获批创新医疗器械重点赛道分布对照（前三季度）",
    subtitle: "统计口径：正式取得医疗器械注册证的创新特别审查产品（不含仅公示项目）；对应指标 02",
    ariaLabel: "获批创新医疗器械分赛道同比对照柱状图",
    note: "口径与来源：国家药监局器审中心创新医疗器械获批公告；2026 年前三季度正式获批 49 件（上年同期 38 件），有源手术与医学影像装备合计占比 42.9%。",
    option: buildInnovTrackOption,
  },
];

const ARCHIVE_TABS: readonly { key: ArchiveFilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "policy", label: "政策条款 (23)" },
  { key: "guideline", label: "审查指导原则 (24)" },
  { key: "standard", label: "国家/行业标准 (37)" },
];

const PHASE_TEXT: Record<IndicatorPhase, { text: string; className: string }> = {
  phase1: { text: "一期纳入", className: "font-semibold text-brand-navy" },
  partial: { text: "一期部分纳入", className: "font-semibold text-link" },
  later: { text: "二期规划", className: "text-ink-muted" },
};

/**
 * 医疗器械产业数据与运行分析平台首页：
 * 采用无卡片化（Zero-Card-Wall）五段式全宽学术刊物与制度数据台架构。
 */
export default function OverviewPage() {
  const navigate = useNavigate();
  const [searchScope, setSearchScope] = useState<string>(ISSUE.searchScopes[0].path);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [trendTab, setTrendTab] = useState<TrendTabKey>("reg");
  const [activeDomainId, setActiveDomainId] = useState<string>(LEVEL1_SECTIONS[0].id);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterKey>("all");

  const activeTrend = TREND_TABS.find((t) => t.key === trendTab) ?? TREND_TABS[0];

  const domainGroups = useMemo(
    () =>
      LEVEL1_SECTIONS.map((section) => {
        const indicators = SYSTEM_INDICATORS.filter((ind) => ind.level1 === section.name);
        const phase1Count = indicators.filter((ind) => ind.phase1).length;
        const cleanTitle = section.name.replace(/^[一二三四五六]、/, "");
        return {
          ...section,
          cleanTitle,
          indicators,
          phase1Count,
        };
      }),
    [],
  );

  const activeDomain = domainGroups.find((d) => d.id === activeDomainId) ?? domainGroups[0];

  const filteredArchive = useMemo(
    () =>
      archiveFilter === "all"
        ? ISSUE.regulatoryArchive
        : ISSUE.regulatoryArchive.filter((item) => item.category === archiveFilter),
    [archiveFilter],
  );

  const maxProvinceReg = Math.max(...ISSUE.provincesTop8.map((p) => p.regCount));

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = searchKeyword.trim();
    if (q) {
      navigate(`${searchScope}?q=${encodeURIComponent(q)}`);
    } else {
      navigate(searchScope);
    }
  }

  return (
    <div className="w-full">
      {/* Band 0: Full-Bleed Institutional Deep-Navy Hero Banner */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden border-b-2 border-brand-sky bg-banner-bg text-on-banner"
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full text-on-banner opacity-10"
        >
          <defs>
            <pattern id="itei-ortho-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.75" />
              <path
                d="M 12 0 L 12 4 M 24 0 L 24 6 M 36 0 L 36 4 M 0 12 L 4 12 M 0 24 L 6 24 M 0 36 L 4 36"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#itei-ortho-grid)" />
          <line x1="0" y1="72%" x2="100%" y2="72%" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
        </svg>

        <div className="relative mx-auto grid w-full max-w-content gap-8 px-4 py-10 md:px-8 md:py-12 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-banner-border">
          {/* Hero Left (7 cols) */}
          <div className="grid content-start gap-4 lg:col-span-7 lg:pr-10">
            <p className="flex items-center gap-2.5 caption text-on-banner-muted">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 bg-brand-sky" />
              <span>{ISSUE.eyebrow}</span>
            </p>

            <h1 id="hero-title" className="title-page text-on-banner">
              {ISSUE.heroTitle}
            </h1>

            <p className="body text-on-banner-muted">{ISSUE.heroCoverage}</p>

            <form
              role="search"
              aria-label="全库分域检索"
              onSubmit={handleSearchSubmit}
              className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <select
                aria-label="检索范围"
                value={searchScope}
                onChange={(e) => setSearchScope(e.target.value)}
                className="h-10 shrink-0 rounded-sm border border-banner-border bg-surface px-3 body-sm font-medium text-ink focus-ring sm:w-40"
              >
                {ISSUE.searchScopes.map((scope) => (
                  <option key={scope.path} value={scope.path}>
                    {scope.label}
                  </option>
                ))}
              </select>
              <input
                type="search"
                aria-label="检索关键词"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="检索器械名称、注册证号、企业、HS编码或指标…"
                className="h-10 min-w-0 flex-1 rounded-sm border border-banner-border bg-surface px-3.5 body text-ink placeholder:text-ink-muted focus-ring"
              />
              <Button
                type="submit"
                className="border-on-banner bg-on-banner text-banner-bg not-disabled:hover:bg-info-bg not-disabled:hover:text-brand-navy"
              >
                <IconSearch size={16} aria-hidden="true" />
                检索
              </Button>
            </form>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 caption text-on-banner-muted">
              <span>热门检索：</span>
              {ISSUE.hotQueries.map((item, idx) => (
                <span key={item.label} className="inline-flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <Link
                    to={item.href}
                    className="text-on-banner underline decoration-banner-border underline-offset-4 transition-colors duration-150 hover:text-on-banner-muted hover:decoration-on-banner focus-ring"
                  >
                    {item.label}
                  </Link>
                </span>
              ))}
            </p>
          </div>

          {/* Hero Right: Open Typographic Ledger (5 cols, NO inner card box) */}
          <div className="grid content-between gap-5 lg:col-span-5 lg:pl-10">
            <div className="grid gap-2">
              <p className="label text-on-banner-muted">{ISSUE.periodEyebrow}</p>
              <h2 className="title-sub text-on-banner">{ISSUE.headline}</h2>
            </div>

            <dl className="divide-y divide-banner-border border-y border-banner-border body-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <dt className="text-on-banner-muted">数据截至</dt>
                <dd className="tabular-nums text-on-banner">{ISSUE.dataSyncNote}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <dt className="text-on-banner-muted">核心来源</dt>
                <dd className="text-on-banner">{ISSUE.coreSources}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <dt className="text-on-banner-muted">体系基准</dt>
                <dd className="tabular-nums text-on-banner">{ISSUE.systemScope}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 body-sm">
              <Link
                to="/reports"
                className="inline-flex items-center gap-1 font-semibold text-on-banner underline underline-offset-4 transition-colors duration-150 hover:text-on-banner-muted focus-ring"
              >
                阅读季度监测报告
                <IconArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link
                to="/system"
                className="inline-flex items-center gap-1 font-semibold text-on-banner underline underline-offset-4 transition-colors duration-150 hover:text-on-banner-muted focus-ring"
              >
                浏览指标目录（V3.0）
                <IconArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Docked Open Baseline KPI Strip */}
      <section aria-label="核心基线指标" className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-content px-4 md:px-8">
          <div className="grid grid-cols-2 divide-y divide-border md:grid-cols-5 md:divide-x md:divide-y-0">
            {ISSUE.kpis.map((kpi) => (
              <Link
                key={kpi.id}
                to={kpi.href}
                className="group flex flex-col justify-between gap-1.5 px-3 py-4 transition-colors duration-150 hover:bg-surface-sunken focus-ring-inset md:px-5 md:py-5"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="label text-ink-muted transition-colors duration-150 group-hover:text-brand-navy">
                    {kpi.label}
                  </span>
                  <span className="code tabular-nums text-ink-muted">({kpi.seq})</span>
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="numeral-lg tabular-nums text-brand-navy">
                    {formatNumber(kpi.value, kpi.digits)}
                  </span>
                  <span className="body-sm text-ink-muted">{kpi.unit}</span>
                </span>
                <span className="flex items-center gap-1 caption tabular-nums text-ink-muted">
                  <DeltaIcon direction={kpi.direction} />
                  <span>{kpi.delta}</span>
                </span>
                <Sparkline values={[...kpi.trend]} label={`${kpi.label}近年序列趋势`} className="mt-1 h-7" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Band 1: Core Industry Trend Chart & Executive Takeaways (open 7:5 split) */}
      <section aria-labelledby="band1-title" className="bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-12 md:px-8 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
          {/* Left: Interactive Core Industry Trend Chart (7 cols) */}
          <div className="grid content-start gap-4 lg:col-span-7 lg:pr-10">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-brand-sky pb-2">
              <div>
                <p className="caption text-ink-muted">核心序列监测 · 图表工作台</p>
                <h2 id="band1-title" className="title-section text-brand-navy">
                  产业运行核心趋势
                </h2>
              </div>
              <TextLink to="/observations" className="inline-flex items-center gap-1 body-sm">
                进入原始观测序列
                <IconArrowRight size={14} aria-hidden="true" />
              </TextLink>
            </div>

            <div role="tablist" aria-label="核心趋势视图切换" className="flex flex-wrap gap-6 border-b border-border">
              {TREND_TABS.map((tab) => {
                const isSelected = tab.key === trendTab;
                return (
                  <button
                    key={tab.key}
                    id={`trend-tab-${tab.key}`}
                    role="tab"
                    type="button"
                    aria-selected={isSelected}
                    aria-controls={`trend-panel-${tab.key}`}
                    onClick={() => setTrendTab(tab.key)}
                    className={cn(
                      "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                      isSelected
                        ? "border-brand-navy font-semibold text-brand-navy"
                        : "border-transparent text-ink-muted hover:text-ink",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              id={`trend-panel-${activeTrend.key}`}
              role="tabpanel"
              aria-labelledby={`trend-tab-${activeTrend.key}`}
              className="grid gap-3 pt-1"
            >
              <div className="grid gap-1">
                <h3 className="title-sub text-ink">{activeTrend.title}</h3>
                <p className="caption text-ink-muted">{activeTrend.subtitle}</p>
              </div>
              <LazyChart
                key={activeTrend.key}
                option={activeTrend.option}
                ariaLabel={activeTrend.ariaLabel}
                height={260}
              />
              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">{activeTrend.note}</p>
            </div>
          </div>

          {/* Right: Executive Takeaways & Recent Approved Innovations (5 cols) */}
          <div className="grid content-start lg:col-span-5 lg:pl-10">
            <div className="flex items-baseline justify-between gap-2 border-b-2 border-brand-navy pb-2">
              <h2 className="title-sub text-brand-navy">本期核心研判要点</h2>
              <span className="caption text-ink-muted">总第 3 期结论摘编</span>
            </div>

            <ol className="divide-y divide-border">
              {ISSUE.insights.map((item) => (
                <li key={item.id} className="flex gap-3.5 py-4">
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center label tabular-nums text-on-brand",
                      item.emphasize ? "bg-brand-red" : "bg-brand-navy",
                    )}
                  >
                    {item.id}
                  </span>
                  <div className="min-w-0 grid gap-1">
                    <p className="body-sm font-semibold text-ink">{item.title}</p>
                    <p className="body-sm text-ink-muted">
                      {item.text}{" "}
                      <TextLink inline to={item.evidenceHref} className="font-medium whitespace-nowrap">
                        {item.evidenceLabel} →
                      </TextLink>
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t-2 border-brand-navy pt-6">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="title-nav text-brand-navy">近期获批创新医疗器械（节选）</h3>
                <span className="caption text-ink-muted">指标 02</span>
              </div>
              <ul className="mt-2 divide-y divide-border border-b border-border">
                {ISSUE.innovations.map((item) => (
                  <li key={item.name} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="body-sm font-medium text-ink">{item.name}</p>
                      <p className="caption text-ink-muted">
                        {item.applicant} · {item.region} · {item.category}
                      </p>
                    </div>
                    <span className="shrink-0 caption tabular-nums text-ink-muted">{item.date}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <TextLink to="/products" className="inline-flex items-center gap-1 body-sm font-semibold">
                  查看全部注册与创新产品
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 2: Six-Domain Interactive Index-Detail Workbench (ZERO 6-card wall) */}
      <section aria-labelledby="band2-title" className="border-y border-border bg-surface-sunken">
        <div className="mx-auto w-full max-w-content px-4 py-12 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <h2 id="band2-title" className="title-section text-brand-navy">
                一、六大业务数据库透视
              </h2>
              <p className="body-sm text-ink-muted">
                严格对齐《医疗器械产业数据系统指标体系 V3.0》6 大一级领域与 33 项三级指标，点击左侧目录切换核查数据源与建设阶段。
              </p>
            </div>
            <TextLink to="/system" className="inline-flex items-center gap-1 body-sm font-semibold">
              查阅完整指标体系目录（V3.0）
              <IconArrowRight size={14} aria-hidden="true" />
            </TextLink>
          </div>

          <div className="mt-6 grid gap-8 border-t-2 border-brand-navy pt-6 lg:grid-cols-12 lg:gap-0">
            {/* Left Vertical Index (4 cols) */}
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label="六大业务数据库目录"
              className="divide-y divide-border border-b border-border lg:col-span-4 lg:border-r lg:border-border lg:pr-6"
            >
              {domainGroups.map((domain) => {
                const isActive = domain.id === activeDomain.id;
                return (
                  <button
                    key={domain.id}
                    id={`domain-tab-${domain.id}`}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    aria-controls={`domain-panel-${domain.id}`}
                    onClick={() => setActiveDomainId(domain.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-3 border-l-4 px-4 py-3.5 text-left transition-colors duration-150 focus-ring-inset",
                      isActive
                        ? "border-brand-navy bg-surface font-semibold text-brand-navy"
                        : "border-transparent text-ink hover:bg-surface",
                    )}
                  >
                    <span className="flex items-baseline gap-2.5">
                      <span className="code tabular-nums text-ink-muted">{domain.code}</span>
                      <span className="body">{domain.cleanTitle}</span>
                    </span>
                    <span className="shrink-0 caption tabular-nums text-ink-muted">
                      一期 {domain.phase1Count}/{domain.indicators.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Open Detail Panel with Academic Three-Line Table (8 cols) */}
            <div
              id={`domain-panel-${activeDomain.id}`}
              role="tabpanel"
              aria-labelledby={`domain-tab-${activeDomain.id}`}
              className="grid content-start gap-4 lg:col-span-8 lg:pl-8"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h3 className="title-sub text-ink">{activeDomain.name}</h3>
                  <span className="caption tabular-nums text-ink-muted">
                    共 {activeDomain.indicators.length} 项三级指标 · 一期纳入 {activeDomain.phase1Count} 项
                  </span>
                </div>
                <TextLink to={activeDomain.subpageHref} className="inline-flex items-center gap-1 body-sm font-semibold">
                  {activeDomain.subpageLabel}
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
              </div>

              <p className="body text-ink-muted">{activeDomain.summary}</p>

              <p className="border-l-2 border-brand-navy pl-4 title-sub tabular-nums text-brand-navy">
                {activeDomain.headlineMetric}
              </p>

              <div className="overflow-x-auto focus-ring" tabIndex={0}>
                <table className="w-full border-collapse border-t border-b border-border-strong text-left">
                  <caption className="sr-only">{activeDomain.name}三级指标清单</caption>
                  <thead>
                    <tr className="border-b border-border-strong label text-ink-muted">
                      <th scope="col" className="py-2.5 pr-3">
                        序号
                      </th>
                      <th scope="col" className="py-2.5 pr-4">
                        三级指标
                      </th>
                      <th scope="col" className="py-2.5 pr-4 whitespace-nowrap">
                        数据形态
                      </th>
                      <th scope="col" className="py-2.5 pr-4">
                        数据来源
                      </th>
                      <th scope="col" className="py-2.5 whitespace-nowrap">
                        建设阶段
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border body-sm">
                    {activeDomain.indicators.map((ind) => {
                      const phaseInfo = PHASE_TEXT[ind.phase];
                      return (
                        <tr key={ind.seq} className="transition-colors duration-150 hover:bg-surface">
                          <td className="py-2.5 pr-3 code tabular-nums text-ink-muted">{ind.seq}</td>
                          <td className="py-2.5 pr-4 font-medium">
                            <TextLink to={`/system/${ind.seq}`}>{ind.name}</TextLink>
                          </td>
                          <td className="py-2.5 pr-4 caption whitespace-nowrap text-ink-muted">
                            {ind.dataForms.map((f) => DATA_FORM_LABEL[f]).join(" / ")}
                          </td>
                          <td className="py-2.5 pr-4 caption text-ink-muted">{ind.source}</td>
                          <td className={cn("py-2.5 caption whitespace-nowrap", phaseInfo.className)}>
                            {phaseInfo.text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <TextLink to={activeDomain.subpageHref} className="inline-flex items-center gap-1 body-sm font-semibold">
                  {activeDomain.subpageLabel}
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
                <TextLink to="/indicators" className="inline-flex items-center gap-1 caption">
                  查看对应底层工程指标库 →
                </TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 3: Provincial Concentration & Foreign Trade Structure (open 6:6 comparative workbench) */}
      <section aria-labelledby="band3-title" className="bg-surface">
        <div className="mx-auto w-full max-w-content px-4 py-12 md:px-8">
          <div className="grid gap-1">
            <h2 id="band3-title" className="title-section text-brand-navy">
              二、重点省市集聚度与进出口品类结构
            </h2>
            <p className="body-sm text-ink-muted">
              国内高端器械注册产出省际集聚格局与五大海关品类进出口及来源集中度（CR3）对照。
            </p>
          </div>

          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            {/* Left: Provincial Concentration (TOP 8) */}
            <div className="grid content-start gap-4 border-t-2 border-brand-navy pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="title-sub text-brand-navy">三类首次注册与单项冠军省市分布（TOP 8）</h3>
                <span className="caption text-ink-muted">指标 01 · 12</span>
              </div>

              <ul className="divide-y divide-border border-t border-b border-border">
                {ISSUE.provincesTop8.map((row) => {
                  const barPct = Math.round((row.regCount / maxProvinceReg) * 100);
                  return (
                    <li key={row.province} className="grid gap-1.5 py-2.5">
                      <div className="flex items-baseline justify-between gap-3 body-sm">
                        <span className="flex items-baseline gap-2">
                          <span className="code tabular-nums text-ink-muted">{row.rank}</span>
                          <span className="font-semibold text-ink">{row.province}</span>
                        </span>
                        <span className="flex items-baseline gap-4 tabular-nums">
                          <span className="font-semibold text-brand-navy">{formatNumber(row.regCount)} 件</span>
                          <span className="w-14 text-right caption text-ink-muted">占比 {row.sharePct.toFixed(1)}%</span>
                          <span className="w-24 text-right caption text-ink-muted">单项冠军 {row.championCount} 家</span>
                        </span>
                      </div>
                      <div aria-hidden="true" className="h-2 w-full bg-surface-sunken">
                        <div className="h-full bg-brand-navy" style={{ width: `${barPct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                注：分省对比以国家药监局第三类首次注册公开批件及工信部第一至八批制造业单项冠军医疗器械主体汇总；TOP 8 省市合计占全国三类首次注册新增量 78.3%。
              </p>

              <div>
                <TextLink to="/enterprises" className="inline-flex items-center gap-1 body-sm font-semibold">
                  进入企业与各省分布
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
              </div>
            </div>

            {/* Right: Five Major Trade Categories Three-Line Table */}
            <div className="grid content-start gap-4 border-t-2 border-brand-navy pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="title-sub text-brand-navy">医疗器械五大品类进出口结构与来源集中度</h3>
                <span className="caption text-ink-muted">海关 HS 口径 · 指标 38</span>
              </div>

              <div className="overflow-x-auto focus-ring" tabIndex={0}>
                <table className="w-full border-collapse border-t border-b border-border-strong text-left">
                  <caption className="sr-only">2026年前三季度医疗器械五大品类进出口额与进口来源CR3集中度</caption>
                  <thead>
                    <tr className="border-b border-border-strong label text-ink-muted">
                      <th scope="col" className="py-2.5 pr-3">
                        品类
                      </th>
                      <th scope="col" className="py-2.5 pr-3 text-right whitespace-nowrap">
                        出口额(亿美元)
                      </th>
                      <th scope="col" className="py-2.5 pr-3 text-right whitespace-nowrap">
                        进口额(亿美元)
                      </th>
                      <th scope="col" className="py-2.5 pr-3 text-right whitespace-nowrap">
                        进口CR3集中度
                      </th>
                      <th scope="col" className="py-2.5 text-right whitespace-nowrap">
                        同比变化
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border body-sm">
                    {ISSUE.tradeCategories.map((row) => (
                      <tr key={row.category} className="transition-colors duration-150 hover:bg-surface-sunken">
                        <td className="py-3 pr-3 font-medium whitespace-nowrap text-ink">{row.category}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-brand-navy">
                          {formatNumber(row.exportUsd, 1)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-ink">
                          {formatNumber(row.importUsd, 1)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums font-medium text-ink">
                          {row.importCr3Pct.toFixed(1)}%
                        </td>
                        <td className="py-3 text-right caption tabular-nums whitespace-nowrap text-ink-muted">
                          {row.yoySummary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong body-sm font-semibold text-ink">
                      <td className="py-2.5 pr-3">全行业合计 / 加权均值</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-brand-navy">312.6</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">268.4</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">68.2%</td>
                      <td className="py-2.5 text-right caption tabular-nums whitespace-nowrap text-ink-muted">
                        出口 +6.6% / 进口 -2.1%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                供应链集中度提示：医院诊断与治疗设备占全行业进口额 67.6%，其中超导磁体、高端 CT 球管及特种探测器美德日来源国集中度（CR3）达 74.6%，建议结合首台（套）目录（26 号）持续跟踪核心部件国产替代。
              </p>

              <div>
                <TextLink to="/trade" className="inline-flex items-center gap-1 body-sm font-semibold">
                  进入进出口贸易库
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 4: Research Briefings & Regulatory/Standard Archive (open 5:7 split) */}
      <section aria-labelledby="band4-title" className="border-t border-border bg-surface-sunken">
        <div className="mx-auto w-full max-w-content px-4 py-12 md:px-8">
          <div className="grid gap-1">
            <h2 id="band4-title" className="title-section text-brand-navy">
              三、研究报告发布与政策标准动态
            </h2>
            <p className="body-sm text-ink-muted">
              ITEI 产业监测研究简报与国家药监、工信、标委会近期发布的法规政策、注册审查指导原则及 GB/YY 标准档案。
            </p>
          </div>

          <div className="mt-6 grid gap-10 lg:grid-cols-12">
            {/* Left: Think-Tank Monitoring Reports & Briefings (5 cols, ZERO cover cards) */}
            <div className="grid content-start border-t-2 border-brand-navy pt-4 lg:col-span-5">
              <div className="flex items-baseline justify-between gap-2 pb-3">
                <h3 className="title-sub text-brand-navy">智库监测报告与专题简报</h3>
                <span className="caption text-ink-muted">ITEI 编制</span>
              </div>

              <div className="divide-y divide-border border-t border-b border-border">
                {ISSUE.briefings.map((report) => (
                  <article key={report.id} className="grid gap-2 py-4">
                    <p className="caption tabular-nums text-ink-muted">
                      {report.date} · {report.reportType}
                    </p>
                    <h4 className="title-nav">
                      <Link
                        to="/reports"
                        className="text-ink transition-colors duration-150 hover:text-link hover:underline focus-ring"
                      >
                        {report.title}
                      </Link>
                    </h4>
                    <p className="body-sm text-ink-muted">{report.takeaway}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 caption text-ink-muted">
                      <span>引用指标：</span>
                      {report.citedSeqs.map((cite) => (
                        <TextLink key={cite.seq} inline to={`/system/${cite.seq}`} className="caption">
                          {cite.label}
                        </TextLink>
                      ))}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            {/* Right: Policies, Review Guidelines & Standards Archive (7 cols) */}
            <div className="grid content-start border-t-2 border-brand-navy pt-4 lg:col-span-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
                <h3 className="title-sub text-brand-navy">政策法规、审查指导原则与行业标准</h3>
                <span className="caption text-ink-muted">指标 23 · 24 · 37</span>
              </div>

              <div
                role="tablist"
                aria-label="政策与标准分类筛选"
                className="flex flex-wrap gap-5 border-b border-border"
              >
                {ARCHIVE_TABS.map((tab) => {
                  const isSelected = tab.key === archiveFilter;
                  return (
                    <button
                      key={tab.key}
                      id={`archive-tab-${tab.key}`}
                      role="tab"
                      type="button"
                      aria-selected={isSelected}
                      aria-controls={`archive-panel-${tab.key}`}
                      onClick={() => setArchiveFilter(tab.key)}
                      className={cn(
                        "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                        isSelected
                          ? "border-brand-navy font-semibold text-brand-navy"
                          : "border-transparent text-ink-muted hover:text-ink",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                id={`archive-panel-${archiveFilter}`}
                role="tabpanel"
                aria-labelledby={`archive-tab-${archiveFilter}`}
              >
                <ul className="divide-y divide-border border-b border-border">
                  {filteredArchive.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex flex-col justify-between gap-2 py-3.5 sm:flex-row sm:items-baseline sm:gap-4"
                    >
                      <div className="min-w-0 grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-surface px-2 py-0.5 caption font-semibold text-brand-navy">
                            {doc.categoryLabel}
                          </span>
                          <Link
                            to="/reports"
                            className="body font-medium text-ink transition-colors duration-150 hover:text-link hover:underline focus-ring"
                          >
                            {doc.title}
                          </Link>
                        </div>
                        <p className="caption text-ink-muted">
                          {doc.authority} · {doc.docNo} · 关联指标 {doc.seq}
                        </p>
                      </div>
                      <span className="shrink-0 caption tabular-nums text-ink-muted">{doc.date}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                <TextLink to="/reports" className="inline-flex items-center gap-1 body-sm font-semibold">
                  查看全部政策与报告
                  <IconArrowRight size={14} aria-hidden="true" />
                </TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeltaIcon({ direction }: { direction: KpiDirection }) {
  if (direction === "up") return <IconArrowUp size={14} aria-hidden="true" />;
  if (direction === "down") return <IconArrowDown size={14} aria-hidden="true" />;
  return <IconMinus size={14} aria-hidden="true" />;
}

function buildRegTrendOption(t: ChartTheme): ChartOption {
  const periods = ISSUE.regTrendSeries.map((r) => r.period);
  const domestic = ISSUE.regTrendSeries.map((r) => r.domesticCount);
  const imported = ISSUE.regTrendSeries.map((r) => r.importCount);
  const shares = ISSUE.regTrendSeries.map((r) => r.domesticShare);

  return {
    ...baseOption(t, 2),
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t, { name: "件" }),
    series: [
      {
        type: "bar",
        stack: "reg",
        name: "境内三类首次注册",
        data: domestic,
        barMaxWidth: 36,
        itemStyle: { color: t.series[0] },
      },
      {
        type: "bar",
        stack: "reg",
        name: "进口三类首次注册",
        data: imported,
        barMaxWidth: 36,
        itemStyle: { color: t.series[3] },
        label: {
          show: true,
          position: "top",
          formatter: (p) => `国产 ${shares[p.dataIndex]}%`,
          color: t.muted,
          fontSize: 11,
        },
      },
    ],
  };
}

function buildTradeTrendOption(t: ChartTheme): ChartOption {
  const periods = ISSUE.tradeTrendSeries.map((r) => r.period);
  const exportsUsd = ISSUE.tradeTrendSeries.map((r) => r.exportUsd);
  const importsUsd = ISSUE.tradeTrendSeries.map((r) => r.importUsd);

  return {
    ...baseOption(t, 2),
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t, { name: "亿美元", scale: true }),
    series: [
      {
        type: "line",
        name: "器械出口额",
        data: exportsUsd,
        symbol: SERIES_SYMBOLS[0],
        symbolSize: 7,
        lineStyle: { width: 2, color: t.series[0] },
        itemStyle: { color: t.series[0] },
      },
      {
        type: "line",
        name: "器械进口额",
        data: importsUsd,
        symbol: SERIES_SYMBOLS[1],
        symbolSize: 7,
        lineStyle: { width: 2, color: t.series[1] },
        itemStyle: { color: t.series[1] },
      },
    ],
  };
}

function buildInnovTrackOption(t: ChartTheme): ChartOption {
  const tracks = ISSUE.innovTrackSeries.map((r) => r.track);
  const prev = ISSUE.innovTrackSeries.map((r) => r.prevCount);
  const curr = ISSUE.innovTrackSeries.map((r) => r.currCount);

  return {
    ...baseOption(t, 2),
    xAxis: {
      ...categoryAxis(t, tracks),
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        fontFamily: t.fontFamily,
        interval: 0,
      },
    },
    yAxis: valueAxis(t, { name: "件" }),
    series: [
      {
        type: "bar",
        name: "2025年前三季度",
        data: prev,
        barMaxWidth: 20,
        itemStyle: { color: t.series[3] },
      },
      {
        type: "bar",
        name: "2026年前三季度",
        data: curr,
        barMaxWidth: 20,
        itemStyle: { color: t.series[0] },
      },
    ],
  };
}
