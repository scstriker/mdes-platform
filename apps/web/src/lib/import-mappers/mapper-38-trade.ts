import type { IndicatorMapper } from "./types";

export const mapper38: IndicatorMapper = {
  seq: "38",
  name: "医疗器械进出口贸易明细、结构与集中度",
  channel: "table",
  indicatorId: "TRD-001",
  primaryKey: "period_geo_hs",
  status: "ready",
  note: "支持通用观测值 CSV（indicator_id, period, geo, value_num, unit, dims）直接事务写入，兼容 TRD-001 至 TRD-007。",
  fields: [
    { key: "indicator_id", label: "工程指标编码", aliases: ["indicator_id", "指标编码"] },
    { key: "period", label: "期间", required: true, aliases: ["期间", "period", "统计年月"] },
    { key: "geo", label: "地域", aliases: ["地域", "geo", "省市关区"] },
    { key: "hs", label: "HS 编码", aliases: ["HS", "HS编码", "HS 码", "商品编码"] },
    { key: "value_num", label: "金额/数值", required: true, aliases: ["金额", "数值", "value_num"] },
    { key: "unit", label: "计量单位", aliases: ["单位", "unit"] },
    { key: "dims", label: "维度 JSON（方向/伙伴）", aliases: ["dims", "维度"] },
  ],
};
