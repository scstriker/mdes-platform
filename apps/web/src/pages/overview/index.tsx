import { Link } from "react-router";
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import { formatNumber, Sparkline, Tag } from "@/components/itei";
import { HeroCarousel } from "@/components/layout/hero-carousel";
import { ReportCoverThumb } from "@/components/layout/report-cover-thumb";
import { ISSUE } from "@/content/issue";
import { cn } from "@/lib/utils";

/**
 * 医疗器械产业数据平台首页（立足国家部委智库门户定位）：
 * 1. 页眉正下方已由 AppShell 统一挂载同轴分域检索带（含热词与跨库实时建议）；
 * 2. 首屏旗舰轮播（2 帧多模态智库封面 + 2 帧 Statista 级高信噪比趋势图，消除同屏数字三遍重复）；
 * 3. 核心监测指标通栏（恢复 36px numeral-lg 大数张力 + 同比增量箭头 + 同期微趋势线）；
 * 4. 7:5 平衡双栏：「ITEI 研判」（配领域标签并精准穿透子页信息图锚点）｜「权威发布」（封面 + 期次 + 核心结论提要）。
 */
export default function OverviewPage() {
  return (
    <div className="w-full overflow-x-clip bg-surface">
      {/* 第 1 层：旗舰首屏轮播 */}
      <HeroCarousel />

      {/* 第 2 层：通栏核心监测指标（numeral-lg 大数 + 同比增量 + 同期趋势微图） */}
      <section aria-label="核心监测指标" className="bg-surface">
        <div className="mx-auto w-full max-w-content px-4 md:px-8">
          <div className="grid grid-cols-1 border-t-2 border-t-brand-navy border-b border-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
            {ISSUE.homepageStats.map((stat, idx) => {
              const ArrowIcon = stat.direction === "down" ? IconArrowDownRight : IconArrowUpRight;
              return (
                <Link
                  key={stat.id}
                  to={stat.href}
                  className={cn(
                    "group flex min-w-0 flex-col justify-between gap-2.5 px-4 py-4 transition-colors duration-150 hover:bg-surface-sunken focus-ring-inset lg:px-5 lg:first:pl-1 lg:last:pr-1",
                    idx < 2 && "max-lg:border-b max-lg:border-border",
                    idx % 2 === 0 && "sm:max-lg:border-r sm:max-lg:border-border",
                    idx === 2 && "max-sm:border-b max-sm:border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="body-sm font-semibold text-ink-muted transition-colors group-hover:text-brand-navy">
                      {stat.label}
                    </span>
                    <span className="caption text-ink-muted">2026Q1–Q3</span>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div className="grid gap-1">
                      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
                        <span className="numeral-lg text-brand-navy">{formatNumber(stat.value, stat.digits)}</span>
                        <span className="body-sm font-semibold text-ink-muted">{stat.unit}</span>
                      </span>
                      <span className="inline-flex items-center gap-0.5 caption font-semibold text-ink">
                        <ArrowIcon size={14} className="text-brand-navy" aria-hidden="true" />
                        {stat.delta}
                      </span>
                    </div>
                    <div className="w-20 shrink-0 pb-1">
                      <Sparkline values={[...stat.trend]} label={`${stat.label}近六年同期走势`} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 第 3 层：7:5 双栏（ITEI 研判 5 条领域观点 ｜ 权威发布 2 份旗舰报告） */}
      <section aria-label="研判观点与权威发布" className="bg-surface py-9 md:py-11">
        <div className="mx-auto grid w-full max-w-content gap-10 px-4 md:px-8 lg:grid-cols-12 lg:gap-12">
          {/* 左 7 列：ITEI 研判 */}
          <div className="min-w-0 lg:col-span-7">
            <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2.5">
              <h2 className="-mb-2.75 border-b-2 border-brand-navy pb-2.5 title-sub text-brand-navy">
                ITEI 研判
              </h2>
              <Link
                to="/reports#fig-reports-briefings"
                className="body-sm text-ink-muted transition-colors duration-150 hover:text-link focus-ring"
              >
                全部专题研判 &raquo;
              </Link>
            </div>

            <ul className="divide-y divide-border/70">
              {ISSUE.homepageInsights.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-3 py-2.75">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "shrink-0",
                      item.featured ? "size-2 bg-brand-red" : "size-1.5 bg-brand-navy",
                    )}
                  />
                  <Tag size="sm" tone={item.featured ? "info" : "neutral"} className="shrink-0">
                    {item.domainTag}
                  </Tag>
                  <Link
                    to={item.href}
                    className="min-w-0 flex-1 truncate body text-ink transition-colors duration-150 hover:text-link focus-ring"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 右 5 列：权威发布 */}
          <div className="min-w-0 lg:col-span-5">
            <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2.5">
              <h2 className="-mb-2.75 border-b-2 border-brand-navy pb-2.5 title-sub text-brand-navy">
                权威发布
              </h2>
              <Link
                to="/reports"
                className="body-sm text-ink-muted transition-colors duration-150 hover:text-link focus-ring"
              >
                进入报告与政策库 &raquo;
              </Link>
            </div>

            <div className="grid gap-4 pt-1">
              {ISSUE.homepageBriefings.map((pub) => (
                <Link
                  key={pub.id}
                  to={pub.href}
                  className="group flex items-start gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0 focus-ring"
                >
                  <ReportCoverThumb variant={pub.coverVariant} label={pub.coverLabel} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
                      <span className="font-semibold text-brand-navy">{pub.issueTag}</span>
                      <span>·</span>
                      <span className="tabular-nums">{pub.date}</span>
                    </div>
                    <h3 className="body font-semibold text-ink transition-colors duration-150 group-hover:text-link">
                      {pub.title}
                    </h3>
                    <p className="line-clamp-2 body-sm text-ink-muted">{pub.takeaway}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
