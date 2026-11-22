import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useTheme } from "./support";

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

test.describe("前端重构专项验收：部委智库门户、同轴范围搜索、Statista图表与前后台隔离", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1. /system 轴线对齐、6 张一级领域表列宽像素级一致，且默认锁定本栏搜索建议", async ({ page }) => {
    await page.goto("/system");
    await expect(page.getByRole("heading", { level: 1, name: /指标目录/ })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // 校验页眉内容左边界 === 检索栏左边界 === 左侧目录左边界；右侧表格右边界 === 搜索框右边界
    const headerLogoBox = await page.locator("header a").first().boundingBox();
    const searchFormBox = await page.locator("main form[role=search]").first().boundingBox();
    const tocNavBox = await page.getByRole("navigation", { name: /一级领域目录/ }).boundingBox();
    const tables = page.locator("main table");
    await expect(tables).toHaveCount(6);
    const firstTableBox = await tables.first().boundingBox();

    expect(Math.abs(headerLogoBox!.x - tocNavBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(headerLogoBox!.x - searchFormBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(searchFormBox!.x + searchFormBox!.width - (firstTableBox!.x + firstTableBox!.width))).toBeLessThanOrEqual(1);

    // 校验全部 6 张一级领域表的各列 th 左边界完全一致（误差 <= 1px）
    const allHeaderPositions = await tables.evaluateAll((tbls) =>
      tbls.map((tbl) =>
        [...tbl.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().x)),
      ),
    );
    expect(allHeaderPositions.length).toBe(6);
    const baseline = allHeaderPositions[0];
    expect(baseline.length).toBeGreaterThanOrEqual(6);
    for (let t = 1; t < allHeaderPositions.length; t++) {
      for (let c = 0; c < baseline.length; c++) {
        expect(Math.abs(allHeaderPositions[t][c] - baseline[c])).toBeLessThanOrEqual(1);
      }
    }

    // 校验顶部全局搜索框默认面向全站跨库检索，且聚焦弹出搜索建议面板
    await expect(page.getByLabel("检索范围")).toHaveValue("/search");
    await page.locator("#system-indicator-search").focus();
    await expect(page.getByRole("region", { name: "搜索建议" })).toBeVisible();
  });

  test("2. 全站前台子页面无建设中空壳、无四边框 Card 组件，且旧工程路由平滑收归后台", async ({ page }) => {
    const routes = [
      "/",
      "/search?q=手术",
      "/products",
      "/enterprises",
      "/trade",
      "/reports",
      "/system",
      "/system/01",
      "/system/35",
      "/system/38",
    ];
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
    await page.goto("/indicators?phase=phase1");
    await expect(page).toHaveURL(/\/admin\/indicators\?phase=phase1$/);
    await page.goto("/observations?indicator_id=TRD-001");
    await expect(page).toHaveURL(/\/admin\/observations\?indicator_id=TRD-001$/);
  });

  test("3. 首页轮播、全站跨库检索及子页默认范围搜索建议闭环", async ({ page }) => {
    await page.goto("/");
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

    // 验证前台顶部搜索栏选择领域并检索统一进入独立搜索结果页 /search（零无关宏观图表遮挡）
    const bannerSearch = page.locator("section").first().locator("form[role=search]");
    await bannerSearch.getByLabel("检索范围").selectOption("/products");
    await bannerSearch.locator("input").first().fill("磁共振");
    await bannerSearch.getByRole("button", { name: /检索/ }).click();
    await expect(page).toHaveURL(/\/search\?q=.*&scope=products/);
    await expect(page.getByRole("heading", { level: 1, name: /「磁共振」的搜索结果/ })).toBeVisible();
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText("5.0T 超高场全身磁共振成像系统");
    await expect(page.getByLabel("检索范围")).toHaveValue("/products");
    await expect(page.getByText("领域：注册与产品")).toBeVisible();
  });

  test("4. 按需输出全量 14+ 页面多视口验收截图", async ({ page }) => {
    test.setTimeout(180_000);
    if (!SCREENSHOT_DIR) return;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const shots: [string, string][] = [
      ["01-home", "/"],
      ["02-products", "/products"],
      ["03-enterprises", "/enterprises"],
      ["04-trade", "/trade"],
      ["05-reports", "/reports"],
      ["06-system", "/system"],
      ["07-system-01", "/system/01"],
      ["08-admin-indicators", "/admin/indicators"],
      ["09-admin-indicator-trd001", "/admin/indicators/TRD-001"],
      ["10-admin-observations", "/admin/observations"],
      ["11-admin-overview", "/admin"],
      ["12-admin-import", "/admin/import"],
      ["13-admin-batches", "/admin/batches"],
      ["14-design", "/__design"],
      ["15-global-search", "/search?q=手术"],
    ];

    await useTheme(page, "light");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [name, route] of shots) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-desktop-light.png`), fullPage: true });
    }

    await useTheme(page, "dark");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [name, route] of [
      ["01-home", "/"],
      ["02-products", "/products"],
      ["04-trade", "/trade"],
      ["05-reports", "/reports"],
    ] as const) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-desktop-dark.png`), fullPage: true });
    }

    await useTheme(page, "light");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, route] of [
      ["01-home", "/"],
      ["06-system", "/system"],
      ["02-products", "/products"],
    ] as const) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-mobile-light.png`), fullPage: true });
    }
  });
});
