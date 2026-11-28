import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field-context";

/** 文本框、下拉、多行文本共用的控件外观（ITEI Input：高 40px、窄屏 44px，边线 border-strong） */
export const controlClass = [
  "w-full min-w-0 rounded-sm border border-input bg-surface px-3 body text-ink",
  "transition-colors duration-150 ease-out focus-ring focus-visible:border-brand-navy",
  "aria-invalid:border-danger",
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:text-ink-disabled",
].join(" ");

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const merged = useFieldControlProps(props);
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClass,
        "h-11 md:h-10",
        "file:mr-3 file:h-full file:border-0 file:bg-transparent file:label file:text-brand-navy",
        className,
      )}
      {...merged}
    />
  );
}

export { Input };
