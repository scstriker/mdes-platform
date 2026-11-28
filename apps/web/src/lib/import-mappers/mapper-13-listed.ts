import type { IndicatorMapper } from "./types";

/** 13 医疗器械上市企业标准样本池：法人主体 × 证券代码 × 样本池版本 */
export const mapper13: IndicatorMapper = {
  seq: "13",
  name: "医疗器械上市企业",
  channel: "table",
  indicatorId: "ENT-072",
  primaryKey: "uscc_stock_code",
  status: "ready",
  note: "A+H 双重上市企业按法人主体仅计 1 家；母子公司同时上市须标注并表归属。",
  fields: [
    { key: "entity_name", label: "法人主体名称", required: true, aliases: ["法人主体", "企业名称", "公司全称"] },
    { key: "uscc", label: "统一社会信用代码", required: true, aliases: ["统一社会信用代码", "信用代码"] },
    { key: "stock_code", label: "证券代码", required: true, aliases: ["证券代码", "股票代码", "ticker"] },
    { key: "stock_abbr", label: "证券简称", required: true, aliases: ["证券简称", "股票简称"] },
    { key: "exchange_board", label: "上市交易所/板块", required: true, aliases: ["上市板块", "交易所", "板块"] },
    { key: "group_flag", label: "集团并表标识", aliases: ["并表标识", "集团归属", "A+H标识"] },
    { key: "province", label: "省份地区", aliases: ["省份", "注册省份", "地区"] },
    { key: "pool_version", label: "样本池版本", required: true, aliases: ["样本池版本", "版本"] },
    { key: "remark", label: "备注", aliases: ["备注"] },
  ],
};
