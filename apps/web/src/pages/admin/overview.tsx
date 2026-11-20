import { useMemo, useState } from "react";
import { Link } from "react-router";
import { IconChevronDown, IconChevronUp, IconPlus } from "@tabler/icons-react";
import type { ImportBatch } from "@mdes/shared";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { SYSTEM_INDICATORS, type SystemIndicator } from "@/content/system-v3";
import { useBatches, useStats } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { MAPPERS } from "@/lib/import-mappers";
import { IMPORT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** 一期 10 项三级指标入库台账基线元数据（对齐 V3.0 口径；实时 D1 有写入时动态融合） */
const DEMO_STORED: Record<
  string,
  { stored: string; coverage: string; last: string; scopeNote?: string; staleReason?: string }
> = {
  "01": {
    stored: "342,186 行",
    coverage: "2000-01 — 2026-09",
    last: "2026-10-18",
    staleReason: "更新频度为日，距上次增量同步已逾 7 天",
  },
  "02": {
    stored: "512 行",
    coverage: "2014-03 — 2026-Q3",
    last: "2026-10-25",
  },
  "03": {
    stored: "186 行",
    coverage: "2016-01 — 2026-Q3",
    last: "2026-10-24",
  },
  "05": {
    stored: "186.4 万行",
    coverage: "2021-01 — 2026-09",
    last: "2026-10-20",
  },
  "12": {
    stored: "48 行（27 家）",
    coverage: "第一批 — 第八批",
    last: "2026-09-30",
  },
  "13": {
    stored: "172 家样本",
    coverage: "2024 — 2026-Q3",
    last: "2026-10-22",
  },
  "23": {
    stored: "418 份原件+JSON",
    coverage: "2018-01 — 2026-09",
    last: "2026-10-26",
    scopeNote: "部分纳入：一期优先覆盖国家级部委及重点先行省市核心条款",
  },
  "24": {
    stored: "506 份原件+JSON",
    coverage: "2016-01 — 2026-09",
    last: "2026-10-23",
  },
  "28": {
    stored: "8 份官方年报",
    coverage: "2018 — 2025 年度",
    last: "2026-08-30",
  },
  "38": {
    stored: "255 个 HS 税号",
    coverage: "2021-01 — 2026-09",
    last: "2026-10-15",
    staleReason: "最新月度海关贸易明细待导入（可上传 trd_sample.csv 校验）",
  },
};

type IntakeRow = {
  seq: string;
  name: string;
  indicatorId?: string;
  scopeNote?: string;
  method: string;
  stored: string;
  coverage: string;
  lastImport: string;
  status: "normal" | "stale" | "pending";
  reason?: string;
};

const PHASE2_INDICATORS: readonly SystemIndicator[] = SYSTEM_INDICATORS.filter((i) => i.phase === "later");

export default function AdminOverviewPage() {
  const stats = useStats();
  const batches = useBatches();
  const [showPhase2, setShowPhase2] = useState(false);

  const batchList = batches.data ?? [];
  const latest = batchList[0] ?? stats.data?.latest_batch ?? null;
  const trdObsCount = stats.data?.clusters.find((c) => c.code === "TRD")?.observations ?? 0;

  const intake: IntakeRow[] = useMemo(
    () =>
      MAPPERS.map((m) => {
        const demo = DEMO_STORED[m.seq];
        const liveTradeSynced = m.seq === "38" && trdObsCount > 0;
        const staleReason = liveTradeSynced ? undefined : demo?.staleReason;
        const status: IntakeRow["status"] =
          m.status === "pending" ? "pending" : staleReason ? "stale" : "normal";

        return {
          seq: m.seq,
          name: m.name,
          indicatorId: m.indicatorId,
          scopeNote: demo?.scopeNote,
          method: m.channel === "table" ? "表格（CSV/Excel）" : "原件 + 解析 JSON",
          stored: liveTradeSynced
            ? `${formatNumber(trdObsCount)} 条观测值（实时库）`
            : (demo?.stored ?? "—"),
          coverage: demo?.coverage ?? "—",
          lastImport: liveTradeSynced && latest ? formatDateTime(latest.created_at) : (demo?.last ?? "—"),
          status,
          reason: m.status === "pending" ? "正式字段清单待补，支持通用观测值 CSV" : staleReason,
        };
      }),
    [latest, trdObsCount],
  );

  const staleCount = intake.filter((r) => r.status === "stale").length;

  const intakeColumns: DataTableColumn<IntakeRow>[] = [
    { key: "seq", title: "序号", type: "code", colClassName: "w-16" },
    {
      key: "name",
      title: "三级指标名称与范围",
      primary: true,
      cell: (r) => (
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <TextLink to={`/system/${r.seq}`} className="font-semibold">
              {r.name}
            </TextLink>
            {r.indicatorId && (
              <TextLink to={`/indicators/${r.indicatorId}`} className="code text-ink-muted">
                {r.indicatorId}
              </TextLink>
            )}
          </div>
          {r.scopeNote && <span className="caption text-ink-muted">{r.scopeNote}</span>}
        </div>
      ),
    },
    { key: "method", title: "导入通道", colClassName: "w-36" },
    { key: "stored", title: "已入库规模", colClassName: "w-40" },
    { key: "coverage", title: "覆盖期间", colClassName: "w-40" },
    { key: "lastImport", title: "最近更新", colClassName: "w-32" },
    {
      key: "status",
      title: "状态",
      type: "status",
      colClassName: "w-44",
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
            {r.reason && <span className="caption whitespace-normal text-ink-muted">{r.reason}</span>}
          </div>
        ) : (
          <div className="grid gap-0.5">
            <Tag size="sm" tone="info">
              模板待补
            </Tag>
            {r.reason && <span className="caption whitespace-normal text-ink-muted">{r.reason}</span>}
          </div>
        ),
    },
    {
      key: "actions",
      title: "操作",
      colClassName: "w-24",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-3">
          <TextLink to={`/admin/import?seq=${r.seq}`}>导入</TextLink>
          <TextLink to={`/system/${r.seq}`} className="caption text-ink-muted">
            口径
          </TextLink>
        </span>
      ),
    },
  ];

  const phase2Columns: DataTableColumn<SystemIndicator>[] = [
    { key: "seq", title: "序号", type: "code", colClassName: "w-16" },
    {
      key: "name",
      title: "二期规划三级指标",
      primary: true,
      cell: (i) => (
        <div className="grid gap-0.5">
          <TextLink to={`/system/${i.seq}`} className="font-semibold">
            {i.name}
          </TextLink>
          <span className="caption text-ink-muted">{i.grain}</span>
        </div>
      ),
    },
    { key: "level1", title: "所属一级维度", colClassName: "w-44" },
    {
      key: "channel",
      title: "预设通道",
      colClassName: "w-28",
      value: (i) => (i.channel === "table" ? "结构化表格" : "文件 + 解析"),
    },
    { key: "source", title: "权威来源", colClassName: "w-44" },
    { key: "frequency", title: "频度", colClassName: "w-20" },
    {
      key: "phase",
      title: "阶段",
      type: "status",
      colClassName: "w-24",
      cell: () => (
        <Tag size="sm" tone="neutral">
          二期规划
        </Tag>
      ),
    },
  ];

  const batchColumns: DataTableColumn<ImportBatch>[] = [
    { key: "created_at", title: "导入时间", colClassName: "w-44", value: (b) => formatDateTime(b.created_at) },
    { key: "filename", title: "源文件名", primary: true },
    { key: "row_ok", title: "成功写入", type: "number", colClassName: "w-28" },
    { key: "row_err", title: "校验跳过", type: "number", colClassName: "w-28" },
    {
      key: "status",
      title: "事务状态",
      type: "status",
      colClassName: "w-28",
      cell: (b) => (
        <Tag size="sm" tone={IMPORT_STATUS[b.status].tone}>
          {IMPORT_STATUS[b.status].label}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: "操作",
      colClassName: "w-28",
      cell: (b) => (
        <span className="flex gap-3">
          {b.row_ok > 0 ? (
            <TextLink to={`/observations?batch_id=${b.id}`}>查看明细</TextLink>
          ) : (
            <span className="caption text-ink-muted">无写入行</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-8 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="grid gap-1.5">
          <p className="label text-brand-navy">数据治理与入库中台 · V3.0 指标映射</p>
          <h1 className="title-page text-brand-navy">入库概况与指标映射台账</h1>
          <p className="body text-ink-muted">
            统一管理一期 10 项核心指标入库状态、事务导入批次及二期 23 项规划指标目录。
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/import">
            <IconPlus aria-hidden="true" />
            新建导入
          </Link>
        </Button>
      </header>

      {stats.isError ? (
        <QueryError error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <section aria-label="入库核心统计">
          <div className="grid grid-cols-2 border-t-2 border-brand-navy border-b border-border lg:grid-cols-4 lg:divide-x lg:divide-border">
            <AdminStripMetric
              label="一期指标纳入"
              value={`${MAPPERS.length} / ${MAPPERS.length}`}
              unit="项"
              hint="其中 23 号为部分纳入"
              className="max-lg:border-r max-lg:border-b max-lg:border-border"
            />
            <AdminStripMetric
              label="待更新提醒"
              value={formatNumber(staleCount)}
              unit="项"
              hint={staleCount > 0 ? "含超期未同步或待补导入项" : "全部一期指标处于正常周期"}
              alert={staleCount > 0}
              className="max-lg:border-b max-lg:border-border"
            />
            <AdminStripMetric
              label="已记录导入批次"
              value={formatNumber(batchList.length)}
              unit="批次"
              hint="单批次原子事务写入，支持回溯"
              className="max-lg:border-r max-lg:border-border"
            />
            <AdminStripMetric
              label="最近一次导入"
              value={latest ? formatDateTime(latest.created_at) : "尚无记录"}
              isTimestamp={Boolean(latest)}
              hint={
                latest
                  ? `${latest.filename} · 写入 ${formatNumber(latest.row_ok)} 行`
                  : "点击右上角「新建导入」上传 CSV 或解析包"
              }
            />
          </div>
        </section>
      )}

      <section className="grid gap-4" aria-labelledby="phase1-intake-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="phase1-intake-heading" className="title-sub text-brand-navy">
              一期指标入库状态（{MAPPERS.length} 项）
            </h2>
            <p className="caption text-ink-muted">
              覆盖审评注册（01–03）、UDI 规格（05）、单项冠军与上市企业（12–13）、政策与审评指导原则（23–24）、监管年报（28）及进出口贸易（38）。
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={showPhase2}
            aria-controls="phase2-roadmap-panel"
            onClick={() => setShowPhase2((prev) => !prev)}
          >
            {showPhase2 ? (
              <>
                <IconChevronUp aria-hidden="true" />
                收起二期规划指标
              </>
            ) : (
              <>
                <IconChevronDown aria-hidden="true" />
                {`显示二期规划指标（${PHASE2_INDICATORS.length} 项）`}
              </>
            )}
          </Button>
        </div>

        <DataTable
          caption="一期指标入库状态台账"
          columns={intakeColumns}
          data={intake}
          getRowId={(r) => r.seq}
          dense
        />
      </section>

      {showPhase2 && (
        <section id="phase2-roadmap-panel" className="grid gap-4 border-t border-border pt-6" aria-labelledby="phase2-heading">
          <div className="grid gap-1">
            <h2 id="phase2-heading" className="title-sub text-brand-navy">
              二期规划指标储备目录（{PHASE2_INDICATORS.length} 项）
            </h2>
            <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
              以下 23 项三级指标已完成 V3.0 记录粒度、关联主键与口径边界定义，将在二期按预设通道接入入库流水线。
            </p>
          </div>
          <DataTable
            caption="二期规划指标目录"
            columns={phase2Columns}
            data={PHASE2_INDICATORS}
            getRowId={(i) => i.seq}
            dense
          />
        </section>
      )}

      <section className="grid gap-4" aria-labelledby="recent-batches-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-batches-heading" className="title-sub text-brand-navy">
            最近导入记录
          </h2>
          <TextLink to="/admin/batches">查看全部导入批次</TextLink>
        </div>
        {batches.isError ? (
          <QueryError error={batches.error} onRetry={() => batches.refetch()} />
        ) : (
          <DataTable
            caption="最近导入记录"
            columns={batchColumns}
            data={batchList.slice(0, 8)}
            getRowId={(b) => b.id}
            loading={batches.isPending}
            empty="尚无实时导入批次记录；可前往「新建导入」选择 38 号指标上传样例 CSV。"
            dense
          />
        )}
      </section>
    </div>
  );
}

function AdminStripMetric({
  label,
  value,
  unit,
  hint,
  alert,
  isTimestamp,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  alert?: boolean;
  isTimestamp?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1 px-4 py-4 first:lg:pl-0 last:lg:pr-0", className)}>
      <p className="flex items-center gap-1.5 label text-ink-muted">
        {alert && <span aria-hidden="true" className="size-1.5 rounded-pill bg-brand-red" />}
        {label}
      </p>
      <p
        className={cn(
          "tabular-nums",
          isTimestamp ? "title-sub text-brand-navy" : "numeral",
          alert ? "text-brand-red" : "text-brand-navy",
        )}
      >
        {value}
        {unit && <span className="ml-1.5 body-sm font-normal text-ink-muted">{unit}</span>}
      </p>
      <p className="caption text-ink-muted">{hint}</p>
    </div>
  );
}
