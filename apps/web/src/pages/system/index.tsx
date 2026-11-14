import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { IndicatorSearch } from "@/components/layout/indicator-search";
import {
  LEVEL1_SECTIONS,
  SYSTEM_INDICATORS,
  SYSTEM_L1,
  SYSTEM_L2,
  SYSTEM_NOTE,
  SYSTEM_PHASE1,
  SYSTEM_TOTAL,
  type SystemIndicator,
} from "@/content/system-v3";
import { showDemoChrome } from "@/lib/demo-chrome";

const FREQ_TONE = {
  日: "warning",
  月: "info",
  季: "info",
  年: "neutral",
} as const;

/** 一期内示意「已有数据」的序号 */
const HAS_DATA = new Set(["01", "02", "05", "06", "38"]);

export default function SystemPage() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim().toLowerCase() ?? "";
  const [phase1Only, setPhase1Only] = useState(false);
  const [withDataOnly, setWithDataOnly] = useState(false);

  const filtered = useMemo(() => {
    return SYSTEM_INDICATORS.filter((row) => {
      if (phase1Only && !row.phase1) return false;
      if (withDataOnly && !HAS_DATA.has(row.seq)) return false;
      if (!q) return true;
      const hay = `${row.seq} ${row.name} ${row.source} ${row.level1} ${row.level2}`.toLowerCase();
      return hay.includes(q);
    });
  }, [q, phase1Only, withDataOnly]);

  const byLevel1 = useMemo(
    () =>
      LEVEL1_SECTIONS.map((s) => ({
        ...s,
        items: filtered.filter((i) => i.level1 === s.name),
      })).filter((s) => s.items.length > 0),
    [filtered],
  );

  const columns: DataTableColumn<SystemIndicator>[] = [
    { key: "seq", title: "序号", type: "code" },
    { key: "name", title: "三级指标", primary: true, cell: (r) => <TextLink to={`/system/${r.seq}`}>{r.name}</TextLink> },
    { key: "unit", title: "计量单位" },
    {
      key: "frequency",
      title: "频度",
      type: "status",
      cell: (r) => (
        <Tag size="sm" tone={FREQ_TONE[r.frequency as keyof typeof FREQ_TONE] ?? "neutral"}>
          {r.frequency}
        </Tag>
      ),
    },
    { key: "source", title: "数据来源" },
    {
      key: "phase1",
      title: "一期",
      cell: (r) =>
        r.phase1 ? (
          <Tag size="sm" tone="info">
            一期
          </Tag>
        ) : (
          <span className="caption text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="grid gap-5 border-b border-border pb-8 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          <h1 className="inline-flex w-fit max-w-full items-center bg-brand-navy py-2 pr-12 pl-6 title-section text-on-brand clip-slash">
            指标体系 V3.0
          </h1>
          <p className="max-w-3xl body-lg text-ink">
            面向产业研究与决策支持的监测框架：按一级、二级组织三级监测项，说明计量单位、更新频度与数据来源。
          </p>
          <IndicatorSearch className="max-w-md" defaultQuery={params.get("q") ?? ""} autoFocus={Boolean(q)} />
          <div className="border-t-2 border-brand-navy pt-4">
            <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
              <Stat label="一级指标" value={SYSTEM_L1} />
              <Stat label="二级指标" value={SYSTEM_L2} />
              <Stat label="三级指标" value={SYSTEM_TOTAL} />
              <Stat label="一期计划" value={SYSTEM_PHASE1} hint={`本页收录 ${SYSTEM_INDICATORS.length} 项`} />
            </div>
          </div>
          <p className="caption text-ink-muted">{SYSTEM_NOTE}</p>
        </div>
        <aside className="border border-border bg-info-bg p-4 lg:self-start">
          <h2 className="mb-2 title-nav text-brand-navy">图例</h2>
          <ul className="grid gap-2 caption text-ink">
            <li className="flex items-center gap-2">
              <Tag size="sm" tone="warning">
                日
              </Tag>
              日更或近实时整理
            </li>
            <li className="flex items-center gap-2">
              <Tag size="sm" tone="info">
                月 / 季
              </Tag>
              定期发布
            </li>
            <li className="flex items-center gap-2">
              <Tag size="sm" tone="info">
                一期
              </Tag>
              当前阶段优先入库
            </li>
          </ul>
        </aside>
      </header>

      {q && (
        <p className="body-sm text-ink-muted" role="status">
          检索「{params.get("q")}」共 {filtered.length} 项
          {filtered.length === 0 && (
            <>
              。可尝试{" "}
              <TextLink to="/indicators" className="body-sm">
                工程目录
              </TextLink>{" "}
              按簇浏览。
            </>
          )}
        </p>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        <nav
          aria-label="一级指标"
          className="shrink-0 border border-border bg-surface-sunken p-3 lg:sticky lg:top-20 lg:w-56 lg:self-start"
        >
          <p className="mb-2 px-2 caption text-ink-muted">目录</p>
          <fieldset className="mb-3 grid gap-1 border-b border-border px-2 pb-3">
            <legend className="sr-only">筛选</legend>
            <label className="flex cursor-pointer items-center gap-2 body-sm text-ink">
              <input
                type="checkbox"
                checked={phase1Only}
                onChange={(e) => setPhase1Only(e.target.checked)}
                className="size-4 accent-brand-navy"
              />
              仅一期指标
            </label>
            <label className="flex cursor-pointer items-center gap-2 body-sm text-ink">
              <input
                type="checkbox"
                checked={withDataOnly}
                onChange={(e) => setWithDataOnly(e.target.checked)}
                className="size-4 accent-brand-navy"
              />
              已有数据
            </label>
          </fieldset>
          <ul className="grid gap-0.5">
            {LEVEL1_SECTIONS.map((s) => {
              const count = filtered.filter((i) => i.level1 === s.name).length;
              if (count === 0) return null;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 body text-ink transition-colors hover:bg-info-bg hover:text-brand-navy focus-ring-inset"
                  >
                    <span className="min-w-0 truncate">{s.name.replace(/^[一二三四五六]、/, "")}</span>
                    <span className="caption tabular-nums text-ink-muted">{count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 grid gap-12">
          {byLevel1.length === 0 ? (
            <p className="body text-ink-muted">没有符合筛选条件的指标。</p>
          ) : (
            byLevel1.map((section) => {
              const l2Count = new Set(section.items.map((i) => i.level2)).size;
              return (
                <section key={section.id} id={section.id} className="grid scroll-mt-24 gap-5">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-brand-navy pb-2">
                    <h2 className="title-sub text-brand-navy">{section.name}</h2>
                    <p className="caption text-ink-muted">
                      二级 {l2Count} 项 · 三级 {section.items.length} 项
                    </p>
                  </div>
                  {groupByLevel2(section.items).map(([l2, rows]) => (
                    <div key={l2} className="grid gap-2">
                      <h3 className="title-nav text-ink">
                        {l2}
                        <span className="ml-2 caption font-normal text-ink-muted">{rows.length} 项</span>
                      </h3>
                      <DataTable
                        caption={`${l2}三级指标`}
                        columns={columns}
                        data={rows}
                        getRowId={(r) => r.seq}
                        dense
                      />
                    </div>
                  ))}
                </section>
              );
            })
          )}
          {showDemoChrome() && (
            <p className="body-sm text-ink-muted">
              工程元数据仍可在{" "}
              <TextLink to="/indicators" className="body-sm">
                指标目录
              </TextLink>{" "}
              按簇浏览。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="px-3 first:pl-0">
      <p className="numeral-lg text-brand-navy tabular-nums">{formatNumber(value)}</p>
      <p className="caption text-ink-muted">{label}</p>
      {hint && <p className="caption text-ink-muted">{hint}</p>}
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