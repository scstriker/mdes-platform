import { useMemo } from "react";
import { Link } from "react-router";
import { IconArrowRight, IconExternalLink, IconFileAnalytics } from "@tabler/icons-react";
import { toStatisticListItem, V2_SEED_STATISTICS } from "@mdes/shared";
import { Descriptions, SectionTitle, Tag, TextLink } from "@/components/itei";
import { ReportCoverThumb } from "@/components/layout/report-cover-thumb";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { ISSUE } from "@/content/issue";
import { useStatisticDetail, useStatisticsList } from "@/lib/api/queries";

function findSeedStat(statisticId: string) {
  return V2_SEED_STATISTICS.find((s) => s.statistic_id === statisticId)!;
}

/**
 * 医疗器械产业总览首页（取消自动轮播，采用左判断 + 右同版本统计依据 + 四大研究问题带 + 省域对比）：
 * - h1 保留「医疗器械产业运行监测报告」核心题名（满足既有验收门禁）；
 * - 首屏左侧「查看依据」与右侧 StatisticFigure 严格指向同一统计期与版本 STAT-REG-CLASS3-TREND?v=2026.09.1；
 * - 承接原企业页迁入的两幅省域统计（有效证存量 + 每百家生产企业对应的三类有效注册证数及生产企业数分母）。
 */
