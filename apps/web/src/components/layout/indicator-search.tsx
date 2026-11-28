import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { IconSearch } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type IndicatorSearchProps = {
  className?: string;
  /** 紧凑版按钮，用于页眉或刊头工具栏 */
  variant?: "field" | "button";
  autoFocus?: boolean;
  defaultQuery?: string;
};

const SEARCH_INPUT_ID = "system-indicator-search";

function scrollAndFocusSearchInput() {
  const tryFocus = (attempt = 0) => {
    const el = document.getElementById(SEARCH_INPUT_ID);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.focus({ preventScroll: true });
      return;
    }
    if (attempt < 10) {
      window.setTimeout(() => tryFocus(attempt + 1), 40);
    }
  };

  window.requestAnimationFrame(() => {
    window.setTimeout(() => tryFocus(0), 50);
  });
}

/** 跳转到指标目录并带 q 查询 */
export function IndicatorSearch({ className, variant = "field", autoFocus, defaultQuery = "" }: IndicatorSearchProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState(defaultQuery);

  useEffect(() => {
    setQ(defaultQuery);
  }, [defaultQuery]);

  function submit(value: string) {
    const term = value.trim();
    if (!term) {
      navigate("/system");
      return;
    }
    navigate(`/system?q=${encodeURIComponent(term)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(q);
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 border border-brand-navy bg-surface px-3 py-1.5 button font-semibold text-brand-navy",
          "transition-colors hover:bg-info-bg focus-ring",
          className,
        )}
        onClick={() => {
          navigate("/system");
          scrollAndFocusSearchInput();
        }}
      >
        <IconSearch size={18} aria-hidden="true" />
        查指标
      </button>
    );
  }

  const hasWidthUtility = Boolean(className && /\b(?:w-|max-w-)/.test(className));

  return (
    <form
      className={cn("flex w-full min-w-0 items-stretch", !hasWidthUtility && "max-w-md", className)}
      onSubmit={onSubmit}
      role="search"
    >
      <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
        查找指标
      </label>
      <span className="flex min-w-0 flex-1 items-center border border-border-strong bg-surface focus-within:border-brand-navy">
        <IconSearch size={18} className="ml-2.5 shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          id={SEARCH_INPUT_ID}
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索序号、指标名称或来源…"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 body text-ink outline-none"
        />
      </span>
      <button
        type="submit"
        className="shrink-0 cursor-pointer border border-l-0 border-brand-navy bg-brand-navy px-3.5 py-1.5 button text-on-brand transition-colors hover:bg-brand-navy-deep focus-ring"
      >
        查
      </button>
    </form>
  );
}
