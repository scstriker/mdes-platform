import type { IndicatorMapper } from "./types";

export const mapper24: IndicatorMapper = {
  seq: "24",
  name: "医疗器械注册审查指导原则",
  channel: "file",
  status: "ready",
  fields: [
    { key: "doc_id", label: "文件编号", required: true },
    { key: "title", label: "标题", required: true },
  ],
};
