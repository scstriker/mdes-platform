import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { useTheme } from "./support";

/**
 * axe 无障碍检查（WCAG 2.1 A / AA）：每个页面 × 桌面 / 手机 × 浅色 / 深色。
 * 在 01 导入样例数据之后运行，页面带真实内容。
 */
const ROUTES: [string, string][] = [
  ["首页", "/"],
  ["全站跨库检索", "/search?q=手术"],
  ["统计成果库", "/statistics"],
  ["单项统计工作台", "/statistics/STAT-ENT-UIH-RD-RATIO"],
  ["品类市场", "/markets"],
  ["注册与产品", "/products"],
  ["产品型号详情", "/products/umr-jupiter"],
  ["企业与机构", "/enterprises"],
  ["企业研究档案", "/enterprises/united-imaging"],
  ["注册与准入", "/regulation/registrations"],
  ["机构名录", "/institutions"],
  ["技术标准", "/standards"],
  ["进出口贸易", "/trade"],
  ["政策与报告", "/reports"],
  ["指标目录", "/system"],
  ["指标详情 01", "/system/01"],
  ["指标详情 35", "/system/35"],
  ["工程指标库 · 表格", "/admin/indicators"],
  ["工程指标库 · 矩阵", "/admin/indicators?view=matrix"],
  ["指标档案 · 数据", "/admin/indicators/TRD-001"],
  ["指标档案 · 对比", "/admin/indicators/TRD-005?split=d.partner"],
  ["指标档案 · 规格", "/admin/indicators/TRD-001?tab=spec"],
  ["指标档案 · 关联", "/admin/indicators/TRD-001?tab=related"],
  ["观测值核查", "/admin/observations?indicator_id=TRD-001"],
  ["数据管理 · 概况", "/admin"],
  ["数据管理 · 导入", "/admin/import"],
  ["数据管理 · 记录", "/admin/batches"],
  ["组件验收", "/__design"],
];

async function audit(page: Page, route: string) {
  await page.waitForLoadState("load");
  // /__design 里有常驻的「加载中」示例，不等它
  if (!route.startsWith("/__design")) await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  await page.waitForTimeout(250);
  // @axe-core/playwright 依赖的 playwright-core 类型版本较旧，运行时接口兼容
  const { violations } = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.map(
    (v) => `${v.id}（${v.impact}）${v.help}：${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}${v.nodes.length > 3 ? ` 等 ${v.nodes.length} 处` : ""}`,
  );
}

for (const [device, opts] of [
  ["桌面", { viewport: { width: 1440, height: 900 } }],
  ["手机", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`无障碍 · ${device} · ${theme === "light" ? "浅色" : "深色"}`, () => {
      test.use(opts);
      for (const [name, route] of ROUTES) {
        test(name, async ({ page }) => {
          test.setTimeout(60_000);
          await useTheme(page, theme);
          await page.goto(route);
          expect(await audit(page, route)).toEqual([]);
        });
      }
    });
  }
}