export default function OverviewPage() {
  const heroStatQuery = useStatisticDetail(ISSUE.heroStatisticId, ISSUE.heroStatisticVersion);
  const provStockQuery = useStatisticDetail("STAT-REG-PROVINCE-STOCK");
  const provDensityQuery = useStatisticDetail("STAT-REG-DENSITY-PER100");
  const latestStatsQuery = useStatisticsList({ limit: 6 });

  const class3TrendStat = heroStatQuery.data?.statistic ?? findSeedStat("STAT-REG-CLASS3-TREND");
  const provStockStat = provStockQuery.data?.statistic ?? findSeedStat("STAT-REG-PROVINCE-STOCK");
  const provDensityStat = provDensityQuery.data?.statistic ?? findSeedStat("STAT-REG-DENSITY-PER100");

  const latestStats = useMemo(() => {
    if (latestStatsQuery.data && latestStatsQuery.data.items.length > 0) {
      return latestStatsQuery.data.items;
    }
    return V2_SEED_STATISTICS.slice(0, 6).map((s) => toStatisticListItem(s, s.version));
  }, [latestStatsQuery.data]);

  const densityDenomNote = useMemo(() => {
    const d = provDensityStat.dataset.denominators;
    if (!d) return null;
    const samplePairs = provDensityStat.dataset.periods
      .slice(0, 4)
      .map((prov, idx) => `${prov} ${d.values[idx]?.toLocaleString("zh-CN") ?? "—"} ${d.unit}`)
      .join(" · ");
    return `${d.label}：${samplePairs}（切换图卡右上角「数据表」可查看全量省市分母明细）`;
  }, [provDensityStat]);

  return (
    <div className="w-full bg-surface">
      {/* 第 1 层：本期核心判断（左） + 同版本支撑统计图（右） */}
      <section aria-labelledby="overview-hero-heading" className="border-b border-border bg-surface py-8 md:py-10">
        <div className="mx-auto grid w-full max-w-content grid-cols-1 gap-8 px-4 md:px-8 lg:grid-cols-12 lg:items-start">
          {/* 左 5 列：期次、本期总判断、证据要点与「查看依据」 */}
          <div className="grid min-w-0 grid-cols-1 content-start gap-5 lg:col-span-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info">{ISSUE.periodCode}</Tag>
              <Tag>{ISSUE.issueNo}</Tag>
              <span className="caption text-ink-muted">发布日期 {ISSUE.publishedAt}</span>
            </div>

            <div className="grid gap-3">
              <p className="label text-brand-navy">{ISSUE.eyebrow}</p>
              <h1 id="overview-hero-heading" className="title-page text-ink">
                {ISSUE.heroTitle}
              </h1>
              <p className="title-sub text-brand-navy">{ISSUE.headline}</p>
              <p className="body text-ink-muted">{ISSUE.lead}</p>
            </div>

            <ul className="grid gap-3 border-y border-border py-4">
              {ISSUE.heroBullets.map((b) => (
                <li key={b.label} className="grid gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="label text-brand-navy">{b.label}</span>
                    <TextLink to={b.href} className="caption font-semibold">
                      核对证据 →
                    </TextLink>
                  </div>
                  <p className="body-sm text-ink">{b.text}</p>
                </li>
              ))}
            </ul>

            <Descriptions
              columns={2}
              items={[
                { term: "支撑统计编号", value: `${class3TrendStat.statistic_id}（v${class3TrendStat.version}）` },
                { term: "统计覆盖期", value: class3TrendStat.coverage.time_span },
              ]}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="primary">
                <Link to={ISSUE.heroEvidenceHref}>
                  <IconFileAnalytics aria-hidden="true" />
                  查看依据（{class3TrendStat.version}）
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={ISSUE.latestReportHref}>
                  阅读本期专题报告
                  <IconArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* 右 7 列：支撑本期核心判断的同版本标准统计图卡 */}
          <div className="min-w-0 lg:col-span-7">
            <StatisticFigure
              id="fig-overview-class3-trend"
              eyebrow={`本期判断核心依据 · ${class3TrendStat.statistic_id} · 版本 v${class3TrendStat.version}`}
              statistic={class3TrendStat}
              titleHref={ISSUE.heroEvidenceHref}
              height={312}
            />
          </div>
        </div>
      </section>

      {/* 第 2 层：市场 · 技术 · 产品 · 企业 四组研究问题带 + 贸易与出版物直达 */}
      <section aria-labelledby="overview-questions-heading" className="border-b border-border bg-surface-sunken py-8 md:py-10">
        <div className="mx-auto grid w-full max-w-content grid-cols-1 gap-6 px-4 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <SectionTitle level={2} as="h2" number="一">
                <span id="overview-questions-heading">核心产业研究问题与核验入口</span>
              </SectionTitle>
              <p className="body-sm text-ink-muted">
                从市场招采、工程技术路线、产品规格型号到企业年报与海关贸易，逐级穿透已核实的公开证据。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 body-sm">
              <TextLink to="/trade" className="font-semibold">
                进出口贸易全景监测 →
              </TextLink>
              <TextLink to={ISSUE.latestReportHref} className="font-semibold">
                2026Q3 高端影像产业链专题报告 →
              </TextLink>
            </div>
          </div>

          <div className="grid grid-cols-1 border-t-2 border-t-brand-navy border-b border-border bg-surface md:grid-cols-2 md:divide-x md:divide-border">
            {ISSUE.researchQuestions.map((rq, idx) => (
              <div
                key={rq.id}
                className={
                  idx < 2
                    ? "grid content-between gap-3 border-b border-border p-5"
                    : "grid content-between gap-3 max-md:border-b max-md:border-border max-md:last:border-b-0 p-5"
                }
              >
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Tag tone="info">{rq.domainLabel}</Tag>
                    <TextLink to={rq.channelHref} className="body-sm font-semibold">
                      进入{rq.domainLabel}栏目 →
                    </TextLink>
                  </div>
                  <h3 className="title-nav text-ink">
                    <Link to={rq.channelHref} className="hover:text-brand-navy hover:underline focus-ring">
                      {rq.question}
                    </Link>
                  </h3>
                  <p className="body-sm text-ink-muted">{rq.summary}</p>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 body-sm">
                  <span className="caption font-semibold text-ink-muted">代表样板：</span>
                  {rq.entityLinks.map((el) => (
                    <TextLink key={el.href} to={el.href} className="font-semibold">
                      {el.label}
                    </TextLink>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 进出口贸易与本期专题出版物横条 */}
          <div className="grid grid-cols-1 gap-6 border border-border bg-surface p-5 lg:grid-cols-12 lg:items-center">
            <div className="grid min-w-0 grid-cols-1 gap-1.5 lg:col-span-6">
              <div className="flex flex-wrap items-center gap-2">
                <Tag>海关 202601 字典 · 164 项 HS8</Tag>
                <span className="caption text-ink-muted">V3 指标 38 · 整机与零件分列对账</span>
              </div>
              <h3 className="title-nav text-brand-navy">
                进出口贸易监测：穿透品类、伙伴国集中度（CR3）与 8 位税号明细
              </h3>
              <p className="body-sm text-ink-muted">
                支持核对成套核磁共振成像装置（90181310）与零件（90181390）年度及月度累计进口快照，导出 SVG 图卡与 CSV 底稿。
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1 body-sm">
                <TextLink to="/trade" className="font-semibold">
                  打开进出口贸易视图 →
                </TextLink>
                <TextLink to="/trade?q=90181310">90181310 成套磁共振</TextLink>
                <TextLink to="/trade?q=90181390">90181390 磁共振零件</TextLink>
              </div>
            </div>

            <div className="min-w-0 border-t border-border pt-4 lg:col-span-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              {ISSUE.homepageBriefings[0] && (
                <Link
                  to={ISSUE.homepageBriefings[0].href}
                  className="group flex min-w-0 items-start gap-4 focus-ring"
                >
                  <ReportCoverThumb
                    variant={ISSUE.homepageBriefings[0].coverVariant}
                    label={ISSUE.homepageBriefings[0].coverLabel}
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                      <span className="font-semibold text-brand-navy">{ISSUE.homepageBriefings[0].issueTag}</span>
                      <span>·</span>
                      <span className="tabular-nums">{ISSUE.homepageBriefings[0].date}</span>
                    </div>
                    <h3 className="body font-semibold text-ink group-hover:text-link">
                      {ISSUE.homepageBriefings[0].title}
                    </h3>
                    <p className="line-clamp-2 body-sm text-ink-muted">{ISSUE.homepageBriefings[0].takeaway}</p>
                    <span className="inline-flex items-center gap-1 caption font-semibold text-link">
                      阅读完整章节与锁定统计快照
                      <IconExternalLink size={13} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 第 3 层：最新发布统计成果条 */}
      <section aria-labelledby="overview-latest-stats-heading" className="border-b border-border bg-surface py-8 md:py-10">
        <div className="mx-auto grid w-full max-w-content grid-cols-1 gap-5 px-4 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <SectionTitle level={2} as="h2" number="二">
                <span id="overview-latest-stats-heading">最新发布统计成果</span>
              </SectionTitle>
              <p className="body-sm text-ink-muted">
                每项统计具备独立永久地址、不可变版本号、统计方法论说明与多格式导出能力。
              </p>
            </div>
            <TextLink to="/statistics" className="body-sm font-semibold">
              浏览全部统计成果 →
            </TextLink>
          </div>

          <ul className="grid grid-cols-1 divide-y divide-border border-y border-border md:grid-cols-2 md:divide-y-0 md:gap-x-8">
            {latestStats.map((item) => {
              const kpiText = item.summary_kpi.headline_value.endsWith("%")
                ? item.summary_kpi.headline_value
                : `${item.summary_kpi.headline_value} ${item.summary_kpi.unit}`;
              return (
                <li key={item.statistic_id} className="flex min-w-0 items-start justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                      <span className="code text-brand-navy">{item.statistic_id}</span>
                      <Tag size="sm">v{item.version}</Tag>
                      <span>{item.summary_kpi.period}</span>
                    </div>
                    <TextLink to={`/statistics/${encodeURIComponent(item.statistic_id)}`} className="body font-semibold text-ink">
                      {item.title}
                    </TextLink>
                    <p className="min-w-0 truncate caption text-ink-muted">来源：{item.source_org}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="title-nav tabular-nums text-brand-navy">{kpiText}</p>
                    {item.summary_kpi.delta_label && (
                      <p className="caption text-ink-muted">{item.summary_kpi.delta_label}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 第 4 层：省域产业集聚与持证密度比较（自原企业页迁入，保留时点与生产企业数分母说明） */}
      <section aria-labelledby="overview-provincial-heading" className="bg-surface-sunken py-8 md:py-10">
        <div className="mx-auto grid w-full max-w-content grid-cols-1 gap-6 px-4 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <SectionTitle level={2} as="h2" number="三">
                <span id="overview-provincial-heading">重点省市三类有效注册证存量与企业持证密度比较</span>
              </SectionTitle>
              <p className="body-sm text-ink-muted">
                截至 2026 年 9 月 30 日时点快照 · 左侧观察期末有效证绝对规模，右侧对照同省生产企业基数下的结构密度。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 body-sm">
              <TextLink to="/enterprises">按省市筛选重点企业 →</TextLink>
              <TextLink to="/institutions">查询各省检验与临床试验机构 →</TextLink>
            </div>
          </div>

          <div id="fig-enterprises-provinces" className="sr-only" aria-hidden="true" />
          <div id="fig-enterprises-density" className="sr-only" aria-hidden="true" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatisticFigure
              id="fig-overview-provinces"
              eyebrow="省域对比图 1 · 期末时点存量"
              statistic={provStockStat}
              height={296}
              className="min-w-0"
            />

            <div className="grid min-w-0 grid-cols-1 content-start gap-2">
              <StatisticFigure
                id="fig-overview-density"
                eyebrow="省域对比图 2 · 比率与分母核对"
                statistic={provDensityStat}
                height={296}
              />
              {densityDenomNote && (
                <p className="border-l-4 border-brand-red bg-surface px-3.5 py-2 caption text-ink">
                  <span className="font-semibold text-brand-navy">分母口径核对：</span>
                  {densityDenomNote}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
