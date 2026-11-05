/**
 * 观测值切片（修复旧图表「按期间把所有行加总」的问题）。
 *
 * 一条观测值落在由「周期粒度 × 地域 × 单位 × dims 各键」确定的切片里。画图前必须先把这些维度
 * 各选定一个值；只有地域或 dims 的某一维可以展开成多条序列做对比。任何情况下都不跨维度、
 * 跨单位、跨周期粒度加总。同一切片同一期间有多条记录时（例如重复导入），取最近导入的一条。
 */
import type { Observation } from "@mdes/shared";
import { dimLabel, dimValueLabel, geoLabel } from "@/lib/labels";

export type Granularity = "year" | "quarter" | "month" | "day" | "other";

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  year: "年度",
  quarter: "季度",
  month: "月度",
  day: "日度",
  other: "其他",
};

export function granularityOf(period: string): Granularity {
  if (/^\d{4}$/.test(period)) return "year";
  if (/^\d{4}-?Q[1-4]$/i.test(period)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(period)) return "month";
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return "day";
  return "other";
}

const EMPTY = "";
const EMPTY_LABEL = "（未填）";

/** 维度键：freq、geo、unit、d.<dims 键> */
export type DimensionKey = string;

export type DimensionValue = { value: string; label: string; count: number };

export type Dimension = {
  key: DimensionKey;
  label: string;
  values: DimensionValue[];
  /** 能否展开成多条序列对比：周期粒度与单位不行（不同粒度、不同单位不能放在同一坐标轴上） */
  splittable: boolean;
};

export function valueOf(row: Observation, key: DimensionKey): string {
  if (key === "freq") return granularityOf(row.period);
  if (key === "geo") return row.geo ?? EMPTY;
  if (key === "unit") return row.unit ?? EMPTY;
  const v = row.dims?.[key.slice(2)];
  if (v === undefined || v === null || v === "") return EMPTY;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function labelOf(key: DimensionKey, value: string): string {
  if (value === EMPTY) return EMPTY_LABEL;
  if (key === "freq") return GRANULARITY_LABELS[value as Granularity] ?? value;
  if (key === "geo") return geoLabel(value);
  if (key === "unit") return value;
  return dimValueLabel(key.slice(2), value);
}

export function dimensionLabel(key: DimensionKey): string {
  if (key === "freq") return "周期";
  if (key === "geo") return "地域";
  if (key === "unit") return "单位";
  return dimLabel(key.slice(2));
}

/** 从数据里归纳出全部维度；取值按出现次数降序 */
export function dimensionsOf(rows: readonly Observation[]): Dimension[] {
  const dimKeys = [...new Set(rows.flatMap((r) => Object.keys(r.dims ?? {})))].sort();
  const keys: DimensionKey[] = ["freq", "geo", "unit", ...dimKeys.map((k) => `d.${k}`)];
  return keys.map((key) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(valueOf(r, key), (counts.get(valueOf(r, key)) ?? 0) + 1);
    const values = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: labelOf(key, value), count }));
    return { key, label: dimensionLabel(key), values, splittable: key !== "freq" && key !== "unit" };
  });
}

export type Selection = Record<DimensionKey, string>;

/**
 * 补全选择：URL 里给的值有效就用，否则取默认（地域优先「全国」CN，其余取出现最多的值）。
 * 选择是逐维收窄的：后面维度的候选值只看前面已选定维度下还存在的数据。
 */
export function resolveSelection(rows: readonly Observation[], requested: Partial<Selection>, splitKey?: string) {
  const dims = dimensionsOf(rows);
  const selection: Selection = {};
  let pool = rows;
  const available: Record<DimensionKey, DimensionValue[]> = {};
  for (const dim of dims) {
    const values = dimensionsOf(pool).find((d) => d.key === dim.key)?.values ?? [];
    available[dim.key] = values;
    if (dim.key === splitKey) continue;
    const wanted = requested[dim.key];
    const pick =
      wanted !== undefined && values.some((v) => v.value === wanted)
        ? wanted
        : dim.key === "geo" && values.some((v) => v.value === "CN")
          ? "CN"
          : (values[0]?.value ?? EMPTY);
    selection[dim.key] = pick;
    pool = pool.filter((r) => valueOf(r, dim.key) === pick);
  }
  return { dimensions: dims, selection, available };
}

export type SeriesPoint = { period: string; value: number; row: Observation };

export type Series = { key: string; label: string; points: SeriesPoint[] };

export type SliceResult = {
  /** 当前切片内的全部记录（含文本值与被去重的记录），供数据表使用 */
  rows: Observation[];
  periods: string[];
  series: Series[];
  /** 同一切片同一期间的重复记录数（已取最近导入的一条） */
  duplicates: number;
  /** 只有文本值、没有数值的记录数 */
  textOnly: number;
  /** 超过 5 条序列时被省略的序列数（ITEI 图表最多 5 个序列色） */
  omitted: number;
};

export const MAX_SERIES = 5;

const newer = (a: Observation, b: Observation) =>
  a.created_at === b.created_at ? Number(a.id) > Number(b.id) : a.created_at > b.created_at;

export function buildSlice(rows: readonly Observation[], selection: Selection, splitKey?: string): SliceResult {
  const inSlice = rows.filter((r) =>
    Object.entries(selection).every(([key, value]) => key === splitKey || valueOf(r, key) === value),
  );
  const groups = new Map<string, Map<string, Observation>>();
  let duplicates = 0;
  let textOnly = 0;
  for (const r of inSlice) {
    if (r.value_num === null || r.value_num === undefined) {
      textOnly++;
      continue;
    }
    const g = splitKey ? valueOf(r, splitKey) : "";
    const byPeriod = groups.get(g) ?? new Map<string, Observation>();
    const prev = byPeriod.get(r.period);
    if (prev) {
      duplicates++;
      if (newer(r, prev)) byPeriod.set(r.period, r);
    } else {
      byPeriod.set(r.period, r);
    }
    groups.set(g, byPeriod);
  }

  let series: Series[] = [...groups.entries()].map(([key, byPeriod]) => ({
    key,
    label: splitKey ? labelOf(splitKey, key) : "",
    points: [...byPeriod.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((row) => ({ period: row.period, value: row.value_num as number, row })),
  }));
  // 多序列时按最新一期的数值降序，超过 5 条只保留前 5 条
  series.sort((a, b) => (b.points.at(-1)?.value ?? 0) - (a.points.at(-1)?.value ?? 0));
  const omitted = Math.max(0, series.length - MAX_SERIES);
  series = series.slice(0, MAX_SERIES);
  const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))].sort();

  return {
    rows: [...inSlice].sort((a, b) => b.period.localeCompare(a.period) || Number(b.id) - Number(a.id)),
    periods,
    series,
    duplicates,
    textOnly,
    omitted,
  };
}
