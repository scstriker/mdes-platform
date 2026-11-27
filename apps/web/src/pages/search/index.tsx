import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { detectCatalogAliasCorrection, V2_SEED_CATALOG_RECORDS } from "@mdes/shared";
import { IconArrowRight, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { EmptyState, formatNumber, Notice, Tag, TextLink } from "@/components/itei";
import { useGlobalSearch, useTradeOverview } from "@/lib/api";
import {
  buildPublicSearchUrl,
  mapObservationHitToSuggestion,
  PUBLIC_SCOPES,
  queryAllPublicGrouped,
  type PublicScopeParam,
  type SearchSuggestionItem,
} from "@/lib/search/search-index";
import { cn } from "@/lib/utils";

const VALID_SCOPE_PARAMS = new Set<PublicScopeParam>([
  "all",
  "statistics",
  "markets",
  "products",
  "enterprises",
  "trade",
  "reports",
  "system",
  "observations",
]);

function parseScopeParam(raw: string | null): PublicScopeParam {
  if (raw && VALID_SCOPE_PARAMS.has(raw as PublicScopeParam)) {
    return raw as PublicScopeParam;
  }
  return "all";
}

const SUBPAGE_TABLE_ANCHOR: Record<string, string> = {
  "/statistics": "",
  "/markets": "",
  "/products": "",
  "/enterprises": "",
  "/trade": "#trade-directory-heading",
  "/reports": "",
  "/system": "",
};

/**
 * 独立全站搜索结果页（/search?q=...&scope=...&item=...）：
 * - 纯粹呈现检索结果列表、一等公民直达链接与结构化档案详情，零宏观装饰大图或统计图表画布干扰；
 * - 完整合并本地种子与服务端 D1 `v2_hits`（统计成果、产品型号、注册证、机构、政策、标准、来源）；
 * - 对废止/误写标准号（如 GB 9706.233-2020 -> YY 9706.233-2021）给出显式纠偏横幅。
 */
export default function GlobalSearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const activeScope = parseScopeParam(params.get("scope"));
  const focusedItemId = params.get("item") ?? "";

  const liveTrade = useTradeOverview(undefined, undefined, true);
  const liveSearch = useGlobalSearch(q, 30, q.length > 0);

  const aliasCorrection = useMemo(
    () => detectCatalogAliasCorrection(q, V2_SEED_CATALOG_RECORDS),
    [q],
  );

  const { total: benchmarkTotal, allGroups, groups } = useMemo(
    () => queryAllPublicGrouped(q, liveTrade.data, liveSearch.data?.v2_hits),
    [q, liveTrade.data, liveSearch.data?.v2_hits],
  );

  const liveObsTotal = q ? (liveSearch.data?.observations.total ?? 0) : 0;
  const liveObsItems = useMemo(
    () =>
      q
        ? (liveSearch.data?.observations.items ?? []).map((hit) =>
            mapObservationHitToSuggestion(hit, q),
          )
        : [],
    [q, liveSearch.data],
  );

  const combinedTotal = benchmarkTotal + liveObsTotal;
  const hotQueries = PUBLIC_SCOPES[0].hotQueries;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusedItemId ? new Set([focusedItemId]) : new Set(),
  );

  useEffect(() => {
    if (!focusedItemId) return;
    setExpandedIds((prev) => {
      if (prev.has(focusedItemId)) return prev;
      const next = new Set(prev);
      next.add(focusedItemId);
      return next;
    });
  }, [focusedItemId]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectScopeTab(nextScope: PublicScopeParam) {
    const next = new URLSearchParams(params);
    if (nextScope === "all") next.delete("scope");
    else next.set("scope", nextScope);
    next.delete("item");
    setParams(next, { replace: true });
  }

  const scopeTabs: { key: PublicScopeParam; label: string; count: number }[] = [
    { key: "all", label: "全部结果", count: combinedTotal },
    ...allGroups.map((g) => ({
      key: g.param as PublicScopeParam,
      label: g.label,
      count: g.items.length,
    })),
    ...(liveObsTotal > 0 || activeScope === "observations"
      ? [{ key: "observations" as const, label: "实时入库观测", count: liveObsTotal }]
      : []),
  ];

  function prioritizeFocused(items: readonly SearchSuggestionItem[]): SearchSuggestionItem[] {
    if (!focusedItemId) return [...items];
    const idx = items.findIndex((i) => i.id === focusedItemId);
    if (idx <= 0) return [...items];
    const copy = [...items];
    const [target] = copy.splice(idx, 1);
    copy.unshift(target!);
    return copy;
  }

  // 若 URL 带有 ?item=xxx，将命中词条所在的分组置于最前，确保 /search?item=rep-ann-28 首屏即见
  const orderedGroups = useMemo(() => {
    if (!focusedItemId) return groups;
    const idx = groups.findIndex((g) => g.items.some((i) => i.id === focusedItemId));
    if (idx <= 0) return groups;
    const copy = [...groups];
    const [target] = copy.splice(idx, 1);
    copy.unshift(target!);
    return copy;
  }, [groups, focusedItemId]);

  const singleGroup =
    activeScope !== "all" && activeScope !== "observations"
      ? allGroups.find((g) => g.param === activeScope) ?? null
      : null;

  const autoExpandAll =
    (q.length > 0 && combinedTotal > 0 && combinedTotal <= 4) ||
    (singleGroup !== null && singleGroup.items.length > 0 && singleGroup.items.length <= 3);

  function resolveDirectActionLabel(item: SearchSuggestionItem): string {
    if (item.scope === "/statistics") return "打开统计工作台";
    if (item.scope === "/system") return "查看指标规范";
    if (item.subpageHref?.startsWith("/products/")) return "查看型号详情";
    if (item.subpageHref?.startsWith("/enterprises/")) return "查看企业档案";
    if (item.subpageHref?.startsWith("/reports/")) return "阅读报告正文";
    if (item.subpageHref?.startsWith("/regulation/registrations")) return "前往注册准入核验";
    if (item.subpageHref?.startsWith("/institutions")) return "前往机构名录核验";
    if (item.subpageHref?.startsWith("/standards")) return "前往技术标准核验";
    if (item.subpageHref?.startsWith("/policies")) return "前往产业政策条款";
    if (item.subpageHref?.startsWith("/sources")) return "前往官方来源核验";
    if (item.subpageHref?.startsWith("/technologies")) return "查看技术路线";
    if (item.subpageHref?.startsWith("/markets")) return "前往市场招采核验";
    return `进入${item.scopeLabel}`;
  }

  function renderResultItem(item: SearchSuggestionItem, isLive = false) {
    const isExpanded = autoExpandAll || expandedIds.has(item.id);
    const isFocused = focusedItemId === item.id;
    const directTarget = item.subpageHref;

    return (
      <li
        key={item.id}
        id={`search-hit-${item.id}`}
        className={cn(
          "transition-colors",
          isFocused && "border-l-2 border-l-brand-navy bg-info-bg/40",
        )}
      >
        <div className="px-3 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {directTarget ? (
                  <Link
                    to={directTarget}
                    className="body font-semibold text-brand-navy hover:underline focus-ring"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className="body font-semibold text-brand-navy">{item.title}</span>
                )}
                <Tag size="sm" tone={isLive ? "success" : "info"}>
                  {item.badge}
                </Tag>
                {activeScope === "all" && !isLive && (
                  <span className="caption text-ink-muted">{item.scopeLabel}</span>
                )}
              </div>
              <p className="body-sm text-ink-muted">{item.subtitle}</p>
              {item.aliasNote && (
                <p className="caption font-semibold text-warning">{item.aliasNote}</p>
              )}
            </div>

            <div className="mt-0.5 flex shrink-0 flex-wrap items-center gap-3">
              {directTarget && (
                <TextLink
                  to={directTarget}
                  className="inline-flex items-center gap-1 caption font-semibold"
                >
                  {resolveDirectActionLabel(item)}
                  <IconArrowRight size={13} aria-hidden="true" />
                </TextLink>
              )}
              {item.fields && item.fields.length > 0 && (
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(item.id)}
                  className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-ink-muted hover:text-brand-navy focus-ring"
                >
                  {isExpanded ? (
                    <>
                      收起摘要
                      <IconChevronUp size={15} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      展开摘要
                      <IconChevronDown size={15} aria-hidden="true" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {isExpanded && item.fields && item.fields.length > 0 && (
            <div className="mt-3 grid gap-3 border-t border-border bg-surface-sunken px-3.5 py-3">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {item.fields.map((f) => (
                  <div
                    key={f.label}
                    className={cn(
                      "grid gap-0.5",
                      f.value.length > 36 && "sm:col-span-2",
                    )}
                  >
                    <dt className="caption text-ink-muted">{f.label}</dt>
                    <dd className="body-sm text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {directTarget && (
                <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-2">
                  <TextLink to={directTarget} className="inline-flex items-center gap-1 body-sm">
                    {resolveDirectActionLabel(item)}
                    <IconArrowRight size={14} aria-hidden="true" />
                  </TextLink>
                </div>
              )}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="title-page text-brand-navy">
            {q ? `「${q}」的搜索结果` : "全站跨库检索"}
          </h1>
          <p className="body-sm text-ink-muted">
            {q ? (
              <>
                共命中{" "}
                <strong className="font-semibold tabular-nums text-ink">{formatNumber(combinedTotal)}</strong>{" "}
                条记录（统计成果、权威名录与指标口径{" "}
                <span className="tabular-nums text-ink">{formatNumber(benchmarkTotal)}</span> 条
                {liveSearch.isPending ? (
                  <span> · 同步实时库中…</span>
                ) : (
                  <>
                    {" "}
                    · 实时入库观测 <span className="tabular-nums text-ink">{formatNumber(liveObsTotal)}</span> 条
                  </>
                )}
                ）
              </>
            ) : (
              "覆盖标准统计成果、产品型号、注册准入、重点企业与检验临床机构、海关 HS 税号、政策标准与官方来源"
            )}
          </p>
        </div>

        {/* 搜索结果页内分栏切换条 */}
        <div
          role="tablist"
          aria-label="搜索结果领域筛选"
          className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border"
        >
          {scopeTabs.map((tab) => {
            const selected = activeScope === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectScopeTab(tab.key)}
                className={cn(
                  "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 py-2.5 body-sm transition-colors focus-ring",
                  selected
                    ? "border-brand-navy font-semibold text-brand-navy"
                    : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                <span>{tab.label}</span>
                <span className="caption tabular-nums text-ink-muted">({formatNumber(tab.count)})</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 误写或废止标准/文号纠偏横幅 */}
      {aliasCorrection && (
        <Notice
          tone="warning"
          title={`编码核验提示：「${aliasCorrection.queried}」现行有效规范条目为 ${aliasCorrection.canonical_code}（${aliasCorrection.canonical_title}）`}
          action={
            <TextLink
              to={`/standards?q=${encodeURIComponent(aliasCorrection.queried)}`}
              className="body-sm font-semibold"
            >
              前往技术标准核验页 →
            </TextLink>
          }
        >
          {aliasCorrection.explanation}
        </Notice>
      )}

      {q && combinedTotal === 0 && !liveSearch.isPending ? (
        <EmptyState
          title={`未找到与「${q}」直接匹配的记录`}
          description="请尝试输入产品型号（如 uMR Jupiter）、注册证号、标准号（如 YY 9706.233-2021）或企业机构简称。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hotQueries.map((h) => (
                <Link
                  key={h.label}
                  to={buildPublicSearchUrl({ q: h.query })}
                  className="border border-border bg-surface-sunken px-3 py-1.5 body-sm text-brand-navy hover:border-brand-navy hover:bg-info-bg focus-ring"
                >
                  {h.label}
                </Link>
              ))}
            </div>
          }
        />
      ) : activeScope === "observations" ? (
        <section id="group-live-observations" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="title-sub text-ink">
                实时入库观测记录{" "}
                <span className="body-sm font-normal tabular-nums text-ink-muted">
                  （共 {formatNumber(liveObsTotal)} 条）
                </span>
              </h2>
              <Tag size="sm" tone="success">
                动态数据库
              </Tag>
            </div>
            {q && liveObsTotal > 0 && (
              <TextLink to={`/admin/observations?q=${encodeURIComponent(q)}`}>
                前往观测值核查台查阅全部 {formatNumber(liveObsTotal)} 条 →
              </TextLink>
            )}
          </div>
          {liveObsItems.length === 0 ? (
            <EmptyState
              title="当前检索词未命中实时入库观测记录"
              description="可切换至「全部结果」查阅各专题名录与标准统计成果。"
            />
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {prioritizeFocused(liveObsItems).map((item) => renderResultItem(item, true))}
            </ul>
          )}
        </section>
      ) : singleGroup ? (
        <section id={`group-${singleGroup.scope.slice(1)}`} className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="title-sub text-ink">
                {singleGroup.label}{" "}
                <span className="body-sm font-normal tabular-nums text-ink-muted">
                  （共 {formatNumber(singleGroup.items.length)} 条）
                </span>
              </h2>
              <Tag size="sm" tone="neutral">
                {singleGroup.scope === "/system"
                  ? "指标口径库"
                  : singleGroup.scope === "/statistics"
                    ? "标准统计对象"
                    : "权威实体与名录"}
              </Tag>
            </div>
            {q && singleGroup.items.length > 0 && (
              <TextLink
                to={`${singleGroup.scope}?q=${encodeURIComponent(q)}${SUBPAGE_TABLE_ANCHOR[singleGroup.scope] ?? ""}`}
              >
                进入{singleGroup.label}深入筛选 →
              </TextLink>
            )}
          </div>
          {singleGroup.items.length === 0 ? (
            <EmptyState
              title={`「${singleGroup.label}」下没有匹配「${q}」的记录`}
              description="可切换顶部「全部结果」页签查看其他业务领域命中结果。"
            />
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {prioritizeFocused(singleGroup.items).map((item) => renderResultItem(item))}
            </ul>
          )}
        </section>
      ) : (
        <div className="grid gap-8">
          {/* 动态入库观测记录分组 */}
          {liveObsTotal > 0 && (
            <section
              id="group-live-observations"
              className="grid gap-3 border-t-2 border-brand-navy pt-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="title-sub text-ink">
                    实时入库观测记录{" "}
                    <span className="body-sm font-normal tabular-nums text-ink-muted">
                      （共 {formatNumber(liveObsTotal)} 条）
                    </span>
                  </h2>
                  <Tag size="sm" tone="success">
                    动态数据库
                  </Tag>
                </div>
                {q && (
                  <TextLink to={`/admin/observations?q=${encodeURIComponent(q)}`}>
                    前往观测值核查台查阅全部 {formatNumber(liveObsTotal)} 条 →
                  </TextLink>
                )}
              </div>

              <ul className="divide-y divide-border border-y border-border">
                {prioritizeFocused(liveObsItems)
                  .slice(0, 8)
                  .map((item) => renderResultItem(item, true))}
              </ul>
            </section>
          )}

          {/* 统计成果库、各领域权威实体与指标口径分组 */}
          {orderedGroups.map((group) => {
            const ordered = prioritizeFocused(group.items);
            return (
              <section
                key={group.scope}
                id={`group-${group.scope.slice(1)}`}
                className="grid gap-3 border-t-2 border-brand-navy pt-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="title-sub text-ink">
                      {group.label}{" "}
                      <span className="body-sm font-normal tabular-nums text-ink-muted">
                        （共 {group.items.length} 条）
                      </span>
                    </h2>
                    <Tag size="sm" tone="neutral">
                      {group.scope === "/system"
                        ? "指标口径库"
                        : group.scope === "/statistics"
                          ? "标准统计对象"
                          : "权威实体与名录"}
                    </Tag>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {group.items.length > 6 && (
                      <button
                        type="button"
                        onClick={() => selectScopeTab(group.param)}
                        className="cursor-pointer body-sm font-semibold text-link hover:underline focus-ring"
                      >
                        在本页查看全部 {group.items.length} 条
                      </button>
                    )}
                    {q && (
                      <TextLink
                        to={`${group.scope}?q=${encodeURIComponent(q)}${SUBPAGE_TABLE_ANCHOR[group.scope] ?? ""}`}
                      >
                        进入{group.label}深入筛选 →
                      </TextLink>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-border border-y border-border">
                  {ordered.slice(0, 8).map((item) => renderResultItem(item))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
