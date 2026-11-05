import { Placeholder } from "../placeholder";

export default function OverviewPage() {
  return (
    <Placeholder
      number="一"
      title="概览"
      lead="指标体系与观测数据的总体情况。"
      items={["KPI：指标总数、一期数、一期已入库数、观测值总数与数据截止期间", "各簇覆盖率与簇导航", "最近一次导入批次"]}
    />
  );
}
