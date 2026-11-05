import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  // 演示版：打成一个 JS 包、资源全部内联，再由 scripts/inline-demo.mjs 合成单个 HTML
  build:
    mode === "demo"
      ? {
          outDir: "dist-demo",
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
          modulePreload: false,
          chunkSizeWarningLimit: 4096,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : undefined,
}));
