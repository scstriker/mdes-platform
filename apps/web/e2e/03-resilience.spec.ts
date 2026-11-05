import { expect, test } from "@playwright/test";

/** 旧版的两个问题：请求失败被吞成空数据、请求竞态 */
test.describe("请求失败不被当成空数据", () => {
  test("接口 500：显示原因与「重试」，重试成功后恢复", async ({ page }) => {
    let fail = true;
    await page.route("**/api/stats", (route) =>
      fail
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "internal server error", params: {} } }),
          })
        : route.continue(),
    );
    await page.goto("/");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("错误：服务器内部错误，请稍后重试");
    await expect(page.getByText("指标总数")).toHaveCount(0);
    fail = false;
    await alert.getByRole("button", { name: "重试" }).click();
    await expect(page.getByText("指标总数")).toBeVisible();
  });

  test("网络断开：提示无法连接服务器", async ({ page }) => {
    await page.route("**/api/indicators", (route) => route.abort("failed"));
    await page.goto("/indicators");
    await expect(page.getByRole("alert")).toContainText("无法连接服务器，请检查网络后重试");
    await expect(page.getByText("没有符合条件的指标")).toHaveCount(0);
  });

  test("观测值查询失败与无结果分开显示", async ({ page }) => {
    await page.goto("/observations?indicator_id=TRD-999");
    await expect(page.getByText("没有符合条件的观测值")).toBeVisible();
    await page.route("**/api/observations?**", (route) => route.abort("failed"));
    await page.goto("/observations?indicator_id=TRD-001");
    await expect(page.getByRole("alert")).toContainText("无法连接服务器");
  });
});

test.describe("请求竞态", () => {
  test("先点的指标响应更慢，也不会覆盖后打开的指标", async ({ page }) => {
    await page.route("**/api/indicators/TRD-001", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/indicators?cluster=TRD");
    const table = page.getByRole("table", { name: "指标目录" });
    await table.getByRole("link", { name: "TRD-001" }).click();
    // 进入 TRD-001 页面（详情请求被拖慢、仍在途中）后马上返回，再打开 TRD-002
    await expect(page).toHaveURL(/\/indicators\/TRD-001$/);
    await page.goBack();
    await expect(page).toHaveURL(/cluster=TRD/);
    await table.getByRole("link", { name: "TRD-002" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("医疗装备出口金额");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("医疗装备出口金额");
    await expect(page).toHaveURL(/TRD-002/);
  });
});
