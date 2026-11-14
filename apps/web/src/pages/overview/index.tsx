import type { ReactNode } from "react";
import { Link } from "react-router";
import { IconArrowDown, IconArrowRight, IconArrowUp, IconMinus } from "@tabler/icons-react";
import { formatNumber, Sparkline, Tag, TextLink, type TagTone } from "@/components/itei";
import { IndicatorSearch } from "@/components/layout/indicator-search";
import { PublicationFooter } from "@/components/layout/publication-footer";
import { Button } from "@/components/ui/button";
import { ISSUE } from "@/content/issue";
import { baseOption, categoryAxis, LazyChart, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import type { ChartOption } from "@/lib/charts/echarts";
import { showDemoChrome } from "@/lib/demo-chrome";
import { cn } from "@/lib/utils";

const STANCE_TONE: Record<string, TagTone> = {
  向好: "success",
  平稳: "info",
  需关注: "warning",
};

/** 态势总览：发布物首页 — 刊头 / 通栏 KPI / 两章正文 / 延伸阅读（非资讯流） */
export default function OverviewPage() {
  const demoChrome = showDemoChrome();

  return (
  <>
    <div className="mx-auto grid w-full max-w-content gap-12 px-4 py-8 md:px-8 md:py-10">
      <header className="grid gap-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 caption text-ink-muted">
          <span className="bg-info-bg px-2 py-0.5 text-brand-navy">
            {ISSUE.periodLabel} · {ISSUE.issueNo}
          </span>
          <span>发布 {ISSUE.publishedAt}</span>
          <span>数据截至 {ISSUE.dataAsOf}</span>
          <span>编制 {ISSUE.publisher}</span>
        </p>
        <h1 className="display-hero max-w-4xl text-brand-navy">{ISSUE.headline}</h1>
        <div aria-hidden="true" className="h-0.5 max-w-2xl bg-brand-sky clip-slash" />

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="grid content-start gap-4 lg:col-span-3">
            <p className="body-lg text-ink">{ISSUE.lead}</p>
            {demoChrome && (
              <p role="note" className="caption text-ink-muted">
                核心指标与图表为演示虚构数据；入库后可替换为真实序列。
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/system">查看指标体系</Link>
              </Button>
              <IndicatorSearch variant="button" className="!inline-flex" />
              <Button variant="secondary" type="button" disabled>
                下载一页纸 PDF
              </Button>
            </div>
          </div>

          <aside className="border border-border bg-info-bg p-4 lg:col-span-2" aria-labelledby="insights-title">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 id="insights-title" className="title-nav text-brand-navy">
                本期研判要点
              </h2>
              {demoChrome && <span className="caption text-ink-muted">编辑位</span>}
            </div>
            <ol className="grid gap-3">
              {ISSUE.insights.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-11 shrink-0 items-center justify-center clip-slash numeral-sm text-on-brand",
                      item.emphasize ? "bg-brand-red" : "bg-brand-navy",
                    )}
                  >
                    {item.id}
                  </span>
                  <p className="min-w-0 body-sm text-ink">{item.text}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </header>

      <section aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="sr-only">
          核心指标
        </h2>
        <div className="border-t-2 border-brand-navy">
          <div className="grid md:grid-cols-5 md:divide-x md:divide-border">
            {ISSUE.kpis.map((k) => (
              <div key={k.label} className="grid gap-1 border-b border-border px-3 py-4 md:border-b-0 md:px-4">
                <p className="label text-ink-muted">{k.label}</p>
                <p className="numeral-lg tabular-nums text-brand-navy">
                  {formatNumber(k.value, "digits" in k ? k.digits : undefined)}
                  <span className="ml-1 body text-ink-muted">{k.unit}</span>
                </p>
                <p className="flex items-center gap-1 body-sm text-ink-muted">
                  <DeltaIcon direction={k.direction} />
                  {k.delta}
                </p>
                <Sparkline values={[...k.trend]} label={`${k.label}趋势`} className="mt-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Chapter number="一" title="本期焦点：注册与创新">
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="grid gap-3 lg:col-span-3">
            <p className="caption text-ink-muted">图 1</p>
            <h3 className="title-sub text-brand-navy">{ISSUE.chartTitle}</h3>
            <p className="caption text-ink-muted">{ISSUE.chartSubtitle}</p>
            <LazyChart option={domesticShareOption} ariaLabel="国产与进口三类首次注册占比堆叠柱图" height={240} />
            <p className="caption text-ink-muted">{ISSUE.chartNote}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" type="button" disabled>
                下载
              </Button>
              <Button variant="ghost" size="sm" type="button" disabled>
                引用
              </Button>
            </div>
          </div>
          <div className="grid content-start gap-3 lg:col-span-2">
            <h3 className="title-nav text-brand-navy">本期获批创新医疗器械</h3>
            <ul className="divide-y divide-border border border-border">
              {ISSUE.innovations.map((item) => (
                <li key={item.name} className="grid gap-0.5 px-3 py-3">
                  <p className="body text-ink">{item.name}</p>
                  <p className="caption text-ink-muted">
                    {item.region} · {item.date}
                  </p>
                </li>
              ))}
            </ul>
            <TextLink to="/system/02" className="body-sm">
              查看创新通道指标
              <IconArrowRight size={14} className="ml-1 inline" aria-hidden="true" />
            </TextLink>
          </div>
        </div>
      </Chapter>

      <Chapter number="二" title="七个维度态势">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ISSUE.dimensions.map((d) => (
            <li key={d.code} className="grid gap-3 border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="numeral-sm text-brand-navy">{d.code}</span>
                <Tag size="sm" tone={STANCE_TONE[d.stance] ?? "info"}>
                  {d.stance}
                </Tag>
              </div>
              <p className="title-nav text-ink">{d.name}</p>
              <p className="body-sm font-medium text-ink">{d.highlight}</p>
              <DomainSegments label={`${d.name}结构`} segments={d.segments} />
            </li>
          ))}
        </ul>
        <p className="mt-4">
          <TextLink to="/system" className="body-sm">
            进入指标体系方法论
            <IconArrowRight size={14} className="ml-1 inline" aria-hidden="true" />
          </TextLink>
        </p>
      </Chapter>

      {ISSUE.furtherReading.length > 0 && (
        <section
          className="grid gap-4 border border-border bg-info-bg p-4 md:p-5"
          aria-labelledby="further-reading-title"
        >
          <div className="grid gap-1">
            <h2 id="further-reading-title" className="title-nav text-brand-navy">
              延伸阅读
            </h2>
            <p className="caption text-ink-muted">
              与本期监测相关的报告与政策摘要；完整目录见
              <TextLink to="/research" className="ml-1 body-sm">
                研究发布
              </TextLink>
              。
            </p>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {ISSUE.furtherReading.map((item) => (
              <li key={item.title} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 grid flex-1 gap-1">
                  <p className="body text-ink">{item.title}</p>
                  <p className="caption text-ink-muted">
                    <span className="tabular-nums">{item.date}</span>
                    <span aria-hidden="true"> · </span>
                    {item.kind}
                    {item.context ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        {item.context}
                      </>
                    ) : null}
                  </p>
                  <TextLink to={item.relatedTo.href} className="body-sm w-fit">
                    {item.relatedTo.label}
                    <IconArrowRight size={14} className="ml-1 inline" aria-hidden="true" />
                  </TextLink>
                </div>
                <Button variant="secondary" size="sm" type="button" disabled className="shrink-0">
                  {item.kind === "PDF" ? "下载 PDF" : "查看原文"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    <PublicationFooter />
  </>
  );
}

function Chapter({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-5">
      <h2 className="inline-flex w-fit max-w-full items-center bg-brand-navy py-2 pr-10 pl-5 title-sub text-on-brand clip-slash">
        {number}、{title}
      </h2>
      {children}
    </section>
  );
}

function DeltaIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <IconArrowUp size={14} aria-hidden="true" />;
  if (direction === "down") return <IconArrowDown size={14} aria-hidden="true" />;
  return <IconMinus size={14} aria-hidden="true" />;
}

function DomainSegments({ label, segments }: { label: string; segments: readonly number[] }) {
  const tones = ["bg-brand-navy", "bg-brand-sky", "bg-chart-4"] as const;
  return (
    <div
      role="img"
      aria-label={`${label}：${segments.map((s, i) => `段${i + 1} ${s}%`).join("，")}`}
      className="flex h-2 w-full overflow-hidden border border-border bg-surface-sunken"
    >
      {segments.map((pct, i) => (
        <div key={i} className={cn("h-full", tones[i % tones.length])} style={{ width: `${pct}%` }} />
      ))}
    </div>
  );
}

function domesticShareOption(t: ChartTheme): ChartOption {
  const years = ISSUE.chartSeries.map((r) => r.year);
  const domestic = ISSUE.chartSeries.map((r) => r.domestic);
  const imp = ISSUE.chartSeries.map((r) => r.import);
  const eventIndex = ISSUE.chartSeries.findIndex((r) => r.year === ISSUE.chartEvent.year);

  return {
    ...baseOption(t, 2),
    legend: { show: false },
    xAxis: categoryAxis(t, years),
    yAxis: { ...valueAxis(t, { name: "%" }), max: 100 },
    series: [
      {
        type: "bar",
        stack: "share",
        name: "国产",
        data: domestic,
        barMaxWidth: 36,
        itemStyle: { color: t.series[0] },
        markPoint:
          eventIndex >= 0
            ? {
                symbol: "pin",
                symbolSize: 0,
                label: {
                  show: true,
                  formatter: ISSUE.chartEvent.label,
                  color: t.emphasis,
                  fontSize: 11,
                  position: "top",
                },
                data: [{ name: ISSUE.chartEvent.label, coord: [eventIndex, domestic[eventIndex] + imp[eventIndex]] }],
              }
            : undefined,
      },
      {
        type: "bar",
        stack: "share",
        name: "进口",
        data: imp,
        barMaxWidth: 36,
        itemStyle: { color: t.series[3] },
        label: {
          show: true,
          position: "top",
          formatter: (p) => {
            const i = p.dataIndex;
            if (i !== years.length - 1) return "";
            return `${domestic[i]}%`;
          },
          color: t.ink,
          fontSize: 12,
        },
      },
    ],
  };
}