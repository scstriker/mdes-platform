import { useEffect, useMemo, useState } from "react";
import { api, type Cluster, type Indicator } from "../api";

export default function CatalogPage() {
  const [items, setItems] = useState<Indicator[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [phase, setPhase] = useState("phase1");
  const [cluster, setCluster] = useState("");
  const [selected, setSelected] = useState<Indicator | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState("");

  useEffect(() => {
    api
      .health()
      .then((h) =>
        setHealth(
          h.ok
            ? `DB ${h.db} · vector=${String(h.vector)} · dims=${h.embedding_dims}`
            : "health failed",
        ),
      )
      .catch((e) => setHealth(String(e)));
    api.clusters().then((r) => setClusters(r.items)).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setError("");
    api
      .indicators({
        phase: phase || undefined,
        cluster: cluster || undefined,
      })
      .then(async (r) => {
        setItems(r.items);
        const first = r.items[0];
        if (!first) {
          setSelected(null);
          return;
        }
        try {
          const detail = await api.indicator(first.id);
          setSelected(detail);
        } catch {
          setSelected(first);
        }
      })
      .catch((e) => setError(String(e)));
  }, [phase, cluster]);

  const countLabel = useMemo(() => `${items.length} 项`, [items.length]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand-navy)] m-0">指标目录</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 mb-0">
          V12 元数据入库预览 · {countLabel} · {health}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm">
          阶段{" "}
          <select
            className="border border-[var(--border)] rounded-[2px] px-2 py-1"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="phase1">一期</option>
            <option value="later">后期</option>
            <option value="">全部</option>
          </select>
        </label>
        <label className="text-sm">
          指标簇{" "}
          <select
            className="border border-[var(--border)] rounded-[2px] px-2 py-1"
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
          >
            <option value="">全部</option>
            {clusters.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="text-[var(--danger)] text-sm">{error}</div>}

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-3">
        <div className="overflow-auto border border-[var(--border)] max-h-[60vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-[var(--surface-sunken)] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-[var(--border)]">ID</th>
                <th className="text-left p-2 border-b border-[var(--border)]">名称</th>
                <th className="text-left p-2 border-b border-[var(--border)]">簇</th>
                <th className="text-left p-2 border-b border-[var(--border)]">来源</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className={`cursor-pointer ${selected?.id === it.id ? "bg-[#e6f1f9]" : ""}`}
                  onClick={() => {
                    void api
                      .indicator(it.id)
                      .then(setSelected)
                      .catch(() => setSelected(it));
                  }}
                >
                  <td className="p-2 border-b border-[var(--border)] font-mono text-xs">
                    {it.id}
                  </td>
                  <td className="p-2 border-b border-[var(--border)]">{it.name}</td>
                  <td className="p-2 border-b border-[var(--border)]">{it.cluster_code}</td>
                  <td className="p-2 border-b border-[var(--border)]">{it.source_kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="border border-[var(--border)] p-3 bg-[var(--surface-sunken)]">
          {selected ? (
            <div className="grid gap-2 text-sm">
              <div className="text-xs text-[var(--brand-sky)] font-bold">{selected.id}</div>
              <h2 className="text-xl font-bold m-0 text-[var(--brand-navy)]">{selected.name}</h2>
              <div>更新频率：{selected.update_freq || "—"}</div>
              <div>一期口径：{selected.phase_scope || "—"}</div>
              <pre className="whitespace-pre-wrap text-xs bg-white border border-[var(--border)] p-2 max-h-[40vh] overflow-auto">
                {JSON.stringify(selected.spec_json, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="text-sm text-[var(--ink-muted)]">选择左侧指标查看规格</div>
          )}
        </aside>
      </div>
    </div>
  );
}
