import { expect, test } from "@playwright/test";
import { useTheme } from "./support";

/** 新外框要解决的四个问题（ADR-002「现状」），外加路由与主题 */
test.describe("外框 · 桌面", () => {
  test("页眉导航标出当前页；深链与未知路径", async ({ page }) => {
    await page.goto("/indicators/TRD-001");
    await expect(page.locator("header nav [aria-current=page]")).toHaveText("指标目录");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("医疗装备进口金额");
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("页面不存在");
  });

  test("页脚右段文字不被斜切装饰遮住", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    const deco = await footer.locator("[aria-hidden=true]").first().boundingBox();
    const textRight = await footer.locator("span").last().evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    expect(textRight).toBeLessThanOrEqual(deco!.x + 0.5);
  });

  test("宽屏由文档滚动，滚动条在视口右缘，页眉吸顶", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/__design?theme=light");
    await page.getByRole("heading", { level: 1, name: "组件验收" }).waitFor();
    await page.waitForLoadState("networkidle");
    const innerScrollers = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].filter((el) => {
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 300;
      }).length,
    );
    expect(innerScrollers).toBe(0);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 3000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    expect((await page.locator("header").first().boundingBox())!.y).toBe(0);
  });
});

test.describe("外框 · 窄屏", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("窄屏有底部 TabBar，可切换页面；页眉导航与页脚隐藏", async ({ page }) => {
    await page.goto("/");
    const tabbar = page.getByRole("navigation", { name: "主导航" });
    await expect(tabbar).toHaveCount(1);
    await expect(tabbar).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeHidden();
    await tabbar.getByRole("link", { name: "指标目录" }).tap();
    await expect(page).toHaveURL(/\/indicators$/);
    await expect(tabbar.locator("[aria-current=page]")).toHaveText("指标目录");
  });

  test("观测值页：窄屏只露出「指标」，其余条件收进「更多条件」", async ({ page }) => {
    await page.goto("/observations");
    await expect(page.getByLabel("起始期间")).toBeHidden();
    await page.getByRole("button", { name: /更多条件/ }).tap();
    await expect(page.getByLabel("起始期间")).toBeVisible();
  });

  test("内容不被 TabBar 挡住：滚到底时最后一块内容在 TabBar 之上", async ({ page }) => {
    await page.goto("/import");
    // 等导入历史加载完、页面高度稳定后再滚到底
    await expect(page.getByText("导入历史")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const tabTop = (await page.getByRole("navigation", { name: "主导航" }).boundingBox())!.y;
    const lastBottom = await page.locator("main > div > div").last().evaluate((el) => el.getBoundingClientRect().bottom);
    expect(lastBottom).toBeLessThanOrEqual(tabTop + 1);
  });
});

test.describe("主题", () => {
  test("深色主题：页眉不放彩色标志，改用文字 ITEI；刷新后保持", async ({ page }) => {
    await useTheme(page, "dark");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("header img[alt=ITEI]")).toBeHidden();
    await expect(page.locator("header .itei-logo-text")).toBeVisible();
  });

  test("主题菜单切换并持久化", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /主题/ }).click();
    await page.getByRole("menuitemradio", { name: "深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /主题/ }).click();
    await page.getByRole("menuitemradio", { name: "跟随系统" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });
});
