import { expect, test } from "@playwright/test";
import { API_BASE, choose, SAMPLE_CSV } from "./support";

/**
 * README「验收样例」四步，按顺序执行（后一步依赖前一步导入的数据）。
 * 库在每次 e2e 启动时清空（见 playwright.config.ts 的 webServer）。
 */
test.describe.serial("README 验收样例", () => {
  test("1. 打开「指标目录」，阶段选「一期」，应约 30 项", async ({ page }) => {
    await page.goto("/indicators");
    await expect(page.getByText(/共 99 项/)).toBeVisible();
    await choose(page, "阶段", /一期/);
    await expect(page.getByText(/共 30 项/)).toBeVisible();
    await expect(page).toHaveURL(/phase=phase1/);
  });

  test("2. 数据后台「新建导入」上传 data/samples/trd_sample.csv", async ({ page }) => {
    await page.goto("/admin/import");
    await page.getByRole("button", { name: /38\s+医疗器械进出口贸易/ }).click();
    await page.locator("input[type=file]").setInputFiles(SAMPLE_CSV);
    await expect(page.getByText(/可写入/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /写入 10 行/ }).click();
    await expect(page.getByText("导入完成，10 行全部写入")).toBeVisible();
    await expect(page.getByRole("link", { name: "查看本批次" })).toBeVisible();
  });

  test("3. 「观测值」查询 TRD-001 应有多行", async ({ page }) => {
    await page.goto("/observations");
    await choose(page, "指标", /^TRD-001 医疗装备进口金额/);
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.getByText(/共 3 条/).first()).toBeVisible();
    const rows = page.getByRole("table", { name: "观测值查询结果" }).locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("2024-03");
  });

  test("4. /api/health 中 db: ok", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`);
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ ok: true, db: "ok" });
  });

  test("导入后目录同步更新", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/创新医疗器械|国产三类/);
    await page.goto("/indicators?data=with");
    await expect(page.getByText(/共 5 项/)).toBeVisible();
  });

  test("指标档案：图表先选切片，不把三个贸易伙伴加总", async ({ page }) => {
    // 样例里 TRD-005 在 2024-01 有 US 22.3 / DE 18.7 / JP 15.2 三行；旧图表会画成 56.2
    await page.goto("/indicators/TRD-005");
    await expect(page.getByText(/当前切片：/)).toBeVisible();
    await expect(page.getByText("仅一期数据")).toBeVisible();
    await expect(page.getByText("56.2")).toHaveCount(0);
    await choose(page, "对比", "按贸易伙伴对比");
    await expect(page).toHaveURL(/split=d\.partner/);
    const rows = page.getByRole("table", { name: /当前切片的观测值/ }).locator("tbody tr");
    await expect(rows).toHaveCount(3);
  });
});
