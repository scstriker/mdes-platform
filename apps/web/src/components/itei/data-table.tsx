import { useMemo, useState, type ReactNode } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconChevronLeft,
  IconChevronRight,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "./format";

export type DataTableColumn<T extends RowData> = {
  key: string;
  title: string;
  /** number：右对齐、等宽数字、千分位；code：等宽字体；status：放 Tag（sm） */
  type?: "text" | "number" | "code" | "status";
  align?: "left" | "right" | "center";
  /** 取值，默认 row[key] */
  value?: (row: T) => unknown;
  /** 自定义单元格；不传则按 type 格式化 value */
  cell?: (row: T) => ReactNode;
  /** number 列的小数位 */
  digits?: number;
  sortable?: boolean;
  /** 窄屏卡片的标题列（默认第一列） */
  primary?: boolean;
  /** 窄屏卡片里不显示 */
  hideOnCard?: boolean;
};

export type DataTablePagination = {
  /** 从 0 开始 */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

type DataTableProps<T extends RowData> = {
  columns: DataTableColumn<T>[];
  data: readonly T[];
  getRowId?: (row: T, index: number) => string;
  /** 表格用途，读屏用；也作为表格标题（视觉隐藏） */
  caption: string;
  loading?: boolean;
  /** 请求失败时的提示，与空数据区分开 */
  error?: ReactNode;
  empty?: ReactNode;
  dense?: boolean;
  /** 横向滚动时固定首列 */
  stickyFirstColumn?: boolean;
  /** 服务端排序：传入后不在前端排序 */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: DataTablePagination;
  className?: string;
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

function readValue<T extends RowData>(column: DataTableColumn<T>, row: T): unknown {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[column.key];
}

function renderCell<T extends RowData>(column: DataTableColumn<T>, row: T): ReactNode {
  if (column.cell) return column.cell(row);
  const v = readValue(column, row);
  if (column.type === "number") return formatNumber(typeof v === "number" ? v : v == null ? null : Number(v), column.digits);
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || v === "—";

function alignOf<T extends RowData>(column: DataTableColumn<T>) {
  return column.align ?? (column.type === "number" ? "right" : "left");
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/**
 * ITEI DataTable（基于 TanStack Table，参考 tablecn）：
 * - 表头 surface-sunken + brand-navy 字 + 2px brand-sky 下边线；偶数行 surface-sunken；无竖线
 * - 数字列右对齐、等宽数字、千分位；编码列等宽字体；状态列放 Tag
 * - 加载、空数据、请求失败三种状态分开显示，失败不会被当成空数据
 * - 窄屏改为卡片列表，不缩小字号；卡片里不显示空的纯值字段
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  loading,
  error,
  empty = "暂无数据",
  dense,
  stickyFirstColumn,
  sorting: controlledSorting,
  onSortingChange,
  pagination,
  className,
}: DataTableProps<T>) {
  const [innerSorting, setInnerSorting] = useState<SortingState>([]);
  const sorting = controlledSorting ?? innerSorting;
  const manual = controlledSorting !== undefined;

  const defs = useMemo(() => {
    const helper = createColumnHelper<typeof features, T>();
    return columns.map((col) =>
      helper.accessor((row: T) => readValue(col, row), {
        id: col.key,
        header: col.title,
        enableSorting: Boolean(col.sortable),
        sortFn: col.type === "number" ? "basic" : "alphanumeric",
      }),
    );
  }, [columns]);

  const table = useTable({
    features,
    columns: defs,
    data: data as T[],
    getRowId: getRowId ? (row: T, index: number) => getRowId(row, index) : undefined,
    state: { sorting },
    manualSorting: manual,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (!manual) setInnerSorting(next);
      onSortingChange?.(next);
    },
  });

  const rows = table.getRowModel().rows;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const status: "loading" | "error" | "empty" | "ready" = loading
    ? "loading"
    : error
      ? "error"
      : rows.length === 0
        ? "empty"
        : "ready";

  const stateMessage =
    status === "error" ? (
      <div role="alert" className="flex items-start gap-2 text-danger">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">错误：</span>
          {error}
        </span>
      </div>
    ) : (
      <span className="text-ink-muted">{empty}</span>
    );

  return (
    <div className={cn("grid gap-3", className)}>
      {/* 桌面：表格 */}
      <div className="hidden md:block">
        <Table dense={dense} aria-busy={loading || undefined}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header, i) => {
                  const col = byKey.get(header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const SortIcon = sorted === "asc" ? IconSortAscending : sorted === "desc" ? IconSortDescending : IconArrowsSort;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined}
                      className={cn(ALIGN[alignOf(col)], stickyFirstColumn && i === 0 && "sticky left-0 z-1")}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 focus-ring",
                            alignOf(col) === "right" && "flex-row-reverse",
                          )}
                        >
                          {col.title}
                          <SortIcon className={cn("size-4", sorted ? "text-brand-navy" : "text-ink-muted")} aria-hidden="true" />
                        </button>
                      ) : (
                        col.title
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {status === "loading" &&
              Array.from({ length: 5 }, (_, r) => (
                <TableRow key={`skeleton-${r}`} data-skeleton="">
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className={cn("h-4", alignOf(col) === "right" ? "ml-auto w-16" : "w-3/4")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {(status === "error" || status === "empty") && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center">
                  <div className="inline-flex">{stateMessage}</div>
                </TableCell>
              </TableRow>
            )}
            {status === "ready" &&
              rows.map((row) => (
                <TableRow key={row.id} className="group/row">
                  {columns.map((col, i) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        ALIGN[alignOf(col)],
                        col.type === "number" && "whitespace-nowrap tabular-nums",
                        col.type === "code" && "code whitespace-nowrap",
                        stickyFirstColumn && i === 0 && "sticky left-0 z-1 bg-surface group-even/row:bg-surface-sunken",
                      )}
                    >
                      {renderCell(col, row.original)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* 窄屏：卡片列表 */}
      <div className="md:hidden" aria-busy={loading || undefined}>
        <p className="sr-only">{caption}</p>
        {status === "loading" && (
          <ul className="grid gap-3">
            {Array.from({ length: 3 }, (_, r) => (
              <li key={r} className="grid gap-2 border border-border bg-surface-raised p-4">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </li>
            ))}
          </ul>
        )}
        {(status === "error" || status === "empty") && (
          <div className="border border-border bg-surface-raised p-4 body">{stateMessage}</div>
        )}
        {status === "ready" && (
          <ul className="grid gap-3">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-3 border border-border bg-surface-raised p-4">
                <div className={cn("title-nav text-brand-navy", primary.type === "code" && "code font-bold")}>
                  {renderCell(primary, row.original)}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {columns
                    .filter((c) => c !== primary && !c.hideOnCard && (c.cell || !isEmpty(readValue(c, row.original))))
                    .map((col) => (
                      <div key={col.key} className="grid min-w-0 content-start gap-0.5">
                        <dt className="caption text-ink-muted">{col.title}</dt>
                        <dd
                          className={cn(
                            "min-w-0 body break-words text-ink",
                            col.type === "number" && "tabular-nums",
                            col.type === "code" && "code",
                          )}
                        >
                          {renderCell(col, row.original)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination && <Pager {...pagination} disabled={loading} />}
    </div>
  );
}

function Pager({ page, pageSize, total, onPageChange, disabled }: DataTablePagination & { disabled?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="分页" className="flex flex-wrap items-center justify-between gap-3">
      <span className="body-sm text-ink-muted tabular-nums">
        共 {formatNumber(total)} 条 · 第 {formatNumber(Math.min(page + 1, pages))} / {formatNumber(pages)} 页
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={disabled || page <= 0} onClick={() => onPageChange(page - 1)}>
          <IconChevronLeft aria-hidden="true" />
          上一页
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>
          下一页
          <IconChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
