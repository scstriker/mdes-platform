import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import heroBluebookImg from "@/assets/visuals/hero-bluebook-q3.webp";
import heroMedtechImg from "@/assets/visuals/hero-medtech-focus.webp";
import { ISSUE, type HeroCarouselSlide } from "@/content/issue";
import type { ChartOption } from "@/lib/charts/echarts";
import { LazyChart } from "@/lib/charts/lazy-chart";
import { baseOption, categoryAxis, SERIES_SYMBOLS, valueAxis, type ChartTheme } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";

const AUTO_INTERVAL_MS = 6500;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 首屏经典克制轮播（向中国信通院首屏结构对齐）：
 * 左侧 7 列：滚动 Banner（2 帧 Gemini 多模态智库视觉 + 2 帧 ECharts 真实趋势主图）+ 左右轻箭头 + 底缘 4 枚缩略图；
 * 右侧 5 列：极简标题（title-sub）+ 单段舒展梗概（body）+ 轻文字链接 + 右下角分页圆点与暂停键。
 */
export function HeroCarousel() {
  const slides = ISSUE.heroSlides;
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState(() => prefersReducedMotion());
  const [hoverPaused, setHoverPaused] = useState(false);

  const count = slides.length;
  const current = slides[active] ?? slides[0];
  const isPosterSurface = current.kind === "bluebook" || current.kind === "medtech";

  const go = useCallback(
    (next: number) => {
      setActive(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (userPaused || hoverPaused) return undefined;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % count);
    }, AUTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [userPaused, hoverPaused, count]);

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(active - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(active + 1);
    }
  }

  return (
    <section
      role="region"
      aria-roledescription="轮播"
      aria-label="本期焦点发布"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={() => setHoverPaused(false)}
      onKeyDown={handleKeyDown}
      className="bg-surface py-6 md:py-7"
    >
      <div className="mx-auto grid w-full max-w-content gap-7 px-4 md:px-8 lg:grid-cols-12 lg:gap-11">
        {/* 左侧 7 列：统一视觉舞台 + 左右轻箭头 + 底缘 4 枚微缩缩略图 */}
        <div
          className={cn(
            "flex min-w-0 flex-col overflow-hidden border border-border lg:col-span-7",
            isPosterSurface ? "bg-banner-bg" : "bg-surface-sunken",
          )}
        >
          <div className="relative h-72 w-full sm:h-76">
            <button
              type="button"
              onClick={() => go(active - 1)}
              aria-label="上一帧"
              className="absolute top-1/2 left-0 z-20 flex h-12 w-9 -translate-y-1/2 cursor-pointer items-center justify-center bg-banner-bg/75 text-on-banner transition-opacity duration-150 hover:bg-banner-bg focus-ring-inset"
            >
              <IconChevronLeft size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => go(active + 1)}
              aria-label="下一帧"
              className="absolute top-1/2 right-0 z-20 flex h-12 w-9 -translate-y-1/2 cursor-pointer items-center justify-center bg-banner-bg/75 text-on-banner transition-opacity duration-150 hover:bg-banner-bg focus-ring-inset"
            >
              <IconChevronRight size={20} aria-hidden="true" />
            </button>

            <SlideCanvas slide={current} />
          </div>

          {/* 左侧底缘 4 枚微缩缩略图轨道 */}
          <div
            aria-label="焦点缩略图切换"
            className={cn(
              "flex h-18 items-center justify-center gap-2.5 border-t px-4 transition-colors duration-150 sm:gap-3",
              isPosterSurface
                ? "border-banner-border bg-banner-bg"
                : "border-border bg-surface",
            )}
          >
            {slides.map((slide, idx) => {
              const isSelected = idx === active;
              return (
                <button
                  key={slide.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`第 ${idx + 1} 帧：${slide.thumbLabel}`}
                  onClick={() => go(idx)}
                  className={cn(
                    "relative flex h-12 w-20 cursor-pointer items-center justify-center overflow-hidden border-2 transition-opacity duration-150 focus-ring sm:w-24",
                    isSelected
                      ? "border-brand-sky opacity-100"
                      : "border-transparent opacity-65 hover:opacity-95",
                    slide.kind === "bluebook" || slide.kind === "medtech"
                      ? "bg-banner-bg"
                      : "bg-surface-sunken",
                  )}
                >
                  <ThumbGraphic kind={slide.kind} />
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧 5 列：极简标题（title-sub）+ 单段舒展梗概（body）+ 轻链接与右下圆点 */}
        <div className="flex min-w-0 flex-col justify-between py-1 lg:col-span-5 lg:py-2">
          <div className="grid gap-4">
            <h1 className="title-sub text-ink">
              <Link
                to={current.href}
                className="transition-colors duration-150 hover:text-brand-navy focus-ring"
              >
                {current.title}
              </Link>
            </h1>
            <p className="body leading-7 text-ink-muted">{current.synopsis}</p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <Link
              to={current.href}
              className="inline-flex items-center gap-1 body text-link transition-colors duration-150 hover:underline focus-ring"
            >
              {current.ctaLabel}
              <IconArrowRight size={16} aria-hidden="true" />
            </Link>

            <div className="flex items-center gap-2.5" aria-label="轮播分页指示">
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                aria-label={userPaused ? "恢复自动轮播" : "暂停自动轮播"}
                className="mr-1 inline-flex cursor-pointer items-center justify-center p-1 text-ink-muted transition-colors duration-150 hover:text-brand-navy focus-ring"
              >
                {userPaused ? (
                  <IconPlayerPlay size={15} aria-hidden="true" />
                ) : (
                  <IconPlayerPause size={15} aria-hidden="true" />
                )}
              </button>

              {slides.map((slide, idx) => {
                const isSelected = idx === active;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`切换到第 ${idx + 1} 帧：${slide.thumbLabel}`}
                    onClick={() => go(idx)}
                    className={cn(
                      "h-2.5 cursor-pointer rounded-pill transition-all duration-150 focus-ring",
                      isSelected
                        ? "w-6 bg-brand-navy"
                        : "w-2.5 bg-border hover:bg-border-strong",
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideCanvas({ slide }: { slide: HeroCarouselSlide }) {
  if (slide.kind === "bluebook" || slide.kind === "medtech") {
    const src = slide.kind === "bluebook" ? heroBluebookImg : heroMedtechImg;
    return (
      <div className="relative flex h-full w-full items-center overflow-hidden bg-banner-bg">
        <img
          src={src}
          alt=""
          width={960}
          height={540}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative z-10 ml-10 mr-10 max-w-md bg-banner-bg/80 px-6 py-5 text-on-banner sm:ml-12">
          {slide.posterKicker && (
            <p className="body text-on-banner-muted">{slide.posterKicker}</p>
          )}
          {slide.posterLines && (
            <p className="mt-2 title-section text-on-banner">
              {slide.posterLines[0]}
              <br />
              {slide.posterLines[1]}
            </p>
          )}
          <div aria-hidden="true" className="my-3.5 h-0.5 w-14 bg-brand-sky" />
          {slide.posterFoot && (
            <p className="body text-on-banner-muted">{slide.posterFoot}</p>
          )}
        </div>
      </div>
    );
  }

  if (slide.kind === "reg-chart") {
    return (
      <div className="flex h-full w-full flex-col justify-between bg-surface-sunken px-11 pt-4 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="body font-semibold text-brand-navy">国产三类首次注册占比（2021—2026Q3）</p>
          <span className="body text-ink-muted">单位：件</span>
        </div>
        <LazyChart
          key="hero-reg-chart"
          option={buildHeroRegOption}
          ariaLabel="2021至2026年前三季度国产与进口第三类医疗器械首次注册占比柱状图"
          height={236}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col justify-between bg-surface-sunken px-11 pt-4 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="body font-semibold text-brand-navy">医疗器械季度海关进出口走势（2025Q1—2026Q3）</p>
        <span className="body text-ink-muted">单位：亿美元</span>
      </div>
      <LazyChart
        key="hero-trade-chart"
        option={buildHeroTradeOption}
        ariaLabel="2025年第一季度至2026年第三季度医疗器械海关出口额与进口额走势折线图"
        height={236}
      />
    </div>
  );
}

function ThumbGraphic({ kind }: { kind: HeroCarouselSlide["kind"] }) {
  if (kind === "bluebook") {
    return (
      <img
        src={heroBluebookImg}
        alt=""
        width={192}
        height={108}
        className="h-full w-full object-cover"
      />
    );
  }
  if (kind === "medtech") {
    return (
      <img
        src={heroMedtechImg}
        alt=""
        width={192}
        height={108}
        className="h-full w-full object-cover"
      />
    );
  }
  if (kind === "reg-chart") {
    return (
      <svg width="68" height="30" viewBox="0 0 68 30" aria-hidden="true">
        <rect x="4" y="15" width="7" height="12" className="fill-chart-1" />
        <rect x="15" y="12" width="7" height="15" className="fill-chart-1" />
        <rect x="26" y="9" width="7" height="18" className="fill-chart-1" />
        <rect x="37" y="6" width="7" height="21" className="fill-chart-1" />
        <rect x="48" y="4" width="7" height="23" className="fill-chart-1" />
        <rect x="59" y="7" width="7" height="20" className="fill-chart-2" />
      </svg>
    );
  }
  return (
    <svg width="68" height="30" viewBox="0 0 68 30" aria-hidden="true">
      <polyline
        fill="none"
        strokeWidth="2"
        className="stroke-chart-1"
        points="4,17 16,14 28,16 40,8 52,10 64,6"
      />
      <polyline
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="3 2"
        className="stroke-chart-2"
        points="4,24 16,22 28,23 40,20 52,25 64,23"
      />
    </svg>
  );
}

function buildHeroRegOption(t: ChartTheme): ChartOption {
  const periods = ISSUE.regTrendSeries.map((r) => r.period);
  const domestic = ISSUE.regTrendSeries.map((r) => r.domesticCount);
  const imported = ISSUE.regTrendSeries.map((r) => r.importCount);
  const shares = ISSUE.regTrendSeries.map((r) => r.domesticShare);

  return {
    ...baseOption(t, 2),
    grid: { top: 34, right: 16, bottom: 26, left: 46 },
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t),
    series: [
      {
        type: "bar",
        stack: "reg",
        name: "境内首次注册",
        data: domestic,
        barMaxWidth: 32,
        itemStyle: { color: t.series[0] },
      },
      {
        type: "bar",
        stack: "reg",
        name: "进口首次注册",
        data: imported,
        barMaxWidth: 32,
        itemStyle: { color: t.series[3] },
        label: {
          show: true,
          position: "top",
          formatter: (p) => `${shares[p.dataIndex]}%`,
          color: t.muted,
          fontSize: 12,
        },
      },
    ],
  };
}

function buildHeroTradeOption(t: ChartTheme): ChartOption {
  const periods = ISSUE.tradeTrendSeries.map((r) => r.period);
  const exportsUsd = ISSUE.tradeTrendSeries.map((r) => r.exportUsd);
  const importsUsd = ISSUE.tradeTrendSeries.map((r) => r.importUsd);

  return {
    ...baseOption(t, 2),
    grid: { top: 34, right: 20, bottom: 26, left: 42 },
    xAxis: categoryAxis(t, periods),
    yAxis: valueAxis(t, { scale: true }),
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
