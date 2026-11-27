import { useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { IconArrowRight, IconExternalLink, IconRotate } from "@tabler/icons-react";
import {
  detectCatalogAliasCorrection,
  matchesQuery,
  V2_SEED_CATALOG_RECORDS,
  type CatalogRecord,
  type ReportChapterSpec,
} from "@mdes/shared";
import {
  Breadcrumbs,
  DataTable,
  Descriptions,
  Notice,
  SectionTitle,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { ReportCoverThumb } from "@/components/layout/report-cover-thumb";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import { useCatalogList } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * MDES 研究报告出版物目录（/reports）：
 * - 默认视图：左侧呈现最新一期（2026 年第 3 期）标题、发布日期、统计覆盖期与核心结论，右侧列示章节及锁定的统计快照版本；下接归档期次列表；
 * - 旧书签兼容：
 *   - ?tab=policies -> /policies
 *   - ?tab=guidelines -> /regulation/registrations?subkind=guideline
 *   - ?tab=standards -> 在原地址清晰提供「官方年报 (/sources)」与「技术标准 (/standards)」两个专用入口，并支持本页即时检索预览。
 */
export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const explicitTab = searchParams.get("tab") ?? "";
  const rawQuery = searchParams.get("q") ?? "";
  const trimmedQ = rawQuery.trim();
  const periodFilter = searchParams.get("period") ?? "";
  const categoryFilter = searchParams.get("category") ?? "";

  if (explicitTab === "policies") {
    return <Navigate to={`/policies${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`} replace />;
  }
  if (explicitTab === "guidelines") {
    return (
      <Navigate
        to={`/regulation/registrations?subkind=guideline${trimmedQ ? `&q=${encodeURIComponent(trimmedQ)}` : ""}`}
        replace
      />
    );
  }

  const isLegacyStandardsBookmark = explicitTab === "standards";

  const reportsQuery = useCatalogList(
    {
      kind: "report",
      period: periodFilter || undefined,
      category: categoryFilter || undefined,
      q: trimmedQ || undefined,
    },
    !isLegacyStandardsBookmark,
  );
  const allReportsQuery = useCatalogList({ kind: "report" }, !isLegacyStandardsBookmark);

  const sourcesQuery = useCatalogList({ kind: "source", q: trimmedQ || undefined }, isLegacyStandardsBookmark);
  const standardsQuery = useCatalogList({ kind: "standard", q: trimmedQ || undefined }, isLegacyStandardsBookmark);

  const allReports = useMemo<CatalogRecord[]>(() => {
    if (allReportsQuery.data && allReportsQuery.data.items.length > 0) {
      return allReportsQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "report");
  }, [allReportsQuery.data]);

  const latestIssue = useMemo<CatalogRecord | undefined>(
    () => allReports.find((r) => r.slug === "mdes-2026q3-high-end-imaging-report") ?? allReports[0],
    [allReports],
  );

  const archiveReports = useMemo<CatalogRecord[]>(() => {
    if (reportsQuery.data) {
      return reportsQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => {
      if (r.kind !== "report") return false;
      if (periodFilter && !(r.period === periodFilter || (r.period ?? "").startsWith(periodFilter))) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (trimmedQ) {
        const hay = `${r.id} ${r.slug} ${r.title} ${r.subtitle} ${r.code ?? ""} ${r.tags.join(" ")} ${JSON.stringify(r.detail)}`;
        if (!matchesQuery(hay, trimmedQ)) return false;
      }
      return true;
    });
  }, [reportsQuery.data, periodFilter, categoryFilter, trimmedQ]);

  const legacySources = useMemo<CatalogRecord[]>(() => {
    if (sourcesQuery.data) return sourcesQuery.data.items;
    return V2_SEED_CATALOG_RECORDS.filter((r) => {
      if (r.kind !== "source") return false;
      if (!trimmedQ) return true;
      return matchesQuery(`${r.id} ${r.code ?? ""} ${r.title} ${r.subtitle} ${r.tags.join(" ")}`, trimmedQ);
    });
  }, [sourcesQuery.data, trimmedQ]);

  const legacyStandards = useMemo<CatalogRecord[]>(() => {
    if (standardsQuery.data) return standardsQuery.data.items;
    const allSeedStds = V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "standard");
    if (!trimmedQ) return allSeedStds;
    return allSeedStds.filter((r) =>
      matchesQuery(
        `${r.id} ${r.code ?? ""} ${r.title} ${r.subtitle} ${r.tags.join(" ")} ${(r.legacy_aliases ?? []).join(" ")}`,
        trimmedQ,
      ),
    );
  }, [standardsQuery.data, trimmedQ]);

  const stdAliasCorrection = useMemo(
    () =>
      standardsQuery.data?.alias_correction ??
      detectCatalogAliasCorrection(
        trimmedQ,
        V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "standard"),
      ),
    [standardsQuery.data, trimmedQ],
  );

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  const sourceColumns = useMemo<DataTableColumn<CatalogRecord>[]>(
    () => [
      { key: "code", title: "来源编号", type: "code", colClassName: "w-40" },
      {
        key: "title",
        title: "官方年报与公报名称",
        primary: true,
        cell: (row) => (
          <div className="grid gap-0.5">
            <TextLink to={`/sources?q=${encodeURIComponent(row.code ?? row.slug)}`} className="font-semibold text-brand-navy">
              {row.title}
            </TextLink>
            <span className="caption text-ink-muted">{row.subtitle}</span>
          </div>
        ),
      },
      { key: "period", title: "发布期次", type: "code", colClassName: "w-32" },
    ],
    [],
  );

  const standardColumns = useMemo<DataTableColumn<CatalogRecord>[]>(
    () => [
      {
        key: "code",
        title: "标准编号",
        type: "code",
        colClassName: "w-44",
        cell: (row) => (
          <TextLink to={`/standards?q=${encodeURIComponent(row.code ?? row.slug)}`} className="code font-semibold">
            {row.code ?? row.id}
          </TextLink>
        ),
      },
      {
        key: "title",
        title: "现行标准名称与实施说明",
        primary: true,
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{row.title}</span>
            <span className="caption text-ink-muted">{row.subtitle}</span>
          </div>
        ),
      },
      {
        key: "subkind",
        title: "标准性质",
        colClassName: "w-40",
        cell: (row) => <Tag size="sm" tone="warning">{row.subkind ?? "技术标准"}</Tag>,
      },
    ],
    [],
  );

  // 旧书签 /reports?tab=standards 专用分流与双库索引视图
  if (isLegacyStandardsBookmark) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
        <header className="grid gap-4 border-b border-border pb-6">
          <Breadcrumbs
            items={[
              { label: "产业总览", href: "/" },
              { label: "研究报告", href: "/reports" },
              { label: "官方年报与技术标准入口" },
            ]}
          />

          <h1 className="title-page text-ink">官方年报与技术标准资料查询入口</h1>

          <Notice tone="info" title="原「监管年报与技术标准」合表已拆分为两个独立资料查询入口">
            为保障正式统计公报与强制性/推荐性技术标准各自按规范字段检索，请根据核查对象进入下方专用入口；您也可以在本页直接筛选并打开目标记录。
          </Notice>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-between gap-3 border border-border border-t-2 border-t-brand-navy bg-surface p-5">
              <div className="grid gap-1">
                <p className="label text-brand-navy">独立资料入口一</p>
                <h2 className="title-sub text-ink">官方年报</h2>
                <p className="body-sm text-ink-muted">
                  收录国家药监局《医疗器械注册工作报告》、工信部运行公报及上市公司经审计年度报告原文定位。
                </p>
              </div>
              <Button asChild variant="primary" className="w-fit">
                <Link to={`/sources${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`}>
                  进入官方年报库（/sources）
                  <IconArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="grid content-between gap-3 border border-border border-t-2 border-t-brand-navy bg-surface p-5">
              <div className="grid gap-1">
                <p className="label text-brand-navy">独立资料入口二</p>
                <h2 className="title-sub text-ink">技术标准</h2>
                <p className="body-sm text-ink-muted">
                  按标准编号核查现行有效强制性国标/行标（如 YY 9706.233-2021）、实施日期、替代关系及全国标准平台登记页。
                </p>
              </div>
              <Button asChild variant="primary" className="w-fit">
                <Link to={`/standards${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`}>
                  进入技术标准库（/standards）
                  <IconArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
            <div className="grid w-72 gap-1">
              <label htmlFor="reports-local-filter" className="label text-ink-muted">
                筛选年报或标准编号
              </label>
              <input
                id="reports-local-filter"
                type="search"
                value={rawQuery}
                onChange={(e) => updateParams({ q: e.target.value || null })}
                placeholder="如 YY 9706.233-2021、注册工作报告…"
                className={cn(controlClass, "h-10")}
              />
            </div>
            <TextLink to="/reports" className="body-sm font-semibold">
              ← 返回 MDES 研究报告出版物目录
            </TextLink>
          </div>
        </header>

        {stdAliasCorrection && (
          <Notice tone="warning" title={`标准编号纠偏提示：现行有效版次为 ${stdAliasCorrection.canonical_code}`}>
            {stdAliasCorrection.explanation}{" "}
            <TextLink to={`/standards?q=${encodeURIComponent(stdAliasCorrection.canonical_code)}`} inline>
              打开 {stdAliasCorrection.canonical_code} 标准详情
            </TextLink>
          </Notice>
        )}

        <section aria-labelledby="legacy-sources-heading" className="grid gap-3">
          <SectionTitle level={2} as="h2">
            <span id="legacy-sources-heading">官方年报与正式来源索引</span>
          </SectionTitle>
          <DataTable
            caption="官方年报与正式来源目录"
            columns={sourceColumns}
            data={legacySources}
            getRowId={(r) => r.id}
          />
        </section>

        <section aria-labelledby="legacy-standards-heading" className="grid gap-3 border-t border-border pt-6">
          <SectionTitle level={2} as="h2">
            <span id="legacy-standards-heading">技术标准现行版次索引</span>
          </SectionTitle>
          <DataTable
            caption="医疗器械技术标准目录"
            columns={standardColumns}
            data={legacyStandards}
            getRowId={(r) => r.id}
          />
        </section>
      </div>
    );
  }

  const latestChapters: ReportChapterSpec[] = Array.isArray(latestIssue?.detail?.chapters)
    ? (latestIssue.detail.chapters as ReportChapterSpec[])
    : [];
  const latestIssueLabel =
    typeof latestIssue?.detail?.issue_label === "string" ? latestIssue.detail.issue_label : "2026 年第 3 期";
  const latestPublishedDate =
    typeof latestIssue?.detail?.published_date === "string" ? latestIssue.detail.published_date : "2026-11-15";
  const latestCoveragePeriod =
    typeof latestIssue?.detail?.coverage_period === "string" ? latestIssue.detail.coverage_period : "2022–2026 年 10 月";
  const latestConclusion =
    typeof latestIssue?.detail?.core_conclusion === "string" ? latestIssue.detail.core_conclusion : "";

  const hasFilters = Boolean(trimmedQ || periodFilter || categoryFilter);

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 顶部标题与原始资料库导航条 */}
      <header className="grid gap-4 border-b border-border pb-6">
        <Breadcrumbs items={[{ label: "产业总览", href: "/" }, { label: "研究报告" }]} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="label text-brand-navy">MDES 按期出版物 · 章节引用永久锁定单项统计版本快照</p>
            <h1 className="title-page text-ink">医疗器械产业研究报告与专题出版物</h1>
            <p className="body text-ink-muted">
              每期报告固定发布日期、统计覆盖期与引用快照版本；后续统计修订在新版本独立发布，确保已出版报告的引文与图表读数长期稳定可复核。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-2.5 body-sm">
          <span className="text-ink-muted">查阅未加工的政策文件、审查指导原则、技术标准或官方年报原文？</span>
          <div className="flex flex-wrap items-center gap-4">
            <TextLink to="/policies" className="font-semibold">
              产业政策 (/policies)
            </TextLink>
            <TextLink to="/regulation/registrations?subkind=guideline" className="font-semibold">
              审查指导原则
            </TextLink>
            <TextLink to="/standards" className="font-semibold">
              技术标准 (/standards)
            </TextLink>
            <TextLink to="/sources" className="font-semibold">
              官方年报 (/sources)
            </TextLink>
          </div>
        </div>
      </header>

      {/* 首屏焦点：最新一期核心结论（左） + 章节目录与锁定版本（右） */}
      {latestIssue && !trimmedQ && (
        <section
          aria-labelledby="latest-issue-heading"
          className="grid gap-8 border border-border border-t-2 border-t-brand-navy bg-surface p-6 lg:grid-cols-12"
        >
          <div className="grid content-between gap-5 lg:col-span-7">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="info">最新出版 · {latestIssueLabel}</Tag>
                <span className="code text-ink-muted">{latestIssue.code}</span>
              </div>

              <h2 id="latest-issue-heading" className="title-section text-ink">
                <Link
                  to={`/reports/${encodeURIComponent(latestIssue.slug)}`}
                  className="hover:text-brand-navy hover:underline focus-ring"
                >
                  {latestIssue.title}
                </Link>
              </h2>

              <Descriptions
                columns={2}
                items={[
                  { term: "发布日期", value: latestPublishedDate },
                  { term: "统计覆盖期", value: latestCoveragePeriod },
                ]}
              />

              <div className="border-l-4 border-brand-red bg-surface-sunken px-4 py-3">
                <p className="label text-brand-navy">本期核心结论</p>
                <p className="mt-1 body text-ink">{latestConclusion}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="primary">
                <Link to={`/reports/${encodeURIComponent(latestIssue.slug)}`}>
                  阅读完整章节与统计图卡
                  <IconArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid content-start gap-3 border-t border-border pt-5 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <p className="label text-brand-navy">本期章节目录与锁定统计版本</p>
            <ol className="divide-y divide-border border-y border-border">
              {latestChapters.map((ch, idx) => (
                <li key={ch.chapter_no} className="grid gap-1.5 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <TextLink
                      to={`/reports/${encodeURIComponent(latestIssue.slug)}#ch-${idx + 1}`}
                      className="body font-semibold text-brand-navy"
                    >
                      {ch.chapter_no} · {ch.title}
                    </TextLink>
                  </div>
                  <p className="line-clamp-2 caption text-ink-muted">{ch.judgment}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {ch.pinned_statistics.map((ps) => (
                      <TextLink
                        key={`${ps.statistic_id}-${ps.version}`}
                        to={`/statistics/${encodeURIComponent(ps.statistic_id)}?v=${encodeURIComponent(ps.version)}`}
                        className="code caption font-semibold"
                      >
                        {ps.statistic_id}@{ps.version}
                      </TextLink>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* 往期与全部报告归档列表 */}
      <section id="fig-reports-briefings" aria-labelledby="reports-archive-heading" className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2">
              <span id="reports-archive-heading">出版物期次归档</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              共 <strong className="font-semibold tabular-nums text-brand-navy">{archiveReports.length}</strong>{" "}
              期正式发布报告 · 按专题领域、出版期次或关键词检索。
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid w-40 gap-1">
              <label htmlFor="reports-period-select" className="caption font-semibold text-ink-muted">
                出版期次
              </label>
              <select
                id="reports-period-select"
                value={periodFilter}
                onChange={(e) => updateParams({ period: e.target.value || null })}
                className={cn(controlClass, "h-9 body-sm")}
              >
                <option value="">全部期次</option>
                <option value="2026Q3">2026Q3（第 3 期）</option>
                <option value="2026Q2">2026Q2（第 2 期）</option>
              </select>
            </div>

            <div className="grid w-44 gap-1">
              <label htmlFor="reports-category-select" className="caption font-semibold text-ink-muted">
                专题方向
              </label>
              <select
                id="reports-category-select"
                value={categoryFilter}
                onChange={(e) => updateParams({ category: e.target.value || null })}
                className={cn(controlClass, "h-9 body-sm")}
              >
                <option value="">全部专题</option>
                <option value="医学影像专题">医学影像专题</option>
                <option value="进出口与供应链">进出口与供应链</option>
              </select>
            </div>

            <div className="grid w-56 gap-1">
              <label htmlFor="reports-local-filter" className="caption font-semibold text-ink-muted">
                检索报告题目或结论
              </label>
              <input
                id="reports-local-filter"
                type="search"
                value={rawQuery}
                onChange={(e) => updateParams({ q: e.target.value || null })}
                placeholder="如 磁共振、联影、集中度…"
                className={cn(controlClass, "h-9 body-sm")}
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
                <IconRotate size={14} aria-hidden="true" />
                重置
              </Button>
            )}
          </div>
        </div>

        {archiveReports.length === 0 ? (
          <div className="border border-border bg-surface-sunken p-6 body text-ink-muted">
            未找到符合当前筛选条件的出版报告。若需检索标准编号或政策文号，请前往{" "}
            <TextLink to={`/standards${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`} inline>
              技术标准库
            </TextLink>{" "}
            或{" "}
            <TextLink to={`/policies${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`} inline>
              产业政策库
            </TextLink>
            。
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {archiveReports.map((rep) => {
              const rd = rep.detail ?? {};
              const issueLabel = typeof rd.issue_label === "string" ? rd.issue_label : (rep.period ?? "");
              const pubDate = typeof rd.published_date === "string" ? rd.published_date : "";
              const cov = typeof rd.coverage_period === "string" ? rd.coverage_period : "";
              const conclusion = typeof rd.core_conclusion === "string" ? rd.core_conclusion : rep.subtitle;
              const chapters = Array.isArray(rd.chapters) ? (rd.chapters as ReportChapterSpec[]) : [];

              return (
                <li key={rep.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
                  <ReportCoverThumb
                    variant={rep.slug.includes("2026q3") ? "quarterly" : "domestic"}
                    label={issueLabel || "研究专报"}
                    className="shrink-0"
                  />
                  <div className="grid min-w-0 flex-1 gap-2">
                    <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                      <Tag size="sm" tone="info">
                        {issueLabel}
                      </Tag>
                      {rep.category && <Tag size="sm">{rep.category}</Tag>}
                      {pubDate && <span className="code">发布于 {pubDate}</span>}
                      {cov && <span>· 覆盖期 {cov}</span>}
                    </div>

                    <h3 className="title-sub text-brand-navy">
                      <Link
                        to={`/reports/${encodeURIComponent(rep.slug)}`}
                        className="hover:underline focus-ring"
                      >
                        {rep.title}
                      </Link>
                    </h3>

                    <p className="body-sm text-ink">{conclusion}</p>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 body-sm">
                      <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                        <span>共 {chapters.length} 章 · 锁定统计：</span>
                        {chapters
                          .flatMap((c) => c.pinned_statistics)
                          .map((ps) => (
                            <TextLink
                              key={`${rep.id}-${ps.statistic_id}-${ps.version}`}
                              to={`/statistics/${encodeURIComponent(ps.statistic_id)}?v=${encodeURIComponent(ps.version)}`}
                              className="code font-semibold"
                            >
                              {ps.statistic_id}@{ps.version}
                            </TextLink>
                          ))}
                      </div>

                      <TextLink
                        to={`/reports/${encodeURIComponent(rep.slug)}`}
                        className="inline-flex items-center gap-1 font-semibold"
                      >
                        <span>打开完整报告</span>
                        <IconExternalLink size={14} aria-hidden="true" />
                      </TextLink>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
