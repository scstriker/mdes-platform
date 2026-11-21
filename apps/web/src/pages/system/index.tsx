import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { matchesQuery } from "@mdes/shared";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { StatistaFigure, type StatistaTableColumn } from "@/components/layout/statista-figure";
import {
  DATA_FORM_LABEL,
  LEVEL1_SECTIONS,
  SYSTEM_INDICATORS,
  SYSTEM_L1,
  SYSTEM_L2,
  SYSTEM_PHASE1,
  SYSTEM_TOTAL,
  type DataForm,
  type IndicatorPhase,
  type SystemIndicator,
} from "@/content/system-v3";
import { statistaHorizontalBarOption, type ChartTheme } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";

const FORM_FILTERS: readonly { key: DataForm; label: string }[] = [
  { key: "stat", label: "含数值统计" },
  { key: "detail", label: "含对象明细" },
  { key: "text", label: "含结构化文本" },
];

function stripLevel1Prefix(name: string) {
  return name.replace(/^[一二三四五六七八九十]+、/, "");
}

function stripLevel2Prefix(name: string) {
  return name.replace(/^（[一二三四五六七八九十]+）/, "");
}

function formatHeadlineMetric(metric: string) {
  return metric
    .replace("二期规划接入", "规划拓展接入")
    .replace("一期纳入", "已上线")
    .replace("二期规划", "规划拓展");
}

function renderCoverageCell(phase: IndicatorPhase) {
  if (phase === "phase1") {
    return (
      <Tag size="sm" tone="info">
        已上线
      </Tag>
    );
  }
  if (phase === "partial") {
    return (
      <Tag size="sm" tone="neutral">
        重点覆盖
      </Tag>
    );
  }
  return <span className="caption text-ink-muted">规划拓展</span>;
}

const OVERVIEW_TABLE_COLUMNS: readonly StatistaTableColumn[] = [
  { key: "domain", title: "一级业务领域" },
  { key: "l2Count", title: "二级分类（类）", align: "right" },
  { key: "total", title: "三级指标（项）", align: "right" },
  { key: "share", title: "体系占比", align: "right" },
  { key: "online", title: "已上线及重点覆盖（项）", align: "right" },
];

const OVERVIEW_DOMAIN_DATA = LEVEL1_SECTIONS.map((sec) => {
  const items = SYSTEM_INDICATORS.filter((i) => i.level1 === sec.name);
  const l2Count = new Set(items.map((i) => i.level2)).size;
  const onlineCount = items.filter((i) => i.phase1).length;
  const pct = ((items.length / SYSTEM_TOTAL) * 100).toFixed(1);
  return {
    id: sec.id,
    domain: stripLevel1Prefix(sec.name),
    l2Count,
    total: items.length,
    share: `${pct}%`,
    online: onlineCount,
    barLabel: `${items.length} 项（${pct}%）`,
  };
}).sort((a, b) => b.total - a.total);

const OVERVIEW_TABLE_ROWS: readonly Record<string, string | number>[] = OVERVIEW_DOMAIN_DATA.map((d) => ({
  domain: d.domain,
  l2Count: d.l2Count,
  total: d.total,
  share: d.share,
  online: d.online,
}));

