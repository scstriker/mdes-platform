import { useParams } from "react-router";
import { Placeholder } from "../placeholder";

export default function IndicatorPage() {
  const { id } = useParams();
  return (
    <Placeholder
      number="三"
      title={`指标档案 ${id ?? ""}`}
      lead="单个指标的数据、规格与关联指标。"
      items={["「数据 / 规格 / 关联」页签，状态写入 URL", "先选切片再画图：不跨维度、跨单位加总", "图下方保留数据表，支持导出 CSV"]}
    />
  );
}
