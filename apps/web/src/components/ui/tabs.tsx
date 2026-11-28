import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * ITEI 页签：底部 1px 边线，当前项 2px brand-navy 下划线（与页眉导航同一语言），不用底色块。
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-5", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // 底线画在伪元素上、被当前项的 2px 下划线压住；不用负外边距，避免横向滚动容器出现纵向滚动条
        "relative flex w-full items-end gap-6 overflow-x-auto overflow-y-hidden",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-1 inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-0.5 button whitespace-nowrap text-ink-muted",
        "transition-colors duration-150 ease-out hover:text-brand-navy focus-ring",
        "data-[state=active]:border-brand-navy data-[state=active]:text-brand-navy",
        "disabled:cursor-not-allowed disabled:text-ink-disabled",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 focus-ring", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
