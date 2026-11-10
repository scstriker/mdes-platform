import type { Indicator } from "@mdes/shared";
import { Descriptions } from "@/components/itei";
import { PHASE_LABELS, SOURCE_KIND_LABELS } from "@/lib/labels";

/** spec_json 里的长文字段，按 V12 指标卡顺序排列 */
export const SPEC_FIELDS: [string, string][] = [
  ["business_value", "业务价值"],
  ["definition", "定义与统计口径"],
  ["source", "数据来源"],
  ["collect_method", "采集方式与更新"],
  ["usage", "计算视图与用途"],
  ["note", "备注"],
];

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** 「规格」页签：元数据键值 + 长文规格（借鉴 open-sdg 指标页的「元数据」页签） */
export function SpecTab({ indicator, clusterName }: { indicator: Indicator; clusterName: string }) {
  const spec = indicator.spec_json ?? {};
  return (
    <div className="grid gap-6">
      <Descriptions
        columns={3}
        items={[
          { term: "指标编号", value: <span className="code">{indicator.id}</span> },
          { term: "所属簇", value: clusterName },
          { term: "阶段", value: PHASE_LABELS[indicator.phase] },
          { term: "更新频率", value: indicator.update_freq },
          { term: "来源类型", value: SOURCE_KIND_LABELS[indicator.source_kind] ?? indicator.source_kind },
          { term: "采集方式", value: indicator.automation },
          { term: "一期承诺口径", value: text(indicator.phase_scope), long: true },
          ...SPEC_FIELDS.map(([key, label]) => ({ term: label, value: text(spec[key]), long: true })),
        ]}
      />
    </div>
  );
}
