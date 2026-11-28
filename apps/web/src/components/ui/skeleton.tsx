import * as React from "react";
import { cn } from "@/lib/utils";

/** 静态占位块：ITEI 只允许 120–200ms 的过渡，因此不做脉冲闪烁（ADR-002 换皮清单「Skeleton」） */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" aria-hidden="true" className={cn("bg-surface-sunken", className)} {...props} />
  );
}

export { Skeleton };
