import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./endpoints";
import type {
  CatalogKind,
  CatalogQuery,
  CsvWriteMode,
  ObservationQuery,
  Phase,
  StatisticListQuery,
  TradeImportManifest,
} from "./types";

/** 查询键集中管理，导入成功后按前缀失效 */
export const queryKeys = {
  health: ["health"] as const,
  stats: ["stats"] as const,
  clusters: ["clusters"] as const,
  indicators: (params: { phase?: Phase; cluster?: string } = {}) => ["indicators", params] as const,
  indicator: (id: string) => ["indicator", id] as const,
  observations: (params: ObservationQuery) => ["observations", params] as const,
  search: (q: string, limit = 12) => ["search", q, limit] as const,
  batches: ["batches"] as const,
  tradeOverview: (period = "", dictVersion = "", releaseId = "") =>
    ["trade", "overview", period, dictVersion, releaseId] as const,
  tradePeriods: (dictVersion = "") => ["trade", "periods", dictVersion] as const,
  tradeBatches: (params: { dictVersion?: string; month?: string; flow?: string; grouping?: string } = {}) =>
    ["trade", "batches", params] as const,
  tradeCoverage: (params: { dictVersion?: string; year?: string; fromMonth?: string; toMonth?: string } = {}) =>
    ["trade", "coverage", params] as const,
  statistics: (params: StatisticListQuery = {}) => ["statistics", "list", params] as const,
  statisticDetail: (id: string, v = "") => ["statistics", "detail", id, v] as const,
  statisticVersions: (id: string) => ["statistics", "versions", id] as const,
  catalog: (params: CatalogQuery = {}) => ["catalog", "list", params] as const,
  catalogDetail: (kind: string, slug: string) => ["catalog", "detail", kind, slug] as const,
};

export const useHealth = () => useQuery({ queryKey: queryKeys.health, queryFn: ({ signal }) => api.health({ signal }) });

export const useStats = () => useQuery({ queryKey: queryKeys.stats, queryFn: ({ signal }) => api.stats({ signal }) });

export const useClusters = () =>
  useQuery({
    queryKey: queryKeys.clusters,
    queryFn: ({ signal }) => api.clusters({ signal }).then((r) => r.items),
    staleTime: 5 * 60_000,
  });

export const useIndicators = (params: { phase?: Phase; cluster?: string } = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.indicators(params),
    queryFn: ({ signal }) => api.indicators(params, { signal }).then((r) => r.items),
    enabled,
  });

export const useIndicator = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.indicator(id ?? ""),
    queryFn: ({ signal }) => api.indicator(id!, { signal }),
    enabled: Boolean(id),
  });

/** 筛选变化时保留上一页数据，避免表格闪空；过期请求由 signal 取消，不会出现竞态覆盖 */
export const useObservations = (params: ObservationQuery, enabled = true) =>
  useQuery({
    queryKey: queryKeys.observations(params),
    queryFn: ({ signal }) => api.observations(params, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });

/** 取全部观测值（每页 500，最多 5000 条），供指标档案做切片与图表 */
export const ALL_OBSERVATIONS_MAX = 5000;

export const useAllObservations = (params: ObservationQuery, enabled = true) =>
  useQuery({
    queryKey: ["observations", "all", params] as const,
    enabled,
    queryFn: async ({ signal }) => {
      const first = await api.observations({ ...params, limit: 500, offset: 0 }, { signal });
      let items = first.items;
      while (items.length < first.total && items.length < ALL_OBSERVATIONS_MAX) {
        const next = await api.observations({ ...params, limit: 500, offset: items.length }, { signal });
        if (next.items.length === 0) break;
        items = items.concat(next.items);
      }
      return { items, total: first.total, truncated: first.total > items.length };
    },
  });

export const useBatches = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.batches,
    queryFn: ({ signal }) => api.batches({ signal }).then((r) => r.items),
    enabled,
  });

export const useGlobalSearch = (q: string, limit = 12, enabled = true) => {
  const trimmed = q.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed, limit),
    queryFn: ({ signal }) => api.search({ q: trimmed, limit }, { signal }),
    placeholderData: keepPreviousData,
    enabled: enabled && trimmed.length > 0,
  });
};

export function useTradeOverview(
  period?: string,
  dictVersion?: string,
  releaseIdOrEnabled?: string | boolean,
  enabledOrReleaseId?: boolean | string,
) {
  const releaseId =
    typeof releaseIdOrEnabled === "string"
      ? releaseIdOrEnabled
      : typeof enabledOrReleaseId === "string"
        ? enabledOrReleaseId
        : undefined;
  const enabled =
    typeof releaseIdOrEnabled === "boolean"
      ? releaseIdOrEnabled
      : typeof enabledOrReleaseId === "boolean"
        ? enabledOrReleaseId
        : true;
  return useQuery({
    queryKey: queryKeys.tradeOverview(period ?? "", dictVersion ?? "", releaseId ?? ""),
    queryFn: ({ signal }) =>
      api.tradeOverview(
        {
          period: period || undefined,
          dictVersion: dictVersion || undefined,
          releaseId: releaseId || undefined,
        },
        { signal },
      ),
    enabled,
    retry: false,
  });
}

export const useTradePeriods = (dictVersion?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.tradePeriods(dictVersion ?? ""),
    queryFn: ({ signal }) => api.tradePeriods({ dictVersion: dictVersion || undefined }, { signal }),
    enabled,
  });

export const useTradeBatches = (
  params: { dictVersion?: string; month?: string; flow?: string; grouping?: string } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: queryKeys.tradeBatches(params),
    queryFn: ({ signal }) => api.tradeBatches(params, { signal }).then((r) => r.items),
    enabled,
  });

export const useTradeCoverage = (
  params: { dictVersion?: string; year?: string; fromMonth?: string; toMonth?: string } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: queryKeys.tradeCoverage(params),
    queryFn: ({ signal }) => api.tradeCoverage(params, { signal }),
    enabled,
  });

export const useStatisticsList = (params: StatisticListQuery = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.statistics(params),
    queryFn: ({ signal }) => api.statistics(params, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useStatisticDetail = (id: string | undefined, v?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.statisticDetail(id ?? "", v ?? ""),
    queryFn: ({ signal }) => api.statisticDetail(id!, { v: v || undefined }, { signal }),
    enabled: enabled && Boolean(id),
  });

export const useStatisticVersions = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.statisticVersions(id ?? ""),
    queryFn: ({ signal }) => api.statisticVersions(id!, { signal }),
    enabled: enabled && Boolean(id),
  });

export const useCatalogList = (params: CatalogQuery = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.catalog(params),
    queryFn: ({ signal }) => api.catalog(params, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useCatalogDetail = (kind: CatalogKind | undefined, slug: string | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.catalogDetail(kind ?? "", slug ?? ""),
    queryFn: ({ signal }) => api.catalogDetail(kind!, slug!, { signal }),
    enabled: enabled && Boolean(kind) && Boolean(slug),
  });

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: File | { filename: string; csvText: string; mode?: CsvWriteMode }) =>
      api.importCsv(payload),
    onSuccess: () => {
      for (const key of [["observations"], ["indicators"], ["indicator"], ["stats"], ["batches"], ["search"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useImportTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      manifest: TradeImportManifest | string;
      file?: File | null;
      emptyEvidences?: File[];
    }) => api.importTrade(payload),
    onSuccess: () => {
      for (const key of [["trade"], ["statistics"], ["observations"], ["indicators"], ["indicator"], ["stats"], ["batches"], ["search"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
