import { describe, expect, it } from "vitest";
import { computeConcentration, computeYoyPct, parseCustomsCsvBytes, USD_SCALE } from "../src/trade";

describe("parseCustomsCsvBytes（海关原件字节解析与定点数美元）", () => {
  it("识别 UTF-8 BOM、千位分隔符美元、双数量双单位，并排除合计行与世界行", () => {
    const csv =
      "\uFEFF商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\r\n" +
      '90181100,心电图记录仪,502,美国,120,台,450,千克,"1,234,567"\r\n' +
      '90181100,心电图记录仪,304,德国,80,台,,,"765,433"\r\n' +
      '90181100,心电图记录仪,000,世界,200,台,450,千克,"2,000,000"\r\n' +
      '合计,,,,200,台,450,千克,"2,000,000"\r\n';
    const bytes = new TextEncoder().encode(csv);
    const res = parseCustomsCsvBytes(bytes, {
      dictVersion: "202601",
      month: "2024-01",
      flow: "import",
      currency: "USD",
      grouping: "partner",
      hs8: ["90181100"],
      emptyHs8: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(2);
    expect(res.summaryRowsSkipped).toBe(2);
    expect(res.rows[0]).toMatchObject({
      hs8: "90181100",
      groupCode: "502",
      groupName: "美国",
      usdScaled: 12_345_670_000n,
      qty1: 120,
      unit1: "台",
      qty2: 450,
      unit2: "千克",
    });
    expect(res.rows[1]).toMatchObject({
      hs8: "90181100",
      groupCode: "304",
      groupName: "德国",
      usdScaled: 7_654_330_000n,
      qty1: 80,
      unit1: "台",
      qty2: null,
      unit2: null,
    });
  });

  it("同一文件内重复 (hs8, groupCode) 业务键时返回行号错误而非重复计额", () => {
    const csv =
      "商品代码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n" +
      "90181100,心电图记录仪,502,美国,100\n" +
      "90181100,心电图记录仪,502,美国,200\n";
    const res = parseCustomsCsvBytes(new TextEncoder().encode(csv), {
      dictVersion: "202601",
      month: "2024-01",
      flow: "import",
      currency: "USD",
      grouping: "partner",
      hs8: ["90181100"],
      emptyHs8: [],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.params.line).toBe(3);
  });
});

describe("computeConcentration 与 computeYoyPct（AC-015 六伙伴与跨期统计）", () => {
  it("验证单月六伙伴 CR1=40, CR3=80, CR5=96, HHI=2602 与双月合并后 CR1=32.5, HHI=2489.5", () => {
    const m1 = [40n, 25n, 15n, 10n, 6n, 4n].map((v, idx) => ({
      partnerCode: `P${idx}`,
      usdScaled: v * USD_SCALE,
    }));
    expect(computeConcentration(m1, 100n * USD_SCALE)).toEqual({
      cr1: 40,
      cr3: 80,
      cr5: 96,
      hhi: 2602,
      partnerCount: 6,
    });

    const m12 = [65n, 65n, 30n, 20n, 12n, 8n].map((v, idx) => ({
      partnerCode: `P${idx}`,
      usdScaled: v * USD_SCALE,
    }));
    expect(computeConcentration(m12, 200n * USD_SCALE)).toEqual({
      cr1: 32.5,
      cr3: 80,
      cr5: 96,
      hhi: 2489.5,
      partnerCount: 6,
    });

    // 伙伴数少于 k 时取已有伙伴；分母为 0 返回 null
    expect(computeConcentration([{ partnerCode: "P0", usdScaled: 60n * USD_SCALE }, { partnerCode: "P1", usdScaled: 40n * USD_SCALE }], 100n * USD_SCALE)).toEqual({
      cr1: 60,
      cr3: 100,
      cr5: 100,
      hhi: 5200,
      partnerCount: 2,
    });
    expect(computeConcentration([], 0n)).toEqual({
      cr1: null,
      cr3: null,
      cr5: null,
      hhi: null,
      partnerCount: 0,
    });
  });

  it("验证同比计算：(100 - 80) / 80 = 25%，缺基期或基期为 0 返回 null", () => {
    expect(computeYoyPct(100n * USD_SCALE, 80n * USD_SCALE)).toBe(25);
    expect(computeYoyPct(100n * USD_SCALE, null)).toBeNull();
    expect(computeYoyPct(100n * USD_SCALE, 0n)).toBeNull();
  });
});
