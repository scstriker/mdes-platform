import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * 筛选条件写进 URL query（ADR-002「路由」）：链接可分享，刷新不丢。
 * 写入用 replace，不在历史里堆一串筛选步骤；值为空时删除该参数。
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const get = useCallback((key: string) => params.get(key) ?? "", [params]);

  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, { push = false } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === "") next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: !push, preventScrollReset: true },
      );
    },
    [setParams],
  );

  return { params, get, set };
}
