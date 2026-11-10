import { Field } from "@/components/itei";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export type FilterOption = { value: string; label: string; count?: number };

/**
 * 筛选下拉：标签在上方；第一项是「全部」，对应 URL 里不带该参数。
 * allLabel 传 null 时不提供「全部」（如图表切片：「全部」意味着加总，不允许）。
 * 选项可带计数（其余条件不变时的数量），计数为 0 的选项仍可选，便于看清为什么没有结果。
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "全部",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel?: string | null;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Select value={allLabel === null ? value : value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel !== null && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {o.count !== undefined && <span className="ml-1 text-ink-muted tabular-nums">（{o.count}）</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
