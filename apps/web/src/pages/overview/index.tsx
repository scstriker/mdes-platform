import { Link } from "react-router";
import { IconListDetails, IconUpload } from "@tabler/icons-react";
import type { ClusterStats } from "@mdes/shared";
import {
  Card,
  DataTable,
  Descriptions,
  EmptyState,
  formatNumber,
  KpiTile,
  ProgressMeter,
  SectionTitle,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { Page } from "@/components/layout/page";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { useStats } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { IMPORT_STATUS } from "@/lib/labels";

const percent = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

const CLUSTER_COLUMNS: DataTableColumn<ClusterStats>[] = [
  {
    key: "name",
    title: "指标簇",
    primary: true,
    cell: (c) => <TextLink to={`/indicators?cluster=${c.code}`}>{c.name}</TextLink>,
  },
  { key: "phase1", title: "一期指标", type: "number", sortable: true },
  { key: "phase1_with_data", title: "一期已入库", type: "number", sortable: true },
  {
    key: "coverage",
    title: "一期覆盖率",
    value: (c) => (c.phase1 > 0 ? c.phase1_with_data / c.phase1 : 0),
    sortable: true,
    cell: (c) => (
      <div className="flex min-w-36 items-center gap-3">
        <ProgressMeter value={c.phase1_with_data} max={c.phase1} label={`${c.name}一期覆盖率`} className="flex-1" />
        <span className="w-12 text-right body-sm tabular-nums text-ink-muted">{percent(c.phase1_with_data, c.phase1)}</span>
      </div>
    ),
  },
  { key: "later", title: "后期指标", type: "number", sortable: true },
  { key: "observations", title: "观测值", type: "number", sortable: true },
];

export default function OverviewPage() {
  const stats = useStats();
  const s = stats.data;
  const loading = stats.isPending;

  return (
    <Page
      number="一"
      title="概览"
      lead={
        <>
          V12 指标体系 7 簇 99 项与已入库观测数据的总体情况
          {s?.observations.latest_period && <>，数据截止 {s.observations.latest_period}</>}。
        </>
      }
      actions={
        <>
          <Button variant="secondary" asChild>
            <Link to="/import">
              <IconUpload aria-hidden="true" />
              导入数据
            </Link>
          </Button>
          <Button asChild>
            <Link to="/indicators">
              <IconListDetails aria-hidden="true" />
              浏览指标目录
            </Link>
          </Button>
        </>
      }
    >
      {stats.isError ? (
        <QueryError error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid gap-8">
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3">
            <KpiTile
              label="指标总数"
              value={s?.indicators.total}
              unit="项"
              delta={s && `${s.clusters.length} 个簇 · 一期 ${s.indicators.phase1} 项`}
              loading={loading}
            />
            <KpiTile
              label="一期已入库"
              value={s?.indicators.phase1_with_data}
              unit={s && `/ ${s.indicators.phase1} 项`}
              delta={s && `覆盖率 ${percent(s.indicators.phase1_with_data, s.indicators.phase1)}`}
              highlight
              loading={loading}
            />
            <KpiTile
              label="观测值"
              value={s?.observations.total}
              unit="条"
              delta={s && (s.observations.latest_period ? `数据截止 ${s.observations.latest_period}` : "尚未导入")}
              loading={loading}
              className="col-span-2 lg:col-span-1"
            />
          </div>

          <section className="grid gap-4">
            <SectionTitle level={2} number="1.1">
              各簇覆盖情况
            </SectionTitle>
            <DataTable
              caption="各指标簇的一期覆盖率与观测值数量"
              columns={CLUSTER_COLUMNS}
              data={s?.clusters ?? []}
              getRowId={(c) => c.code}
              loading={loading}
            />
          </section>

          <section className="grid gap-4">
            <SectionTitle level={2} number="1.2">
              最近导入
            </SectionTitle>
            {loading ? (
              <Card>
                <span className="body text-ink-muted">加载中</span>
              </Card>
            ) : s?.latest_batch ? (
              <Card
                title={s.latest_batch.filename}
                meta={formatDateTime(s.latest_batch.created_at)}
                footer={
                  <>
                    <TextLink to={`/observations?batch_id=${s.latest_batch.id}`} className="body">
                      查看本批次数据
                    </TextLink>
                    <Button variant="secondary" size="sm" asChild>
                      <Link to="/import">继续导入</Link>
                    </Button>
                  </>
                }
              >
                <Descriptions
                  columns={3}
                  items={[
                    {
                      term: "状态",
                      value: <Tag tone={IMPORT_STATUS[s.latest_batch.status].tone}>{IMPORT_STATUS[s.latest_batch.status].label}</Tag>,
                    },
                    { term: "写入行数", value: formatNumber(s.latest_batch.row_ok) },
                    { term: "失败行数", value: formatNumber(s.latest_batch.row_err) },
                  ]}
                />
              </Card>
            ) : (
              <EmptyState
                title="还没有导入记录"
                description="上传 CSV 观测值后，这里显示最近一次导入的结果。"
                action={
                  <Button asChild>
                    <Link to="/import">去导入</Link>
                  </Button>
                }
              />
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
