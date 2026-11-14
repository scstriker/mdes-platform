import type { IndicatorMapper } from "./types";

export const mapper05: IndicatorMapper = {
  seq: "05",
  name: "医疗器械UDI规格型号明细",
  channel: "table",
  primaryKey: "udi_di",
  status: "pending",
  note: "正式字段清单待补；壳层可选该指标，对照表显示「模板待补」。",
  fields: [
    { key: "udi_di", label: "UDI-DI", required: true, aliases: ["UDI-DI", "产品标识"] },
    { key: "reg_no", label: "注册证号", aliases: ["注册证号"] },
    { key: "model", label: "规格型号", aliases: ["规格型号", "型号"] },
  ],
};
