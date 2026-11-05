import { defineConfig } from "@playwright/test";

/**
 * 端到端测试：README「验收样例」+ 外框 + 回归 + axe 无障碍检查。
 * 用独立端口与独立的库，不影响正在跑的开发服务（8787 / 5173）与开发库：
 *   API 8788 → mdes_e2e（每次启动时重建数据），Web 5174（VITE_API_BASE 指向 8788）。
 * 前置：npm run dev:db（docker-compose 的 pgvector）。运行：npm run e2e
 */
const API_PORT = 8788;
const WEB_PORT = 5174;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL || "postgres://mdes:mdes@127.0.0.1:5433/mdes_e2e";

const API_BASE = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: "e2e",
  // 测试之间共享一个库（先导入再查询），按文件名顺序串行执行
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `npx tsx ../api/src/prepare-db.ts ${E2E_DATABASE_URL} --reset && npx tsx ../api/src/node.ts`,
      url: `${API_BASE}/api/health`,
      env: { DATABASE_URL: E2E_DATABASE_URL, PORT: String(API_PORT), IMPORT_MAX_ROWS: "5000" },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_API_BASE: API_BASE },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
