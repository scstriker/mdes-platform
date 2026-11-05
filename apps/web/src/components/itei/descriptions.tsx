import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DescriptionItem = {
  term: ReactNode;
  value: ReactNode;
  /** 长文规格：body-lg、保留换行，占满整行 */
  long?: boolean;
  /** 占满整行 */
  full?: boolean;
};

const COLUMNS = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3" } as const;

/**
 * 键值列表（规格与元数据）：dt 用 label 样式 ink-muted，dd 用 body；行间 1px border 分隔，不加底色。
 * 空值显示「—」。
 */
export function Descriptions({
  items,
  columns = 2,
  className,
}: {
  items: DescriptionItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 border-t border-border", COLUMNS[columns], className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn("grid min-w-0 content-start gap-1 border-b border-border py-3", (item.long || item.full) && "md:col-span-full")}
        >
          <dt className="label text-ink-muted">{item.term}</dt>
          <dd className={cn("min-w-0 text-ink break-words", item.long ? "body-lg whitespace-pre-line" : "body")}>
            {item.value === null || item.value === undefined || item.value === "" ? "—" : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
