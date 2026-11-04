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

  it("keeps each row's source line when an earlier row fails", () => {
    // Line 2 fails parsing; XXX-999 is still on line 3.
    const result = parseObservationCsv(
      "indicator_id,period,value_num\nTRD-001,,1\nXXX-999,2024-01,2",
    );
    expect(result.errors).toEqual([
      { line: 2, message: "indicator_id and period are required" },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ indicator_id: "XXX-999", line: 3 });
  });

  it.each([
    { name: "LF", eol: "\n" },
    { name: "CRLF", eol: "\r\n" },
  ])("counts blank lines when numbering lines ($name)", ({ eol }) => {
    const csv = [
      "indicator_id,period,value_num", // 1
      "TRD-001,2024-01,1", // 2
      "", // 3: blank
      "TRD-001,,2", // 4: parse error
      "   ", // 5: whitespace only
      "TRD-002,2024-02,3", // 6
    ].join(eol);
    const result = parseObservationCsv(csv);
    expect(result.errors).toEqual([
      { line: 4, message: "indicator_id and period are required" },
    ]);
    expect(result.rows.map((r) => [r.indicator_id, r.line])).toEqual([
      ["TRD-001", 2],
      ["TRD-002", 6],
    ]);
  });

  it("counts blank lines before the header", () => {
    const ok = parseObservationCsv("\n\nindicator_id,period,value_num\nTRD-001,2024-01,1");
    expect(ok.errors).toEqual([]);
    expect(ok.rows.map((r) => r.line)).toEqual([4]);

    const missing = parseObservationCsv("\n\nindicator_id,value_num\nTRD-001,1");
    expect(missing.errors).toEqual([
      { line: 3, message: "missing required header: period" },
    ]);
  });
});
