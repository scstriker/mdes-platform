import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 开发态将 @tabler/icons-react 具名图标导入重写为单文件 ESM 子路径，
 * 避免 Vite dev 预打包或加载整包 5700+ 图标（>4MB JS），将冷页面加载提速数十倍。
 */
function tablerIconsDevPlugin(): Plugin {
  return {
    name: "tabler-icons-dev-direct",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/") && !id.includes("\\src\\")) return null;
      if (!code.includes("@tabler/icons-react")) return null;
      const rewritten = code.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']@tabler\/icons-react["']\s*;?/g,
        (full, specifiers: string) => {
          const lines: string[] = [];
          const typeParts: string[] = [];
          for (const raw of specifiers.split(",")) {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            if (/^type\s+/.test(trimmed)) {
              typeParts.push(trimmed);
              continue;
            }
            const parts = trimmed.split(/\s+as\s+/).map((s) => s.trim());
            const imported = parts[0];
            const local = parts[1] || imported;
            if (imported.startsWith("Icon")) {
              lines.push(`import ${local} from "@tabler/icons-react/dist/esm/icons/${imported}.mjs";`);
            } else {
              return full;
            }
          }
          if (typeParts.length > 0) {
            lines.unshift(`import { ${typeParts.join(", ")} } from "@tabler/icons-react";`);
          }
          return lines.join("\n");
        },
      );
      return rewritten === code ? null : { code: rewritten, map: null };
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [tablerIconsDevPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["@tabler/icons-react"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "radix-ui",
      "echarts/core",
      "echarts/charts",
      "echarts/components",
      "echarts/features",
      "echarts/renderers",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
    ],
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  preview: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  // 演示版：打成一个 JS 包、资源全部内联，再由 scripts/inline-demo.mjs 合成单个 HTML
  // 标准生产版 / E2E 版：依靠动态 import() 原生分包并禁止首屏预加载重型导出器 chunk（write-excel-file / pptxgenjs）
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
      : {
          ...(mode === "e2e" ? { outDir: "dist-e2e" } : {}),
          modulePreload: {
            resolveDependencies(_filename, deps) {
              return deps.filter((dep) => !dep.includes("export-xlsx") && !dep.includes("export-pptx"));
            },
          },
        },
}));
