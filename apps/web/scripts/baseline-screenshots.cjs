#!/usr/bin/env node
/**
 * 旧界面（重构前）基线截图。阶段 0 用它留档，之后的重构以此为对照。
 *
 * 前置：API 与 Web dev server 已启动，且已导入 data/samples/trd_sample.csv。
 * 用法：node apps/web/scripts/baseline-screenshots.cjs [输出目录]
 *   BASE_URL 默认 http://127.0.0.1:5173
 *
 * 旧界面用组件 state 切换视图，没有路由；窄屏下顶部导航被隐藏、也没有 TabBar，
 * 所以这里统一用 DOM click() 驱动，窄屏截图里的页面真实用户其实到不了。
 * 去掉 Playwright 默认的 --hide-scrollbars，让滚动条位置问题出现在截图里。
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = path.resolve(process.argv[2] || "docs/screenshots/baseline");

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const SCHEMES = ["light", "dark"];

/** 点击文本完全匹配的按钮（不要求可见）。 */
async function clickButton(page, scope, text) {
  const ok = await page.evaluate(
    ([sel, t]) => {
      const btn = [...document.querySelectorAll(`${sel} button`)].find(
        (b) => b.textContent.trim() === t,
      );
      if (btn) btn.click();
      return Boolean(btn);
    },
    [scope, text],
  );
  if (!ok) throw new Error(`button not found: ${scope} "${text}"`);
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

async function main() {
  const res = await fetch(`${BASE}/api/indicators/TRD-001`);
  if (!res.ok) throw new Error(`API not reachable via ${BASE}: ${res.status}`);
  const trd = await res.json();
  const { items: clusters } = await (await fetch(`${BASE}/api/clusters`)).json();
  const clusterIndex = clusters.findIndex((c) => c.code === trd.cluster_code);
  const clusterLabel = `${String(clusterIndex + 1).padStart(2, "0")}　${clusters[
    clusterIndex
  ].name.replace(/（.+$/, "")}`;

  const openIndicator = async (page) => {
    await clickButton(page, ".side", clusterLabel);
    await settle(page);
    await clickButton(page, ".leaves", trd.name);
  };

  const VIEWS = {
    home: async () => {},
    catalog: async (page) => clickButton(page, ".hdr nav", "指标"),
    indicator: openIndicator,
    charts: async (page) => {
      await openIndicator(page);
      await settle(page);
      await clickButton(page, ".hdr nav", "图表");
    },
    import: async (page) => clickButton(page, ".hdr nav", "导入"),
  };

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    for (const [device, opts] of Object.entries(VIEWPORTS)) {
      for (const scheme of SCHEMES) {
        const context = await browser.newContext({ ...opts, colorScheme: scheme, locale: "zh-CN" });
        const page = await context.newPage();
        for (const [view, go] of Object.entries(VIEWS)) {
          await page.goto(BASE);
          await settle(page);
          await go(page);
          await settle(page);
          const file = path.join(OUT, `${view}-${device}-${scheme}.png`);
          await page.screenshot({ path: file });
          console.log(path.relative(process.cwd(), file));
        }
        await context.close();
      }
    }

    // 1440 下内容区恰好占满（240 + 1200），滚动条贴边；更宽时才看得出它跑到屏幕中间。
    const wide = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      locale: "zh-CN",
    });
    const page = await wide.newPage();
    await page.goto(BASE);
    await settle(page);
    await VIEWS.indicator(page);
    await settle(page);
    const file = path.join(OUT, "indicator-wide1920-light.png");
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
    await wide.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
