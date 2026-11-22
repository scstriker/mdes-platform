import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { IconArrowRight, IconChevronDown, IconSearch, IconSparkles, IconX } from "@tabler/icons-react";
import { Tag } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { floatingMotionClass, floatingPanelClass } from "@/components/ui/overlay";
import { useBatches, useGlobalSearch, useIndicators, useTradeOverview } from "@/lib/api";
import {
  ADMIN_SCOPES,
  buildPublicSearchUrl,
  PUBLIC_SCOPES,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
  type AdminSearchScope,
  type PublicSearchScope,
  type SearchSuggestionItem,
} from "@/lib/search/search-scopes";
import { cn } from "@/lib/utils";

type SearchIndexModule = typeof import("@/lib/search/search-index");

let cachedSearchIndex: SearchIndexModule | null = null;
let pendingSearchIndex: Promise<SearchIndexModule> | null = null;

function loadSearchIndex(): Promise<SearchIndexModule> {
  if (cachedSearchIndex) return Promise.resolve(cachedSearchIndex);
  if (!pendingSearchIndex) {
    pendingSearchIndex = import("@/lib/search/search-index").then((mod) => {
      cachedSearchIndex = mod;
      return mod;
    });
  }
  return pendingSearchIndex;
}

type ScopedSearchBarProps = {
  mode?: "public" | "admin";
  className?: string;
};

/**
 * 全站同轴常驻搜索栏（置于 AppHeader 正下方，1200px 轴线对齐）：
 * - 前台模式（public）：作为标准全站搜索引擎入口，在任意页面检索、选热词或点结果词条统一进入独立搜索结果页 `/search`（不跳入带宏观大图的栏目概览页）；
 * - 后台模式（admin）：面向数据治理表格，保留本栏实时筛选与当前页面查询参数（如 geo / indicator_id）。
 */
