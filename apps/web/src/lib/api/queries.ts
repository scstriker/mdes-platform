import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./endpoints";
import type { ObservationQuery, Phase } from "./types";

/** 查询键集中管理，导入成功后按前缀失效 */
export const queryKeys = {
  health: ["health"] as const,
  stats: ["stats"] as const,
  clusters: ["clusters"] as const,
  indicators: (params: { phase?: Phase; cluster?: string } = {}) => ["indicators", params] as const,
  indicator: (id: string) => ["indicator", id] as const,
  observations: (params: ObservationQuery) => ["observations", params] as const,
  batches: ["batches"] as const,
};

export const useHealth = () => useQuery({ queryKey: queryKeys.health, queryFn: ({ signal }) => api.health({ signal }) });

export const useStats = () => useQuery({ queryKey: queryKeys.stats, queryFn: ({ signal }) => api.stats({ signal }) });

export const useClusters = () =>
  useQuery({
    queryKey: queryKeys.clusters,
    queryFn: ({ signal }) => api.clusters({ signal }).then((r) => r.items),
    staleTime: 5 * 60_000,
  });

export const useIndicators = (params: { phase?: Phase; cluster?: string } = {}) =>
  useQuery({
    queryKey: queryKeys.indicators(params),
    queryFn: ({ signal }) => api.indicators(params, { signal }).then((r) => r.items),
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

export const useBatches = () =>
  useQuery({ queryKey: queryKeys.batches, queryFn: ({ signal }) => api.batches({ signal }).then((r) => r.items) });

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.importCsv(file),
    onSuccess: () => {
      for (const key of [["observations"], ["indicators"], ["indicator"], ["stats"], ["batches"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
