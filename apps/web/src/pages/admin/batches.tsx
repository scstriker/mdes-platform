import { Link } from "react-router";
import type { ImportBatch } from "@mdes/shared";
import { DataTable, SectionTitle, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { useBatches } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { IMPORT_STATUS } from "@/lib/labels";

export default function AdminBatchesPage() {
  const batches = useBatches();
  const columns: DataTableColumn<ImportBatch>[] = [
    { key: "created_at", title: "时间", value: (b) => formatDateTime(b.created_at) },
    { key: "filename", title: "文件", primary: true },
    {
      key: "status",
      title: "状态",
      type: "status",
      cell: (b) => (
        <Tag size="sm" tone={IMPORT_STATUS[b.status].tone}>
          {IMPORT_STATUS[b.status].label}
        </Tag>
      ),
    },
    { key: "row_ok", title: "写入", type: "number" },
    { key: "row_err", title: "跳过", type: "number" },
    {
      key: "actions",
      title: "操作",
      cell: (b) =>
        b.row_ok > 0 ? <TextLink to={`/observations?batch_id=${b.id}`}>查看观测值</TextLink> : "—",
    },
  ];

  return (
    <div className="grid gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionTitle level={1}>导入记录</SectionTitle>
          <p className="mt-2 body text-ink-muted">最近 50 次导入批次。撤销能力本轮未接 API。</p>
        </div>
        <Button asChild>
          <Link to="/admin/import">新建导入</Link>
        </Button>
      </div>
      {batches.isError ? (
        <QueryError error={batches.error} onRetry={() => batches.refetch()} />
      ) : (
        <DataTable
          caption="导入记录"
          columns={columns}
          data={batches.data ?? []}
          getRowId={(b) => b.id}
          loading={batches.isPending}
          empty="还没有导入记录"
        />
      )}
    </div>
  );
}
