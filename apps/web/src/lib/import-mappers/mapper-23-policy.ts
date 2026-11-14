import type { IndicatorMapper } from "./types";

export const mapper23: IndicatorMapper = {
  seq: "23",
  name: "国家及地方医疗器械政策条款",
  channel: "file",
  status: "ready",
  note: "原始 PDF/HTML 与解析 JSON 按文件名配对上传，两者都保存。",
  fields: [
    { key: "doc_id", label: "文号", required: true },
    { key: "title", label: "标题", required: true },
    { key: "clause_id", label: "条款 ID", required: true },
  ],
};
