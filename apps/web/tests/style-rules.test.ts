import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ITEI / ADR-002 的样式硬规则，在源码层拦截：
 * 不写色值、不写任意值、不写 dark: 前缀、不用 Tailwind 默认色板、不用渐变、
 * 不用 rounded-md 以上与 shadow-sm 以上、不用 animate-pulse 与缩放动画、不用 lucide 图标。
 */
const SRC = path.resolve(__dirname, "../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";

const RULES: [string, RegExp][] = [
  ["dark: 前缀（深色由 token 驱动）", /(^|[\s"'`{(])dark:/],
  ["十六进制色值", /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/],
  ["rgb / hsl / oklch 色值", /\b(?:rgba?|hsla?|oklch|oklab)\(/],
  ["Tailwind 默认色板", new RegExp(`(?<![\\w-])(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|accent|caret)-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`)],
  ["渐变", /(?<![\w-])(?:bg-gradient-|bg-linear-|bg-radial|bg-conic)/],
  ["rounded-md 及以上（ITEI 直角，控件最多 2px）", /(?<![\w-])rounded(?:-[trblse]{1,2})?-(?:md|lg|xl|2xl|3xl|4xl|full)(?![\w-])/],
  ["shadow-sm 等默认阴影（只用 shadow-raised / shadow-modal）", /(?<![\w-])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![\w-])/],
  ["animate-pulse（ITEI 只允许 120–200ms 过渡）", /(?<![\w-])animate-(?:pulse|bounce|ping)(?![\w-])/],
  ["缩放动画", /(?<![\w-])zoom-(?:in|out)(?:-\d+)?(?![\w-])/],
  ["lucide 图标（改用 Tabler）", /from ["']lucide-react["']/],
];

/** 任意值（如 w-[13px]、bg-[#fff]）；data-[…]: 这类任意变体不算 */
function arbitraryValues(source: string): string[] {
  const found: string[] = [];
  const re = /(?<![\w-])([a-z][a-z0-9-]*)-\[([^\]\s]+)\]/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const after = source.slice(m.index + m[0].length);
    if (/^(?:\/[\w-]+)?:/.test(after)) continue; // 任意变体：data-[state=open]:、group-data-[dense]/table:
    found.push(m[0]);
  }
  return found;
}

describe("样式硬规则", () => {
  const all = files(SRC);

  it("扫描到源码", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  for (const [name, re] of RULES) {
    it(`不出现：${name}`, () => {
      const hits = all.flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => (re.test(line) ? `${path.relative(SRC, file)}:${i + 1}: ${line.trim()}` : null))
          .filter(Boolean),
      );
      expect(hits).toEqual([]);
    });
  }

  it("不出现任意值（如 text-[13px]、bg-[#...]）", () => {
    const hits = all.flatMap((file) => arbitraryValues(readFileSync(file, "utf8")).map((v) => `${path.relative(SRC, file)}: ${v}`));
    expect(hits).toEqual([]);
  });

  it("public 里没有 404.html（Cloudflare Pages 只在没有 404.html 时做 SPA 回退）", () => {
    expect(existsSync(path.resolve(__dirname, "../public/404.html"))).toBe(false);
  });
});
