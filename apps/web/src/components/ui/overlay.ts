/**
 * 浮层（Select 下拉、Popover、DropdownMenu、Tooltip）共用外观：
 * 直角、1px 边线、shadow-raised；动效只保留 150ms 淡入与 4px 位移，去掉缩放（ADR-002 换皮清单）。
 */
export const floatingPanelClass =
  "border border-border bg-popover text-popover-foreground shadow-raised";

export const floatingMotionClass = [
  "duration-150 ease-out",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
  "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
].join(" ");

/** 菜单项、下拉选项：悬停与键盘高亮用 accent（info-bg + 深蓝字） */
export const menuItemClass = [
  "relative flex w-full cursor-default items-center gap-2 px-3 py-2 body outline-hidden select-none",
  "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:text-ink-disabled",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
].join(" ");
