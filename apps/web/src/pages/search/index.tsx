import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IconArrowRight, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { EmptyState, formatNumber, Tag, TextLink } from "@/components/itei";
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
  "/products": "#product-explorer-heading",
  "/enterprises": "#enterprise-directory-heading",
  "/trade": "#trade-directory-heading",
  "/reports": "#fig-reports-briefings",
  "/system": "",
};

/**
 * 独立全站搜索结果页（/search?q=...&scope=...&item=...）：
 * - 纯粹呈现检索结果列表与结构化档案详情，零宏观装饰大图或统计图表干扰，确保首屏直达命中条目；
 * - 支持在搜索页内按「全部 / 注册与产品 / 企业与机构 / 进出口贸易 / 政策与报告 / 指标目录 / 实时观测」切换分栏；
 * - 点击任意结果条目原地展开完整结构化字段，无需被迫跳转至栏目概览子页。
 */
export default function GlobalSearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const activeScope = parseScopeParam(params.get("scope"));
  const focusedItemId = params.get("item") ?? "";

  const liveTrade = useTradeOverview(undefined, undefined, true);
  const { total: benchmarkTotal, allGroups, groups } = useMemo(
    () => queryAllPublicGrouped(q, liveTrade.data),
    [q, liveTrade.data],
  );
  const liveSearch = useGlobalSearch(q, 30, q.length > 0);
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
      label: g.scope === "/system" ? "指标目录" : g.label,
      count: g.items.length,
    })),
    ...(liveObsTotal > 0 || activeScope === "observations"
      ? [{ key: "observations" as const, label: "实时入库观测", count: liveObsTotal }]
      : []),
  ];

  // 将 URL ?item= 命中的目标词条置顶于所属分组首位，确保从下拉联想点击进入时首行即可阅读详情
  function prioritizeFocused(items: readonly SearchSuggestionItem[]): SearchSuggestionItem[] {
    if (!focusedItemId) return [...items];
    const idx = items.findIndex((i) => i.id === focusedItemId);
    if (idx <= 0) return [...items];
    const copy = [...items];
    const [target] = copy.splice(idx, 1);
    copy.unshift(target);
    return copy;
  }

  const singleGroup =
    activeScope !== "all" && activeScope !== "observations"
      ? allGroups.find((g) => g.param === activeScope) ?? null
      : null;

  const autoExpandAll =
    (q.length > 0 && combinedTotal > 0 && combinedTotal <= 4) ||
    (singleGroup !== null && singleGroup.items.length > 0 && singleGroup.items.length <= 3);

  function renderResultItem(item: SearchSuggestionItem, isLive = false) {
    const isExpanded = autoExpandAll || expandedIds.has(item.id);
    const isFocused = focusedItemId === item.id;
    const isSystemProfile = item.scope === "/system" && item.subpageHref?.startsWith("/system/");

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
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => toggleExpand(item.id)}
            className="flex w-full cursor-pointer items-start justify-between gap-4 text-left focus-ring"
          >
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="body font-semibold text-brand-navy">{item.title}</span>
                <Tag size="sm" tone={isLive ? "success" : "info"}>
                  {item.badge}
                </Tag>
                {activeScope === "all" && !isLive && (
                  <span className="caption text-ink-muted">{item.scopeLabel}</span>
                )}
              </div>
              <p className="body-sm text-ink-muted">{item.subtitle}</p>
            </div>
            <span className="mt-1 inline-flex shrink-0 items-center gap-1 caption font-semibold text-link">
              {isExpanded ? (
                <>
                  收起详情
                  <IconChevronUp size={15} aria-hidden="true" />
                </>
              ) : (
                <>
                  展开详情
                  <IconChevronDown size={15} aria-hidden="true" />
                </>
              )}
            </span>
          </button>

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
              {item.subpageHref && (
                <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-2">
                  <TextLink to={item.subpageHref} className="inline-flex items-center gap-1 body-sm">
                    {isSystemProfile ? "查看完整指标规范档案" : `在「${item.scopeLabel}」多维筛选表中定位`}
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
                条记录（基准名录与指标口径{" "}
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
              "覆盖注册产品、重点企业与临床检验机构、海关 HS 税号、政策标准报告、指标口径及实时入库观测记录"
            )}
          </p>
        </div>

        {/* 搜索结果页内分栏切换条（点击原地过滤，不跳出搜索页） */}
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

      {q && combinedTotal === 0 && !liveSearch.isPending ? (
        <EmptyState
          title={`未找到与「${q}」直接匹配的记录`}
          description="请尝试缩短关键词（如搜器械核心词、企业简称、工程指标编码或 4 位 HS 编码），或直接选择下方热门检索词。"
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
              description="可切换至「全部结果」查阅各专题名录与指标口径。"
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
                {singleGroup.scope === "/system" ? "指标口径库" : "代表性基准名录"}
              </Tag>
            </div>
            {q && singleGroup.items.length > 0 && (
              <TextLink
                to={`${singleGroup.scope}?q=${encodeURIComponent(q)}${SUBPAGE_TABLE_ANCHOR[singleGroup.scope] ?? ""}`}
              >
                进入{singleGroup.label}专题库深入筛选 →
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
          {/* 动态入库观测记录分组（连接 D1 实时数据库） */}
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

          {/* 五大专题代表性基准名录与指标目录 */}
          {groups.map((group) => {
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
                      {group.scope === "/system" ? "指标口径库" : "代表性基准名录"}
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
                        进入{group.label}专题库深入筛选 →
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
