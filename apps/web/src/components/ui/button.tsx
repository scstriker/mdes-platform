import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * ITEI Button（换皮自 shadcn/ui）：primary / secondary（深蓝描边）/ danger / ghost 四种，
 * md 40px、sm 32px，直角 2px，按下不缩放，焦点环统一用 focus-ring。
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent whitespace-nowrap",
    "transition-colors duration-150 ease-out focus-ring",
    "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:text-ink-disabled",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-navy text-on-brand not-disabled:hover:bg-brand-navy-deep",
        secondary: "border-brand-navy bg-surface text-brand-navy not-disabled:hover:bg-info-bg",
        danger: "bg-brand-red text-on-brand",
        ghost: "bg-transparent text-link underline-offset-4 not-disabled:hover:underline",
      },
      size: {
        md: "h-10 px-6 button [&_svg:not([class*='size-'])]:size-4.5",
        sm: "h-8 px-3 label [&_svg:not([class*='size-'])]:size-4",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    compoundVariants: [
      { variant: "ghost", size: "md", class: "px-2" },
      { variant: "ghost", size: "sm", class: "px-2" },
      { variant: "ghost", size: ["icon", "icon-sm"], class: "text-ink not-disabled:hover:bg-info-bg not-disabled:hover:text-brand-navy not-disabled:hover:no-underline" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "primary"}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants, type ButtonProps };
