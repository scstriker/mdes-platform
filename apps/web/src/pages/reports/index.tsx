import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconCheck, IconChevronDown, IconChevronUp, IconCopy, IconX } from "@tabler/icons-react";
import bannerReports from "@/assets/visuals/banner-reports.webp";
import { DataTable, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { ReportCoverThumb, type ReportCoverVariant } from "@/components/layout/report-cover-thumb";
import { StatistaFigure } from "@/components/layout/statista-figure";
import { statistaHorizontalBarOption } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";
import {
  ANNUAL_REPORTS_ROWS,
  BRIEFING_LEDGER,
  GUIDELINE_ROWS,
  GUIDELINE_TRACK_DISTRIBUTION,
  POLICY_CLAUSE_ROWS,
  POLICY_TOPIC_DISTRIBUTION,
  REPORTS_SUMMARY_STRIP,
  STANDARD_CATALOG_ROWS,
  type AnnualReportRow,
  type GuidelineCategory,
  type GuidelineRow,
  type PolicyClauseRow,
  type PolicyLevel,
  type ReportTabKey,
  type StandardRow,
} from "./data";

const VALID_TABS: readonly ReportTabKey[] = ["briefings", "policies", "guidelines", "standards"];
const POLICY_LEVELS: readonly ("全部" | PolicyLevel)[] = ["全部", "国家级部委", "重点省市"];
const GUIDELINE_CATEGORIES: readonly ("全部" | GuidelineCategory)[] = [
  "全部",
  "有源手术与机器人",
  "医学影像",
  "人工智能软件",
  "植介入与耗材",
  "体外诊断",
];
const PAGE_SIZE = 8;

function parseTab(raw: string | null): ReportTabKey {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as ReportTabKey;
  }
  return "briefings";
}

function coverVariantFor(series: string): ReportCoverVariant {
  return series.includes("季度") ? "quarterly" : "domestic";
}

