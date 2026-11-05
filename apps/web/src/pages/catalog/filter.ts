import type { IndicatorListItem } from "@mdes/shared";

/** 目录筛选条件，全部来自 URL query；空字符串表示不限 */
export type CatalogFilters = {
  cluster: string;
  phase: string;
  source: string;
  automation: string;
  /** with：已入库；without：未入库 */
  data: string;
  q: string;
};

export const FILTER_KEYS = ["cluster", "phase", "source", "automation", "data", "q"] as const;

const AUTOMATION_NONE = "未填写";
export const automationOf = (i: IndicatorListItem) => i.automation ?? AUTOMATION_NONE;

function matches(i: IndicatorListItem, f: CatalogFilters, skip?: keyof CatalogFilters): boolean {
  if (skip !== "cluster" && f.cluster && i.cluster_code !== f.cluster) return false;
  if (skip !== "phase" && f.phase && i.phase !== f.phase) return false;
  if (skip !== "source" && f.source && i.source_kind !== f.source) return false;
  if (skip !== "automation" && f.automation && automationOf(i) !== f.automation) return false;
  if (skip !== "data" && f.data === "with" && i.obs_count === 0) return false;
  if (skip !== "data" && f.data === "without" && i.obs_count > 0) return false;
  if (skip !== "q" && f.q) {
    const q = f.q.trim().toLowerCase();
    if (q && !i.id.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function filterIndicators(items: readonly IndicatorListItem[], f: CatalogFilters) {
  return items.filter((i) => matches(i, f));
}

/** 某个分面在「其余条件不变」时各取值的数量，用于选项后的计数 */
export function facetCounts(
  items: readonly IndicatorListItem[],
  f: CatalogFilters,
  key: keyof CatalogFilters,
  valueOf: (i: IndicatorListItem) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (!matches(i, f, key)) continue;
    const v = valueOf(i);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

export const dataStatusOf = (i: IndicatorListItem) => (i.obs_count > 0 ? "with" : "without");

/** 簇名去掉括号里的编码：「进出口贸易（TRD）」→「进出口贸易」 */
export const shortClusterName = (name: string) => name.replace(/（[^）]*）$/, "");
