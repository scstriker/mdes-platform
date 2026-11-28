import { request } from "./client";
import type {
  CatalogDetailResponse,
  CatalogKind,
  CatalogPage,
  CatalogQuery,
  Cluster,
  CsvWriteMode,
  GlobalSearchResult,
  Health,
  ImportBatch,
  ImportResult,
  Indicator,
  IndicatorListItem,
  ObservationPage,
  ObservationQuery,
  Phase,
  Statistic,
  StatisticDetailResponse,
  StatisticListPage,
  StatisticListQuery,
  StatisticVersionsResponse,
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
  importCsv: (
    payload: File | { filename: string; csvText: string; mode?: CsvWriteMode },
    o?: Opts,
  ) => {
    if (payload instanceof File) {
      const fd = new FormData();
      fd.append("file", payload);
      return request<ImportResult>("/api/import/csv", { ...o, method: "POST", body: fd });
    }
    return request<ImportResult>("/api/import/csv", {
      ...o,
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  tradeOverview: (params: { period?: string; dictVersion?: string; releaseId?: string } = {}, o?: Opts) =>
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
  statistics: (params: StatisticListQuery = {}, o?: Opts) =>
    request<StatisticListPage>("/api/statistics", {
      ...o,
      query: {
        q: params.q,
        topic: params.topic,
        v3_seq: params.v3_seq,
        entity: params.entity,
        has_forecast: params.has_forecast === undefined ? undefined : params.has_forecast ? "1" : "0",
        has_break: params.has_break === undefined ? undefined : params.has_break ? "1" : "0",
        limit: params.limit,
        offset: params.offset,
      },
    }),
  statisticDetail: (id: string, params: { v?: string } = {}, o?: Opts) =>
    request<StatisticDetailResponse>(`/api/statistics/${encodeURIComponent(id)}`, {
      ...o,
      query: { v: params.v },
    }),
  statisticRaw: (id: string, params: { v?: string } = {}, o?: Opts) =>
    request<Statistic>(`/api/statistics/${encodeURIComponent(id)}`, {
      ...o,
      query: { v: params.v, raw: "1" },
    }),
  statisticVersions: (id: string, o?: Opts) =>
    request<StatisticVersionsResponse>(`/api/statistics/${encodeURIComponent(id)}/versions`, o),
  publishStatistic: (statistic: Statistic, o?: Opts) =>
    request<{ ok: boolean; statistic_id: string; version: string; latest_version: string; content_hash: string }>(
      "/api/statistics/publish",
      { ...o, method: "POST", json: statistic },
    ),
  catalog: (params: CatalogQuery = {}, o?: Opts) =>
    request<CatalogPage>("/api/catalog", { ...o, query: params }),
  catalogDetail: (kind: CatalogKind, slug: string, o?: Opts) =>
    request<CatalogDetailResponse>(`/api/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`, o),
};
