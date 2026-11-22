import { describe, expect, it } from "vitest";
import { parseCustomsCsvBytes } from "../src/trade";

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
