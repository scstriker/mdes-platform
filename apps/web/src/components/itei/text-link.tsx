import type { ComponentProps } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/**
 * 文字链接：link 色（不是 brand-sky），悬停加下划线。
 * inline：放在段落里的链接常显下划线，不只靠颜色与正文区分（WCAG 1.4.1）。
 */
export function TextLink({ className, inline, ...props }: ComponentProps<typeof Link> & { inline?: boolean }) {
  return (
    <Link
      className={cn(
        "text-link underline-offset-4 focus-ring",
        inline ? "underline decoration-1 hover:decoration-2" : "hover:underline",
        className,
      )}
      {...props}
    />
  );
}
