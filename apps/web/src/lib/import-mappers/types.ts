/** 指标入库 mapper：平台内差异是配置，不是整站 fork。字段清单未定则 status=pending。 */
export type ImportChannel = "table" | "file";

export type MapperField = {
  key: string;
  label: string;
  required?: boolean;
  /** 示意表头别名，用于自动对照 */
  aliases?: string[];
};

export type IndicatorMapper = {
  seq: string;
  name: string;
  channel: ImportChannel;
  /** 观测值 / 明细写入用的工程指标 id，可空 */
  indicatorId?: string;
  primaryKey?: string;
  fields: MapperField[];
  status: "ready" | "pending";
  note?: string;
};