function coverLabelFor(series: string): string {
  if (series.includes("季度")) return "季度报告";
  if (series.includes("供应链")) return "供应链";
  if (series.includes("审评")) return "审评标准";
  if (series.includes("准入")) return "准入复盘";
  if (series.includes("年报")) return "企业年报";
  if (series.includes("政策")) return "政策跟踪";
  return series.slice(0, 4);
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const rawQuery = searchParams.get("q")?.trim() ?? "";
  const q = rawQuery.toLowerCase();

  // 默认全部收起长结论，实现一屏纵览全部 6 篇智库代表性成果（彻底消除图5下半屏大面积空白截断）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [policyLevel, setPolicyLevel] = useState<"全部" | PolicyLevel>("全部");
  const [guidelineCat, setGuidelineCat] = useState<"全部" | GuidelineCategory>("全部");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [activeTab, q, policyLevel, guidelineCat]);

  function setTab(nextTab: ReportTabKey) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "briefings") next.delete("tab");
    else next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  }

  function clearQuery() {
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    setSearchParams(next, { replace: true });
  }

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copyCitation = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // 忽略受限剪贴板环境异常
    }
  }, []);

  // 各分栏过滤（统一响应顶部 <ScopedSearchBar /> 驱动的 URL ?q=）
  const filteredBriefings = useMemo(
    () =>
      BRIEFING_LEDGER.filter(
        (b) => !q || `${b.title} ${b.series} ${b.summary} ${b.keyFindings.join(" ")}`.toLowerCase().includes(q),
      ),
    [q],
  );

  const filteredPolicies = useMemo(
    () =>
      POLICY_CLAUSE_ROWS.filter((p) => {
        if (policyLevel !== "全部" && p.level !== policyLevel) return false;
        if (!q) return true;
        return `${p.docNo} ${p.title} ${p.agency} ${p.topic} ${p.clauseSummary}`.toLowerCase().includes(q);
      }),
    [policyLevel, q],
  );

  const filteredGuidelines = useMemo(
    () =>
      GUIDELINE_ROWS.filter((g) => {
        if (guidelineCat !== "全部" && g.category !== guidelineCat) return false;
        if (!q) return true;
        return `${g.noticeNo} ${g.title} ${g.category} ${g.classCode} ${g.reviewPoints}`.toLowerCase().includes(q);
      }),
    [guidelineCat, q],
  );

  const filteredAnnuals = useMemo(
    () =>
      ANNUAL_REPORTS_ROWS.filter(
        (a) => !q || `${a.reportTitle} ${a.publisher} ${a.reconciliationScope}`.toLowerCase().includes(q),
      ),
    [q],
  );

  const filteredStandards = useMemo(
    () =>
      STANDARD_CATALOG_ROWS.filter(
        (s) => !q || `${s.stdNo} ${s.stdName} ${s.scope} ${s.nature} ${s.keyClause}`.toLowerCase().includes(q),
      ),
    [q],
  );

  const tabCounts: Record<ReportTabKey, number> = {
    briefings: filteredBriefings.length,
    policies: filteredPolicies.length,
    guidelines: filteredGuidelines.length,
    standards: filteredAnnuals.length + filteredStandards.length,
  };

  // 当激活分栏命中 0 条，但兄弟分栏有命中时，提供智能跨 Tab 检索引导
  const fallbackSiblingTab = useMemo(() => {
    if (!q || tabCounts[activeTab] > 0) return null;
    const labels: Record<ReportTabKey, string> = {
      briefings: "季度与专题报告",
      policies: "国家及地方政策条款",
      guidelines: "注册审查指导原则",
      standards: "监管年报与技术标准",
    };
    for (const k of VALID_TABS) {
      if (k !== activeTab && tabCounts[k] > 0) {
        return { key: k, label: labels[k], count: tabCounts[k] };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activeTab, filteredBriefings.length, filteredPolicies.length, filteredGuidelines.length, filteredAnnuals.length, filteredStandards.length]);

  const policyChartCols = [
    { key: "topic", title: "政策主题方向" },
    { key: "count", title: "条款数量(份)", align: "right" as const },
    { key: "share", title: "占比", align: "right" as const },
    { key: "focusMeasures", title: "核心政策工具" },
  ];

  const guidelineChartCols = [
    { key: "track", title: "技术审评赛道" },
    { key: "count", title: "指导原则(份)", align: "right" as const },
    { key: "share", title: "占比", align: "right" as const },
    { key: "classScope", title: "典型器械范围" },
  ];

  const policyColumns: DataTableColumn<PolicyClauseRow>[] = useMemo(
    () => [
      { key: "docNo", title: "发文字号", type: "code", colClassName: "w-44" },
      {
        key: "title",
        title: "政策文件与核心医疗装备条款",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-brand-navy">{r.title}</span>
            <span className="line-clamp-1 caption text-ink-muted">{r.clauseSummary}</span>
          </div>
        ),
      },
      { key: "agency", title: "发文机关", colClassName: "w-36" },
      {
        key: "level",
        title: "层级与主题",
        type: "status",
        colClassName: "w-40",
        cell: (r) => (
          <Tag size="sm" tone={r.level === "国家级部委" ? "info" : "neutral"}>
            {r.topic}
          </Tag>
        ),
      },
      { key: "publishDate", title: "发布日期", type: "code", colClassName: "w-28" },
    ],
    [],
  );

  const guidelineColumns: DataTableColumn<GuidelineRow>[] = useMemo(
    () => [
      { key: "noticeNo", title: "通告号", type: "code", colClassName: "w-32" },
      {
        key: "title",
        title: "审查指导原则与技术审评要点",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-brand-navy">{r.title}</span>
            <span className="line-clamp-1 caption text-ink-muted">{r.reviewPoints}</span>
          </div>
        ),
      },
      {
        key: "category",
        title: "技术赛道",
        type: "status",
        colClassName: "w-40",
        cell: (r) => (
          <Tag size="sm" tone="info">
            {r.category}
          </Tag>
        ),
      },
      { key: "classCode", title: "分类编码", type: "code", colClassName: "w-24" },
      {
        key: "versionStatus",
        title: "版本效力",
        colClassName: "w-24",
        cell: (r) => <span className="body-sm text-ink-muted">{r.versionStatus}</span>,
      },
    ],
    [],
  );

  const standardColumns: DataTableColumn<StandardRow>[] = useMemo(
    () => [
      { key: "stdNo", title: "标准编号", type: "code", colClassName: "w-40" },
      {
        key: "stdName",
        title: "标准名称与安全性能核心要求",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-brand-navy">{r.stdName}</span>
            <span className="line-clamp-1 caption text-ink-muted">{r.keyClause}</span>
          </div>
        ),
      },
      {
        key: "nature",
        title: "标准属性",
        type: "status",
        colClassName: "w-32",
        cell: (r) => (
          <Tag size="sm" tone={r.nature.startsWith("强制性") ? "warning" : "neutral"}>
            {r.nature}
          </Tag>
        ),
      },
      { key: "scope", title: "适用领域", colClassName: "w-40" },
    ],
    [],
  );

  const annualColumns: DataTableColumn<AnnualReportRow>[] = useMemo(
    () => [
      {
        key: "reportTitle",
        title: "权威年度报告与统计公报",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <TextLink to={`/system/${r.seq}`} className="font-semibold">
              {r.reportTitle}
            </TextLink>
            <span className="line-clamp-1 caption text-ink-muted">{r.reconciliationScope}</span>
          </div>
        ),
      },
      { key: "publisher", title: "发布部门", colClassName: "w-40" },
      { key: "latestIssue", title: "最新基准期", colClassName: "w-36" },
      {
        key: "coverageLabel",
        title: "核验用途",
        type: "status",
        colClassName: "w-32",
        cell: (r) => (
          <Tag size="sm" tone="info">
            {r.coverageLabel}
          </Tag>
        ),
      },
    ],
    [],
  );

  const TAB_ITEMS: readonly { key: ReportTabKey; label: string }[] = [
    { key: "briefings", label: "季度与专题报告" },
    { key: "policies", label: "国家及地方政策条款" },
    { key: "guidelines", label: "注册审查指导原则" },
    { key: "standards", label: "监管年报与技术标准" },
  ];

  return (
    <div className="mx-auto grid w-full max-w-content gap-10 px-4 py-8 md:px-8 md:py-10">
      {/* Band 1：智库页头 + 4 列核心文献规模条 */}
      <div className="grid gap-6">
        <PageVisualBanner
          title="研究报告、政策法规与技术标准库"
          summary="汇集本所季度运行监测报告、专题研判简报，以及国家级部委与重点省市产业政策条款、注册审查指导原则与现行强制性/推荐性标准。"
          image={bannerReports}
          actions={<TextLink to="/system#l1-pol">查看政策与技术标准统计口径 →</TextLink>}
        />

        <div className="grid grid-cols-2 border-t-2 border-t-brand-navy border-b border-border lg:grid-cols-4 lg:divide-x lg:divide-border">
          {REPORTS_SUMMARY_STRIP.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as ReportTabKey)}
              className="grid cursor-pointer content-between gap-1 px-3 py-3.5 text-left transition-colors hover:bg-surface-sunken focus-ring-inset lg:px-4 lg:first:pl-1"
            >
              <span className="body-sm font-semibold text-ink-muted">{item.label}</span>
              <div>
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span className="numeral text-brand-navy">{item.value}</span>
                  {item.unit && <span className="caption text-ink-muted">{item.unit}</span>}
                </span>
                <p className="mt-0.5 caption text-ink-muted">{item.subline}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Band 2：双栏 Statista 级政策主题与审评指导原则构成信息图（终结原图5 0图表空白） */}
      <section aria-label="政策焦点与技术规范结构概览" className="grid gap-6 lg:grid-cols-2">
        <StatistaFigure
          id="fig-reports-policy"
          eyebrow="图 1 · 产业政策主题结构"
          title="设备更新改造与创新审评准入成为国家及地方政策首要着力点"
          subtitle="截至 2026年9月 · 418 份国家级部委及重点省市医疗器械政策主题分布（单位：份）"
          badge={{ label: "收录有效政策 418 份", tone: "info" }}
          ariaLabel="国家及地方医疗器械政策主题分布横向条形图"
          height={256}
          option={(t) =>
            statistaHorizontalBarOption(t, {
              categories: POLICY_TOPIC_DISTRIBUTION.map((d) => d.topic),
              values: POLICY_TOPIC_DISTRIBUTION.map((d) => d.count),
              labels: POLICY_TOPIC_DISTRIBUTION.map((d) => d.barLabel),
              highlightTopN: 2,
              rightPadding: 108,
            })
          }
          tableColumns={policyChartCols}
          tableRows={POLICY_TOPIC_DISTRIBUTION as unknown as Record<string, string | number>[]}
          exportName="policy-topic-distribution"
          source="国务院各部委及重点省市人民政府公开公报"
          note="单份综合政策按核心医疗装备支持条款主方向归类统计"
        />

        <StatistaFigure
          id="fig-reports-guidelines"
          eyebrow="图 2 · 审评指导原则赛道分布"
          title="植介入耗材、体外诊断与医学影像合计占现行指导原则逾七成"
          subtitle="截至 2026年9月 · 506 份现行医疗器械注册审查指导原则技术领域构成（单位：份）"
          badge={{ label: "现行有效 506 份", tone: "info" }}
          ariaLabel="医疗器械注册审查指导原则技术赛道分布横向条形图"
          height={256}
          option={(t) =>
            statistaHorizontalBarOption(t, {
              categories: GUIDELINE_TRACK_DISTRIBUTION.map((d) => d.track),
              values: GUIDELINE_TRACK_DISTRIBUTION.map((d) => d.count),
              labels: GUIDELINE_TRACK_DISTRIBUTION.map((d) => d.barLabel),
              highlightTopN: 3,
              rightPadding: 108,
            })
          }
          tableColumns={guidelineChartCols}
          tableRows={GUIDELINE_TRACK_DISTRIBUTION as unknown as Record<string, string | number>[]}
          exportName="guideline-track-distribution"
          source="国家药监局医疗器械技术审评中心（CMDE）"
          note="覆盖全部 22 个《医疗器械分类目录》子目录及 6840 体外诊断试剂"
        />
      </section>

      {/* Band 3：四分栏智库文献与法规标准检索台 */}
      <section id="fig-reports-briefings" aria-label="研究报告与法规标准目录" className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div role="tablist" aria-label="文献类别切换" className="flex flex-wrap gap-6">
            {TAB_ITEMS.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "-mb-px cursor-pointer border-b-2 py-2.5 button transition-colors focus-ring",
                    active
                      ? "border-brand-navy text-brand-navy"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {item.label}
                  {q && <span className="ml-1.5 caption tabular-nums">({tabCounts[item.key]})</span>}
                </button>
              );
            })}
          </div>

          {rawQuery && (
            <button
              type="button"
              onClick={clearQuery}
              className="inline-flex cursor-pointer items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
            >
              <IconX size={15} aria-hidden="true" />
              清除检索词「{rawQuery}」
            </button>
          )}
        </div>

        {/* 跨 Tab 检索引导（解决原图5搜指导原则/标准词在默认报告 Tab 显示 0 条死胡同的问题） */}
        {fallbackSiblingTab && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-info-bg px-4 py-3 body-sm text-ink">
            <span>
              当前分栏未命中「{rawQuery}」，但在<strong>「{fallbackSiblingTab.label}」</strong>中匹配到{" "}
              <strong className="tabular-nums text-brand-navy">{fallbackSiblingTab.count}</strong> 条记录。
            </span>
            <button
              type="button"
              onClick={() => setTab(fallbackSiblingTab.key)}
              className="cursor-pointer font-semibold text-brand-navy underline hover:text-link focus-ring"
            >
              切换至{fallbackSiblingTab.label}查看 →
            </button>
          </div>
        )}

        {/* 分栏 1：季度与专题报告（默认收起长结论，一屏清晰纵览全部代表作） */}
        {activeTab === "briefings" && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="title-sub text-ink">季度运行监测报告与专题研判简报</h2>
              <span className="caption text-ink-muted">
                共 {filteredBriefings.length} 篇代表性成果 · 点击「展开核心结论」可查阅研判要点与标准引用格式
              </span>
            </div>

            {filteredBriefings.length === 0 ? (
              <p className="border-y border-border py-8 text-center body text-ink-muted">
                未找到匹配的专题报告，请尝试其他关键词或切换上方政策/指导原则分栏。
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {filteredBriefings.map((item) => {
                  const isOpen = expandedIds.has(item.id);
                  return (
                    <li key={item.id} className="py-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <ReportCoverThumb
                          variant={coverVariantFor(item.series)}
                          label={coverLabelFor(item.series)}
                          className="shrink-0"
                        />
                        <div className="grid min-w-0 flex-1 gap-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="code text-ink-muted">{item.date}</span>
                              <Tag size="sm" tone="info">
                                {item.series}
                              </Tag>
                            </div>
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => toggleExpand(item.id)}
                              className="inline-flex cursor-pointer items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
                            >
                              {isOpen ? (
                                <>
                                  收起核心结论
                                  <IconChevronUp size={15} aria-hidden="true" />
                                </>
                              ) : (
                                <>
                                  展开核心结论与引用
                                  <IconChevronDown size={15} aria-hidden="true" />
                                </>
                              )}
                            </button>
                          </div>

                          <h3 className="title-nav text-brand-navy">{item.title}</h3>
                          <p className="body-sm text-ink-muted">{item.summary}</p>

                          {isOpen && (
                            <div className="mt-2 grid gap-3 border-l-2 border-brand-sky bg-surface-sunken px-4 py-3">
                              <div className="grid gap-1">
                                <p className="label text-brand-navy">核心研判发现</p>
                                <ul className="grid gap-1 body-sm text-ink">
                                  {item.keyFindings.map((f, idx) => (
                                    <li key={idx}>· {f}</li>
                                  ))}
                                </ul>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 caption text-ink-muted">
                                <span className="font-semibold text-ink">关联指标口径：</span>
                                {item.citedIndicators.map((ci) => (
                                  <TextLink key={ci.label} to={ci.href}>
                                    {ci.label}
                                  </TextLink>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 caption text-ink-muted">
                                <span className="min-w-0 flex-1">文献引用：{item.citation}</span>
                                <button
                                  type="button"
                                  onClick={() => copyCitation(item.id, item.citation)}
                                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 font-semibold text-link hover:underline focus-ring"
                                >
                                  {copiedId === item.id ? (
                                    <>
                                      <IconCheck size={14} aria-hidden="true" />
                                      已复制引用
                                    </>
                                  ) : (
                                    <>
                                      <IconCopy size={14} aria-hidden="true" />
                                      复制标准引用
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 分栏 2：国家及地方政策条款 */}
        {activeTab === "policies" && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="政策发文层级筛选">
                {POLICY_LEVELS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    aria-pressed={policyLevel === lv}
                    onClick={() => setPolicyLevel(lv)}
                    className={cn(
                      "cursor-pointer border px-3 py-1 body-sm font-semibold transition-colors focus-ring",
                      policyLevel === lv
                        ? "border-brand-navy bg-brand-navy text-on-brand"
                        : "border-border bg-surface text-ink hover:border-brand-navy",
                    )}
                  >
                    {lv}
                  </button>
                ))}
              </div>
              <span className="caption text-ink-muted">精选代表性条款 {filteredPolicies.length} 份</span>
            </div>

            <DataTable
              caption="国家及地方医疗器械政策条款目录"
              columns={policyColumns}
              data={filteredPolicies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
              getRowId={(r) => r.id}
              pagination={
                filteredPolicies.length > PAGE_SIZE
                  ? { page, pageSize: PAGE_SIZE, total: filteredPolicies.length, onPageChange: setPage }
                  : undefined
              }
            />
          </div>
        )}

        {/* 分栏 3：注册审查指导原则 */}
        {activeTab === "guidelines" && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="技术审评赛道筛选">
                {GUIDELINE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={guidelineCat === cat}
                    onClick={() => setGuidelineCat(cat)}
                    className={cn(
                      "cursor-pointer border px-3 py-1 body-sm font-semibold transition-colors focus-ring",
                      guidelineCat === cat
                        ? "border-brand-navy bg-brand-navy text-on-brand"
                        : "border-border bg-surface text-ink hover:border-brand-navy",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <span className="caption text-ink-muted">精选代表性指导原则 {filteredGuidelines.length} 份</span>
            </div>

            <DataTable
              caption="医疗器械注册审查指导原则目录"
              columns={guidelineColumns}
              data={filteredGuidelines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
              getRowId={(r) => r.id}
              pagination={
                filteredGuidelines.length > PAGE_SIZE
                  ? { page, pageSize: PAGE_SIZE, total: filteredGuidelines.length, onPageChange: setPage }
                  : undefined
              }
            />
          </div>
        )}

        {/* 分栏 4：监管年报与现行标准 */}
        {activeTab === "standards" && (
          <div className="grid gap-8">
            <div className="grid gap-3">
              <h2 className="title-sub text-brand-navy">官方统计年报与行业运行公报索引</h2>
              <DataTable
                caption="医疗器械监管与行业统计年报目录"
                columns={annualColumns}
                data={filteredAnnuals}
                getRowId={(r) => r.seq}
              />
            </div>

            <div className="grid gap-3">
              <h2 className="title-sub text-brand-navy">现行强制性与推荐性医疗器械标准目录</h2>
              <DataTable
                caption="医疗器械国家标准与行业标准目录"
                columns={standardColumns}
                data={filteredStandards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
                getRowId={(r) => r.stdNo}
                pagination={
                  filteredStandards.length > PAGE_SIZE
                    ? { page, pageSize: PAGE_SIZE, total: filteredStandards.length, onPageChange: setPage }
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
