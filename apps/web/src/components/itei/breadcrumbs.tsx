import type { ReactNode } from "react";
import { TextLink } from "./text-link";

export type Crumb = { label: ReactNode; href?: string };

/** 面包屑：body-sm ink-muted，当前页不加链接 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="位置">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 body-sm text-ink-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-2">
              {item.href && !last ? (
                <TextLink to={item.href}>{item.label}</TextLink>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-ink" : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
