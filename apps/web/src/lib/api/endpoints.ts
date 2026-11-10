import { request } from "./client";
import type {
  Cluster,
  Health,
  ImportBatch,
  ImportResult,
  Indicator,
  IndicatorListItem,
  ObservationPage,
  ObservationQuery,
  Phase,
  Stats,
} from "./types";

type Opts = { signal?: AbortSignal };

export const api = {
  health: (o?: Opts) => request<Health>("/api/health", o),
  stats: (o?: Opts) => request<Stats>("/api/stats", o),
  clusters: (o?: Opts) => request<{ items: Cluster[] }>("/api/clusters", o),
  indicators: (params: { phase?: Phase; cluster?: string } = {}, o?: Opts) =>
    request<{ items: IndicatorListItem[] }>("/api/indicators", { ...o, query: params }),
  indicator: (id: string, o?: Opts) => request<Indicator>(`/api/indicators/${encodeURIComponent(id)}`, o),
  observations: (params: ObservationQuery = {}, o?: Opts) =>
    request<ObservationPage>("/api/observations", { ...o, query: params }),
  batches: (o?: Opts) => request<{ items: ImportBatch[] }>("/api/import/batches", o),
  importCsv: (file: File, o?: Opts) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportResult>("/api/import/csv", { ...o, method: "POST", body: fd });
  },
};
