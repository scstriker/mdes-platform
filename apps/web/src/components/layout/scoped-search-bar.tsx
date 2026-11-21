import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { IconArrowRight, IconChevronDown, IconSearch, IconSparkles, IconX } from "@tabler/icons-react";
import { Tag } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { floatingMotionClass, floatingPanelClass } from "@/components/ui/overlay";
import { useIndicators } from "@/lib/api";
import {
  ADMIN_SCOPES,
  ADMIN_SEARCH_ITEMS,
  PUBLIC_SCOPES,
  queryPublicSuggestions,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
  type AdminSearchScope,
  type PublicSearchScope,
  type SearchSuggestionItem,
} from "@/lib/search/search-index";
import { cn } from "@/lib/utils";

type ScopedSearchBarProps = {
  mode?: "public" | "admin";
  className?: string;
};

/**
 * 全站同轴常驻分域搜索栏（置于 AppHeader 正下方，1200px 轴线对齐）：
 * - 首页默认「全站跨库检索」，进入任意子页面自动锁定「当前子页范围」；
 * - 支持一键移除本栏限制扩域至全站检索；
 * - 零输入聚焦展示本栏示范热词，输入实时弹出多源分组建议并联动过滤当页内容。
 */
export function ScopedSearchBar({ mode = "public", className }: ScopedSearchBarProps) {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const scopeSelectId = useId();
  const urlQuery = searchParams.get("q") ?? "";

  const defaultScope =
    mode === "admin" ? resolveDefaultAdminScope(pathname) : resolveDefaultPublicScope(pathname);

  const [scope, setScope] = useState<string>(defaultScope);
  const [query, setQuery] = useState<string>(urlQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 仅在后台模式打开建议面板且有输入时按需拉取 /api/indicators，避免前台页面无谓请求
  const adminIndicators = useIndicators({}, mode === "admin" && open && query.trim().length > 0);

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

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
  const isSubpageScoped = mode === "public" && scope !== "/search";

  const suggestions = useMemo(() => {
    if (mode === "public") {
      return queryPublicSuggestions(query, scope as PublicSearchScope);
    }
    const q = query.trim().toLowerCase();
    if (!q) {
      return { scopedMatches: [] as SearchSuggestionItem[], indicatorMatches: [] as SearchSuggestionItem[], globalTotal: 0 };
    }
    const liveIndItems: SearchSuggestionItem[] = (adminIndicators.data ?? [])
      .filter((i) => `${i.id} ${i.name} ${i.cluster_code}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((i) => ({
        id: `adm-api-ind-${i.id}`,
        scope: "/admin/indicators" as AdminSearchScope,
        scopeLabel: "工程指标库",
        badge: i.id,
        title: `${i.id} ${i.name}`,
        subtitle: `观测值 ${i.obs_count} 条 · 更新频率：${i.update_freq || "—"}`,
        href:
          scope === "/admin/observations"
            ? `/admin/observations?indicator_id=${encodeURIComponent(i.id)}`
            : `/admin/indicators/${encodeURIComponent(i.id)}`,
        keywords: `${i.id} ${i.name}`.toLowerCase(),
      }));

    const staticMatches = ADMIN_SEARCH_ITEMS.filter((item) => item.keywords.includes(q));
    const combined = [...staticMatches, ...liveIndItems];
    const dedup = combined.filter((v, idx, arr) => arr.findIndex((x) => x.title === v.title) === idx);
    return {
      scopedMatches: dedup.slice(0, 6),
      indicatorMatches: [] as SearchSuggestionItem[],
      globalTotal: dedup.length,
    };
  }, [mode, query, scope, adminIndicators.data]);

  function syncLivePageFilter(nextVal: string, targetScope: string) {
    // 若当前路由与激活的检索范围完全一致（如在 /products 搜 /products），实时同步 URL ?q= 驱动当页即时过滤
    if (pathname === targetScope) {
      const next = new URLSearchParams(searchParams);
      if (nextVal.trim()) {
        next.set("q", nextVal.trim());
      } else {
        next.delete("q");
      }
      if (next.has("page")) next.delete("page");
      setSearchParams(next, { replace: true });
    }
  }

  function handleInputChange(val: string) {
    setQuery(val);
    setOpen(true);
    setActiveIndex(-1);
    syncLivePageFilter(val, scope);
  }

  function executeSearch(rawTerm: string, targetScope = scope) {
    const term = rawTerm.trim();
    setOpen(false);
    setActiveIndex(-1);

    if (mode === "admin" && targetScope === "/admin/observations" && /^[a-z]{3}-\d{3}$/i.test(term)) {
      navigate(`/admin/observations?indicator_id=${encodeURIComponent(term.toUpperCase())}`);
      return;
    }

    if (!term) {
      if (pathname === targetScope) {
        const next = new URLSearchParams(searchParams);
        next.delete("q");
        setSearchParams(next, { replace: true });
      } else {
        navigate(targetScope);
      }
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
    syncLivePageFilter("", scope);
    inputRef.current?.focus();
    setOpen(true);
  }

  function widenToGlobal() {
    setScope("/search");
    inputRef.current?.focus();
    setOpen(true);
  }

  // 组装可键盘上下导航的扁平建议项引用顺序
  const flatActions = useMemo(() => {
    const trimmed = query.trim();
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
    const items: { type: "item" | "ind" | "global"; label: string; onSelect: () => void }[] = [
      ...suggestions.scopedMatches.map((m) => ({
        type: "item" as const,
        label: m.title,
        onSelect: () => {
          setOpen(false);
          navigate(m.href);
        },
      })),
      ...suggestions.indicatorMatches.map((m) => ({
        type: "ind" as const,
        label: m.title,
        onSelect: () => {
          setOpen(false);
          navigate(m.href);
        },
      })),
    ];
    if (mode === "public" && scope !== "/search") {
      items.push({
        type: "global" as const,
        label: `在全站跨库检索「${trimmed}」`,
        onSelect: () => executeSearch(trimmed, "/search"),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeMeta, suggestions, mode, scope]);

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Backspace" && query === "" && isSubpageScoped) {
      // 空输入按退格自动扩域至全站跨库检索
      setScope("/search");
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

  const trimmed = query.trim();

  return (
    <section
      aria-label={mode === "admin" ? "后台范围检索" : "分域与全站检索"}
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
                setOpen(true);
                syncLivePageFilter(query, nextScope);
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

          {/* 中部关键词输入框（含子页面默认本栏锁定胶囊 + 清空按钮） */}
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-sm border border-border-strong bg-surface px-2.5 focus-within:border-brand-navy">
            <IconSearch size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            {isSubpageScoped && (
              <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-info-bg px-2 py-0.5 caption font-semibold text-brand-navy">
                <span>本栏：{activeMeta.shortLabel}</span>
                <button
                  type="button"
                  onClick={widenToGlobal}
                  aria-label="解除本栏范围限制"
                  title="解除本栏范围限制"
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

        {/* 弹出式搜索建议面板（零输入热词 / 实时分组联想 + 跨库兜底） */}
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
                  {isSubpageScoped && (
                    <button
                      type="button"
                      onClick={widenToGlobal}
                      className="cursor-pointer caption font-semibold text-link hover:underline focus-ring"
                    >
                      切换至全站跨库检索 →
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
                {/* 第一组：当前范围精准匹配建议 */}
                <div className="p-3">
                  <p className="px-2 pb-1.5 caption font-semibold text-ink-muted">
                    {scope === "/search" ? "全站跨库匹配建议" : `本栏匹配建议（${activeMeta.shortLabel}）`}
                  </p>
                  {suggestions.scopedMatches.length === 0 ? (
                    <p className="px-2 py-2 body-sm text-ink-muted">
                      当前范围未直接命中「{trimmed}」的代表性词条，可按回车筛选或切换全站检索。
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
                            onClick={() => {
                              setOpen(false);
                              navigate(item.href);
                            }}
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

                {/* 第二组：关联 V3.0 统计指标直达 */}
                {suggestions.indicatorMatches.length > 0 && (
                  <div className="bg-surface-sunken/60 p-3">
                    <p className="px-2 pb-1.5 caption font-semibold text-ink-muted">关联指标口径与方法论</p>
                    <ul className="grid gap-0.5">
                      {suggestions.indicatorMatches.map((ind, i) => {
                        const refIdx = suggestions.scopedMatches.length + i;
                        return (
                          <li key={ind.id}>
                            <button
                              ref={(el) => {
                                optionRefs.current[refIdx] = el;
                              }}
                              type="button"
                              onKeyDown={(e) => onSuggestionKeyDown(e, refIdx)}
                              onClick={() => {
                                setOpen(false);
                                navigate(ind.href);
                              }}
                              className="flex w-full cursor-pointer items-center justify-between gap-3 px-2.5 py-1.5 text-left transition-colors hover:bg-info-bg focus:bg-info-bg focus-ring"
                            >
                              <span className="truncate body-sm font-semibold text-brand-navy">{ind.title}</span>
                              <span className="shrink-0 caption text-ink-muted">{ind.subtitle}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 第三组：全站跨库检索兜底入口 */}
                {mode === "public" && scope !== "/search" && (
                  <div className="bg-surface-sunken px-3 py-2.5">
                    <button
                      ref={(el) => {
                        optionRefs.current[
                          suggestions.scopedMatches.length + suggestions.indicatorMatches.length
                        ] = el;
                      }}
                      type="button"
                      onKeyDown={(e) =>
                        onSuggestionKeyDown(
                          e,
                          suggestions.scopedMatches.length + suggestions.indicatorMatches.length,
                        )
                      }
                      onClick={() => executeSearch(trimmed, "/search")}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1 body-sm font-semibold text-link hover:underline focus-ring"
                    >
                      <span>
                        在全站全部业务库中检索「{trimmed}」（共命中 {suggestions.globalTotal} 条记录）
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
