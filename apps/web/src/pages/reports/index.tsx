import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconArrowRight, IconCheck, IconChevronDown, IconChevronUp, IconCopy, IconSearch, IconX } from "@tabler/icons-react";
import bannerReports from "@/assets/visuals/banner-reports.webp";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { ReportCoverThumb, type ReportCoverVariant } from "@/components/layout/report-cover-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ANNUAL_REPORTS_ROWS,
  BRIEFING_LEDGER,
  GUIDELINE_ROWS,
  POLICY_CLAUSE_ROWS,
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

function parseTab(raw: string | null): ReportTabKey {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as ReportTabKey;
  }
  return "briefings";
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const queryText = searchParams.get("q") ?? "";
  const normalizedQ = queryText.trim().toLowerCase();

  const [policyLevel, setPolicyLevel] = useState<"全部" | PolicyLevel>("全部");
  const [guidelineCat, setGuidelineCat] = useState<"全部" | GuidelineCategory>("全部");
  const [expandedBriefingIds, setExpandedBriefingIds] = useState<Record<string, boolean>>({
    "itei-2026q3": true,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const updateParams = useCallback(
    (patch: { tab?: ReportTabKey; q?: string | null }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.tab) {
        if (patch.tab === "briefings") next.delete("tab");
        else next.set("tab", patch.tab);
      }
      if ("q" in patch) {
        const val = patch.q ?? "";
        if (val) next.set("q", val);
        else next.delete("q");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const toggleBriefing = useCallback((id: string) => {
    setExpandedBriefingIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const copyCitation = useCallback((id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1800);
  }, []);

  // Filtered datasets
  const filteredBriefings = useMemo(() => {
    if (!normalizedQ) return BRIEFING_LEDGER;
    return BRIEFING_LEDGER.filter((b) => {
      const hay = `${b.code} ${b.series} ${b.title} ${b.summary} ${b.keyFindings.join(" ")} ${b.citedIndicators.map((c) => c.label).join(" ")}`.toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [normalizedQ]);

  const filteredPolicies = useMemo(() => {
    return POLICY_CLAUSE_ROWS.filter((r) => {
      if (policyLevel !== "全部" && r.level !== policyLevel) return false;
      if (!normalizedQ) return true;
      const hay = `${r.docNo} ${r.publishDate} ${r.title} ${r.clauseSummary} ${r.agency} ${r.topic} ${r.level}`.toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [normalizedQ, policyLevel]);

  const filteredGuidelines = useMemo(() => {
    return GUIDELINE_ROWS.filter((r) => {
      if (guidelineCat !== "全部" && r.category !== guidelineCat) return false;
      if (!normalizedQ) return true;
      const hay = `${r.noticeNo} ${r.year} ${r.title} ${r.reviewPoints} ${r.category} ${r.classCode}`.toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [normalizedQ, guidelineCat]);

  const filteredAnnuals = useMemo(() => {
    if (!normalizedQ) return ANNUAL_REPORTS_ROWS;
    return ANNUAL_REPORTS_ROWS.filter((r) =>
      `${r.seq} ${r.reportTitle} ${r.publisher} ${r.reconciliationScope}`.toLowerCase().includes(normalizedQ),
    );
  }, [normalizedQ]);

  const filteredStandards = useMemo(() => {
    if (!normalizedQ) return STANDARD_CATALOG_ROWS;
    return STANDARD_CATALOG_ROWS.filter((r) =>
      `${r.stdNo} ${r.stdName} ${r.keyClause} ${r.nature} ${r.scope}`.toLowerCase().includes(normalizedQ),
    );
  }, [normalizedQ]);

  // Column definitions
  const policyColumns: DataTableColumn<PolicyClauseRow>[] = useMemo(
    () => [
      {
        key: "docNo",
        title: "发文字号/日期",
        colClassName: "w-40",
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="code font-semibold text-brand-navy">{r.docNo}</span>
            <span className="caption tabular-nums text-ink-muted">{r.publishDate}</span>
          </div>
        ),
      },
      {
        key: "title",
        title: "政策名称与核心条款摘要",
        primary: true,
        cell: (r) => (
          <div className="grid gap-1">
            <span className="font-semibold text-ink">{r.title}</span>
            <p className="body-sm text-ink-muted">{r.clauseSummary}</p>
          </div>
        ),
      },
      { key: "agency", title: "发文机关", colClassName: "w-36" },
      { key: "topic", title: "政策主题", colClassName: "w-28" },
      {
        key: "level",
        title: "层级",
        type: "status",
        colClassName: "w-20",
        cell: (r) => (
          <Tag size="sm" tone={r.level === "国家级部委" ? "info" : "neutral"}>
            {r.level === "国家级部委" ? "国家级" : "省市级"}
          </Tag>
        ),
      },
    ],
    [],
  );

  const guidelineColumns: DataTableColumn<GuidelineRow>[] = useMemo(
    () => [
      {
        key: "noticeNo",
        title: "通告编号/年份",
        colClassName: "w-32",
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="code font-semibold text-brand-navy">{r.noticeNo}</span>
            <span className="caption tabular-nums text-ink-muted">{r.year} 年发布</span>
          </div>
        ),
      },
      {
        key: "title",
        title: "指导原则名称与审评要点",
        primary: true,
        cell: (r) => (
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{r.title}</span>
              <span className="caption text-ink-muted">[{r.category}]</span>
            </div>
            <p className="body-sm text-ink-muted">{r.reviewPoints}</p>
          </div>
        ),
      },
      { key: "classCode", title: "适用分类码", type: "code", colClassName: "w-24" },
      {
        key: "versionStatus",
        title: "版本状态",
        type: "status",
        colClassName: "w-24",
        cell: (r) => (
          <Tag size="sm" tone={r.versionStatus === "现行有效" ? "success" : "info"}>
            {r.versionStatus}
          </Tag>
        ),
      },
    ],
    [],
  );

  const annualColumns: DataTableColumn<AnnualReportRow>[] = useMemo(
    () => [
      {
        key: "seq",
        title: "序号",
        type: "code",
        colClassName: "w-16",
        cell: (r) => (
          <TextLink to={`/system/${r.seq}`} className="code font-semibold">
            {r.seq}
          </TextLink>
        ),
      },
      {
        key: "reportTitle",
        title: "官方统计年报与公报名称 / 解析对账范围",
        primary: true,
        cell: (r) => (
          <div className="grid gap-1">
            <TextLink to={`/system/${r.seq}`} className="font-semibold">
              {r.reportTitle}
            </TextLink>
            <p className="body-sm text-ink-muted">{r.reconciliationScope}</p>
          </div>
        ),
      },
      { key: "publisher", title: "发布机关", colClassName: "w-36" },
      { key: "latestIssue", title: "最新期次", colClassName: "w-40" },
      {
        key: "phaseLabel",
        title: "纳入阶段",
        type: "status",
        colClassName: "w-28",
        cell: (r) => (
          <Tag size="sm" tone={r.phaseLabel === "一期已纳入" ? "info" : "neutral"}>
            {r.phaseLabel}
          </Tag>
        ),
      },
    ],
    [],
  );

  const standardColumns: DataTableColumn<StandardRow>[] = useMemo(
    () => [
      { key: "stdNo", title: "标准编号", type: "code", colClassName: "w-36" },
      {
        key: "stdName",
        title: "标准名称与核心技术条款",
        primary: true,
        cell: (r) => (
          <div className="grid gap-1">
            <span className="font-semibold text-ink">{r.stdName}</span>
            <p className="body-sm text-ink-muted">{r.keyClause}</p>
          </div>
        ),
      },
      {
        key: "nature",
        title: "性质",
        type: "status",
        colClassName: "w-28",
        cell: (r) => (
          <Tag size="sm" tone={r.nature.startsWith("强制性") ? "warning" : "neutral"}>
            {r.nature}
          </Tag>
        ),
      },
      {
        key: "status",
        title: "实施状态",
        type: "status",
        colClassName: "w-24",
        cell: (r) => (
          <Tag size="sm" tone="success">
            {r.status}
          </Tag>
        ),
      },
      { key: "scope", title: "归口范围", colClassName: "w-40" },
    ],
    [],
  );

  const tabs: { key: ReportTabKey; label: string; count: number }[] = [
    { key: "briefings", label: "季度与专题报告", count: filteredBriefings.length },
    { key: "policies", label: "国家及地方政策条款 (23)", count: filteredPolicies.length },
    { key: "guidelines", label: "注册审查指导原则 (24)", count: filteredGuidelines.length },
    {
      key: "standards",
      label: "监管年报与技术标准 (28–37)",
      count: filteredAnnuals.length + filteredStandards.length,
    },
  ];

  return (
    <div>
      {/* Band 1: Header, Open 4-Column Summary Strip, Search & Underline Tab Bar */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 pt-8 md:px-8 md:pt-10">
          <PageVisualBanner
            title="研究报告、政策法规与技术标准库"
            summary="汇聚 ITEI 季度运行监测报告、专题简报，以及国家及地方政策条款、注册审查指导原则与现行 GB/YY 标准档案。"
            image={bannerReports}
            actions={
              <>
                <TextLink to="/system#l1-pol" className="inline-flex items-center gap-1 body">
                  政策与监管体系（23–32）
                  <IconArrowRight size={15} aria-hidden="true" />
                </TextLink>
                <TextLink to="/system#l1-ip" className="body text-ink-muted">
                  知识产权与标准（35–37）
                </TextLink>
              </>
            }
          />

          {/* Open 4-Column Rule-Line Summary Strip */}
          <div
            aria-label="报告与法规入库概览"
            className="grid grid-cols-2 border-t-2 border-brand-navy border-b border-border md:grid-cols-4 md:divide-x md:divide-border"
          >
            {REPORTS_SUMMARY_STRIP.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  "grid content-start gap-1 px-4 py-4 first:md:pl-0 last:md:pr-0",
                  idx < 2 && "max-md:border-b max-md:border-border",
                  idx % 2 === 0 && "max-md:border-r max-md:border-border",
                )}
              >
                <p className="label text-ink-muted">{item.label}</p>
                <p className="numeral text-brand-navy tabular-nums">
                  {item.value}
                  {item.unit && <span className="ml-1.5 body font-normal text-ink-muted">{item.unit}</span>}
                </p>
                <p className="caption text-ink-muted">{item.subline}</p>
              </div>
            ))}
          </div>

          {/* Keyword Search + 4 Clean Underline Tabs */}
          <div className="grid gap-4 pt-1 lg:flex lg:items-end lg:justify-between">
            <div
              role="tablist"
              aria-label="政策与报告分类目录"
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              {tabs.map((t) => {
                const selected = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    id={`reports-tab-${t.key}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`reports-panel-${t.key}`}
                    onClick={() => updateParams({ tab: t.key })}
                    className={cn(
                      "cursor-pointer border-b-2 pb-3 body transition-colors focus-ring",
                      selected
                        ? "border-brand-navy font-semibold text-brand-navy"
                        : "border-transparent text-ink-muted hover:text-brand-navy",
                    )}
                  >
                    {t.label}
                    {normalizedQ && (
                      <span className="ml-1.5 caption tabular-nums text-ink-muted">({formatNumber(t.count)})</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pb-3 lg:w-80">
              <div className="relative flex-1">
                <IconSearch
                  size={16}
                  className="pointer-events-none absolute top-2.5 left-2.5 text-ink-muted"
                  aria-hidden="true"
                />
                <Input
                  value={queryText}
                  onChange={(e) => updateParams({ q: e.target.value })}
                  placeholder="检索报告题目、文号、指导原则或标准号…"
                  aria-label="检索研究报告、政策法规、指导原则与标准"
                  className="pl-8"
                />
              </div>
              {queryText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateParams({ q: null })}
                  aria-label="清除检索词"
                >
                  <IconX size={16} aria-hidden="true" />
                  清除
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Band 2: Active Tab Content (Open Editorial Ledger & Fixed-Layout Three-Line Tables) */}
      <section className="bg-surface">
        <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
          {/* Tab 1: 季度与专题报告 (Open NBER/Brookings Editorial Ledger — ZERO Cover Cards) */}
          {activeTab === "briefings" && (
            <div
              id="reports-panel-briefings"
              role="tabpanel"
              aria-labelledby="reports-tab-briefings"
              className="grid gap-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="grid gap-1">
                  <h2 className="title-sub text-brand-navy">季度产业运行报告与专题研判台账</h2>
                  <p className="caption text-ink-muted">
                    每篇报告严格锚定 V3.0 底层指标口径与统计边界，支持在线查阅核心研判要点与标准文献引用格式。
                  </p>
                </div>
                <span className="caption tabular-nums text-ink-muted">
                  当前展示 {formatNumber(filteredBriefings.length)} 篇代表性成果
                </span>
              </div>

              {filteredBriefings.length === 0 ? (
                <div className="border-y border-border py-8 text-center body text-ink-muted">
                  未检索到包含「{queryText.trim()}」的研究报告，请尝试切换至政策条款、指导原则或标准标签页查看。
                </div>
              ) : (
                <ol className="divide-y divide-border border-y border-border">
                  {filteredBriefings.map((item, idx) => {
                    const expanded = Boolean(expandedBriefingIds[item.id]);
                    const isCopied = copiedId === item.id;
                    const coverVariant: ReportCoverVariant =
                      idx % 3 === 0 ? "quarterly" : idx % 3 === 1 ? "domestic" : "supply";
                    const coverLabel =
                      idx % 3 === 0 ? "监测报告" : idx % 3 === 1 ? "专题简报" : "风险评估";
                    return (
                      <li key={item.id} className="grid gap-4 py-6 sm:grid-cols-12">
                        <div className="sm:col-span-2">
                          <ReportCoverThumb variant={coverVariant} label={coverLabel} className="w-full sm:w-28" />
                        </div>
                        <div className="grid gap-3 sm:col-span-10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="code tabular-nums text-ink-muted">{item.date}</span>
                            <Tag size="sm" tone="info">
                              {item.series}
                            </Tag>
                            <span className="code text-ink-muted">{item.code}</span>
                          </div>
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => toggleBriefing(item.id)}
                            className="inline-flex cursor-pointer items-center gap-1 body-sm text-link underline-offset-4 hover:underline focus-ring"
                          >
                            {expanded ? (
                              <>
                                收起核心结论
                                <IconChevronUp size={15} aria-hidden="true" />
                              </>
                            ) : (
                              <>
                                展开核心结论
                                <IconChevronDown size={15} aria-hidden="true" />
                              </>
                            )}
                          </button>
                        </div>

                        <h3 className="title-sub text-brand-navy">{item.title}</h3>
                        <p className="max-w-4xl body text-ink">{item.summary}</p>

                        {expanded && (
                          <div className="grid gap-2 border-l-2 border-brand-sky pl-4">
                            <p className="label text-brand-navy">核心研判发现与口径校验</p>
                            <ul className="grid gap-1.5">
                              {item.keyFindings.map((finding) => (
                                <li key={finding} className="body-sm text-ink">
                                  · {finding}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 caption">
                          <span className="font-semibold text-ink-muted">引用指标口径：</span>
                          {item.citedIndicators.map((ind) => (
                            <TextLink key={ind.href} to={ind.href} className="body-sm">
                              {ind.label}
                            </TextLink>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <p className="caption text-ink-muted">
                            <span className="font-semibold">建议引用：</span>
                            {item.citation}
                          </p>
                          <button
                            type="button"
                            onClick={() => copyCitation(item.id, item.citation)}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1 caption text-link underline-offset-4 hover:underline focus-ring"
                          >
                            {isCopied ? (
                              <>
                                <IconCheck size={14} aria-hidden="true" />
                                已复制引用格式
                              </>
                            ) : (
                              <>
                                <IconCopy size={14} aria-hidden="true" />
                                复制引用
                              </>
                            )}
                          </button>
                        </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {/* Tab 2: 国家及地方政策条款 (23) */}
          {activeTab === "policies" && (
            <div
              id="reports-panel-policies"
              role="tabpanel"
              aria-labelledby="reports-tab-policies"
              className="grid gap-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="grid gap-1">
                  <h2 className="title-sub text-brand-navy">国家及地方医疗器械政策条款结构化台账（23号）</h2>
                  <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                    一期先行纳入国务院有关部委及京、沪、粤、苏、浙等重点先行省市核心政策条款；保留原始公文快照与条款 ID 锚点，政策发文数量不直接等同于财政补贴强度。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 body-sm">
                  <TextLink to="/system/23">23 号指标口径详情</TextLink>
                  <TextLink to="/indicators/POL-116" className="code">
                    POL-116
                  </TextLink>
                </div>
              </div>

              {/* Level Filter */}
              <div
                role="group"
                aria-label="按发文层级筛选"
                className="flex flex-wrap items-center gap-5 border-b border-border pb-2.5"
              >
                <span className="caption text-ink-muted">层级筛选：</span>
                {POLICY_LEVELS.map((lvl) => {
                  const active = policyLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPolicyLevel(lvl)}
                      className={cn(
                        "cursor-pointer border-b-2 pb-1 body-sm transition-colors focus-ring",
                        active
                          ? "border-brand-navy font-semibold text-brand-navy"
                          : "border-transparent text-ink-muted hover:text-brand-navy",
                      )}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>

              <DataTable
                caption="国家及地方医疗器械政策条款列表"
                columns={policyColumns}
                data={filteredPolicies}
                getRowId={(r) => r.id}
                empty="没有符合当前层级与检索词的政策条款"
                fixedLayout
                dense
              />

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 caption text-ink-muted">
                <span>关联政策支持名单指标（二期规划接入）：</span>
                <TextLink to="/system/25">25 国家科技计划医疗器械立项项目</TextLink>
                <TextLink to="/system/26">26 首台（套）医疗装备目录</TextLink>
                <TextLink to="/system/27">27 医疗装备揭榜挂帅任务</TextLink>
              </div>
            </div>
          )}

          {/* Tab 3: 注册审查指导原则 (24) */}
          {activeTab === "guidelines" && (
            <div
              id="reports-panel-guidelines"
              role="tabpanel"
              aria-labelledby="reports-tab-guidelines"
              className="grid gap-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="grid gap-1">
                  <h2 className="title-sub text-brand-navy">医疗器械注册审查指导原则章节检索目录（24号）</h2>
                  <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                    解析国家药监局医疗器械技术审评中心（CMDE）现行指导原则，关联 6 位《医疗器械分类目录》编码；技术审评指导性文件在法律约束层级上不同于强制性国家/行业标准（37号）。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 body-sm">
                  <TextLink to="/system/24">24 号指标口径详情</TextLink>
                  <TextLink to="/indicators/REG-024" className="code">
                    REG-024
                  </TextLink>
                </div>
              </div>

              {/* Category Filter */}
              <div
                role="group"
                aria-label="按器械技术领域筛选指导原则"
                className="flex flex-wrap items-center gap-5 border-b border-border pb-2.5"
              >
                <span className="caption text-ink-muted">赛道筛选：</span>
                {GUIDELINE_CATEGORIES.map((cat) => {
                  const active = guidelineCat === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setGuidelineCat(cat)}
                      className={cn(
                        "cursor-pointer border-b-2 pb-1 body-sm transition-colors focus-ring",
                        active
                          ? "border-brand-navy font-semibold text-brand-navy"
                          : "border-transparent text-ink-muted hover:text-brand-navy",
                      )}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              <DataTable
                caption="国家药监局医疗器械注册审查指导原则目录"
                columns={guidelineColumns}
                data={filteredGuidelines}
                getRowId={(r) => r.id}
                empty="没有符合当前赛道与检索词的注册审查指导原则"
                fixedLayout
                dense
              />
            </div>
          )}

          {/* Tab 4: 监管年报与技术标准 (28–37) */}
          {activeTab === "standards" && (
            <div
              id="reports-panel-standards"
              role="tabpanel"
              aria-labelledby="reports-tab-standards"
              className="grid gap-10"
            >
              {/* Section 1: Official Regulatory & Statistical Annual Reports (28-32) */}
              <div className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="title-sub text-brand-navy">官方统计年报与公报解析目录（28–32号）</h2>
                    <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                      官方年度统计公报作为全站明细库聚合数据的权威外部校准锚点：本库公开批件日常采集数与 28 号药监年报官方统计数须双列并存展示差异，严禁无说明地互相覆盖。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 body-sm">
                    <TextLink to="/system/28">28 药监年报</TextLink>
                    <TextLink to="/system/29">29 不良事件年报</TextLink>
                    <TextLink to="/system/30">30 医药工业运行</TextLink>
                    <TextLink to="/system/32">32 医保集采公报</TextLink>
                  </div>
                </div>

                <DataTable
                  caption="官方统计年报与公报解析目录"
                  columns={annualColumns}
                  data={filteredAnnuals}
                  getRowId={(r) => r.seq}
                  empty="没有匹配当前检索词的官方统计年报"
                  fixedLayout
                  dense
                />
              </div>

              {/* Section 2: National & Industry Standards (37) + IP Links (35-36) */}
              <div className="grid gap-4 border-t border-border pt-8">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="title-sub text-brand-navy">医疗器械国家与行业标准重点目录（37号）</h2>
                    <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                      严格区分强制性标准（GB / YY）与推荐性标准（GB/T / YY/T）以及新旧标准实施过渡期；废止标准仅供历史存量注册证回溯参考，受版权保护标准全文仅在内部合规范围调用。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 body-sm">
                    <TextLink to="/system/35">35 企业专利清单</TextLink>
                    <TextLink to="/system/36">36 临床与医工论文</TextLink>
                    <TextLink to="/system/37">37 国家与行业标准</TextLink>
                  </div>
                </div>

                <DataTable
                  caption="医疗器械国家标准与医药行业标准重点目录"
                  columns={standardColumns}
                  data={filteredStandards}
                  getRowId={(r) => r.stdNo}
                  empty="没有匹配当前检索词的国家或行业标准"
                  fixedLayout
                  dense
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 caption text-ink-muted">
                  <span>
                    五、知识产权与标准簇工程指标映射（二期全量接入）：专利法律状态去重（PCT 进入阶段不等于海外授权）与论文临床证据分级（科研论文不替代药监临床审评结论）。
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    <TextLink to="/indicators/INN-036" className="code">
                      INN-036 发明专利
                    </TextLink>
                    <TextLink to="/indicators/INN-042" className="code">
                      INN-042 研究论文
                    </TextLink>
                    <TextLink to="/indicators/INN-039" className="code">
                      INN-039 技术标准
                    </TextLink>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
