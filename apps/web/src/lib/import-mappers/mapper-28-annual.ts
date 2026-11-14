import type { IndicatorMapper } from "./types";

export const mapper28: IndicatorMapper = {
  seq: "28",
  name: "药监注册监管年度报告",
  channel: "file",
  status: "ready",
  fields: [
    { key: "year", label: "报告年度", required: true },
    { key: "metric", label: "统计项", required: true },
    { key: "value", label: "数值" },
  ],
};
