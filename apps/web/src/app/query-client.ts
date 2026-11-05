import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/** 4xx 不重试（参数或数据问题，重试也不会成功）；网络与 5xx 最多重试 2 次 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
    },
  });
}
