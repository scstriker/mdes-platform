import { FormEvent, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { IconSearch } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type IndicatorSearchProps = {
  className?: string;
  /** 紧凑版仅图标按钮，用于页眉 */
  variant?: "field" | "button";
  autoFocus?: boolean;
  defaultQuery?: string;
};

/** 跳转到指标体系并带 q 查询 */
export function IndicatorSearch({ className, variant = "field", autoFocus, defaultQuery = "" }: IndicatorSearchProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState(defaultQuery);
  const id = useId();

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
          "inline-flex items-center gap-1.5 border border-brand-navy bg-surface px-3 py-1.5 button font-semibold text-brand-navy",
          "transition-colors hover:bg-info-bg focus-ring",
          className,
        )}
        onClick={() => {
          navigate("/system");
          queueMicrotask(() => {
            document.getElementById("system-indicator-search")?.focus();
          });
        }}
      >
        <IconSearch size={18} aria-hidden="true" />
        查指标
      </button>
    );
  }

  return (
    <form className={cn("flex min-w-0 max-w-xs flex-1 items-stretch", className)} onSubmit={onSubmit} role="search">
      <label htmlFor={id} className="sr-only">
        查找指标
      </label>
      <span className="flex min-w-0 flex-1 items-center border border-border-strong bg-surface focus-within:border-brand-navy">
        <IconSearch size={18} className="ml-2 shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          id="system-indicator-search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="查找指标…"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 body text-ink outline-none"
        />
      </span>
      <button
        type="submit"
        className="shrink-0 border border-l-0 border-brand-navy bg-brand-navy px-3 py-1.5 button text-on-brand hover:bg-brand-navy-deep focus-ring"
      >
        查
      </button>
    </form>
  );
}