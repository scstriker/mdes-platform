import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { API_BASE, useTheme } from "./support";

const here = path.dirname(fileURLToPath(import.meta.url));
const DICT_CSV_PATH = path.resolve(here, "../../../data/hs_dict_202601.csv");

function loadAll164Hs8(): Array<{ hs8: string; name: string }> {
  const lines = fs
    .readFileSync(DICT_CSV_PATH, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return { hs8: cols[3].trim(), name: cols[2].trim() };
  });
}

function buildFull164GroupingCsv(
  items: Array<{ hs8: string; name: string }>,
  grouping: "product" | "partner" | "regime" | "region",
  targetUsd: number,
  targetQty1: number,
): string {
  const rows: string[] = [];
  if (grouping === "product") {
    rows.push("商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
    for (const it of items) {
      const isEcg = it.hs8 === "90181100";
      rows.push(
        `${it.hs8},${it.name},${isEcg ? targetQty1 : 0},台,${isEcg ? 12000 : 0},千克,${isEcg ? targetUsd : 0}`,
      );
    }
    return rows.join("\n");
  }
  const p1 = Math.floor(targetUsd * 0.6);
  const p2 = targetUsd - p1;
  if (grouping === "partner") {
    rows.push("商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元");
    for (const it of items) {
      if (it.hs8 === "90181100") {
        rows.push(`${it.hs8},${it.name},502,美国,${p1}`);
        rows.push(`${it.hs8},${it.name},304,德国,${p2}`);
      } else {
        rows.push(`${it.hs8},${it.name},502,美国,0`);
      }
    }
    return rows.join("\n");
  }
  if (grouping === "regime") {
    rows.push("商品编码,商品名称,贸易方式编码,贸易方式名称,美元");
    for (const it of items) {
      if (it.hs8 === "90181100") {
        rows.push(`${it.hs8},${it.name},10,一般贸易,${p1}`);
        rows.push(`${it.hs8},${it.name},14,进料加工贸易,${p2}`);
      } else {
        rows.push(`${it.hs8},${it.name},10,一般贸易,0`);
      }
    }
    return rows.join("\n");
  }
  rows.push("商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元");
  for (const it of items) {
    if (it.hs8 === "90181100") {
      rows.push(`${it.hs8},${it.name},4403,广东深圳,${p1}`);
      rows.push(`${it.hs8},${it.name},3100,上海市,${p2}`);
    } else {
      rows.push(`${it.hs8},${it.name},4403,广东深圳,0`);
    }
  }
  return rows.join("\n");
}

test.describe.serial("G4 / AC-016：38号海关原件向导 → 贸易专题 / 指标详情 / 全站搜索 / 后台观测值 / 图表导出同源闭环", () => {
  const dictItems = loadAll164Hs8();
  const allHs8 = dictItems.map((i) => i.hs8);
  let publishedReleaseId = "";

  test("1. 通过 38 号导入向导提交海关原件与清单：先暂存 staged，补齐当月双流向四分组后发布 published", async ({
    page,
    request,
    }, testInfo) => {
    expect(allHs8).toHaveLength(164);

    // 第一批：在浏览器打开 /admin/import?seq=38，载入 manifest.json 与海关原始 CSV，验证 staged 回执与 SHA-256
    const impProductCsv = buildFull164GroupingCsv(dictItems, "product", 20_375_226, 191_363_479);
    const impProductSha = createHash("sha256").update(Buffer.from(impProductCsv, "utf8")).digest("hex");
    const firstManifest = {
      dictVersion: "202601",
      month: "2024-01",
      flow: "import",
      currency: "USD",
      grouping: "product",
      hs8: allHs8,
      emptyHs8: [],
    };

    const manifestPath1 = testInfo.outputPath("manifest_import_product.json");
    const csvPath1 = testInfo.outputPath("fixture_2024-01_import_product.csv");
    fs.writeFileSync(manifestPath1, JSON.stringify(firstManifest, null, 2), "utf8");
    fs.writeFileSync(csvPath1, impProductCsv, "utf8");

    await page.goto("/admin/import?seq=38");
    await page.getByRole("button", { name: /海关月度原件与清单/ }).click();
    await expect(page.getByTestId("customs-trade-import-flow")).toBeVisible();
    await expect(page.getByTestId("trade-year-coverage-bar")).toContainText("164 个 HS8 · 117 个 HS6 · 11 个一级类别");
    await expect(page.getByTestId("trade-year-coverage-bar")).toContainText("15,744 格");

    await page.getByLabel("载入清单文件").setInputFiles(manifestPath1);
    await page
      .getByTestId("customs-trade-import-flow")
      .locator('input[type="file"][accept*="csv"]')
      .setInputFiles(csvPath1);

    await expect(page.getByTestId("customs-precheck-summary")).toContainText("164");
    await page.getByRole("button", { name: /提交海关批次入库/ }).click();

    const receipt = page.getByTestId("trade-import-receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText("status: staged");
    await expect(receipt).toContainText(impProductSha);
    await expect(receipt).toContainText("已取得 164 项");

    // 补入其余中间 6 个组合（import partner/regime/region + export product/partner/regime）
    const intermediateCombos: Array<["import" | "export", "product" | "partner" | "regime" | "region", number, number]> = [
      ["import", "partner", 20_375_226, 191_363_479],
      ["import", "regime", 20_375_226, 191_363_479],
      ["import", "region", 20_375_226, 191_363_479],
      ["export", "product", 89_723_246, 167_167_363],
      ["export", "partner", 89_723_246, 167_167_363],
      ["export", "regime", 89_723_246, 167_167_363],
    ];

    for (const [flow, grouping, usd, qty1] of intermediateCombos) {
      const csv = buildFull164GroupingCsv(dictItems, grouping, usd, qty1);
      const res = await request.post(`${API_BASE}/api/trade/import`, {
        multipart: {
          manifest: JSON.stringify({
            dictVersion: "202601",
            month: "2024-01",
            flow,
            currency: "USD",
            grouping,
            hs8: allHs8,
            emptyHs8: [],
          }),
          file: {
            name: `fixture_2024-01_${flow}_${grouping}.csv`,
            mimeType: "text/csv",
            buffer: Buffer.from(csv, "utf8"),
          },
        },
      });
      expect(res.ok()).toBe(true);
    }

    // 第八批（export / region）：在 38 号向导点击“继续导入下一分组/月份”提交，触发当月正式发布切换 releaseId
    await page.getByRole("button", { name: /继续导入下一分组/ }).click();
    const lastManifest = {
      dictVersion: "202601",
      month: "2024-01",
      flow: "export",
      currency: "USD",
      grouping: "region",
      hs8: allHs8,
      emptyHs8: [],
    };
    const expRegionCsv = buildFull164GroupingCsv(dictItems, "region", 89_723_246, 167_167_363);
    const manifestPath8 = testInfo.outputPath("manifest_export_region.json");
    const csvPath8 = testInfo.outputPath("fixture_2024-01_export_region.csv");
    fs.writeFileSync(manifestPath8, JSON.stringify(lastManifest, null, 2), "utf8");
    fs.writeFileSync(csvPath8, expRegionCsv, "utf8");

    await page.getByLabel("载入清单文件").setInputFiles(manifestPath8);
    await page
      .getByTestId("customs-trade-import-flow")
      .locator('input[type="file"][accept*="csv"]')
      .setInputFiles(csvPath8);
    await page.getByRole("button", { name: /提交海关批次入库/ }).click();

    await expect(receipt).toContainText("status: published");
    const receiptText = await receipt.innerText();
    const m = /releaseId=([0-9a-f-]{36})/.exec(receiptText);
    expect(m).toBeTruthy();
    publishedReleaseId = m![1];
  });

  test("2. 缺月与多入口同源一致性：未齐备年度提示可用期间，贸易专题、38号详情、搜索、后台观测值与图表导出共享同一 releaseId", async ({
    page,
  }) => {
    expect(publishedReleaseId).toMatch(/^[0-9a-f-]{36}$/);

    // (a) 缺少 2–12 月时访问 /trade?period=2024：提示全年尚未齐备，并列出实际可用期间 2024-01
    await page.goto("/trade?period=2024");
    const unpub = page.getByTestId("trade-unpublished-period");
    await expect(unpub).toBeVisible();
    await expect(unpub).toContainText("所选统计期间「2024」尚未齐备发布");
    await unpub.getByRole("button", { name: "查看 2024-01" }).click();

    // (b) 贸易专题 /trade?period=2024-01 核对 releaseId、11 大类、亿美元与原始美元、并导出 CSV 与 SVG
    await expect(page).toHaveURL(/\/trade\?period=2024-01/);
    const metaBar = page.getByTestId("trade-release-meta");
    await expect(metaBar).toContainText("2024-01");
    await expect(metaBar).toContainText("202601");
    await expect(metaBar).toContainText(publishedReleaseId);

    const kpiStrip = page.getByLabel("进出口贸易核心指标");
    await expect(kpiStrip).toContainText("1.1010");
    await expect(kpiStrip).toContainText("0.8972");
    await expect(kpiStrip).toContainText("0.2038");
    await expect(kpiStrip).toContainText("+0.6935");
    await expect(page.getByTestId("trade-narrative-summary")).toBeVisible();
    await expect(page.locator("#fig-trade-category-donut")).toBeVisible();
    await expect(page.locator("#fig-trade-structure-ranking")).toBeVisible();
    await expect(page.getByRole("tab", { name: /医疗器械品类结构 \(11类\)/ })).toBeVisible();

    // 验证一键导出 A4 分析报告 HTML（含全部 4 张 SVG）与 Excel 口径双表统计汇总 CSV
    const [reportDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("btn-export-trade-report").click(),
    ]);
    const reportHtml = fs.readFileSync((await reportDownload.path())!, "utf8");
    expect(reportHtml).toContain("中国医疗器械海关进出口与供应链集中度态势研判报告");
    expect(reportHtml).toContain(publishedReleaseId);
    expect((reportHtml.match(/<svg\b/g) ?? []).length).toBe(4);

    // 验证输入搜索词卸载全部图表后，导出 A4 报告仍能基于快照生成全部 4 张矢量 SVG 图
    await page.locator("#trade-local-filter").fill("90181100");
    await expect(page.locator("#fig-trade-trend")).toHaveCount(0);
    const [filteredReportDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("btn-export-trade-report").click(),
    ]);
    const filteredReportHtml = fs.readFileSync((await filteredReportDownload.path())!, "utf8");
    expect((filteredReportHtml.match(/<svg\b/g) ?? []).length).toBe(4);
    await page.locator("#trade-local-filter").fill("");
    await expect(page.locator("#fig-trade-trend")).toBeVisible();

    const [dualCsvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("btn-export-trade-summary-csv").click(),
    ]);
    const dualCsvText = fs.readFileSync((await dualCsvDownload.path())!, "utf8");
    expect(dualCsvText).toContain("进出口总额(亿美元)");
    expect(dualCsvText).toContain("90181100");

    const trendFig = page.locator("#fig-trade-trend");
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      trendFig.getByRole("button", { name: /导出数据\(CSV\)/ }).click(),
    ]);
    const exportedCsv = fs.readFileSync((await csvDownload.path())!, "utf8");
    expect(exportedCsv).toContain("2024-01");
    expect(exportedCsv).toContain("0.8972");
    expect(exportedCsv).toContain("0.2038");
    expect(exportedCsv).toContain("89723246");
    expect(exportedCsv).toContain("20375226");

    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      trendFig.getByRole("button", { name: /导出图卡\(SVG\)/ }).click(),
    ]);
    const exportedSvg = fs.readFileSync((await svgDownload.path())!, "utf8");
    expect(exportedSvg).toContain(publishedReleaseId);
    expect(exportedSvg).toContain("2024-01");

    // (c) 38 号指标详情页 /system/38?period=2024-01 展示相同 releaseId 与相同金额
    await page.goto("/system/38?period=2024-01");
    const sysSnap = page.getByTestId("system-38-live-snapshot");
    await expect(sysSnap).toBeVisible();
    await expect(sysSnap).toContainText(publishedReleaseId);
    await expect(sysSnap).toContainText("0.2038");
    await expect(sysSnap).toContainText("0.8972");
    await expect(sysSnap).toContainText("+0.6935");

    // (d) 后台观测值核查页 /admin/observations?indicator_id=TRD-001&period=2024-01 定位同版派生观测记录
    await page.goto("/admin/observations?indicator_id=TRD-001&period=2024-01");
    const obsTable = page.getByRole("table", { name: "观测值查询结果" });
    await expect(obsTable).toContainText("TRD-001");
    await expect(obsTable).toContainText("2024-01");
    await expect(obsTable).toContainText(publishedReleaseId);

    // (e) 顶部全站搜索 HS8 90181100 命中同版记录并深链跳转至贸易专题税号明细表
    await page.goto("/search?q=90181100");
    await expect(page.locator("main")).toContainText("90181100 心电图记录仪");
    await expect(page.locator("main")).toContainText(publishedReleaseId);
    await page.getByRole("link", { name: /进入进出口贸易专题库深入筛选/ }).click();
    await expect(page).toHaveURL(/\/trade\?.*q=90181100/);
    await expect(page.locator("main table")).toContainText("90181100");
    await expect(page.locator("main table")).toContainText("191,363,479 台");
  });

  test("3. 发布后实况视图无障碍检查（浅色 / 深色）：/trade、/system/38 与 38号海关向导均无 WCAG 2.1 AA 违规", async ({
    page,
  }) => {
    for (const theme of ["light", "dark"] as const) {
      await useTheme(page, theme);
      for (const route of ["/trade?period=2024-01", "/system/38?period=2024-01", "/admin/import?seq=38"]) {
        await page.goto(route);
        if (route.includes("/admin/import")) {
          await page.getByRole("button", { name: /海关月度原件与清单/ }).click();
        }
        await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
        await page.waitForTimeout(200);
        const { violations } = await new AxeBuilder({ page: page as never })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          violations.map((v) => `${theme} ${route}: ${v.id} (${v.impact}) ${v.help}`),
        ).toEqual([]);
      }
    }
  });
});
