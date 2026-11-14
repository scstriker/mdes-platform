import { Link } from "react-router";
import { IconPlus } from "@tabler/icons-react";
import { DataTable, formatNumber, SectionTitle, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { MAPPERS } from "@/lib/import-mappers";
import { useBatches, useStats } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { IMPORT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ImportBatch } from "@mdes/shared";

/** 示意入库量（对齐 admin-desktop 示意稿；真实 API 接上后替换） */
const DEMO_STORED: Record<string, { stored: string; coverage: string; last: string }> = {
  "01": { stored: "342,186 行", coverage: "2000-01 — 2026-09", last: "10-26" },
  "02": { stored: "512 行", coverage: "2014 — 2026-Q3", last: "10-20" },
  "03": { stored: "186 行", coverage: "2016 — 2026-Q3", last: "10-18" },
  "05": { stored: "1.2 万行", coverage: "2020-01 — 2026-09", last: "10-08" },
  "12": { stored: "48 行", coverage: "2021 — 2025", last: "09-30" },
  "13": { stored: "172 行", coverage: "2024 — 2026-Q2", last: "10-12" },
  "23": { stored: "418 文件", coverage: "2018 — 2026-09", last: "10-22" },
  "24": { stored: "96 文件", coverage: "2019 — 2026-09", last: "10-21" },
  "28": { stored: "12 文件", coverage: "2015 — 2025", last: "08-15" },
  "38": { stored: "—", coverage: "—", last: "10-15" },
};

type IntakeRow = {
  seq: string;
  name: string;
  method: string;
  stored: string;
  coverage: string;
  lastImport: string;
  status: "normal" | "stale" | "pending";
  reason?: string;
};

export default function AdminOverviewPage() {
  const stats = useStats();
  const batches = useBatches();
  const latest = stats.data?.latest_batch;
  const monthBatches = batches.data?.length ?? 0;
  const staleCount = 2;

  const intake: IntakeRow[] = MAPPERS.map((m) => {
    const demo = DEMO_STORED[m.seq];
    const stale = m.seq === "05" || m.seq === "38";
    return {
      seq: m.seq,
      name: m.name,
      method: m.channel === "table" ? "表格（CSV/Excel）" : "文件 + 解析结果",
      stored: demo?.stored ?? (m.status === "pending" ? "模板待补" : "—"),
      coverage: demo?.coverage ?? "—",
      lastImport: demo?.last ?? "—",
      status: m.status === "pending" ? "pending" : stale ? "stale" : "normal",
      reason:
        m.seq === "05"
          ? "更新频率为日，已 18 天未导入"
          : m.seq === "38"
            ? "最近一次导入失败：表头缺少 HS 编码列"
            : m.status === "pending"
              ? "正式字段清单待补"
              : undefined,
    };
  });

  const intakeColumns: DataTableColumn<IntakeRow>[] = [
    { key: "seq", title: "序号", type: "code" },
    { key: "name", title: "三级指标", primary: true },
    { key: "method", title: "导入方式" },
    { key: "stored", title: "已入库" },
    { key: "coverage", title: "覆盖期间" },
    { key: "lastImport", title: "最近导入" },
    {
      key: "status",
      title: "状态",
      type: "status",
      cell: (r) =>
        r.status === "normal" ? (
          <Tag size="sm" tone="success">
            正常
          </Tag>
        ) : r.status === "stale" ? (
          <div className="grid gap-0.5">
            <Tag size="sm" tone="warning">
              待更新
            </Tag>
            {r.reason && <span className="caption text-ink-muted">{r.reason}</span>}
          </div>
        ) : (
          <Tag size="sm" tone="info">
            模板待补
          </Tag>
        ),
    },
    {
      key: "actions",
      title: "操作",
      cell: (r) => (
        <span className="flex flex-wrap gap-3">
          <TextLink to={`/admin/import?seq=${r.seq}`}>导入</TextLink>
          <span className="caption text-ink-disabled">模板</span>
        </span>
      ),
    },
  ];

  const batchColumns: DataTableColumn<ImportBatch>[] = [
    { key: "created_at", title: "时间", value: (b) => formatDateTime(b.created_at) },
    { key: "filename", title: "文件", primary: true },
    { key: "row_ok", title: "写入", type: "number" },
    { key: "row_err", title: "跳过", type: "number" },
    {
      key: "status",
      title: "结果",
      type: "status",
      cell: (b) => (
        <Tag size="sm" tone={IMPORT_STATUS[b.status].tone}>
          {IMPORT_STATUS[b.status].label}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: "操作",
      cell: (b) => (
        <span className="flex gap-3">
          {b.row_ok > 0 ? (
            <TextLink to={`/observations?batch_id=${b.id}`}>查看</TextLink>
          ) : (
            <span className="caption text-ink-muted">查看</span>
          )}
          <span className="caption text-ink-disabled" title="API 未备齐">
            撤销
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-8 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionTitle level={1}>概况</SectionTitle>
          <p className="mt-2 body text-ink-muted">一期指标入库状态与最近导入记录。</p>
        </div>
        <Button asChild>
          <Link to="/admin/import">
            <IconPlus aria-hidden="true" />
            新建导入
          </Link>
        </Button>
      </div>

      {stats.isError ? (
        <QueryError error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 divide-x divide-border border border-border sm:grid-cols-4">
          <AdminStat label="一期指标" value={MAPPERS.length} unit={`/ ${MAPPERS.length} 项`} />
          <AdminStat label="待更新" value={staleCount} unit="项" emphasize />
          <AdminStat label="本月导入" value={monthBatches} unit="批次" />
          <AdminStat
            label="最近写入"
            value={latest?.row_ok ?? 0}
            unit="行"
            hint={latest ? formatDateTime(latest.created_at) : "尚无批次"}
          />
        </div>
      )}

      <section className="grid gap-4">
        <SectionTitle level={2}>一期指标入库状态</SectionTitle>
        <DataTable caption="一期指标入库状态" columns={intakeColumns} data={intake} getRowId={(r) => r.seq} />
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle level={2}>最近导入记录</SectionTitle>
          <TextLink to="/admin/batches">全部记录</TextLink>
        </div>
        {batches.isError ? (
          <QueryError error={batches.error} onRetry={() => batches.refetch()} />
        ) : (
          <DataTable
            caption="最近导入记录"
            columns={batchColumns}
            data={(batches.data ?? []).slice(0, 8)}
            getRowId={(b) => b.id}
            loading={batches.isPending}
            empty="还没有导入记录"
          />
        )}
      </section>
    </div>
  );
}

function AdminStat({
  label,
  value,
  unit,
  hint,
  emphasize,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={cn("grid gap-0.5 px-4 py-3", emphasize && "border-t-2 border-brand-red")}>
      <p className="caption text-ink-muted">{label}</p>
      <p className="numeral tabular-nums text-brand-navy">
        {formatNumber(value)}
        <span className="ml-1 body-sm font-normal text-ink-muted">{unit}</span>
      </p>
      {hint && <p className="caption text-ink-muted">{hint}</p>}
    </div>
  );
}
