import { request } from "./client";
import type {
  Cluster,
  GlobalSearchResult,
  Health,
  ImportBatch,
  ImportResult,
  Indicator,
  IndicatorListItem,
  ObservationPage,
  ObservationQuery,
  Phase,
  Stats,
  TradeBatchListItem,
  TradeCoverageMatrixResponse,
  TradeImportManifest,
  TradeImportResponse,
  TradeOverviewResponse,
} from "./types";

type Opts = { signal?: AbortSignal };

export type TradePeriodsMeta = {
  dictVersion: string;
  releaseId: string | null;
  publishedMonths: string[];
  availablePeriods: string[];
};

export const api = {
  health: (o?: Opts) => request<Health>("/api/health", o),
  stats: (o?: Opts) => request<Stats>("/api/stats", o),
  clusters: (o?: Opts) => request<{ items: Cluster[] }>("/api/clusters", o),
  indicators: (params: { phase?: Phase; cluster?: string } = {}, o?: Opts) =>
    request<{ items: IndicatorListItem[] }>("/api/indicators", { ...o, query: params }),
  indicator: (id: string, o?: Opts) => request<Indicator>(`/api/indicators/${encodeURIComponent(id)}`, o),
  observations: (params: ObservationQuery = {}, o?: Opts) =>
    request<ObservationPage>("/api/observations", { ...o, query: params }),
  search: (params: { q: string; limit?: number }, o?: Opts) =>
    request<GlobalSearchResult>("/api/search", { ...o, query: params }),
  batches: (o?: Opts) => request<{ items: ImportBatch[] }>("/api/import/batches", o),
  importCsv: (file: File, o?: Opts) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportResult>("/api/import/csv", { ...o, method: "POST", body: fd });
  },
  tradeOverview: (params: { period?: string; dictVersion?: string } = {}, o?: Opts) =>
    request<TradeOverviewResponse>("/api/trade/overview", { ...o, query: params }),
  tradePeriods: (params: { dictVersion?: string } = {}, o?: Opts) =>
    request<TradePeriodsMeta>("/api/trade/periods", { ...o, query: params }),
  tradeBatches: (
    params: { dictVersion?: string; month?: string; flow?: string; grouping?: string } = {},
    o?: Opts,
  ) => request<{ items: TradeBatchListItem[] }>("/api/trade/batches", { ...o, query: params }),
  tradeCoverage: (
    params: { dictVersion?: string; year?: string; fromMonth?: string; toMonth?: string; month?: string; hs8?: string } = {},
    o?: Opts,
  ) => request<TradeCoverageMatrixResponse>("/api/trade/coverage", { ...o, query: params }),
  importTrade: (
    payload: {
      manifest: TradeImportManifest | string;
      file?: File | null;
      emptyEvidences?: File[];
    },
    o?: Opts,
  ) => {
    const fd = new FormData();
    fd.append(
      "manifest",
      typeof payload.manifest === "string" ? payload.manifest : JSON.stringify(payload.manifest),
    );
    if (payload.file) {
      fd.append("file", payload.file);
    }
    for (const ev of payload.emptyEvidences ?? []) {
      fd.append("emptyEvidence", ev);
    }
    return request<TradeImportResponse>("/api/trade/import", { ...o, method: "POST", body: fd });
  },
};
