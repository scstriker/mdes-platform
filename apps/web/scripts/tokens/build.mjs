#!/usr/bin/env node
/**
 * ITEI token 流水线（Style Dictionary）。
 *
 * 唯一输入：apps/web/design/itei/itei-design-system/tokens.json
 * 输出：
 *   1. 设计系统目录里的 tokens.css      —— 浅 / 深主题 CSS 变量与文字样式类（Web 直接引入）
 *   2. 设计系统目录里的 tokens.flat.json —— 两主题解析成十六进制的扁平版
 *   3. apps/web/src/styles/generated/itei-theme.css —— Tailwind v4 主题：清空默认命名空间，
 *      只注册 ITEI token；文字样式注册为 @utility（见 ADR-002「Tailwind 主题」）
 *
 * 1、2 与设计系统原始文件逐字节一致；改 tokens.json 后运行本脚本即可同步三处产物。
 *
 * 用法：
 *   node apps/web/scripts/tokens/build.mjs           生成并写入
 *   node apps/web/scripts/tokens/build.mjs --check   只比对，产物与仓库不一致时退出码为 1
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "../..");
export const DESIGN_DIR = path.join(WEB, "design/itei/itei-design-system");
export const SOURCE = path.join(DESIGN_DIR, "tokens.json");

/** 产物：相对输出根目录的路径 → 仓库里的真实位置 */
export const OUTPUTS = {
  "tokens.css": path.join(DESIGN_DIR, "tokens.css"),
  "tokens.flat.json": path.join(DESIGN_DIR, "tokens.flat.json"),
  "itei-theme.css": path.join(WEB, "src/styles/generated/itei-theme.css"),
};

const THEMES = ["light", "dark"];

/* ------------------------------------------------------------------ */
/* 解析：ITEI 自有的 tokens.json 结构 → Style Dictionary token 树         */
/* ------------------------------------------------------------------ */

/** "{brand-red}" → "{color.<theme>.brand-red}"；ITEI 的引用只指向同主题的颜色 */
function themedRef(value, theme) {
  return typeof value === "string"
    ? value.replace(/\{([a-z0-9-]+)\}/g, (_, name) => `{color.${theme}.${name}}`)
    : value;
}

function perTheme(value, theme) {
  return value && typeof value === "object" ? value[theme] : value;
}

function themedGroup(tokens) {
  const out = {};
  for (const theme of THEMES) {
    out[theme] = {};
    for (const t of tokens) {
      out[theme][t.name] = { value: themedRef(perTheme(t.value, theme), theme), comment: t.usage };
    }
  }
  return out;
}

function flatGroup(tokens) {
  return Object.fromEntries(tokens.map((t) => [t.name, { value: t.value, comment: t.usage }]));
}

export function parseIteiTokens(json) {
  const typography = {};
  for (const group of json.type.groups) {
    for (const s of group.styles) {
      const value = {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}),
        family: s.family || group.family,
      };
      typography[s.name] = { value, type: "typography", comment: s.usage };
    }
  }
  return {
    color: themedGroup(json.color.tokens),
    shadow: themedGroup(json.shadow.tokens),
    spacing: flatGroup(json.spacing.tokens),
    radius: flatGroup(json.radius.tokens),
    borderWidth: flatGroup(json["border-width"].tokens),
    zIndex: flatGroup(json["z-index"].tokens),
    font: Object.fromEntries(
      Object.entries(json.type.families).map(([k, v]) => [k, { value: v, type: "fontFamily" }]),
    ),
    typography,
  };
}

/* ------------------------------------------------------------------ */
/* 格式                                                                 */
/* ------------------------------------------------------------------ */

const byGroup = (dictionary, ...head) =>
  dictionary.allTokens.filter((t) => head.every((h, i) => t.path[i] === h));

