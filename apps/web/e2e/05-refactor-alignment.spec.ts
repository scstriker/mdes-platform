import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useTheme } from "./support";

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

test.describe("前端重构专项验收：像素对齐、多子页与去卡片化", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1. /system 轴线对齐与全部 14 张子表列宽像素级一致，且吸顶不裁切搜索框", async ({ page }) => {
    await page.goto("/system");
    await expect(page.getByRole("heading", { level: 1, name: /指标目录/ })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // 校验页眉内容左边界 === 左侧目录左边界；右侧表格右边界 === 搜索框右边界
    const headerLogoBox = await page.locator("header a").first().boundingBox();
    const searchFormBox = await page.locator("main form[role=search]").first().boundingBox();
    const tocNavBox = await page.getByRole("navigation", { name: /一级领域目录/ }).boundingBox();
    const tables = page.locator("main table");
    await expect(tables).toHaveCount(14);
    const firstTableBox = await tables.first().boundingBox();

    expect(Math.abs(headerLogoBox!.x - tocNavBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(searchFormBox!.x + searchFormBox!.width - (firstTableBox!.x + firstTableBox!.width))).toBeLessThanOrEqual(1);

    // 校验全部 14 张二级分类表的 7 列 th 左边界完全一致（误差 <= 1px）
    const allHeaderPositions = await tables.evaluateAll((tbls) =>
      tbls.map((tbl) =>
        [...tbl.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().x)),
      ),
    );
    expect(allHeaderPositions.length).toBe(14);
    const baseline = allHeaderPositions[0];
    expect(baseline.length).toBe(7);
    for (let t = 1; t < allHeaderPositions.length; t++) {
      for (let c = 0; c < baseline.length; c++) {
        expect(Math.abs(allHeaderPositions[t][c] - baseline[c])).toBeLessThanOrEqual(1);
      }
    }

    // 校验滚动后点击页眉「查指标」按钮，搜索输入框完全位于 62px 吸顶页眉下方（无裁切）
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("header").getByRole("button", { name: "查指标" }).click();
    await page.waitForTimeout(200);
    const inputBox = await page.locator("#system-indicator-search").boundingBox();
    expect(inputBox!.y).toBeGreaterThanOrEqual(66);
  });

  test("2. 全站前台子页面无建设中空壳、无四边框 Card 组件，且旧路由平滑重定向", async ({ page }) => {
    const routes = ["/", "/products", "/enterprises", "/trade", "/reports", "/system", "/system/01", "/system/35", "/system/38"];
    for (const r of routes) {
      await page.goto(r);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText("本栏目建设中")).toHaveCount(0);
      await expect(page.locator("[data-slot=card]")).toHaveCount(0);
    }

    await page.goto("/monitoring");
    await expect(page).toHaveURL(/\/trade$/);
    await page.goto("/regions");
    await expect(page).toHaveURL(/\/enterprises$/);
    await page.goto("/research");
    await expect(page).toHaveURL(/\/reports$/);
  });

  test("3. 首页分域检索直达子页，且经典克制首屏轮播与全站视觉图正常加载", async ({ page }) => {
    await page.goto("/");
    // 等待懒加载首页挂载并校验经典克制轮播联动
    const h1 = page.locator("main h1");
    await expect(h1).toContainText("医疗器械产业运行监测报告");
    await page.waitForLoadState("networkidle");

    // 验证首页图片均完整加载（含 Gemini 多模态视觉图）
    await expect
      .poll(async () => {
        const statuses = await page.locator("main img").evaluateAll((imgs) =>
          imgs.map((img) => ({
            complete: (img as HTMLImageElement).complete,
            w: (img as HTMLImageElement).naturalWidth,
          })),
        );
        return statuses.length >= 4 && statuses.every((s) => s.complete && s.w > 0);
      })
      .toBe(true);

    // 验证左侧底缘缩略图、左右轻箭头与右侧分页圆点三向联动切换
    await page.getByRole("button", { name: /^第 2 帧/ }).click();
    await expect(h1).toContainText("创新医疗器械审评提速");
    await page.getByRole("button", { name: "下一帧" }).click();
    await expect(h1).toContainText("国产占比连续五年攀升至七成");
    await page.getByRole("button", { name: /^切换到第 4 帧/ }).click();
    await expect(h1).toContainText("贸易顺差稳步扩大");

    // 验证首页外显分域检索携带查询词直达对应业务子页
    const bannerSearch = page.locator("section").first().locator("form[role=search]");
    await bannerSearch.getByLabel("检索范围").selectOption("/products");
    await bannerSearch.locator("input").first().fill("手术");
    await bannerSearch.getByRole("button", { name: /检索/ }).click();
    await expect(page).toHaveURL(/\/products\?q=/);
    await expect(page.getByRole("heading", { level: 1, name: /注册准入与产品数据库/ })).toBeVisible();
    await expect
      .poll(async () => {
        const widths = await page.locator("main img").evaluateAll((imgs) =>
          imgs.map((img) => (img as HTMLImageElement).naturalWidth),
        );
        return widths.some((w) => w > 0);
      })
      .toBe(true);
  });

  test("4. 按需输出多视口双主题验收截图", async ({ page }) => {
    test.setTimeout(120_000);
    if (!SCREENSHOT_DIR) return;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const shots: [string, string][] = [
      ["home", "/"],
      ["products", "/products"],
      ["enterprises", "/enterprises"],
      ["trade", "/trade"],
      ["reports", "/reports"],
      ["system", "/system"],
      ["system-01", "/system/01"],
      ["system-35", "/system/35"],
      ["admin", "/admin"],
    ];

    for (const theme of ["light", "dark"] as const) {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const [name, route] of shots) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-desktop-${theme}.png`), fullPage: true });
      }
    }

    await useTheme(page, "light");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, route] of [["home", "/"], ["system", "/system"], ["products", "/products"]] as const) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-mobile-light.png`), fullPage: true });
    }
  });
});
