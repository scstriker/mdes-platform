import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// 单元测试只跑 tests/；e2e/ 下是 Playwright 用例（npm run e2e）
export default mergeConfig(viteConfig, defineConfig({ test: { include: ["tests/**/*.test.ts"] } }));
