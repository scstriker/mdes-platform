import { Placeholder } from "../placeholder";

export default function CatalogPage() {
  return (
    <Placeholder
      number="二"
      title="指标目录"
      lead="V12 指标体系 7 簇 99 项，按簇、阶段与采集方式筛选。"
      items={["簇树 + 分面筛选（阶段、来源、采集方式、数据状态）", "表格 / 矩阵两种视图，筛选条件写入 URL", "数据状态标签：已入库 / 未入库"]}
    />
  );
}
