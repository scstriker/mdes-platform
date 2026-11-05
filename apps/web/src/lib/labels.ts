/**
 * 界面上的中文标签：阶段、来源类型、地域与常见维度。
 * 未登记的值原样显示，不猜测含义。
 */
import type { ImportStatus, Phase } from "@mdes/shared";
import type { TagTone } from "@/components/itei";

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

/** 地域：CN 与 31 个省级行政区划代码（GB/T 2260） */
export const GEO_LABELS: Record<string, string> = {
  CN: "全国",
  "110000": "北京",
  "120000": "天津",
  "130000": "河北",
  "140000": "山西",
  "150000": "内蒙古",
  "210000": "辽宁",
  "220000": "吉林",
  "230000": "黑龙江",
  "310000": "上海",
  "320000": "江苏",
  "330000": "浙江",
  "340000": "安徽",
  "350000": "福建",
  "360000": "江西",
  "370000": "山东",
  "410000": "河南",
  "420000": "湖北",
  "430000": "湖南",
  "440000": "广东",
  "450000": "广西",
  "460000": "海南",
  "500000": "重庆",
  "510000": "四川",
  "520000": "贵州",
  "530000": "云南",
  "540000": "西藏",
  "610000": "陕西",
  "620000": "甘肃",
  "630000": "青海",
  "640000": "宁夏",
  "650000": "新疆",
};

export const geoLabel = (geo: string) => GEO_LABELS[geo] ?? geo;

/** 维度名与取值的中文说明（样例数据里出现过的） */
const DIM_LABELS: Record<string, string> = {
  trade_type: "贸易方向",
  partner: "贸易伙伴",
  metric: "口径",
};

const DIM_VALUE_LABELS: Record<string, Record<string, string>> = {
  trade_type: { import: "进口", export: "出口" },
  partner: {
    US: "美国",
    DE: "德国",
    JP: "日本",
    NL: "荷兰",
    KR: "韩国",
    FR: "法国",
    GB: "英国",
    IT: "意大利",
    CH: "瑞士",
    IE: "爱尔兰",
    MX: "墨西哥",
    SG: "新加坡",
    CN: "中国",
  },
};

export const dimLabel = (key: string) => DIM_LABELS[key] ?? key;

export function dimValueLabel(key: string, value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return DIM_VALUE_LABELS[key]?.[raw] ?? raw;
}

/** dims → 「贸易方向：进口 · 贸易伙伴：美国」；空时返回「—」 */
export function formatDims(dims: Record<string, unknown> | null | undefined): string {
  const entries = Object.entries(dims ?? {});
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${dimLabel(k)}：${dimValueLabel(k, v)}`).join(" · ");
}
