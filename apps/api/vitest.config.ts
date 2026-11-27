import { defineConfig } from "vitest/config";

// Miniflare (workerd + 本地 D1 8 份迁移) 多文件并行启动时单用例可能超过默认 5s
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
