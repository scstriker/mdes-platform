import type { IndicatorMapper } from "./types";

/** 02 创新医疗器械审查、获批产品：公示与正式获批分阶段记录，严禁混同加总 */
export const mapper02: IndicatorMapper = {
  seq: "02",
  name: "创新医疗器械审查、获批产品",
  channel: "table",
  indicatorId: "INN-029",
  primaryKey: "apply_or_reg_no",
  status: "ready",
  note: "进入创新特别审查程序公示与正式获批上市须按阶段标识分开统计。",
  fields: [
    { key: "apply_or_reg_no", label: "审查编号/注册证号", required: true, aliases: ["审查编号", "受理号", "注册证号"] },
    { key: "product_name", label: "产品名称", required: true, aliases: ["产品名称", "器械名称"] },
    { key: "applicant", label: "申报企业", required: true, aliases: ["申报企业", "申请人", "注册人名称"] },
    { key: "uscc", label: "统一社会信用代码", aliases: ["统一社会信用代码", "信用代码"] },
    { key: "review_stage", label: "审评阶段", required: true, aliases: ["审评阶段", "阶段", "状态"] },
    { key: "category_code", label: "器械分类编码", aliases: ["分类编码", "产品类别"] },
    { key: "province", label: "省份地区", aliases: ["省份", "地区", "所在省"] },
    { key: "announce_date", label: "公示/批准日期", required: true, aliases: ["公示日期", "批准日期", "日期"] },
    { key: "remark", label: "备注", aliases: ["备注"] },
  ],
};
