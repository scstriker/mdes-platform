#!/usr/bin/env node
/**
 * 页面截图自查：五个页面 × 桌面 1440 / 手机 390 × 浅色 / 深色，整页截图。
 *
 * 前置：API 与 Web dev server 已启动；库里导入了 data/samples/trd_sample.csv 与
 * `node scripts/make-demo-csv.mjs` 生成的演示数据（虚构，用于展示多省份、多序列等切片情形）。
 * 用法：node apps/web/scripts/page-screenshots.cjs [输出目录]
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = path.resolve(process.argv[2] || "docs/screenshots/phase3");

const PAGES = [
  ["overview", "/"],
  ["catalog", "/indicators?phase=phase1"],
  ["indicator", "/indicators/TRD-001"],
  ["indicator-compare", "/indicators/TRD-005?split=d.partner"],
  ["observations", "/observations?indicator_id=TRD-001&geo=CN&period_from=2024-01"],
  ["import", "/import"],
];
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [device, opts] of Object.entries(DEVICES)) {
      for (const theme of ["light", "dark"]) {
        const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1, locale: "zh-CN" });
        await ctx.addInitScript((t) => localStorage.setItem("mdes-theme", t), theme);
        const page = await ctx.newPage();
        for (const [name, route] of PAGES) {
          await page.goto(BASE + route);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(700);
          const file = path.join(OUT, `${name}-${device}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: true });
          console.log(path.relative(process.cwd(), file));
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