/** 引用 token 输出 var(--name)，其余输出解析后的值（与原 tokens.css 一致） */
function cssValue(token) {
  const original = token.original.value;
  if (typeof original === "string" && /^\{[^}]+\}$/.test(original)) {
    return `var(--${original.slice(1, -1).split(".").at(-1)})`;
  }
  return token.value;
}

const decl = (token) => `  --${token.path.at(-1)}: ${cssValue(token)};`;

function themeBlock(dictionary, theme) {
  return [...byGroup(dictionary, "color", theme), ...byGroup(dictionary, "shadow", theme)]
    .map(decl)
    .join("\n");
}

function textStyleBody(v) {
  const parts = [
    `font-family: var(--font-${v.family})`,
    `font-size: ${v.fontSize}`,
    `line-height: ${v.lineHeight}`,
    `font-weight: ${v.fontWeight}`,
  ];
  if (v.letterSpacing) parts.push(`letter-spacing: ${v.letterSpacing}`);
  return parts;
}

function formatTokensCss({ dictionary }) {
  const invariant = [
    ...byGroup(dictionary, "spacing"),
    ...byGroup(dictionary, "radius"),
    ...byGroup(dictionary, "borderWidth"),
    ...byGroup(dictionary, "zIndex"),
  ]
    .map(decl)
    .concat(byGroup(dictionary, "font").map((t) => `  --font-${t.path.at(-1)}: ${t.value};`))
    .join("\n");
  const textStyles = byGroup(dictionary, "typography")
    .map((t) => `.${t.path.at(-1)} { ${textStyleBody(t.value).join("; ")}; }`)
    .join("\n");
  const dark = themeBlock(dictionary, "dark");
  return [
    `/* ITEI design tokens — compiled from tokens.json. Themes: :root = light, [data-theme="dark"] = dark */`,
    `:root, [data-theme="light"] {`,
    themeBlock(dictionary, "light"),
    `}`,
    `[data-theme="dark"] {`,
    dark,
    `}`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {`,
    dark,
    `} }`,
    `:root {`,
    invariant,
    `}`,
    textStyles,
    `body { background: var(--surface); color: var(--ink); font-family: var(--font-sans); }`,
    `:focus-visible { outline: var(--border-rule) solid var(--focus); outline-offset: 2px; }`,
    ``,
  ].join("\n");
}

function formatFlatJson({ dictionary }) {
  const pick = (...head) =>
    Object.fromEntries(byGroup(dictionary, ...head).map((t) => [t.path.at(-1), t.value]));
  const out = {
    color: Object.fromEntries(THEMES.map((theme) => [theme, pick("color", theme)])),
    spacing: pick("spacing"),
    radius: pick("radius"),
    type: pick("typography"),
    families: pick("font"),
  };
  return JSON.stringify(out, null, 2);
}

/**
 * Tailwind v4 主题。@theme inline 让工具类直接引用 ITEI 变量（bg-brand-navy →
 * background-color: var(--brand-navy)），因此局部的 [data-theme="dark"] 容器也能正确换色。
 * 半径、阴影、字体与 ITEI 变量同名：半径与字体写字面值，阴影随主题变化只能引用变量。
 */
function formatTailwindTheme({ dictionary }) {
  // 页眉改为白底后全站不用渐变（ADR-002「页眉：白底加双线」），渐变色不注册为工具类
  const NO_UTILITY = new Set(["gradient-start", "gradient-end", "on-gradient"]);
  const colors = byGroup(dictionary, "color", "light")
    .filter((t) => !NO_UTILITY.has(t.path.at(-1)))
    .map((t) => `  --color-${t.path.at(-1)}: var(--${t.path.at(-1)});`);
  // 不注册 radius-md：ADR-002 要求 shadcn 的 rounded-md/lg/xl 不再生成样式，组件自动变为直角
  const radii = byGroup(dictionary, "radius")
    .filter((t) => t.path.at(-1) !== "radius-md")
    .map((t) => `  --${t.path.at(-1)}: ${t.value};`);
  const shadows = byGroup(dictionary, "shadow", "light")
    .filter((t) => t.path.at(-1) !== "shadow-none")
    .map((t) => `  --${t.path.at(-1)}: var(--${t.path.at(-1)});`);
  const fonts = byGroup(dictionary, "font").map((t) => `  --font-${t.path.at(-1)}: ${t.value};`);
  const contentMax = byGroup(dictionary, "spacing").find((t) => t.path.at(-1) === "content-max");
  const utilities = byGroup(dictionary, "typography").map(
    (t) =>
      `@utility ${t.path.at(-1)} {\n${textStyleBody(t.value)
        .map((p) => `  ${p};`)
        .join("\n")}\n}`,
  );
  return [
    `/* 由 apps/web/scripts/tokens/build.mjs 从 ITEI tokens.json 生成，勿手改。 */`,
    `/* Tailwind 只开放 ITEI token：先清空默认命名空间，再注册（ADR-002「Tailwind 主题」）。 */`,
    `@theme inline {`,
    `  --color-*: initial;`,
    `  --radius-*: initial;`,
    `  --shadow-*: initial;`,
    `  --inset-shadow-*: initial;`,
    `  --drop-shadow-*: initial;`,
    `  --text-shadow-*: initial;`,
    `  --text-*: initial;`,
    `  --font-*: initial;`,
    ``,
    ...colors,
    ``,
    ...radii,
    ``,
    ...shadows,
    ``,
    ...fonts,
    ``,
    `  --container-content: ${contentMax.value};`,
    `}`,
    ``,
    `/* 文字样式：注册为工具类，才能配合响应式前缀使用（如 md:title-page） */`,
    ...utilities,
    ``,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 构建                                                                 */
/* ------------------------------------------------------------------ */

export async function buildTokens(outDir) {
  const sd = new StyleDictionary({
    source: [SOURCE],
    parsers: ["itei/tokens-json"],
    hooks: {
      parsers: {
        "itei/tokens-json": {
          pattern: /tokens\.json$/,
          parser: ({ contents }) => parseIteiTokens(JSON.parse(contents)),
        },
      },
      formats: {
        "itei/tokens-css": formatTokensCss,
        "itei/flat-json": formatFlatJson,
        "itei/tailwind-theme": formatTailwindTheme,
      },
    },
    log: { verbosity: "silent", warnings: "disabled" },
    platforms: {
      itei: {
        buildPath: `${outDir}/`,
        files: [
          { destination: "tokens.css", format: "itei/tokens-css" },
          { destination: "tokens.flat.json", format: "itei/flat-json" },
          { destination: "itei-theme.css", format: "itei/tailwind-theme" },
        ],
      },
    },
  });
  await sd.buildAllPlatforms();
  return Object.fromEntries(Object.keys(OUTPUTS).map((name) => [name, path.join(outDir, name)]));
}

/** 生成到临时目录，返回与仓库里不一致的产物名 */
export async function checkTokens() {
  const dir = await mkdtemp(path.join(tmpdir(), "itei-tokens-"));
  try {
    const built = await buildTokens(dir);
    const stale = [];
    for (const [name, target] of Object.entries(OUTPUTS)) {
      const [a, b] = await Promise.all([
        readFile(built[name], "utf8"),
        readFile(target, "utf8").catch(() => null),
      ]);
      if (a !== b) stale.push(path.relative(process.cwd(), target));
    }
    return stale;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--check")) {
    const stale = await checkTokens();
    if (stale.length) {
      console.error(`token 产物与 tokens.json 不一致，请运行 npm run tokens：\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("token 产物与 tokens.json 一致");
    return;
  }
  const { copyFile, mkdir } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(tmpdir(), "itei-tokens-"));
  try {
    const built = await buildTokens(dir);
    for (const [name, target] of Object.entries(OUTPUTS)) {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(built[name], target);
      console.log(path.relative(process.cwd(), target));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
