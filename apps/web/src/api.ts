const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type Indicator = {
  id: string;
  cluster_code: string;
  name: string;
  phase: string;
  update_freq: string;
  source_kind: string;
  phase_scope: string;
  spec_json?: Record<string, unknown>;
};

export type Observation = {
  id: number;
  indicator_id: string;
  period: string;
  geo: string;
  dims: Record<string, unknown>;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  batch_id: string | null;
  created_at: string;
};

export type Cluster = { code: string; name: string; subsystem_id: string };

export const api = {
  health: () =>
    request<{ ok: boolean; db: string; vector: boolean; embedding_dims: number }>(
      "/api/health",
    ),
  clusters: () => request<{ items: Cluster[] }>("/api/clusters"),
  indicators: (params?: { phase?: string; cluster?: string }) => {
    const q = new URLSearchParams();
    if (params?.phase) q.set("phase", params.phase);
    if (params?.cluster) q.set("cluster", params.cluster);
    const qs = q.toString();
    return request<{ items: Indicator[] }>(`/api/indicators${qs ? `?${qs}` : ""}`);
  },
  indicator: (id: string) => request<Indicator>(`/api/indicators/${encodeURIComponent(id)}`),
  observations: (params?: { indicator_id?: string; period?: string }) => {
    const q = new URLSearchParams();
    if (params?.indicator_id) q.set("indicator_id", params.indicator_id);
    if (params?.period) q.set("period", params.period);
    const qs = q.toString();
    return request<{ items: Observation[] }>(
      `/api/observations${qs ? `?${qs}` : ""}`,
    );
  },
  importCsv: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{
      batch_id: string;
      status: string;
      row_ok: number;
      row_err: number;
      errors: { line: number; message: string }[];
    }>("/api/import/csv", { method: "POST", body: fd });
  },
};