export function ScopedSearchBar({ mode = "public", className }: ScopedSearchBarProps) {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const scopeSelectId = useId();

  const publicScopeParam = pathname === "/search" ? searchParams.get("scope") : null;
  const urlQuery =
    mode === "admin"
      ? (searchParams.get("q") ?? "")
      : pathname === "/search"
        ? (searchParams.get("q") ?? "")
        : "";

  const defaultScope =
    mode === "admin"
      ? resolveDefaultAdminScope(pathname)
      : resolveDefaultPublicScope(pathname, publicScopeParam);

  const [scope, setScope] = useState<string>(defaultScope);
  const [query, setQuery] = useState<string>(urlQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [indexMod, setIndexMod] = useState<SearchIndexModule | null>(() => cachedSearchIndex);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const trimmed = query.trim();

  // 仅在打开建议面板时按需加载索引与实时接口，避免首屏静默拉取全站数据
  useEffect(() => {
    if (!open || indexMod) return;
    let active = true;
    void loadSearchIndex().then((mod) => {
      if (active) setIndexMod(mod);
    });
    return () => {
      active = false;
    };
  }, [open, indexMod]);

  const adminQueryEnabled = mode === "admin" && open && trimmed.length > 0;
  const adminIndicators = useIndicators({}, adminQueryEnabled);
  const adminBatches = useBatches(adminQueryEnabled);
  const livePublicSearch = useGlobalSearch(trimmed, 6, mode === "public" && open && trimmed.length > 0);
  const liveTrade = useTradeOverview(undefined, undefined, mode === "public" && open && trimmed.length > 0);

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  useEffect(() => {
    setQuery(urlQuery);
  }, [pathname, urlQuery]);

  // 点击外部收起下拉建议
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 全局 "/" 快捷键聚焦搜索框
  useEffect(() => {
    function onGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  const scopes = mode === "admin" ? ADMIN_SCOPES : PUBLIC_SCOPES;
  const activeMeta = scopes.find((s) => s.scope === scope) ?? scopes[0];
  const isDomainFiltered = mode === "public" && scope !== "/search";

  const suggestions = useMemo(() => {
    if (!indexMod || !trimmed) {
      return {
        scopedMatches: [] as SearchSuggestionItem[],
        liveMatches: [] as SearchSuggestionItem[],
        secondaryMatches: [] as SearchSuggestionItem[],
        secondaryTitle: "",
        globalTotal: 0,
        liveObsTotal: 0,
      };
    }

    if (mode === "public") {
      const pub = indexMod.queryPublicSuggestions(trimmed, scope as PublicSearchScope, liveTrade.data);
      const liveObsTotal = livePublicSearch.data?.observations.total ?? 0;
      const liveMatches = (livePublicSearch.data?.observations.items ?? [])
        .slice(0, 3)
        .map((hit) => indexMod.mapObservationHitToSuggestion(hit, trimmed));
      return {
        scopedMatches: pub.scopedMatches,
        liveMatches,
        secondaryMatches: pub.indicatorMatches,
        secondaryTitle: "关联指标口径与方法论",
        globalTotal: pub.globalTotal,
        liveObsTotal,
      };
    }

    const adm = indexMod.queryAdminSuggestions(trimmed, scope as AdminSearchScope, {
      indicators: adminIndicators.data,
      batches: adminBatches.data,
    });
    return {
      scopedMatches: adm.scopedMatches,
      liveMatches: [] as SearchSuggestionItem[],
      secondaryMatches: adm.crossMatches,
      secondaryTitle: "跨后台检索",
      globalTotal: adm.globalTotal,
      liveObsTotal: 0,
    };
  }, [
    indexMod,
    trimmed,
    mode,
    scope,
    livePublicSearch.data,
    liveTrade.data,
    adminIndicators.data,
    adminBatches.data,
  ]);

  function applyAdminSamePageQuery(nextVal: string, targetScope: string, pushHistory: boolean) {
    const next = new URLSearchParams(searchParams);
    const clean = nextVal.trim();
    if (clean) {
      next.set("q", clean);
      if (targetScope === "/admin/import" && next.has("seq")) {
        next.delete("seq");
      }
    } else {
      next.delete("q");
    }
    next.delete("page");
    const unchanged = next.toString() === searchParams.toString();
    setSearchParams(next, { replace: !pushHistory || unchanged });
  }

  function syncAdminLiveFilter(nextVal: string, targetScope: string) {
    if (mode === "admin" && pathname === targetScope) {
      applyAdminSamePageQuery(nextVal, targetScope, false);
    }
  }

  function handleInputChange(val: string) {
    setQuery(val);
    setOpen(true);
    setActiveIndex(-1);
    syncAdminLiveFilter(val, scope);
  }

  function navigatePublicSuggestion(item: SearchSuggestionItem) {
    setOpen(false);
    setActiveIndex(-1);
    if (item.scope === "/system" && item.href.startsWith("/system/")) {
      navigate(item.href);
      return;
    }
    const targetScope = item.id.startsWith("live-obs-")
      ? "observations"
      : (item.scope as PublicSearchScope);
    navigate(
      buildPublicSearchUrl({
        q: trimmed || item.title,
        scope: targetScope,
        item: item.id,
      }),
    );
  }

  function executeSearch(rawTerm: string, targetScope = scope) {
    const term = rawTerm.trim();
    setOpen(false);
    setActiveIndex(-1);

    // 前台公开门户：统一进入独立搜索结果页 /search，彻底杜绝跳入带宏观大图的栏目子页
    if (mode === "public") {
      navigate(
        buildPublicSearchUrl({
          q: term,
          scope: targetScope as PublicSearchScope,
        }),
      );
      return;
    }

    // 后台治理模式：同页保留当前筛选条件，跨页携带 q 跳转对应后台模块
    if (pathname === targetScope) {
      applyAdminSamePageQuery(term, targetScope, true);
      return;
    }

    if (!term) {
      navigate(targetScope);
      return;
    }

    navigate(`${targetScope}?q=${encodeURIComponent(term)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    executeSearch(query, scope);
  }

  function clearInput() {
    setQuery("");
    if (mode === "admin") {
      syncAdminLiveFilter("", scope);
    } else if (pathname === "/search") {
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      next.delete("item");
      setSearchParams(next, { replace: true });
    }
    inputRef.current?.focus();
    setOpen(true);
  }

  function widenToGlobal() {
    setScope("/search");
    if (mode === "public" && pathname === "/search") {
      const next = new URLSearchParams(searchParams);
      next.delete("scope");
      next.delete("item");
      setSearchParams(next, { replace: true });
    }
    inputRef.current?.focus();
    setOpen(true);
  }

  // 组装可键盘上下导航的扁平建议项引用顺序
  const flatActions = useMemo(() => {
    if (!trimmed) {
      return activeMeta.hotQueries.map((h) => ({
        type: "hot" as const,
        label: h.label,
        onSelect: () => {
          setQuery(h.query);
          if (h.href) {
            setOpen(false);
            navigate(h.href);
          } else {
            executeSearch(h.query, scope);
          }
        },
      }));
    }
    const items: { type: "item" | "live" | "secondary" | "global"; label: string; onSelect: () => void }[] = [
      ...suggestions.scopedMatches.map((m) => ({
        type: "item" as const,
        label: m.title,
        onSelect: () => {
          if (mode === "public") {
            navigatePublicSuggestion(m);
          } else {
            setOpen(false);
            navigate(m.href);
          }
        },
      })),
      ...suggestions.liveMatches.map((m) => ({
        type: "live" as const,
        label: m.title,
        onSelect: () => navigatePublicSuggestion(m),
      })),
      ...suggestions.secondaryMatches.map((m) => ({
        type: "secondary" as const,
        label: m.title,
        onSelect: () => {
          if (mode === "public") {
            navigatePublicSuggestion(m);
          } else {
            setOpen(false);
            navigate(m.href);
          }
        },
      })),
    ];
    if (mode === "public") {
      items.push({
        type: "global" as const,
        label: `查看「${trimmed}」的全部搜索结果`,
        onSelect: () => executeSearch(trimmed, "/search"),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, activeMeta, suggestions, mode, scope]);

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Backspace" && query === "" && isDomainFiltered) {
      widenToGlobal();
      return;
    }
    if (e.key === "ArrowDown" && flatActions.length > 0) {
      e.preventDefault();
      setOpen(true);
      const next = activeIndex + 1 >= flatActions.length ? 0 : activeIndex + 1;
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
    }
  }

  function onSuggestionKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = idx + 1 >= flatActions.length ? 0 : idx + 1;
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx === 0) {
        setActiveIndex(-1);
        inputRef.current?.focus();
      } else {
        const prev = idx - 1;
        setActiveIndex(prev);
        optionRefs.current[prev]?.focus();
      }
    }
  }

  const liveOffset = suggestions.scopedMatches.length;
  const secondaryOffset = liveOffset + suggestions.liveMatches.length;
  const globalActionIndex = secondaryOffset + suggestions.secondaryMatches.length;

  return (
    <section
      aria-label={mode === "admin" ? "后台范围检索" : "全站搜索"}
      className={cn("border-b border-border bg-surface", className)}
    >
      <div
        ref={containerRef}
        className={cn(
          "relative mx-auto w-full",
          mode === "admin" ? "px-4 py-3 md:px-8" : "max-w-content px-4 py-3.5 md:px-8",
        )}
      >
        <form onSubmit={onSubmit} role="search" className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {/* 左侧范围选择器 */}
          <div className="relative shrink-0 sm:w-42">
            <label htmlFor={scopeSelectId} className="sr-only">
              检索范围
            </label>
            <select
              id={scopeSelectId}
              aria-label="检索范围"
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value;
                setScope(nextScope);
                if (mode === "public" && pathname === "/search") {
                  navigate(
                    buildPublicSearchUrl({
                      q: query,
                      scope: nextScope as PublicSearchScope,
                    }),
                    { replace: true },
                  );
                } else {
                  setOpen(true);
                  syncAdminLiveFilter(query, nextScope);
                }
              }}
              className="h-10 w-full cursor-pointer appearance-none rounded-sm border border-border-strong bg-surface-sunken pr-8 pl-3 body-sm font-semibold text-brand-navy focus-ring"
            >
              {scopes.map((s) => (
                <option key={s.scope} value={s.scope}>
                  {s.label}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted"
            />
          </div>

          {/* 中部关键词输入框 */}
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-sm border border-border-strong bg-surface px-2.5 focus-within:border-brand-navy">
            <IconSearch size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            {isDomainFiltered && (
              <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-info-bg px-2 py-0.5 caption font-semibold text-brand-navy">
                <span>领域：{activeMeta.shortLabel}</span>
                <button
                  type="button"
                  onClick={widenToGlobal}
                  aria-label="解除领域范围限制"
                  title="解除领域范围限制"
                  className="inline-flex cursor-pointer items-center text-brand-navy hover:text-brand-red focus-ring"
                >
                  <IconX size={13} aria-hidden="true" />
                </button>
              </span>
            )}
            <label htmlFor="system-indicator-search" className="sr-only">
              检索关键词
            </label>
            <input
              ref={inputRef}
              id="system-indicator-search"
              name="q"
              type="search"
              autoComplete="off"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={activeMeta.placeholder}
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 body text-ink outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={clearInput}
                aria-label="清空输入内容"
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center text-ink-muted hover:text-ink focus-ring"
              >
                <IconX size={16} aria-hidden="true" />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="hidden shrink-0 border border-border bg-surface-sunken px-1.5 py-0.5 code text-ink-muted lg:inline-block"
              >
                /
              </kbd>
            )}
          </div>

          <Button type="submit" className="h-10 shrink-0 px-5">
            <IconSearch size={17} aria-hidden="true" />
            检索
          </Button>
        </form>

        {/* 弹出式搜索建议面板 */}
        {open && (
          <div
            role="region"
            aria-label="搜索建议"
            className={cn(
              floatingPanelClass,
              floatingMotionClass,
              "absolute right-4 left-4 z-(--z-dropdown) mt-1.5 md:right-8 md:left-8",
            )}
          >
            {!trimmed ? (
              <div className="grid gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 label text-brand-navy">
                    <IconSparkles size={15} aria-hidden="true" />
                    {activeMeta.shortLabel} · 热门检索示范
                  </p>
                  {isDomainFiltered && (
                    <button
                      type="button"
                      onClick={widenToGlobal}
                      className="cursor-pointer caption font-semibold text-link hover:underline focus-ring"
                    >
                      切换至全部领域检索 →
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeMeta.hotQueries.map((hq, idx) => (
                    <button
                      key={hq.label}
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      onKeyDown={(e) => onSuggestionKeyDown(e, idx)}
                      onClick={() => flatActions[idx]?.onSelect()}
                      className="cursor-pointer rounded-sm border border-border bg-surface-sunken px-3 py-1.5 body-sm text-ink transition-colors hover:border-brand-navy hover:bg-info-bg hover:text-brand-navy focus-ring"
                    >
                      {hq.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* 第一组：当前选中范围的匹配建议 */}
                <div className="p-3">
                  <p className="px-2 pb-1.5 caption font-semibold text-ink-muted">
                    {mode === "public"
                      ? scope === "/search"
                        ? "全站匹配词条预览"
                        : `${activeMeta.shortLabel}匹配词条预览`
                      : `本栏匹配建议（${activeMeta.shortLabel}）`}
                  </p>
                  {!indexMod ? (
                    <p className="px-2 py-2 body-sm text-ink-muted">正在加载检索索引…</p>
                  ) : suggestions.scopedMatches.length === 0 ? (
                    <p className="px-2 py-2 body-sm text-ink-muted">
                      {mode === "admin"
                        ? `当前「${activeMeta.shortLabel}」范围未直接命中「${trimmed}」，可按回车在本页筛选或从下方跨后台检索进入其他模块。`
                        : `当前所选领域未直接命中「${trimmed}」的代表性词条，可点击下方查看全站搜索结果。`}
                    </p>
                  ) : (
                    <ul className="grid gap-0.5">
                      {suggestions.scopedMatches.map((item, idx) => (
                        <li key={item.id}>
                          <button
                            ref={(el) => {
                              optionRefs.current[idx] = el;
                            }}
                            type="button"
                            onKeyDown={(e) => onSuggestionKeyDown(e, idx)}
                            onClick={() => flatActions[idx]?.onSelect()}
                            className="flex w-full cursor-pointer items-start justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-info-bg focus:bg-info-bg focus-ring"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="body-sm font-semibold text-ink">{item.title}</span>
                                <Tag size="sm" tone="neutral">
                                  {scope === "/search" ? `${item.scopeLabel} · ${item.badge}` : item.badge}
                                </Tag>
                              </div>
                              <p className="mt-0.5 truncate caption text-ink-muted">{item.subtitle}</p>
                            </div>
                            <IconArrowRight size={15} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 第二组（前台动态库）：实时入库观测记录命中 */}
                {suggestions.liveMatches.length > 0 && (
                  <div className="bg-surface-sunken/40 p-3">
                    <p className="px-2 pb-1.5 caption font-semibold text-ink-muted">
                      实时入库数据命中（D1 观测库共 {suggestions.liveObsTotal} 条）
                    </p>
                    <ul className="grid gap-0.5">
                      {suggestions.liveMatches.map((item, i) => {
                        const refIdx = liveOffset + i;
                        return (
                          <li key={item.id}>
                            <button
                              ref={(el) => {
                                optionRefs.current[refIdx] = el;
                              }}
                              type="button"
                              onKeyDown={(e) => onSuggestionKeyDown(e, refIdx)}
                              onClick={() => flatActions[refIdx]?.onSelect()}
                              className="flex w-full cursor-pointer items-start justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-info-bg focus:bg-info-bg focus-ring"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="body-sm font-semibold text-ink">{item.title}</span>
                                  <Tag size="sm" tone="success">
                                    {item.badge}
                                  </Tag>
                                </div>
                                <p className="mt-0.5 truncate caption text-ink-muted">{item.subtitle}</p>
                              </div>
                              <IconArrowRight size={15} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 第三组：前台「关联指标口径与方法论」 / 后台「跨后台检索」 */}
                {suggestions.secondaryMatches.length > 0 && (
                  <div className="bg-surface-sunken/60 p-3">
                    <p className="px-2 pb-1.5 caption font-semibold text-ink-muted">{suggestions.secondaryTitle}</p>
                    <ul className="grid gap-0.5">
                      {suggestions.secondaryMatches.map((item, i) => {
                        const refIdx = secondaryOffset + i;
                        return (
                          <li key={item.id}>
                            <button
                              ref={(el) => {
                                optionRefs.current[refIdx] = el;
                              }}
                              type="button"
                              onKeyDown={(e) => onSuggestionKeyDown(e, refIdx)}
                              onClick={() => flatActions[refIdx]?.onSelect()}
                              className="flex w-full cursor-pointer items-center justify-between gap-3 px-2.5 py-1.5 text-left transition-colors hover:bg-info-bg focus:bg-info-bg focus-ring"
                            >
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <span className="truncate body-sm font-semibold text-brand-navy">{item.title}</span>
                                {mode === "admin" && (
                                  <Tag size="sm" tone="info">
                                    {item.scopeLabel} · {item.badge}
                                  </Tag>
                                )}
                              </div>
                              <span className="shrink-0 caption text-ink-muted">{item.subtitle}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 第四组：进入独立搜索结果页查看全量匹配结果 */}
                {mode === "public" && (
                  <div className="bg-surface-sunken px-3 py-2.5">
                    <button
                      ref={(el) => {
                        optionRefs.current[globalActionIndex] = el;
                      }}
                      type="button"
                      onKeyDown={(e) => onSuggestionKeyDown(e, globalActionIndex)}
                      onClick={() => executeSearch(trimmed, "/search")}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1 body-sm font-semibold text-link hover:underline focus-ring"
                    >
                      <span>
                        {suggestions.liveObsTotal > 0
                          ? `进入搜索结果页查看「${trimmed}」全量结果（代表性名录 ${suggestions.globalTotal} 条 · 实时观测 ${suggestions.liveObsTotal} 条）`
                          : `进入搜索结果页查看「${trimmed}」全量结果（共命中 ${suggestions.globalTotal} 条）`}
                      </span>
                      <IconArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
