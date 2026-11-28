import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4.5 shrink-0 cursor-pointer rounded-sm border border-input bg-surface focus-ring",
        "data-[state=checked]:border-brand-navy data-[state=checked]:bg-brand-navy data-[state=checked]:text-on-brand",
        "aria-invalid:border-danger disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
        <IconCheck className="size-3.5" stroke={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
