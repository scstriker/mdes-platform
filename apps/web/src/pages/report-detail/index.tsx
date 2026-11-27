import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconCheck, IconCopy, IconExternalLink, IconLock } from "@tabler/icons-react";
import {
  V2_HISTORICAL_STATISTIC_VERSIONS,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogRecord,
  type ReportChapterSpec,
  type Statistic,
} from "@mdes/shared";
import {
  Breadcrumbs,
  Descriptions,
  EmptyState,
  Notice,
  SectionTitle,
  Tag,
  TextLink,
} from "@/components/itei";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { useCatalogDetail, useStatisticDetail } from "@/lib/api/queries";

const LEGACY_REPORT_SLUG_MAP: Record<string, string> = {
  "rep-brf-01": "mdes-2026q3-high-end-imaging-report",
  "rep-brf-02": "mdes-2026q2-customs-supply-chain-briefing",
};

function findSeedPinnedStatistic(statisticId: string, version: string): Statistic | undefined {
  const all = [...V2_SEED_STATISTICS, ...V2_HISTORICAL_STATISTIC_VERSIONS];
  return (
    all.find((s) => s.statistic_id === statisticId && s.version === version) ??
    V2_SEED_STATISTICS.find((s) => s.statistic_id === statisticId)
  );
}