export default function SystemPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawQuery = params.get("q")?.trim() ?? "";
  const q = rawQuery.toLowerCase();
  const l1Target = params.get("l1") ?? "";

  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectedForms, setSelectedForms] = useState<DataForm[]>([]);
  const [activeId, setActiveId] = useState<string>(LEVEL1_SECTIONS[0]?.id ?? "l1-reg");

  const filtered = useMemo(() => {
    return SYSTEM_INDICATORS.filter((row) => {
      if (onlineOnly && !row.phase1) return false;
      if (selectedForms.length > 0 && !selectedForms.every((f) => row.dataForms.includes(f))) {
        return false;
      }
      if (!q) return true;
      return matchesQuery(
        `${row.seq} ${row.name} ${row.source} ${row.frequency} ${row.level1} ${row.level2} ${row.recordWhat} ${row.canAnswer.join(" ")} ${row.v12Codes.join(" ")}`,
        q,
      );
    });
  }, [q, onlineOnly, selectedForms]);

  const byLevel1 = useMemo(
    () =>
      LEVEL1_SECTIONS.map((s) => ({
        ...s,
        items: filtered.filter((i) => i.level1 === s.name),
      })).filter((s) => s.items.length > 0),
    [filtered],
  );

  const countByLevel1 = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of LEVEL1_SECTIONS) {
      map.set(s.id, filtered.filter((i) => i.level1 === s.name).length);
    }
    return map;
  }, [filtered]);

  const currentActiveId = byLevel1.some((s) => s.id === activeId) ? activeId : (byLevel1[0]?.id ?? "");

  useEffect(() => {
    if (!l1Target) return;
    const el = document.getElementById(l1Target);
    if (el) {
      setActiveId(l1Target);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [l1Target]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || byLevel1.length === 0) return;

    const elements = byLevel1
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visibleIds = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }
        const firstVisible = byLevel1.find((s) => visibleIds.has(s.id));
        if (firstVisible) {
          setActiveId(firstVisible.id);
        }
      },
      { rootMargin: "-88px 0px -62% 0px", threshold: 0 },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [byLevel1]);

  function toggleFormFilter(form: DataForm) {
    setSelectedForms((prev) => (prev.includes(form) ? prev.filter((f) => f !== form) : [...prev, form]));
  }

  function resetAllFilters() {
    setOnlineOnly(false);
    setSelectedForms([]);
    if (rawQuery) {
      navigate("/system");
    }
  }

  const hasActiveFilter = Boolean(rawQuery) || onlineOnly || selectedForms.length > 0;

  const overviewChartOption = useCallback(
    (t: ChartTheme) =>
      statistaHorizontalBarOption(t, {
        categories: OVERVIEW_DOMAIN_DATA.map((d) => d.domain),
        values: OVERVIEW_DOMAIN_DATA.map((d) => d.total),
        labels: OVERVIEW_DOMAIN_DATA.map((d) => d.barLabel),
        highlightTopN: 2,
        rightPadding: 116,
        max: 14,
      }),
    [],
  );

  const columns: DataTableColumn<SystemIndicator>[] = useMemo(
    () => [
      { key: "seq", title: "序号", type: "code", colClassName: "w-14" },
      {
        key: "level2",
        title: "二级分类",
        colClassName: "w-34",
        value: (r) => stripLevel2Prefix(r.level2),
        cell: (r) => <span className="body-sm whitespace-nowrap text-ink">{stripLevel2Prefix(r.level2)}</span>,
      },
      {
        key: "name",
        title: "三级指标",
        primary: true,
        cell: (r) => (
          <div className="grid gap-0.5">
            <TextLink to={`/system/${r.seq}`}>{r.name}</TextLink>
            <span className="caption font-normal text-ink-muted">来源：{r.source}</span>
          </div>
        ),
      },
      {
        key: "dataForms",
        title: "数据形态",
        colClassName: "w-28",
        value: (r) => r.dataForms.map((f) => DATA_FORM_LABEL[f]).join("·"),
        cell: (r) => (
          <span className="caption whitespace-nowrap text-ink-muted">
            {r.dataForms.map((f) => DATA_FORM_LABEL[f]).join("·")}
          </span>
        ),
      },
      {
        key: "unit",
        title: "计量单位",
        colClassName: "w-22",
        cell: (r) => <span className="body-sm whitespace-nowrap text-ink">{r.unit}</span>,
      },
      {
        key: "frequency",
        title: "频度",
        colClassName: "w-14",
        cell: (r) => <span className="body-sm whitespace-nowrap text-ink-muted">{r.frequency}</span>,
      },
      {
        key: "phase",
        title: "覆盖状态",
        type: "status",
        colClassName: "w-26",
        value: (r) => r.phase,
        cell: (r) => renderCoverageCell(r.phase),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="grid gap-5">
        <div className="grid gap-1.5">
          <p className="caption text-ink-muted">方法论与数据字典</p>
          <h1 className="title-page text-brand-navy">指标目录（V3.0）</h1>
          <p className="max-w-3xl body text-ink">
            按 6 大业务领域、14 个二级分类组织全部 33 项三级监测指标，统一界定计量单位、数据形态、更新频度与权威统计口径。
          </p>
        </div>

        <div className="border-t-2 border-brand-navy border-b border-border py-4">
          <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-border lg:grid-cols-5">
            <SummaryStat label="一级业务领域" value={SYSTEM_L1} className="pr-4" />
            <SummaryStat label="二级指标分类" value={SYSTEM_L2} className="sm:px-5" />
            <SummaryStat label="三级监测指标" value={SYSTEM_TOTAL} className="pr-4 sm:px-5" />
            <SummaryStat label="已上线及重点覆盖" value={SYSTEM_PHASE1} className="sm:pl-5 lg:px-5" />
            <div className="col-span-2 flex flex-col justify-between gap-1 border-t border-border pt-3 sm:col-span-4 lg:col-span-1 lg:border-t-0 lg:pt-0 lg:pl-5">
              <p className="body-sm font-semibold text-brand-navy">日度 / 月度 / 季度 / 年度权威同步</p>
              <p className="caption text-ink-muted">数据更新机制</p>
            </div>
          </div>
        </div>
      </header>

      {hasActiveFilter && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 body-sm text-ink-muted"
        >
          <p>
            {rawQuery ? `检索「${rawQuery}」 · ` : ""}当前显示{" "}
            <span className="font-semibold tabular-nums text-ink">{filtered.length}</span> / {SYSTEM_TOTAL} 项三级指标
          </p>
          <button
            type="button"
            onClick={resetAllFilters}
            className="cursor-pointer body-sm text-link hover:underline focus-ring"
          >
            重置筛选条件
          </button>
        </div>
      )}

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav
          aria-label="一级领域目录"
          className="shrink-0 lg:sticky lg:top-20 lg:w-56 lg:self-start lg:border-r lg:border-border lg:pr-6"
        >
          <ul className="divide-y divide-border border-b border-border pb-3">
            {LEVEL1_SECTIONS.map((s) => {
              const count = countByLevel1.get(s.id) ?? 0;
              const isActive = currentActiveId === s.id && count > 0;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={count === 0}
                    onClick={() => {
                      setActiveId(s.id);
                      document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 py-2.5 pr-2 pl-3 text-left body-sm transition-colors focus-ring",
                      count === 0
                        ? "cursor-not-allowed border-l-2 border-transparent text-ink-disabled"
                        : isActive
                          ? "cursor-pointer border-l-2 border-brand-navy bg-info-bg font-semibold text-brand-navy"
                          : "cursor-pointer border-l-2 border-transparent text-ink hover:text-brand-navy",
                    )}
                  >
                    <span className="min-w-0">{s.name}</span>
                    <span className="shrink-0 caption tabular-nums text-ink-muted">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <fieldset className="grid gap-2 pt-4">
            <legend className="mb-1 caption font-semibold text-ink-muted">目录筛选</legend>
            <div>
              <label htmlFor="system-local-filter" className="sr-only">
                筛选本目录指标
              </label>
              <input
                id="system-local-filter"
                type="search"
                value={params.get("q") ?? ""}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value.trim()) next.set("q", e.target.value);
                  else next.delete("q");
                  setParams(next, { replace: true });
                }}
                placeholder="筛选本目录指标…"
                className="mb-1 h-8 w-full rounded-sm border border-border-strong bg-surface px-2.5 body-sm text-ink outline-none focus:border-brand-navy"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 body-sm text-ink">
              <input
                type="checkbox"
                checked={onlineOnly}
                onChange={(e) => setOnlineOnly(e.target.checked)}
                className="size-4 accent-brand-navy"
              />
              仅看已上线指标
            </label>
            {FORM_FILTERS.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center gap-2 body-sm text-ink">
                <input
                  type="checkbox"
                  checked={selectedForms.includes(item.key)}
                  onChange={() => toggleFormFilter(item.key)}
                  className="size-4 accent-brand-navy"
                />
                {item.label}
              </label>
            ))}
          </fieldset>
        </nav>

        <div className="min-w-0 flex-1 grid gap-10">
          {!rawQuery && (
            <StatistaFigure
              id="fig-system-overview"
              eyebrow="体系结构总览"
              title="企业与机构、政策与监管两大领域合计覆盖逾六成核心监测指标"
              subtitle="《医疗器械产业数据系统指标体系》6 大一级业务领域三级指标数量分布（单位：项）"
              badge={{ label: "共 6 大领域 · 33 项三级指标", tone: "info" }}
              option={overviewChartOption}
              ariaLabel="医疗器械产业数据系统指标体系六大一级业务领域三级指标数量分布：企业与机构 12 项、政策与监管 9 项、审评注册与上市准入 4 项、产品 4 项、知识产权与标准 3 项、进出口贸易 1 项"
              height={208}
              tableColumns={OVERVIEW_TABLE_COLUMNS}
              tableRows={OVERVIEW_TABLE_ROWS}
              exportName="mdes-system-v3-overview"
              source="机械工业仪器仪表综合技术经济研究所（ITEI）《医疗器械产业数据系统指标体系（V3.0）》"
              note="全体系共设 6 大一级业务领域、14 个二级分类、33 项三级监测指标。"
            />
          )}

          {byLevel1.length === 0 ? (
            <div className="grid gap-2 border-y border-border py-8">
              <p className="body text-ink">没有符合当前检索与筛选条件的三级指标。</p>
              <p className="body-sm text-ink-muted">
                可尝试放宽左侧目录筛选条件，或{" "}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="cursor-pointer body-sm text-link hover:underline focus-ring"
                >
                  重置全部筛选条件
                </button>{" "}
                查看完整 33 项三级指标目录。
              </p>
            </div>
          ) : (
            byLevel1.map((section) => {
              const l2Count = new Set(section.items.map((i) => i.level2)).size;
              return (
                <section key={section.id} id={section.id} className="grid scroll-mt-24 gap-4">
                  <div className="grid gap-2 border-b-2 border-brand-navy pb-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="title-section text-brand-navy">{section.name}</h2>
                      <p className="caption text-ink-muted">
                        二级 {l2Count} 类 · 三级 {section.items.length} 项
                        <TextLink to={section.subpageHref} className="body-sm ml-2.5">
                          {section.subpageLabel} →
                        </TextLink>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <p className="body-sm text-ink-muted">{section.summary}</p>
                      <Tag
                        size="sm"
                        tone={section.id === "l1-ip" ? "neutral" : "info"}
                        className="h-auto py-0.5 whitespace-normal"
                      >
                        {formatHeadlineMetric(section.headlineMetric)}
                      </Tag>
                    </div>
                  </div>

                  <DataTable
                    caption={`${section.name}三级指标目录`}
                    columns={columns}
                    data={section.items}
                    getRowId={(r) => r.seq}
                    fixedLayout
                    dense
                  />
                </section>
              );
            })
          )}

          <p className="border-t border-border pt-3 caption text-ink-muted">
            编排说明：指标序号（01–38）沿用体系标准编码，历史精简合并条目保留原位编号以保持跨期文献与专报引用稳定。
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("grid content-start gap-0.5", className)}>
      <p className="numeral-lg text-brand-navy tabular-nums">{formatNumber(value)}</p>
      <p className="caption text-ink-muted">{label}</p>
    </div>
  );
}
