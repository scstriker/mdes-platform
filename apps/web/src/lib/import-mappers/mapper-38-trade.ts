import type { IndicatorMapper } from "./types";

export const mapper38: IndicatorMapper = {
  seq: "38",
  name: "医疗器械进出口贸易",
  channel: "table",
  indicatorId: "TRD-001",
  primaryKey: "period_geo_hs",
  status: "pending",
  note: "可暂用通用观测值 CSV（indicator_id/period/geo/value_num）；专用模板字段待补。",
  fields: [
    { key: "period", label: "期间", required: true, aliases: ["期间", "period"] },
    { key: "geo", label: "地域", aliases: ["地域", "geo"] },
    { key: "hs", label: "HS 编码", aliases: ["HS", "HS编码", "HS 码"] },
    { key: "value_num", label: "金额", required: true, aliases: ["金额", "value_num"] },
  ],
};
