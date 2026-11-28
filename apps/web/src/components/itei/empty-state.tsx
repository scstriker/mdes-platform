import type { ReactNode } from "react";
import { IconDatabaseOff, type Icon } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/** 空状态：说明为什么是空的、下一步做什么。请求失败不要用它，用 Notice（danger） */
export function EmptyState({
  title,
  description,
  action,
  icon: IconComp = IconDatabaseOff,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: Icon;
  className?: string;
}) {
  return (
    <div className={cn("grid justify-items-center gap-2 border border-border bg-surface px-6 py-10 text-center", className)}>
      <IconComp className="size-8 text-ink-muted" aria-hidden="true" />
      <p className="title-nav text-ink">{title}</p>
      {description && <p className="max-w-md body text-ink-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
