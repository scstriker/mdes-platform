import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { IndicatorSearch } from "@/components/layout/indicator-search";
import {
  DATA_FORM_LABEL,
  LEVEL1_SECTIONS,
  SYSTEM_INDICATORS,
  SYSTEM_L1,
  SYSTEM_L2,
  SYSTEM_NOTE,
  SYSTEM_PHASE1,
  SYSTEM_TOTAL,
  type DataForm,
  type IndicatorPhase,
  type SystemIndicator,
} from "@/content/system-v3";
import { cn } from "@/lib/utils";

const FORM_FILTERS: readonly { key: DataForm; label: string }[] = [
  { key: "stat", label: "含数值统计" },
  { key: "detail", label: "含对象明细" },
  { key: "text", label: "含结构化文本" },
];

function renderPhaseCell(phase: IndicatorPhase) {
  if (phase === "phase1") {
    return (
      <Tag size="sm" tone="info">
        一期
      </Tag>
    );
  }
  if (phase === "partial") {
    return (
      <Tag size="sm" tone="neutral">
        部分
      </Tag>
    );
  }
  return <span className="caption text-ink-muted">二期</span>;
}

export default function SystemPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawQuery = params.get("q")?.trim() ?? "";
  const q = rawQuery.toLowerCase();
  const l1Target = params.get("l1") ?? "";

  const [phase1Only, setPhase1Only] = useState(false);
  const [selectedForms, setSelectedForms] = useState<DataForm[]>([]);
  const [activeId, setActiveId] = useState<string>(LEVEL1_SECTIONS[0]?.id ?? "l1-reg");

  const filtered = useMemo(() => {
    return SYSTEM_INDICATORS.filter((row) => {
      if (phase1Only && !row.phase1) return false;
      if (selectedForms.length > 0 && !selectedForms.every((f) => row.dataForms.includes(f))) {
        return false;
      }
      if (!q) return true;
      const hay = `${row.seq} ${row.name} ${row.source} ${row.level1} ${row.level2} ${row.recordWhat} ${row.v12Codes.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [q, phase1Only, selectedForms]);

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
    setPhase1Only(false);
    setSelectedForms([]);
    if (rawQuery) {
      navigate("/system");
    }
  }

  const hasActiveFilter = Boolean(rawQuery) || phase1Only || selectedForms.length > 0;

  const columns: DataTableColumn<SystemIndicator>[] = useMemo(
    () => [
      { key: "seq", title: "序号", type: "code", colClassName: "w-14" },
      {
        key: "name",
        title: "三级指标",
        primary: true,
        cell: (r) => <TextLink to={`/system/${r.seq}`}>{r.name}</TextLink>,
      },
      {
        key: "dataForms",
        title: "数据形态",
        colClassName: "w-28",
        cell: (r) => <span className="body-sm text-ink-muted">{r.dataForms.map((f) => DATA_FORM_LABEL[f]).join("·")}</span>,
      },
      { key: "unit", title: "计量单位", colClassName: "w-24" },
      {
        key: "frequency",
        title: "频度",
        colClassName: "w-16",
        cell: (r) => <span className="body-sm text-ink-muted">{r.frequency}</span>,
      },
      { key: "source", title: "数据来源", colClassName: "w-44" },
      {
        key: "phase",
        title: "阶段",
        colClassName: "w-20",
        cell: (r) => renderPhaseCell(r.phase),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="grid gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-1.5">
            <p className="caption text-ink-muted">方法论与数据字典</p>
            <h1 className="title-page text-brand-navy">指标目录（V3.0）</h1>
            <p className="max-w-3xl body text-ink">
              按 6 大业务领域、14 个二级分类组织全部 33 项三级指标，明确计量单位、数据形态、更新频度与权威来源。
            </p>
          </div>
          <IndicatorSearch className="w-full lg:w-80 shrink-0" defaultQuery={rawQuery} autoFocus={Boolean(q)} />
        </div>

        <div className="grid gap-2.5">
          <div className="border-t-2 border-brand-navy border-b border-border py-4">
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-border lg:grid-cols-5">
              <SummaryStat label="一级业务领域" value={SYSTEM_L1} className="pr-4" />
              <SummaryStat label="二级指标分类" value={SYSTEM_L2} className="sm:px-5" />
              <SummaryStat label="三级监测指标" value={SYSTEM_TOTAL} className="pr-4 sm:px-5" />
              <SummaryStat label="一期纳入（含1项部分）" value={SYSTEM_PHASE1} className="sm:pl-5 lg:px-5" />
              <div className="col-span-2 flex flex-col justify-between gap-1 border-t border-border pt-3 sm:col-span-4 lg:col-span-1 lg:border-t-0 lg:pt-0 lg:pl-5">
                <p className="caption text-ink-muted">底层工程与观测直达</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 body-sm">
                  <TextLink to="/indicators">底层工程指标库</TextLink>
                  <TextLink to="/observations">原始观测值查询</TextLink>
                </div>
              </div>
            </div>
          </div>
          <p className="caption text-ink-muted">{SYSTEM_NOTE}</p>
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
            <label className="flex cursor-pointer items-center gap-2 body-sm text-ink">
              <input
                type="checkbox"
                checked={phase1Only}
                onChange={(e) => setPhase1Only(e.target.checked)}
                className="size-4 accent-brand-navy"
              />
              仅看一期纳入
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
          {byLevel1.length === 0 ? (
            <div className="grid gap-2 border-y border-border py-8">
              <p className="body text-ink">没有符合当前检索与筛选条件的三级指标。</p>
              <p className="body-sm text-ink-muted">
                可尝试放宽左侧筛选条件，或前往{" "}
                <TextLink inline to="/indicators" className="body-sm">
                  底层工程指标库
                </TextLink>{" "}
                按工程编码检索。
              </p>
            </div>
          ) : (
            byLevel1.map((section) => {
              const l2Count = new Set(section.items.map((i) => i.level2)).size;
              return (
                <section key={section.id} id={section.id} className="grid scroll-mt-24 gap-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-brand-navy pb-2">
                    <h2 className="title-section text-brand-navy">{section.name}</h2>
                    <p className="caption text-ink-muted">
                      二级 {l2Count} 项 · 三级 {section.items.length} 项
                      <TextLink to={section.subpageHref} className="body-sm ml-2">
                        {section.subpageLabel} →
                      </TextLink>
                    </p>
                  </div>

                  {groupByLevel2(section.items).map(([l2, rows]) => (
                    <div key={l2} className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="title-nav text-ink">{l2}</h3>
                        <span className="caption tabular-nums text-ink-muted">{rows.length} 项</span>
                      </div>
                      <DataTable
                        caption={`${l2}三级指标`}
                        columns={columns}
                        data={rows}
                        getRowId={(r) => r.seq}
                        fixedLayout
                        dense
                      />
                    </div>
                  ))}
                </section>
              );
            })
          )}
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

function groupByLevel2(items: SystemIndicator[]) {
  const map = new Map<string, SystemIndicator[]>();
  for (const item of items) {
    const list = map.get(item.level2) ?? [];
    list.push(item);
    map.set(item.level2, list);
  }
  return [...map.entries()];
}
