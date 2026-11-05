import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvRecords, parseObservationCsv, type CsvParseResult } from "../src/csv";
import { developerMessage, ERROR_CODES } from "../src/errors";

const HEADER = "indicator_id,period,geo,value_num,unit,value_text,dims";

function ok(result: CsvParseResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.fileError.code}`);
  return result;
}

describe("parseCsvRecords（RFC 4180）", () => {
  it("引号内的逗号、换行与双引号转义", () => {
    expect(parseCsvRecords('a,"b,c","d\ne","f""g"\r\nh,i,j,k')).toEqual([
      ["a", "b,c", "d\ne", 'f"g'],
      ["h", "i", "j", "k"],
    ]);
  });

  it("末尾换行不产生多余记录", () => {
    expect(parseCsvRecords("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseObservationCsv", () => {
  it("解析有效行", () => {
    const r = ok(parseObservationCsv(`${HEADER}\nTRD-001,2024-01,CN,10,亿元,,"{""trade_type"":""import""}"\n`));
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        line: 2,
        indicator_id: "TRD-001",
        period: "2024-01",
        geo: "CN",
        value_num: 10,
        value_text: null,
        unit: "亿元",
        dims: { trade_type: "import" },
      },
    ]);
  });

  it("样例文件 trd_sample.csv 10 行全部有效", () => {
    const csv = readFileSync(path.resolve(__dirname, "../../../data/samples/trd_sample.csv"), "utf8");
    const r = ok(parseObservationCsv(csv));
    expect(r.rows).toHaveLength(10);
    expect(r.errors).toEqual([]);
  });

  it("兼容 BOM、CRLF，geo 缺省为 CN，列顺序不限", () => {
    const r = ok(parseObservationCsv("﻿value_num,Period,INDICATOR_ID\r\n1.5,2024,TRD-006\r\n"));
    expect(r.rows[0]).toMatchObject({ indicator_id: "TRD-006", period: "2024", geo: "CN", value_num: 1.5, unit: "" });
  });

  it("行号是表格行号：空行也计数", () => {
    const r = ok(parseObservationCsv(`${HEADER}\nTRD-001,2024-01,CN,1,,,\n\nTRD-001,,CN,1,,,\n`));
    expect(r.rows[0].line).toBe(2);
    expect(r.errors).toEqual([{ line: 4, code: "REQUIRED_FIELD_MISSING", params: { field: "period" } }]);
    expect(r.dataRows).toBe(2);
  });

  it("引号内含换行的单元格仍算一行", () => {
    const r = ok(parseObservationCsv(`indicator_id,period,value_text\nTRD-001,2024,"第一行\n第二行"\nTRD-001,,x\n`));
    expect(r.rows[0].value_text).toBe("第一行\n第二行");
    expect(r.errors[0].line).toBe(3);
  });

  it("每种行错误给出错误码与参数", () => {
    const csv = [
      HEADER,
      ",2024-01,CN,1,,,",
      "TRD-001,2024-01,CN,12,3,,,",
      'TRD-001,2024-01,CN,"12,3",,,',
      "TRD-001,2024-01,CN,Infinity,,,",
      "TRD-001,2024-01,CN,,,,",
      'TRD-001,2024-01,CN,1,,,"{bad"',
      'TRD-001,2024-01,CN,1,,,"[1,2]"',
    ].join("\n");
    const r = ok(parseObservationCsv(csv));
    expect(r.rows).toHaveLength(1); // 第 3 行多一列不影响前几列
    expect(r.errors).toEqual([
      { line: 2, code: "REQUIRED_FIELD_MISSING", params: { field: "indicator_id" } },
      { line: 4, code: "INVALID_VALUE_NUM", params: { value: "12,3" } },
      { line: 5, code: "INVALID_VALUE_NUM", params: { value: "Infinity" } },
      { line: 6, code: "VALUE_MISSING", params: {} },
      { line: 7, code: "DIMS_INVALID_JSON", params: {} },
      { line: 8, code: "DIMS_NOT_OBJECT", params: {} },
    ]);
  });

  it("传入指标目录时校验指标编号", () => {
    const r = ok(
      parseObservationCsv(`${HEADER}\nTRD-001,2024-01,CN,1,,,\nTRD-099,2024-01,CN,1,,,`, {
        knownIndicatorIds: ["TRD-001"],
      }),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 3, code: "UNKNOWN_INDICATOR", params: { indicator_id: "TRD-099" } }]);
  });

  it("文件级错误：空文件", () => {
    expect(parseObservationCsv("")).toEqual({ ok: false, fileError: { code: "EMPTY_CSV", params: {} } });
    expect(parseObservationCsv("\n\n")).toMatchObject({ fileError: { code: "EMPTY_CSV" } });
    expect(parseObservationCsv(`${HEADER}\n`)).toMatchObject({ fileError: { code: "EMPTY_CSV" } });
  });

  it("文件级错误：缺必需列", () => {
    expect(parseObservationCsv("indicator_id,value_num\nTRD-001,1")).toEqual({
      ok: false,
      fileError: { code: "MISSING_HEADER", params: { header: "period" } },
    });
    expect(parseObservationCsv("indicator_id,period\nTRD-001,2024")).toMatchObject({
      fileError: { code: "MISSING_HEADER", params: { header: "value_num" } },
    });
  });

  it("文件级错误：超过行数上限", () => {
    const rows = Array.from({ length: 3 }, (_, i) => `TRD-001,2024-0${i + 1},1`).join("\n");
    expect(parseObservationCsv(`indicator_id,period,value_num\n${rows}`, { maxRows: 2 })).toEqual({
      ok: false,
      fileError: { code: "ROW_LIMIT_EXCEEDED", params: { max: 2, actual: 3 } },
    });
  });
});

describe("developerMessage", () => {
  it("每个错误码都有英文说明", () => {
    for (const code of ERROR_CODES) {
      expect(developerMessage(code, { header: "period", field: "period", value: "x", indicator_id: "TRD-099", resource: "indicator", id: "X", max: 1, actual: 2 })).toMatch(/^[ -~]+$/);
    }
  });
});
