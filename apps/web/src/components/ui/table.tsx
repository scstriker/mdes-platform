import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ITEI 表格（换皮自 shadcn/ui）：表头 surface-sunken 底 + brand-navy 文字 + 2px brand-sky 下边线；
 * 偶数行 surface-sunken，无竖线；dense 模式用 body-sm 并把纵向内边距降到 4px。
 */
function Table({ className, dense = false, ...props }: React.ComponentProps<"table"> & { dense?: boolean }) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        data-dense={dense || undefined}
        className={cn("group/table w-full border-collapse caption-bottom text-ink", dense ? "body-sm" : "body", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&>tr:nth-child(even):not([data-skeleton])]:bg-surface-sunken", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t border-border font-semibold", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("data-[state=selected]:bg-info-bg", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "border-b-2 border-brand-sky bg-surface-sunken px-3 py-2 text-left align-middle label font-bold whitespace-nowrap text-brand-navy",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "border-b border-border px-3 py-2 align-middle group-data-[dense]/table:py-1",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 caption text-ink-muted", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
