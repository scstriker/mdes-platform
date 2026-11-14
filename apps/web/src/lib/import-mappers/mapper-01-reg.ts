import type { IndicatorMapper } from "./types";

/** 01 注册与备案：字段按示意 xlsx 明细推演，正式清单可再替换 */
export const mapper01: IndicatorMapper = {
  seq: "01",
  name: "医疗器械注册与备案明细",
  channel: "table",
  indicatorId: "REG-001",
  primaryKey: "reg_no",
  status: "ready",
  fields: [
    { key: "reg_no", label: "注册证号", required: true, aliases: ["注册证号", "注册证编号", "备案号"] },
    { key: "product_name", label: "产品名称", required: true, aliases: ["产品名称", "产品名"] },
    { key: "registrant", label: "注册人名称", required: true, aliases: ["注册人", "注册人名称", "备案人"] },
    { key: "uscc", label: "统一社会信用代码", aliases: ["统一社会信用代码", "信用代码"] },
    { key: "mgmt_class", label: "管理类别", required: true, aliases: ["管理类别", "类别"] },
    { key: "origin", label: "国产/进口", required: true, aliases: ["国产/进口", "境内/境外"] },
    { key: "approve_date", label: "批准日期", required: true, aliases: ["批准日期", "发证日期"] },
    { key: "valid_until", label: "有效期至", aliases: ["有效期至", "有效期"] },
    { key: "address", label: "注册人住所", aliases: ["住所", "注册人住所", "地址"] },
    { key: "remark", label: "备注", aliases: ["备注"] },
  ],
};
