import { describe, expect, it } from "vitest";
import type { Observation } from "@mdes/shared";
import { buildSlice, dimensionsOf, granularityOf, resolveSelection } from "../src/lib/observations/slice";

let seq = 0;
const obs = (p: Partial<Observation>): Observation => ({
  id: String(++seq),
  indicator_id: "TRD-001",
  period: "2024-01",
  geo: "CN",
  dims: {},
  value_num: 1,
  value_text: null,
  unit: "亿元",
  batch_id: "b1",
  created_at: "2026-11-05T00:00:00Z",
  ...p,
});

describe("granularityOf", () => {
  it("识别年、季、月、日", () => {
    expect(["2024", "2024Q1", "2024-Q2", "2024-03", "2024-03-01", "上半年"].map(granularityOf)).toEqual([
      "year",
      "quarter",
      "quarter",
      "month",
      "day",
      "other",
    ]);
  });
});

describe("切片：不跨维度、跨单位加总（旧图表的 bug）", () => {
  // 全国汇总 + 两个省，同一期间；旧逻辑会把三者加在一起
  const rows = [
    obs({ geo: "CN", value_num: 100 }),
    obs({ geo: "440000", value_num: 30 }),
    obs({ geo: "310000", value_num: 20 }),
    obs({ geo: "CN", period: "2024-02", value_num: 110 }),
  ];

  it("默认地域选全国，期间值等于全国汇总，不加省份", () => {
    const { selection } = resolveSelection(rows, {});
    expect(selection.geo).toBe("CN");
    const s = buildSlice(rows, selection);
    expect(s.series).toHaveLength(1);
    expect(s.series[0].points.map((p) => [p.period, p.value])).toEqual([
      ["2024-01", 100],
      ["2024-02", 110],
    ]);
  });

  it("按地域对比时每个地域一条序列，各自取值", () => {
    const { selection } = resolveSelection(rows, {}, "geo");
    const s = buildSlice(rows, selection, "geo");
    expect(Object.fromEntries(s.series.map((x) => [x.key, x.points.map((p) => p.value)]))).toEqual({
      CN: [100, 110],
      "440000": [30],
      "310000": [20],
    });
  });

  it("dims 不同的行分到不同切片（贸易伙伴 US / DE / JP）", () => {
    const partners = [
      obs({ indicator_id: "TRD-005", dims: { partner: "US" }, value_num: 22.3 }),
      obs({ indicator_id: "TRD-005", dims: { partner: "DE" }, value_num: 18.7 }),
      obs({ indicator_id: "TRD-005", dims: { partner: "JP" }, value_num: 15.2 }),
    ];
    const one = resolveSelection(partners, {});
    expect(buildSlice(partners, one.selection).series[0].points).toHaveLength(1);
    // 默认取出现最多的取值，次数相同按字母序（DE）；绝不是三者之和 56.2
    expect(one.selection["d.partner"]).toBe("DE");
    expect(buildSlice(partners, one.selection).series[0].points[0].value).toBe(18.7);
    const split = resolveSelection(partners, {}, "d.partner");
    expect(buildSlice(partners, split.selection, "d.partner").series.map((s) => s.label)).toEqual(["美国", "德国", "日本"]);
  });

  it("不同单位不进同一序列，单位不能作为对比维度", () => {
    const mixed = [obs({ unit: "亿元", value_num: 5 }), obs({ unit: "万美元", value_num: 7000 }), obs({ unit: "亿元", period: "2024-02" })];
    const dims = dimensionsOf(mixed);
    expect(dims.find((d) => d.key === "unit")?.splittable).toBe(false);
    expect(dims.find((d) => d.key === "freq")?.splittable).toBe(false);
    const { selection } = resolveSelection(mixed, {});
    expect(selection.unit).toBe("亿元");
    expect(buildSlice(mixed, selection).series[0].points.map((p) => p.value)).toEqual([5, 1]);
  });

  it("年度与月度数据分开，不混在一条时间轴上", () => {
    const mixed = [obs({ period: "2024", value_num: 1500 }), obs({ period: "2024-01", value_num: 120 }), obs({ period: "2024-02", value_num: 130 })];
    const { selection } = resolveSelection(mixed, {});
    expect(selection.freq).toBe("month");
    expect(buildSlice(mixed, selection).periods).toEqual(["2024-01", "2024-02"]);
    const yearly = resolveSelection(mixed, { freq: "year" });
    expect(buildSlice(mixed, yearly.selection).periods).toEqual(["2024"]);
  });

  it("同一期间重复导入：取最近导入的一条，并给出重复数", () => {
    const dup = [
      obs({ value_num: 1, created_at: "2026-11-01T00:00:00Z" }),
      obs({ value_num: 2, created_at: "2026-11-03T00:00:00Z" }),
      obs({ value_num: 3, created_at: "2026-11-02T00:00:00Z" }),
    ];
    const s = buildSlice(dup, resolveSelection(dup, {}).selection);
    expect(s.series[0].points.map((p) => p.value)).toEqual([2]);
    expect(s.duplicates).toBe(2);
    expect(s.rows).toHaveLength(3);
  });

  it("只有文本值的记录不进图表，单独计数", () => {
    const rows2 = [obs({ value_num: null, value_text: "暂缺" }), obs({ period: "2024-02", value_num: 3 })];
    const s = buildSlice(rows2, resolveSelection(rows2, {}).selection);
    expect(s.textOnly).toBe(1);
    expect(s.periods).toEqual(["2024-02"]);
  });

  it("超过 5 条序列只保留最新值最大的 5 条", () => {
    const many = ["A", "B", "C", "D", "E", "F", "G"].map((p, i) => obs({ dims: { partner: p }, value_num: i }));
    const s = buildSlice(many, resolveSelection(many, {}, "d.partner").selection, "d.partner");
    expect(s.series.map((x) => x.key)).toEqual(["G", "F", "E", "D", "C"]);
    expect(s.omitted).toBe(2);
  });

  it("URL 里的选择无效时回落到默认；后面维度只在前面已选范围内取值", () => {
    const rows3 = [obs({ geo: "CN", unit: "亿元" }), obs({ geo: "440000", unit: "万元" })];
    const r = resolveSelection(rows3, { geo: "999999" });
    expect(r.selection).toMatchObject({ geo: "CN", unit: "亿元" });
    const gd = resolveSelection(rows3, { geo: "440000", unit: "亿元" });
    expect(gd.selection).toMatchObject({ geo: "440000", unit: "万元" });
    expect(gd.available.unit.map((v) => v.value)).toEqual(["万元"]);
  });
});

import { findMentions } from "../src/lib/observations/related";

describe("findMentions", () => {
  it("找出规格正文里的其他指标编号，记下出现的字段，不含自身", () => {
    expect(
      findMentions("TRD-001", {
        usage: "经 REG-021 关联 REG-013 与 PRD-056，并与 TRD-002 合成顺逆差；TRD-001 自身",
        note: "参见 REG-021",
        other: 42,
      }),
    ).toEqual([
      { id: "PRD-056", fields: ["usage"] },
      { id: "REG-013", fields: ["usage"] },
      { id: "REG-021", fields: ["usage", "note"] },
      { id: "TRD-002", fields: ["usage"] },
    ]);
  });
});
