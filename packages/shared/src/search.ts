/**
 * 前后端统一的查询分词、多词项（AND）规范化匹配与地域/切片维度中文别名解析。
 * 确保全站检索、各业务专题页、后台核查页与 D1 SQL 服务端过滤遵循完全一致的匹配语义。
 */
import type { Observation } from "./types";

export const MAX_QUERY_TOKENS = 8;

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

/** 维度名与取值的中文说明 */
export const DIM_LABELS: Record<string, string> = {
  trade_type: "贸易方向",
  partner: "贸易伙伴",
  metric: "口径",
};

export const DIM_VALUE_LABELS: Record<string, Record<string, string>> = {
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

/**
 * 将用户查询词规范化拆分为小写 token 列表（支持半角与全角空白分隔，去重，上限 MAX_QUERY_TOKENS）。
 */
export function tokenizeQuery(rawQuery: string | null | undefined): string[] {
  if (!rawQuery) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of rawQuery.trim().toLowerCase().split(/[\s\u3000]+/)) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    out.push(part);
    if (out.length >= MAX_QUERY_TOKENS) break;
  }
  return out;
}

/**
 * 要求所有查询 token 均在目标文本中命中（不区分大小写，无顺序与连续性硬约束）。
 * 空查询始终返回 true。
 */
export function matchesQuery(
  haystack: string,
  rawQuery: string | readonly string[] | null | undefined,
): boolean {
  const tokens =
    typeof rawQuery === "string" || rawQuery == null ? tokenizeQuery(rawQuery) : rawQuery;
  if (tokens.length === 0) return true;
  const lower = haystack.toLowerCase();
  for (const tk of tokens) {
    if (!lower.includes(tk)) return false;
  }
  return true;
}

/**
 * 将单个小写搜索 token 解析为可能对应的行政区划代码和 dims 键值片段，
 * 使服务端 SQLite 与内存查询在搜「广东」「美国」「进口」等中文词时能命中存为编码的观测值。
 */
export function resolveObservationTokenAliases(token: string): {
  geoCodes: string[];
  dimHints: string[];
} {
  const tk = token.trim().toLowerCase();
  if (!tk) return { geoCodes: [], dimHints: [] };

  const geoCodes: string[] = [];
  for (const [code, label] of Object.entries(GEO_LABELS)) {
    const aliases =
      code === "CN"
        ? `${code} ${label} 全国汇总`
        : `${code} ${label} ${label}省 ${label}市 ${label}自治区`;
    if (aliases.toLowerCase().includes(tk)) {
      geoCodes.push(code);
    }
  }

  const dimSet = new Set<string>();
  for (const [key, label] of Object.entries(DIM_LABELS)) {
    if (label.toLowerCase().includes(tk)) {
      dimSet.add(key.toLowerCase());
    }
  }
  for (const valueMap of Object.values(DIM_VALUE_LABELS)) {
    for (const [rawVal, cnLabel] of Object.entries(valueMap)) {
      if (cnLabel.toLowerCase().includes(tk)) {
        dimSet.add(`"${rawVal.toLowerCase()}"`);
      }
    }
  }

  return { geoCodes, dimHints: [...dimSet] };
}

/**
 * 与服务端 SQL 语义完全等价的观测值匹配函数（供浏览器离线演示 API 与单元测试复用）。
 */
export function observationMatchesQuery(
  obs: Pick<
    Observation,
    "indicator_id" | "period" | "geo" | "dims" | "value_num" | "value_text" | "unit" | "batch_id"
  >,
  indicatorName: string,
  rawQuery: string | null | undefined,
): boolean {
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) return true;

  const dimsJson = JSON.stringify(obs.dims ?? {}).toLowerCase();
  const baseHaystack = `${obs.indicator_id} ${indicatorName} ${obs.period} ${obs.geo} ${dimsJson} ${obs.value_num ?? ""} ${obs.value_text ?? ""} ${obs.unit} ${obs.batch_id ?? ""}`.toLowerCase();

  for (const tk of tokens) {
    if (baseHaystack.includes(tk)) continue;
    const { geoCodes, dimHints } = resolveObservationTokenAliases(tk);
    if (geoCodes.includes(obs.geo)) continue;
    if (dimHints.some((h) => dimsJson.includes(h))) continue;
    return false;
  }
  return true;
}
