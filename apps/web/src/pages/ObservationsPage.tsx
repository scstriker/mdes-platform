import { useEffect, useState } from "react";
import { api, type Observation } from "../api";

export default function ObservationsPage() {
  const [indicatorId, setIndicatorId] = useState("TRD-001");
  const [period, setPeriod] = useState("");
  const [items, setItems] = useState<Observation[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const r = await api.observations({
        indicator_id: indicatorId || undefined,
        period: period || undefined,
      });
      setItems(r.items);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand-navy)] m-0">观测值</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 mb-0">
          按指标与期间查询已导入事实
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm grid gap-1">
          indicator_id
          <input
            className="border border-[var(--border)] rounded-[2px] px-2 py-1"
            value={indicatorId}
            onChange={(e) => setIndicatorId(e.target.value)}
          />
        </label>
        <label className="text-sm grid gap-1">
          period
          <input
            className="border border-[var(--border)] rounded-[2px] px-2 py-1"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="可选"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 bg-[var(--brand-navy)] text-white rounded-[2px]"
        >
          查询
        </button>
      </div>

      {error && <div className="text-[var(--danger)] text-sm">{error}</div>}

      <div className="overflow-auto border border-[var(--border)]">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th className="text-left p-2 border-b">指标</th>
              <th className="text-left p-2 border-b">期间</th>
              <th className="text-left p-2 border-b">地域</th>
              <th className="text-left p-2 border-b">数值</th>
              <th className="text-left p-2 border-b">单位</th>
              <th className="text-left p-2 border-b">dims</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="p-2 border-b font-mono text-xs">{it.indicator_id}</td>
                <td className="p-2 border-b">{it.period}</td>
                <td className="p-2 border-b">{it.geo}</td>
                <td className="p-2 border-b">
                  {it.value_num ?? it.value_text ?? "—"}
                </td>
                <td className="p-2 border-b">{it.unit}</td>
                <td className="p-2 border-b font-mono text-xs">
                  {JSON.stringify(it.dims)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="p-3 text-[var(--ink-muted)]" colSpan={6}>
                  暂无数据，请先在「数据导入」上传样例 CSV
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
