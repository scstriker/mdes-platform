import { useMemo } from "react";
import type { Indicator, IndicatorListItem } from "@mdes/shared";
import { DataTable, EmptyState, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { useIndicators } from "@/lib/api";
import { findMentions, type Mention } from "@/lib/observations/related";
import { SPEC_FIELDS } from "./spec-tab";

const FIELD_LABELS = Object.fromEntries([...SPEC_FIELDS, ["phase_scope", "一期承诺口径"]]);

type Row = Mention & { indicator?: IndicatorListItem };

/** 「关联指标」页签：由规格正文中出现的指标编号生成（借鉴 OpenMetadata 的关系展示） */
export function RelatedTab({ indicator, clusterNames }: { indicator: Indicator; clusterNames: Map<string, string> }) {
  const list = useIndicators();
  const rows: Row[] = useMemo(() => {
    const byId = new Map((list.data ?? []).map((i) => [i.id, i]));
    return findMentions(indicator.id, { ...(indicator.spec_json ?? {}), phase_scope: indicator.phase_scope }).map((m) => ({
      ...m,
      indicator: byId.get(m.id),
    }));
  }, [indicator, list.data]);

  if (list.isError) return <QueryError error={list.error} onRetry={() => list.refetch()} />;
  if (!list.isPending && rows.length === 0) {
    return <EmptyState title="规格正文中没有提到其他指标" description="关联指标由规格正文里出现的指标编号自动生成。" />;
  }

  const columns: DataTableColumn<Row>[] = [
    {
      key: "id",
      title: "编号",
      type: "code",
      cell: (r) => (r.indicator ? <TextLink to={`/indicators/${r.id}`}>{r.id}</TextLink> : r.id),
    },
    {
      key: "name",
      title: "名称",
      primary: true,
      value: (r) => r.indicator?.name ?? "（指标目录中没有这个编号）",
    },
    { key: "cluster", title: "簇", value: (r) => (r.indicator ? (clusterNames.get(r.indicator.cluster_code) ?? r.indicator.cluster_code) : null) },
    { key: "fields", title: "提及位置", value: (r) => r.fields.map((f) => FIELD_LABELS[f] ?? f).join("、") },
    {
      key: "status",
      title: "数据状态",
      type: "status",
      cell: (r) =>
        !r.indicator ? <Tag size="sm" tone="warning">无此编号</Tag> : r.indicator.obs_count > 0 ? <Tag size="sm" tone="success">已入库</Tag> : <Tag size="sm">未入库</Tag>,
    },
  ];

  return (
    <div className="grid gap-3">
      <p className="body text-ink-muted">规格正文中提到的 {rows.length} 个指标编号。</p>
      <DataTable caption="关联指标" columns={columns} data={rows} getRowId={(r) => r.id} loading={list.isPending} />
    </div>
  );
}

