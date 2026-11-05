import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** 表单标签：label 文字样式，放在控件上方 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "inline-flex items-center gap-0.5 label text-ink select-none peer-disabled:cursor-not-allowed peer-disabled:text-ink-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
