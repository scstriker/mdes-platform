import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { matchesQuery, type ImportBatch } from "@mdes/shared";
import { DataTable, EmptyState, SectionTitle, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { useBatches } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { IMPORT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | ImportBatch["status"];

const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: "all", label: "全部状态" },
  { id: "completed", label: "已完成" },
  { id: "completed_with_errors", label: "部分跳过" },
  { id: "failed", label: "导入失败" },
];

export default function AdminBatchesPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const batches = useBatches();

  const filtered = useMemo(() => {
    const list = batches.data ?? [];
    return list.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      const statusText = IMPORT_STATUS[b.status]?.label ?? b.status;
      return matchesQuery(`${b.filename} ${b.id} ${statusText} ${b.status}`, q);
    });
  }, [batches.data, statusFilter, q]);

  const columns: DataTableColumn<ImportBatch>[] = [
    { key: "created_at", title: "导入时间", value: (b) => formatDateTime(b.created_at), colClassName: "w-44" },
    { key: "filename", title: "源文件名", primary: true },
    {
      key: "status",
      title: "事务状态",
      type: "status",
      colClassName: "w-32",
      cell: (b) => (
        <Tag size="sm" tone={IMPORT_STATUS[b.status].tone}>
          {IMPORT_STATUS[b.status].label}
        </Tag>
      ),
    },
    { key: "row_ok", title: "成功写入", type: "number", colClassName: "w-28" },
    { key: "row_err", title: "校验跳过", type: "number", colClassName: "w-28" },
    {
      key: "actions",
      title: "核查操作",
      colClassName: "w-32",
      cell: (b) =>
        b.row_ok > 0 ? <TextLink to={`/admin/observations?batch_id=${b.id}`}>核查观测值</TextLink> : "—",
    },
  ];

  return (
    <div className="grid gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionTitle level={1}>导入记录</SectionTitle>
          <p className="mt-2 body text-ink-muted">
            保留最近 50 次结构化观测值与文件导入事务记录，可按批次追踪入库明细。
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/import">新建导入</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="导入批次状态筛选">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={statusFilter === f.id}
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                "cursor-pointer border px-3 py-1 body-sm font-semibold transition-colors focus-ring",
                statusFilter === f.id
                  ? "border-brand-navy bg-brand-navy text-on-brand"
                  : "border-border bg-surface text-ink hover:border-brand-navy",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="caption tabular-nums text-ink-muted">共 {filtered.length} 条记录</span>
      </div>

      {batches.isError ? (
        <QueryError error={batches.error} onRetry={() => batches.refetch()} />
      ) : !batches.isPending && (batches.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="当前尚无实时导入批次记录"
          description="前往「新建导入」选择对应指标上传标准 CSV 或原件解析包后，事务批次将在此归档。"
          action={
            <Button asChild>
              <Link to="/admin/import">前往新建导入</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          caption="导入记录"
          columns={columns}
          data={filtered}
          getRowId={(b) => b.id}
          loading={batches.isPending}
          empty="未找到匹配当前筛选条件的导入批次"
        />
      )}
    </div>
  );
}
