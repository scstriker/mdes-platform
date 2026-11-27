import type { IndicatorMapper } from "./types";

/** 03 优先审批医疗器械：按公示、在审、审结、批准状态分层记录 */
export const mapper03: IndicatorMapper = {
  seq: "03",
  name: "优先审批医疗器械",
  channel: "table",
  indicatorId: "REG-025",
  primaryKey: "accept_no",
  status: "ready",
  note: "纳入优先审批公示名单不代表已获批上市，须按审批阶段分层披露。",
  fields: [
    { key: "accept_no", label: "优先审批受理号", required: true, aliases: ["受理号", "申请编号"] },
    { key: "product_name", label: "产品名称", required: true, aliases: ["产品名称", "器械名称"] },
    { key: "applicant", label: "申报企业", required: true, aliases: ["申报企业", "申请人"] },
    { key: "uscc", label: "统一社会信用代码", aliases: ["统一社会信用代码", "信用代码"] },
    { key: "priority_reason", label: "优先审批理由", required: true, aliases: ["优先审批理由", "适用情形", "理由"] },
    { key: "approval_stage", label: "审批阶段", required: true, aliases: ["审批阶段", "审评状态", "状态"] },
    { key: "public_date", label: "公示日期", required: true, aliases: ["公示日期", "受理日期"] },
    { key: "reg_no", label: "获批注册证号", aliases: ["注册证号", "关联注册证号"] },
    { key: "remark", label: "备注", aliases: ["备注"] },
  ],
};
