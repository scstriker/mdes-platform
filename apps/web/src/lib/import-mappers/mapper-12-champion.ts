import type { IndicatorMapper } from "./types";

/** 12 医疗器械制造业单项冠军企业与统计：企业 × 冠军产品 × 认定批次 */
export const mapper12: IndicatorMapper = {
  seq: "12",
  name: "医疗器械制造业单项冠军企业与统计",
  channel: "table",
  indicatorId: "ENT-075",
  primaryKey: "uscc_product_batch",
  status: "ready",
  note: "工信部认定的冠军产品属市场品类口径，与单张药监注册证型号并非严格一对一。",
  fields: [
    { key: "enterprise_name", label: "认定企业", required: true, aliases: ["认定企业", "企业名称", "示范企业"] },
    { key: "uscc", label: "统一社会信用代码", required: true, aliases: ["统一社会信用代码", "信用代码"] },
    { key: "champion_product", label: "冠军产品名称", required: true, aliases: ["冠军产品", "冠军产品名称", "单项冠军产品"] },
    { key: "champion_type", label: "认定类别", required: true, aliases: ["认定类别", "类型"] },
    { key: "batch_no", label: "认定批次", required: true, aliases: ["认定批次", "批次"] },
    { key: "review_status", label: "复核状态", aliases: ["复核状态", "状态"] },
    { key: "province", label: "省份地区", required: true, aliases: ["省份", "地区", "所在省份"] },
    { key: "remark", label: "备注", aliases: ["备注"] },
  ],
};
