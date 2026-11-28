/**
 * 界面上的中文标签：阶段、来源类型、地域与常见维度。
 * 地域与维度映射来自 @mdes/shared，前后端查询别名与界面展示共用同一份字典。
 */
import type { ImportStatus, Phase } from "@mdes/shared";
import type { TagTone } from "@/components/itei";

export {
  DIM_LABELS,
  DIM_VALUE_LABELS,
  GEO_LABELS,
  dimLabel,
  dimValueLabel,
  formatDims,
  geoLabel,
} from "@mdes/shared";

export const PHASE_LABELS: Record<Phase, string> = { phase1: "一期", later: "后期" };

export const SOURCE_KIND_LABELS: Record<string, string> = {
  pub: "公开数据",
  wind: "Wind",
  topic: "专题",
  mixed: "混合",
  unknown: "未明确",
};

export const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: TagTone }> = {
  completed: { label: "已完成", tone: "success" },
  completed_with_errors: { label: "部分失败", tone: "warning" },
  failed: { label: "导入失败", tone: "danger" },
};
