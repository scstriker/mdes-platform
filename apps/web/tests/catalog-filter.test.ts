import { describe, expect, it } from "vitest";
import type { IndicatorListItem } from "@mdes/shared";
import { facetCounts, filterIndicators, shortClusterName, type CatalogFilters } from "../src/pages/catalog/filter";

const item = (p: Partial<IndicatorListItem>): IndicatorListItem => ({
  id: "TRD-001",
  cluster_code: "TRD",
  name: "医疗装备进口金额",
  phase: "phase1",
  update_freq: "月",
  source_kind: "pub",
  phase_scope: "",
  obs_count: 0,
  latest_period: null,
  automation: "全自动",
  ...p,
});

const ITEMS = [
  item({ id: "TRD-001", obs_count: 3 }),
  item({ id: "TRD-008", phase: "later", name: "出口结构" }),
  item({ id: "REG-001", cluster_code: "REG", name: "注册证数量", automation: "人工整理", source_kind: "topic" }),
  item({ id: "REG-002", cluster_code: "REG", phase: "later", automation: null }),
];
const NONE: CatalogFilters = { cluster: "", phase: "", source: "", automation: "", data: "", q: "" };

describe("指标目录筛选", () => {
  it("不带条件时返回全部", () => {
    expect(filterIndicators(ITEMS, NONE)).toHaveLength(4);
  });

  it("阶段选一期", () => {
    expect(filterIndicators(ITEMS, { ...NONE, phase: "phase1" }).map((i) => i.id)).toEqual(["TRD-001", "REG-001"]);
  });

  it("多个条件同时生效；搜索匹配编号或名称，不区分大小写", () => {
    expect(filterIndicators(ITEMS, { ...NONE, cluster: "TRD", q: "trd-00" }).map((i) => i.id)).toEqual(["TRD-001", "TRD-008"]);
    expect(filterIndicators(ITEMS, { ...NONE, q: "注册" }).map((i) => i.id)).toEqual(["REG-001"]);
    expect(filterIndicators(ITEMS, { ...NONE, data: "with" }).map((i) => i.id)).toEqual(["TRD-001"]);
    expect(filterIndicators(ITEMS, { ...NONE, data: "without", cluster: "REG" })).toHaveLength(2);
  });

  it("采集方式为空的指标归入「未填写」", () => {
    expect(filterIndicators(ITEMS, { ...NONE, automation: "未填写" }).map((i) => i.id)).toEqual(["REG-002"]);
  });

  it("分面计数忽略自身条件、保留其余条件", () => {
    const f = { ...NONE, cluster: "REG", phase: "phase1" };
    expect(Object.fromEntries(facetCounts(ITEMS, f, "phase", (i) => i.phase))).toEqual({ phase1: 1, later: 1 });
    expect(Object.fromEntries(facetCounts(ITEMS, f, "cluster", (i) => i.cluster_code))).toEqual({ TRD: 1, REG: 1 });
  });

  it("簇名去掉括号编码", () => {
    expect(shortClusterName("进出口贸易（TRD）")).toBe("进出口贸易");
  });
});
