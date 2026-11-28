import type { Plugin } from "vite";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/** Vitest/esbuild 无法解析带 shebang 的 repo 根 scripts/*.mjs（demo-api 等会静态引用） */
function stripScriptsShebang(): Plugin {
  return {
    name: "strip-scripts-mjs-shebang",
    transform(code, id) {
      if (!/[\\/]scripts[\\/].*\.mjs$/.test(id) || !code.startsWith("#!")) return null;
      return { code: code.replace(/^#![^\n]*\n/, ""), map: null };
    },
  };
}

// 单元测试只跑 tests/；e2e/ 下是 Playwright 用例（npm run e2e）
export default mergeConfig(
  viteConfig({ mode: "test", command: "serve" }),
  defineConfig({
    plugins: [stripScriptsShebang()],
    test: { include: ["tests/**/*.test.{ts,tsx}"] },
  }),
);
