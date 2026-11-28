import { describe, expect, it } from "vitest";
import {
  matchesQuery,
  observationMatchesQuery,
  resolveObservationTokenAliases,
  tokenizeQuery,
} from "../src/search";

describe("统一查询分词与匹配规则（@mdes/shared）", () => {
  it("按半角与全角空白拆分、转小写并去重", () => {
    expect(tokenizeQuery("  CT　9022.3000  ct ")).toEqual(["ct", "9022.3000"]);
    expect(tokenizeQuery("")).toEqual([]);
  });

  it("matchesQuery 要求所有词项分别出现，不强制连续子串", () => {
    const hay = "9022.3000 医用 X 射线 CT 球管及高压发生器";
    expect(matchesQuery(hay, "CT 9022.3000")).toBe(true);
    expect(matchesQuery(hay, "CT 磁共振")).toBe(false);
    expect(matchesQuery(hay, "")).toBe(true);
  });

  it("观测值别名解析覆盖行政区划中文名与切片维度中文值", () => {
    expect(resolveObservationTokenAliases("广东").geoCodes).toContain("440000");
    expect(resolveObservationTokenAliases("德国").dimHints).toContain('"de"');
    expect(resolveObservationTokenAliases("进口").dimHints).toContain('"import"');

    const sampleObs = {
      indicator_id: "TRD-005",
      period: "2026-09",
      geo: "440000",
      dims: { partner: "DE", trade_type: "import" },
      value_num: 18.5,
      value_text: null,
      unit: "亿美元",
      batch_id: "batch-1234",
    };
    expect(observationMatchesQuery(sampleObs, "主要贸易伙伴结构", "广东 德国 进口")).toBe(true);
    expect(observationMatchesQuery(sampleObs, "主要贸易伙伴结构", "广东 日本")).toBe(false);
  });
});
