import type { ComponentProps } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** 文字链接：link 色（不是 brand-sky），悬停加下划线 */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn("text-link underline-offset-4 hover:underline focus-ring", className)} {...props} />;
}
