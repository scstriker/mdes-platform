import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field-context";
import { controlClass } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const merged = useFieldControlProps(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "field-sizing-content min-h-24 py-2", className)}
      {...merged}
    />
  );
}

export { Textarea };
