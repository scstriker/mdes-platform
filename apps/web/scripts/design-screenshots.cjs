#!/usr/bin/env node
/**
 * /__design 验收截图：与设计系统 showcase.html 逐个组件并排对照，外加整页截图。
 *
 * 前置：Web dev server 已启动（需要接口连通时再起 API）。
 * 用法：node apps/web/scripts/design-screenshots.cjs [输出目录]
 *   BASE_URL 默认 http://127.0.0.1:5173
 *
 * 产物：
 *   compare-light.png / compare-dark.png   showcase.html 与 /__design 逐组件并排
 *   design-{desktop|mobile}-{light|dark}.png   /__design 整页
 *   shell-{desktop|mobile}-{light|dark}.png    外框（页眉、页脚 / TabBar）
 */
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = path.resolve(process.argv[2] || "docs/screenshots/phase1");
const SHOWCASE = path.resolve(__dirname, "../design/itei/itei-design-system/showcase.html");

/** showcase 小节 → /__design 小节标题 */
const PAIRS = [
  ["色板", null, "色板"],
  ["AppHeader", "AppHeader", "AppHeader"],
  ["SectionTitle", "SectionTitle", "SectionTitle"],
  ["NumberedNav", "NumberedNav", "NumberedNav"],
  ["Button", "Button", "Button"],
  ["Card", "Card", "Card"],
  ["Input", "Input", "Field / Input"],
  ["Tag", "Tag", "Tag"],
  ["Footer", "Footer", "Footer / TabBar"],
  ["DataTable", "DataTable", "DataTable"],
  ["KpiTile", "KpiTile", "KpiTile"],
];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

async function showcaseShots(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1104, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(SHOWCASE).href);
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.waitForTimeout(200);
  const shots = {};
  for (const [label, root] of PAIRS) {
    const el = root ? page.locator(`#root-${root}`).locator("xpath=ancestor::section[1]") : page.locator(".sw");
    shots[label] = (await el.screenshot()).toString("base64");
  }
  await ctx.close();
  return shots;
}

async function designShots(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/__design?theme=${theme}`);
  await settle(page);
  const shots = {};
  for (const [label, , title] of PAIRS) {
    const el = page
      .locator(`#theme-${theme} section`)
      .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
      .first();
    shots[label] = (await el.screenshot()).toString("base64");
  }
  await ctx.close();
  return shots;
}

function compareHtml(theme, left, right) {
  const rows = PAIRS.map(
    ([label]) => `
    <section>
      <h2>${label}</h2>
      <div class="pair">
        <figure><img src="data:image/png;base64,${left[label]}"></figure>
        <figure><img src="data:image/png;base64,${right[label]}"></figure>
      </div>
    </section>`,
  ).join("");
  const dark = theme === "dark";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif;background:${dark ? "#0b1a2b" : "#fff"};color:${dark ? "#e8eef4" : "#1a1a1a"}}
    header{display:grid;grid-template-columns:1fr 1fr;gap:24px;position:sticky;top:0;padding:8px 0;font-weight:700;font-size:15px}
    h1{font-size:20px;margin:0 0 12px}
    h2{font-size:16px;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #0080cc;display:inline-block}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
    figure{margin:0;border:1px dashed ${dark ? "#4b6480" : "#8fa1b3"}}
    img{display:block;width:100%}
  </style></head><body>
    <h1>ITEI 组件对照（${dark ? "深色" : "浅色"}）</h1>
    <header><span>左：设计系统 showcase.html</span><span>右：MDES /__design</span></header>
    ${rows}
  </body></html>`;
}

async function fullPage(browser, url, file, { width, height, mobile, theme, scale }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale ?? (mobile ? 2 : 1),
    isMobile: mobile,
    hasTouch: mobile,
    locale: "zh-CN",
  });
  await ctx.addInitScript((t) => localStorage.setItem("mdes-theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(url);
  await settle(page);
  await page.screenshot({ path: file, fullPage: true });
  console.log(path.relative(process.cwd(), file));
  await ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) {
      const [left, right] = await Promise.all([showcaseShots(browser, theme), designShots(browser, theme)]);
      const ctx = await browser.newContext({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.setContent(compareHtml(theme, left, right), { waitUntil: "load" });
      const file = path.join(OUT, `compare-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(path.relative(process.cwd(), file));
      await ctx.close();

      await fullPage(browser, `${BASE}/__design?theme=${theme}`, path.join(OUT, `design-desktop-${theme}.png`), {
        width: 1440, height: 900, mobile: false, theme,
      });
      await fullPage(browser, `${BASE}/__design?theme=${theme}`, path.join(OUT, `design-mobile-${theme}.png`), {
        // 验收页很长，1 倍像素即可
        width: 390, height: 844, mobile: true, theme, scale: 1,
      });
      await fullPage(browser, `${BASE}/`, path.join(OUT, `shell-desktop-${theme}.png`), {
        width: 1440, height: 900, mobile: false, theme,
      });
      await fullPage(browser, `${BASE}/`, path.join(OUT, `shell-mobile-${theme}.png`), {
        width: 390, height: 844, mobile: true, theme,
      });
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
