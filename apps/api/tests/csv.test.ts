import { describe, expect, it } from "vitest";
import { parseObservationCsv } from "../src/csv";

describe("parseObservationCsv", () => {
  it("parses valid rows", () => {
    const csv = `indicator_id,period,geo,value_num,unit,value_text,dims
TRD-001,2024-01,CN,10,亿元,,"{""trade_type"":""import""}"
`;
    const result = parseObservationCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].indicator_id).toBe("TRD-001");
    expect(result.rows[0].value_num).toBe(10);
    expect(result.rows[0].dims).toEqual({ trade_type: "import" });
  });

  it("rejects over limit", () => {
    const header = "indicator_id,period,value_num";
    const rows = Array.from({ length: 3 }, (_, i) => `TRD-001,2024-0${i + 1},1`).join("\n");
    const result = parseObservationCsv(`${header}\n${rows}`, 2);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/row limit exceeded/);
  });

  it("requires value", () => {
    const csv = `indicator_id,period,geo,value_num,unit,value_text,dims
TRD-001,2024-01,CN,,,
`;
    const result = parseObservationCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/value_num or value_text/);
  });
});