function ReportPinnedStatisticBlock({
  statisticId,
  pinnedVersion,
}: {
  statisticId: string;
  pinnedVersion: string;
}) {
  const detailQuery = useStatisticDetail(statisticId, pinnedVersion);
  const pinnedHref = `/statistics/${encodeURIComponent(statisticId)}?v=${encodeURIComponent(pinnedVersion)}`;

  const statistic = useMemo(
    () => detailQuery.data?.statistic ?? findSeedPinnedStatistic(statisticId, pinnedVersion),
    [detailQuery.data, statisticId, pinnedVersion],
  );

  if (!statistic) {
    return (
      <Notice tone="danger" title={`缺少锁定的统计版本快照 ${statisticId}@${pinnedVersion}`}>
        未能读取该章节出版时绑定的统计快照（目标版本：{pinnedVersion}）。
      </Notice>
    );
  }

  const isHistorical = detailQuery.data?.is_historical_version ?? false;
  const latestVersion = detailQuery.data?.latest_version ?? statistic.version;

  return (
    <div className="grid gap-2.5">
      <StatisticFigure
        id={`fig-report-${statisticId.toLowerCase()}`}
        eyebrow={`出版物锁定统计快照 · ${statisticId} · 锁定版本 v${pinnedVersion}`}
        statistic={statistic}
        titleHref={pinnedHref}
        height={288}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-2.5 caption text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <IconLock size={14} className="text-brand-navy" aria-hidden="true" />
          <span className="font-semibold text-brand-navy">
            版本永久锁定：v{statistic.version}
          </span>
          {isHistorical && (
            <span className="text-ink-muted">
              （该统计后续已发布独立修订版 v{latestVersion}，本章节严格保持原出版快照数据不变）
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <TextLink to={pinnedHref} className="font-semibold">
            打开当期锁定统计工作台（v{pinnedVersion}） →
          </TextLink>
          {isHistorical && (
            <TextLink to={`/statistics/${encodeURIComponent(statisticId)}`}>
              对照最新修订版（v{latestVersion}）
            </TextLink>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * MDES 研究出版物详情阅读页（/reports/:slug）：
 * - 按章节依次呈现「核心研判结论 → 正文分析 → 版本锁定的 StatisticFigure（通过 ?v= 精确拉取快照）→ 原文出处与延伸实体链接」；
 * - 即使后台后续针对同一 statistic_id 发布了新版修订数据，重新打开本报告仍 100% 复现出版时点版本（如联影研发占比 18.99% · v2026.06.1）。
 */
export default function ReportDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const resolvedSlug = slug ? (LEGACY_REPORT_SLUG_MAP[slug] ?? slug) : undefined;

  const detailQuery = useCatalogDetail("report", resolvedSlug);
  const [copiedReportCitation, setCopiedReportCitation] = useState(false);

  const record = useMemo<CatalogRecord | undefined>(() => {
    if (detailQuery.data?.record) return detailQuery.data.record;
    if (!resolvedSlug) return undefined;
    return V2_SEED_CATALOG_RECORDS.find(
      (r) =>
        r.kind === "report" &&
        (r.slug === resolvedSlug || r.id === resolvedSlug || (r.legacy_aliases ?? []).includes(resolvedSlug)),
    );
  }, [detailQuery.data, resolvedSlug]);

  const d = record?.detail ?? {};
  const issueLabel = typeof d.issue_label === "string" ? d.issue_label : (record?.period ?? "");
  const publishedDate = typeof d.published_date === "string" ? d.published_date : "";
  const coveragePeriod = typeof d.coverage_period === "string" ? d.coverage_period : "";
  const coreConclusion = typeof d.core_conclusion === "string" ? d.core_conclusion : "";
  const chapters: ReportChapterSpec[] = Array.isArray(d.chapters) ? (d.chapters as ReportChapterSpec[]) : [];

  const reportCitationText = useMemo(() => {
    if (!record) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mdes-web.pages.dev";
    return `机械工业仪器仪表综合技术经济研究所（ITEI）. ${record.title} [R/OL]. 医疗器械产业数据平台（MDES）, ${publishedDate || "2026"}. ${origin}/reports/${record.slug}.`;
  }, [record, publishedDate]);

  const handleCopyReportCitation = useCallback(async () => {
    if (!reportCitationText) return;
    try {
      await navigator.clipboard.writeText(reportCitationText);
      setCopiedReportCitation(true);
      window.setTimeout(() => setCopiedReportCitation(false), 2000);
    } catch {
      // 忽略受限剪贴板异常
    }
  }, [reportCitationText]);

  if (!record) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
        <Breadcrumbs items={[{ label: "研究报告", href: "/reports" }, { label: slug ?? "未知报告" }]} />
        <h1 className="title-page text-ink">未找到指定的研究报告期次</h1>
        <EmptyState
          title={`未收录标识为「${slug ?? ""}」的研究报告`}
          description="请返回研究报告出版物目录选择已发布的季度监测报告或专题研判。"
          action={
            <Button asChild variant="primary">
              <Link to="/reports">返回研究报告目录</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 报告刊头与出版元数据 */}
      <header className="grid gap-5 border-b border-border pb-6">
        <Breadcrumbs
          items={[
            { label: "产业总览", href: "/" },
            { label: "研究报告", href: "/reports" },
            { label: issueLabel || record.title },
          ]}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info">{issueLabel}</Tag>
              {record.code && <span className="code text-brand-navy">{record.code}</span>}
              {record.category && <Tag>{record.category}</Tag>}
            </div>

            <h1 className="title-page text-ink">{record.title}</h1>
            <p className="body text-ink-muted">{record.subtitle}</p>
          </div>

          <Button variant="secondary" size="sm" onClick={() => void handleCopyReportCitation()}>
            {copiedReportCitation ? (
              <>
                <IconCheck size={15} aria-hidden="true" />
                已复制报告引用
              </>
            ) : (
              <>
                <IconCopy size={15} aria-hidden="true" />
                复制报告标准引用
              </>
            )}
          </Button>
        </div>

        <Descriptions
          columns={3}
          items={[
            { term: "出版期次", value: issueLabel || "—" },
            { term: "正式发布日期", value: publishedDate || "—" },
            { term: "统计数据覆盖期", value: coveragePeriod || "—" },
          ]}
        />

        {coreConclusion && (
          <div className="border-l-4 border-brand-red bg-surface-sunken px-5 py-4">
            <p className="label text-brand-navy">核心研判结论提要</p>
            <p className="mt-1.5 body-lg text-ink">{coreConclusion}</p>
          </div>
        )}

        {chapters.length > 0 && (
          <nav aria-label="报告章节导航" className="flex flex-wrap items-center gap-2 pt-1">
            <span className="label text-ink-muted">章节直达：</span>
            {chapters.map((ch, idx) => (
              <a
                key={ch.chapter_no}
                href={`#ch-${idx + 1}`}
                className="border border-border bg-surface px-3 py-1.5 body-sm font-semibold text-ink hover:border-brand-navy hover:text-brand-navy focus-ring"
              >
                {ch.chapter_no} · {ch.title}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* 各章节正文与版本锁定的单项统计图卡 */}
      <div className="grid gap-10">
        {chapters.map((chapter, idx) => (
          <article
            key={chapter.chapter_no}
            id={`ch-${idx + 1}`}
            aria-labelledby={`ch-heading-${idx + 1}`}
            className="grid gap-5 border-b border-border pb-10 last:border-b-0 last:pb-0"
          >
            <div className="grid gap-2">
              <SectionTitle level={2} as="h2" number={chapter.chapter_no}>
                <span id={`ch-heading-${idx + 1}`}>{chapter.title}</span>
              </SectionTitle>
              <p className="title-nav text-brand-navy">{chapter.judgment}</p>
              <p className="body text-ink">{chapter.body}</p>
            </div>

            {chapter.pinned_statistics.map((pinned) => (
              <ReportPinnedStatisticBlock
                key={`${chapter.chapter_no}-${pinned.statistic_id}-${pinned.version}`}
                statisticId={pinned.statistic_id}
                pinnedVersion={pinned.version}
              />
            ))}

            {chapter.source_refs.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 body-sm">
                <span className="label text-ink-muted">本章原文依据与关联档案：</span>
                {chapter.source_refs.map((ref) =>
                  ref.href.startsWith("http") ? (
                    <a
                      key={ref.href}
                      href={ref.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                    >
                      <span>{ref.label}</span>
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <TextLink key={ref.href} to={ref.href} className="font-semibold">
                      {ref.label} →
                    </TextLink>
                  ),
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
