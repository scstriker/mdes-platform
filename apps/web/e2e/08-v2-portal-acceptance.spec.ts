import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { API_BASE, choose } from "./support";

/**
 * V2 全站改造五项端到端验收任务（《MDES全站页面改造设计记录.md》§6）
 * + 历史旧书签零闪烁迁移回归
 * + PRD_V2 AC-101..110 单项统计工作台 URL 状态复现与 .xlsx / .pptx 出版导出验收
 */
test.describe.serial("MDES V2 全站改造五项端到端验收、旧书签迁移与统计工作台闭环", () => {
  test("Task 1 — 按型号查采购、临床启用分列与同品类双型号逐项对比", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator("#system-indicator-search");
    await searchInput.fill("uMR Jupiter");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=uMR(\+|%20)Jupiter/);
    await page.getByRole("link", { name: /磁共振成像系统 · uMR Jupiter/ }).first().click();
    await expect(page).toHaveURL(/\/products\/umr-jupiter$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("磁共振成像系统 · uMR Jupiter");

    // 04 采购记录：核验西安交通大学第二附属医院 WXZB(2024)-016 · 1 套 · 人民币 4,980 万元
    const dealsSection = page.locator('section[aria-labelledby="model-deals-heading"]');
    await expect(dealsSection).toContainText("西安交通大学第二附属医院");
    await expect(dealsSection).toContainText("WXZB(2024)-016");
    await expect(dealsSection).toContainText("1 套");
    await expect(dealsSection).toContainText("4,980 万元");
    await expect(dealsSection.locator('a[href*="xjefy.cn/defsyy/info/2191/424301.htm"]')).toBeVisible();

    // 05 实际应用（与采购中标记录严格分离）：核验深圳市龙华区中心医院 2024-08-10 正式开机启用
    const actSection = page.locator('section[aria-labelledby="model-activations-heading"]');
    await expect(actSection).toContainText("深圳市龙华区中心医院");
    await expect(actSection).toContainText("2024-08-10");
    await expect(actSection.locator('a[href*="szlhq.gov.cn"]')).toBeVisible();

    // 点击「与 uMR 880 比较」进入同品类双型号参数与出处对照
    await page.getByRole("link", { name: /与 uMR 880 比较/ }).click();
    await expect(page).toHaveURL(/\/products\?compare=umr-jupiter(%2C|,)umr-880/);
    const comparePanel = page.locator("#product-comparison-panel");
    await expect(comparePanel).toBeVisible();
    await expect(comparePanel).toContainText("5.0 T（超导磁体）");
    await expect(comparePanel).toContainText("3.0 T（超导磁体）");
    await expect(comparePanel).toContainText("CQZ2200057 第 4 页");

    // 从磁共振品类市场筛选陕西与 2024 年，核验共享同一笔 WXZB(2024)-016 公开采购记录
    await page.goto("/markets?category=mri&region=陕西&period=2024");
    const marketTable = page.getByRole("table", { name: "公开采购记录" });
    await expect(marketTable.locator("tbody tr")).toHaveCount(1);
    await expect(marketTable).toContainText("西安交通大学第二附属医院");
    await expect(marketTable).toContainText("WXZB(2024)-016");
    await expect(marketTable).toContainText("1 套");
    await expect(marketTable).toContainText("人民币 4,980 万元");
  });

  test("Task 2 — 按证号查型号、器审受理号独立显示与一证多型号/UDI 包装内折去重", async ({ page }) => {
    await page.goto("/regulation/registrations");
    await page.getByLabel("证号 / 产品名 / 注册人 / 器审受理号").fill("国械注准20223061141");
    await expect(page).toHaveURL(/q=%E5%9B%BD%E6%A2%B0%E6%B3%A8%E5%87%8620223061141/);

    // 证书列表计 1 张证，独立显示器审受理号 CQZ2200057，同时列出覆盖的两个型号 uMR Jupiter 与 uMR 880
    const certRows = page.locator('[data-testid^="reg-row-"]');
    await expect(certRows).toHaveCount(1);
    const certRow = certRows.first();
    await expect(certRow).toContainText("国械注准20223061141");
    await expect(certRow).toContainText("器审受理号：");
    await expect(certRow).toContainText("CQZ2200057");
    await expect(certRow.getByRole("link", { name: /uMR Jupiter/ }).first()).toBeVisible();
    await expect(certRow.getByRole("link", { name: /uMR 880/ }).first()).toBeVisible();

    // 从覆盖型号进入 uMR Jupiter 档案，核验 CMDE 审评报告 #page=4 链接及可收合/展开的 2 条 UDI-DI 包装赋码记录
    await certRow.getByRole("link", { name: /uMR Jupiter/ }).first().click();
    await expect(page).toHaveURL(/\/products\/umr-jupiter$/);
    await expect(
      page.locator('a[href="https://www.cmde.org.cn/directory/web/cmde/images/1663555209371083806.pdf#page=4"]').first(),
    ).toBeVisible();

    const udiDetails = page.locator('section[aria-labelledby="model-specs-heading"] details');
    await expect(udiDetails).toHaveAttribute("open", "");
    const udiRows = udiDetails.locator("tbody tr");
    await expect(udiRows).toHaveCount(2);
    await expect(udiDetails).toContainText("06971928370016");
    await expect(udiDetails).toContainText("06971928370023");

    // 验证规格区内折叠面板可交互收起与重新展开
    await udiDetails.locator("summary").click();
    await expect(udiDetails).not.toHaveAttribute("open", "");
    await udiDetails.locator("summary").click();
    await expect(udiDetails).toHaveAttribute("open", "");

    // 双向可达：从型号详情点击注册证链接返回证书核验页
    await page.getByRole("link", { name: "国械注准20223061141 → 证书记录" }).click();
    await expect(page).toHaveURL(/\/regulation\/registrations\?q=/);
    await expect(page.locator('[data-testid="reg-row-reg-cert-20223061141"]')).toBeVisible();

    // 产品目录按证号筛选：同一张证覆盖 2 个产品型号（不会因 2+1 条 UDI 包装膨胀行数）
    await page.goto("/products?cert=国械注准20223061141");
    const productRows = page.getByRole("table", { name: "医疗器械产品型号名录" }).locator("tbody tr");
    await expect(productRows).toHaveCount(2);
    await expect(page.getByRole("table", { name: "医疗器械产品型号名录" })).toContainText("uMR Jupiter");
    await expect(page.getByRole("table", { name: "医疗器械产品型号名录" })).toContainText("uMR 880");
  });

  test("Task 3 — 按服务类型、省市与专业查找检验检测机构并核验主管部门公开依据", async ({ page }) => {
    await page.goto("/institutions");
    await page.getByRole("tab", { name: "检验检测" }).click();
    await choose(page, "所在省市（地区）", "湖北");
    await page.getByRole("button", { name: "医用超声设备", exact: true }).click();

    await expect(page).toHaveURL(/subkind=%E6%A3%80%E9%AA%8C%E6%A3%80%E6%B5%8B/);
    await expect(page).toHaveURL(/region=%E6%B9%96%E5%8C%97/);
    await expect(page).toHaveURL(/q=%E5%8C%BB%E7%94%A8%E8%B6%85%E5%A3%B0%E8%AE%BE%E5%A4%87/);

    const instRows = page.locator('[data-testid^="inst-row-"]');
    await expect(instRows).toHaveCount(1);
    const hubeiRow = page.getByTestId("inst-row-inst-hubei-mdqi");
    await expect(hubeiRow).toBeVisible();
    await expect(hubeiRow).toContainText("湖北省医疗器械质量监督检验研究院");
    await expect(hubeiRow).toContainText("武汉");
    await expect(hubeiRow).toContainText("医用超声设备类医疗器械质量监督检验");
    await expect(
      hubeiRow.locator('a[href="https://mpa.hubei.gov.cn/zfxxgk/fdzdgknr/jgjj/zsdw/202008/t20200806_2745120.shtml"]').first(),
    ).toBeVisible();
  });

  test("Task 4 — 从研究报告核对锁定版本统计、发布隔离修订版不改原报告读数、并验证废止/误写标准号纠偏", async ({
    page,
    browser,
    request,
  }) => {
    await page.goto("/reports/mdes-2026q3-high-end-imaging-report");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "中国高端医学影像装备运行监测与磁共振产业链专题报告",
    );
    const ch1Article = page.locator("#ch-1");
    await expect(ch1Article).toContainText("18.99%");
    await expect(ch1Article).toContainText("版本永久锁定：v2026.06.1");

    // 进入第一章锁定的单项统计工作台 v2026.06.1，切换图表/数据表并核验 2025 年报正文第 87 页链接
    await ch1Article.getByRole("link", { name: /打开当期锁定统计工作台（v2026\.06\.1）/ }).click();
    await expect(page).toHaveURL(/\/statistics\/STAT-ENT-UIH-RD-RATIO\?v=2026\.06\.1$/);
    await expect(page.getByLabel("核心统计摘要")).toContainText(/18\.99\s*%/);

    const figGroup = page.getByRole("group", { name: "图表与数据表视图切换" });
    await figGroup.getByRole("button", { name: "数据表" }).click();
    await expect(page.locator('[data-slot="figure-canvas"] table')).toContainText("18.99%");
    await expect(page.locator('[data-slot="figure-canvas"] table')).toContainText("21.95%");
    await figGroup.getByRole("button", { name: "图表" }).click();
    await expect(page.locator('[data-slot="figure-canvas"] svg')).toBeVisible();

    const sourcesSection = page.locator('section[aria-labelledby="sec-sources"]');
    await expect(sourcesSection).toContainText("正文第 87 页");
    await expect(sourcesSection.locator('a[href*="2025-annual-report.pdf#page=87"]')).toBeVisible();

    // 读取 2026.06.1 原始对象并向 /api/statistics/publish 发布隔离的新修订版本 2026.09.1（headline 19.50）
    const baseRes = await request.get(`${API_BASE}/api/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1&raw=1`);
    expect(baseRes.ok()).toBe(true);
    const baseStat = await baseRes.json();

    const revisedStat = {
      ...baseStat,
      version: "2026.09.1",
      content_hash: "",
      published_at: "2026-09-25T08:00:00Z",
      insight: "隔离修订测试版（2026.09.1）：研发投入占营业收入比例重述为 19.50%。",
      summary_kpi: {
        ...baseStat.summary_kpi,
        headline_value: "19.50",
        period: "2025（重述修订）",
      },
      dataset: {
        ...baseStat.dataset,
        series: [
          {
            ...baseStat.dataset.series[0],
            values: [14.45, 15.82, 16.81, 21.95, 19.5],
          },
        ],
      },
    };

    const pubRes = await request.post(`${API_BASE}/api/statistics/publish`, {
      data: { statistic: revisedStat },
    });
    expect(pubRes.ok()).toBe(true);
    const pubJson = await pubRes.json();
    expect(pubJson.latest_version).toBe("2026.09.1");

    // 使用全新无缓存浏览器上下文（避免前序 ?v=2026.06.1 的 immutable 本地缓存遮蔽服务端最新返回的 is_historical_version 状态）
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();

    // 1) 不带版本参数打开 /statistics/STAT-ENT-UIH-RD-RATIO：展示最新发布版 2026.09.1（19.50%）
    await freshPage.goto("/statistics/STAT-ENT-UIH-RD-RATIO");
    await expect(freshPage.locator("main")).toContainText("版本 v2026.09.1");
    await expect(freshPage.getByLabel("核心统计摘要")).toContainText(/19\.50\s*%/);

    // 2) 重新打开已出版报告：第一章依然严格锁定 v2026.06.1 与 18.99%，绝不被新版本篡改
    await freshPage.goto("/reports/mdes-2026q3-high-end-imaging-report");
    await expect(freshPage.locator("#ch-1")).toContainText("18.99%");
    await expect(freshPage.locator("#ch-1")).toContainText("版本永久锁定：v2026.06.1");
    await expect(freshPage.locator("#ch-1")).toContainText("该统计后续已发布独立修订版 v2026.09.1");

    // 3) 重新打开固定版本链接 ?v=2026.06.1：依然展示 18.99%，并弹出历史归档版本提示横幅
    await freshPage.goto("/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1");
    await expect(freshPage.getByLabel("核心统计摘要")).toContainText(/18\.99\s*%/);
    await expect(
      freshPage.getByText("您正在查看历史归档版本 2026.06.1，最新已发布版本为 2026.09.1"),
    ).toBeVisible();
    await freshContext.close();

    // 4) 标准纠偏案例：检索历史误写号 GB 9706.233-2020，提示现行规范编号为强制性行业标准 YY 9706.233-2021
    await page.goto("/standards?q=GB+9706.233-2020");
    await expect(
      page.getByText(/标准编号纠偏提示：您输入的「GB 9706\.233-2020」现行规范编号为 YY 9706\.233-2021/),
    ).toBeVisible();
    await expect(page.getByTestId("std-row-std-yy-9706-233-2021")).toContainText("YY 9706.233-2021");
  });

  test("Task 5 — 原入口贸易查询导出与跨页深链 + 四组旧书签抽查 + 统计工作台 URL 状态复现与 XLSX/PPTX 下载", async ({
    page,
    context,
  }) => {
    // A. 从桌面一级导航「进出口贸易」进入 /trade，切换税号与伙伴目录、切换图表/数据表并导出 SVG 与 CSV
    await page.goto("/");
    await page.locator("header nav").getByRole("link", { name: "进出口贸易" }).click();
    await expect(page).toHaveURL(/\/trade$/);

    await page.getByRole("tab", { name: /税号/ }).click();
    await expect(page).toHaveURL(/tab=hs/);
    await page.getByRole("tab", { name: /贸易伙伴/ }).click();
    await expect(page).toHaveURL(/tab=partners/);

    const tradeTrendFig = page.locator("#fig-trade-trend");
    await expect(tradeTrendFig).toBeVisible();
    const tradeViewGroup = tradeTrendFig.getByRole("group", { name: "图表与数据表视图切换" });
    await tradeViewGroup.getByRole("button", { name: "数据表" }).click();
    await expect(tradeTrendFig.locator('[data-slot="figure-canvas"] table')).toBeVisible();
    await tradeViewGroup.getByRole("button", { name: "图表" }).click();
    await expect(tradeTrendFig.locator('[data-slot="figure-canvas"] svg')).toBeVisible();

    const [tradeSvgDl] = await Promise.all([
      page.waitForEvent("download"),
      tradeTrendFig.getByRole("button", { name: /导出图卡\(SVG\)/ }).click(),
    ]);
    expect(fs.statSync((await tradeSvgDl.path())!).size).toBeGreaterThan(200);

    const [tradeCsvDl] = await Promise.all([
      page.waitForEvent("download"),
      tradeTrendFig.getByRole("button", { name: /导出数据\(CSV\)/ }).click(),
    ]);
    expect(fs.statSync((await tradeCsvDl.path())!).size).toBeGreaterThan(30);

    // 跨页深链：从品类市场页点击磁共振成套装置税号链接进入 /trade?q=90181310
    await page.goto("/markets?category=mri");
    await page.getByRole("link", { name: /查 90181310 成套装置/ }).click();
    await expect(page).toHaveURL(/\/trade\?q=90181310/);
    await expect(page.locator("#trade-local-filter")).toHaveValue("90181310");
    await expect(page.locator("main table")).toContainText(/9018\.?1310/);

    // B. 旧链接抽查 1：/products?channel=priority -> 平滑导向注册与准入优先审批列表
    await page.goto("/products?channel=priority");
    await expect(page).toHaveURL(/\/regulation\/registrations\?channel=priority/);
    await expect(page.getByRole("tab", { name: "优先审批", selected: true })).toBeVisible();
    await expect(page.locator("main")).toContainText("儿童先天性心脏病可降解封堵系统优先审批决定");

    // C. 旧链接抽查 2：/enterprises?group=ashare&province=上海 -> 精确筛选上海 A 股企业（联影医疗 & 奕瑞科技）
    await page.goto("/enterprises?group=ashare&province=上海");
    const entTable = page.getByRole("table", { name: "医疗器械重点企业名录" });
    await expect(entTable).toContainText("上海联影医疗科技股份有限公司");
    await expect(entTable).toContainText("上海奕瑞光电子科技股份有限公司");
    await expect(entTable).not.toContainText("深圳迈瑞生物医疗电子股份有限公司");

    // D. 旧链接抽查 3：/reports?tab=standards -> 呈现「官方年报」与「技术标准」双独立入口
    await page.goto("/reports?tab=standards");
    await expect(page.getByRole("heading", { level: 2, name: "官方年报", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "技术标准", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /进入官方年报库/ })).toHaveAttribute("href", "/sources");
    await expect(page.getByRole("link", { name: /进入技术标准库/ })).toHaveAttribute("href", "/standards");

    // E. 旧链接抽查 4：/search?item=rep-ann-28 -> 首屏置顶并可直达 2025 年度医疗器械注册工作报告
    await page.goto("/search?item=rep-ann-28");
    const focusedHit = page.locator("#search-hit-rep-ann-28");
    await expect(focusedHit).toBeVisible();
    await expect(focusedHit).toContainText("2025 年度医疗器械注册工作报告");
    await focusedHit.getByRole("link", { name: /2025 年度医疗器械注册工作报告/ }).first().click();
    await expect(page).toHaveURL(/\/sources\?id=rep-ann-28/);
    await expect(page.getByText(/已定位官方来源文献：2025 年度医疗器械注册工作报告/)).toBeVisible();

    // F. V2 单项统计工作台 URL 状态复现 & .xlsx / .pptx 出版级文件下载
    await page.goto("/statistics/STAT-MKT-MRI-PROCUREMENT");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("中国医用磁共振成像设备市场规模与预测");

    await page.getByRole("button", { name: "图表设置" }).click();
    await page.getByRole("button", { name: "折线图", exact: true }).click();
    await expect(page).toHaveURL(/chart=line/);
    const perspectiveUrl = page.url();
    await page.keyboard.press("Escape");

    const peerPage = await context.newPage();
    await peerPage.goto(perspectiveUrl);
    await expect(peerPage).toHaveURL(/chart=line/);
    await expect(peerPage.getByRole("button", { name: /恢复默认发布视角/ })).toBeVisible();
    await peerPage.getByRole("button", { name: "图表设置" }).click();
    await expect(peerPage.getByRole("button", { name: "折线图", exact: true })).toHaveClass(/bg-brand-navy/);
    await peerPage.close();

    const [xlsxDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /导出 4-Sheet 标准统计底稿 \(\.xlsx\)/ }).click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toMatch(/\.xlsx$/);
    const xlsxBuffer = fs.readFileSync((await xlsxDownload.path())!);
    expect(xlsxBuffer.byteLength).toBeGreaterThan(1000);
    // OOXML (.xlsx) ZIP 魔数 PK\x03\x04
    expect(xlsxBuffer[0]).toBe(0x50);
    expect(xlsxBuffer[1]).toBe(0x4b);

    const [pptxDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /导出 16:9 原生可编辑图表幻灯片 \(\.pptx\)/ }).click(),
    ]);
    expect(pptxDownload.suggestedFilename()).toMatch(/\.pptx$/);
    const pptxBuffer = fs.readFileSync((await pptxDownload.path())!);
    expect(pptxBuffer.byteLength).toBeGreaterThan(1000);
    // OOXML (.pptx) ZIP 魔数 PK\x03\x04
    expect(pptxBuffer[0]).toBe(0x50);
    expect(pptxBuffer[1]).toBe(0x4b);
  });
});
