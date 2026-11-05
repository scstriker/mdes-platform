import { Placeholder } from "../placeholder";

export default function ImportPage() {
  return (
    <Placeholder
      number="五"
      title="数据导入"
      lead="上传 CSV 观测值，预校验后写入数据库。"
      items={["拖拽上传 → 前端预校验 → 导入 → 结果", "行错误按错误码显示中文说明", "导入历史与「查看本批次数据」"]}
    />
  );
}
