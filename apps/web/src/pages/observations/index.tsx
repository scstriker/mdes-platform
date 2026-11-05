import { Placeholder } from "../placeholder";

export default function ObservationsPage() {
  return (
    <Placeholder
      number="四"
      title="观测值"
      lead="按指标、期间、地域与批次查询已导入的观测值。"
      items={["筛选：指标、期间范围、地域、批次", "服务端分页与总数", "导出 CSV"]}
    />
  );
}
