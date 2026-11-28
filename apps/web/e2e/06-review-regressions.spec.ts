import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { API_BASE } from "./support";

test.describe.serial("PR #2 代码审查缺陷全量回归测试（P1 / P2）", () => {
  test.beforeAll(async ({ request }) => {
    // 写入 62 条观测值：其中 2018-01 的靶标记录排在第 60+ 位（超过单页 PAGE_SIZE=50，位于第二页）
    const csvLines = [
      "indicator_id,period,geo,value_num,value_text,unit,dims",
      'TRD-005,2018-01,440000,,跨分页靶标光子球管,批,"{""partner"":""DE"",""trade_type"":""import""}"',
      ...Array.from(
        { length: 61 },
        (_, i) => `TRD-001,2025-${String((i % 12) + 1).padStart(2, "0")},CN,${100 + i},,亿美元,`,
      ),
    ];
    const res = await request.post(`${API_BASE}/api/import/csv`, {
      data: { filename: "review_regression_62.csv", csvText: csvLines.join("\n") },
    });
    expect(res.ok()).toBe(true);
  });

  test("1. [P1] 观测值核查页：服务端全库关键词过滤跨分页命中，且计数、分页与筛选后 CSV 导出完全一致", async ({
    page,
  }) => {
    await page.goto("/admin/observations");
    const table = page.getByRole("table", { name: "观测值查询结果" });
    await expect(table.locator("tbody tr")).toHaveCount(50);
    // 第一页未过滤时不包含排在末尾的 2018-01 靶标记录
    await expect(table).not.toContainText("跨分页靶标光子球管");

    // 在顶部本栏搜索框输入跨字段中文别名词并按回车提交
    const searchInput = page.locator("#system-indicator-search");
    await searchInput.fill("广东 德国 跨分页靶标");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/admin\/observations\?q=/);
    await expect(page.getByText(/共\s*1\s*条/).first()).toBeVisible();
    await expect(page.getByText("共 1 条 · 第 1 / 1 页")).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table).toContainText("跨分页靶标光子球管");

    // 筛选状态下导出 CSV，验证导出文件仅包含筛选命中的那 1 条记录，而非全库数据
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /导出 CSV/ }).click(),
    ]);
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    const csvContent = fs.readFileSync(csvPath!, "utf8").trim();
    const lines = csvContent.split(/\r?\n/);
    // 表头 + 1 条筛选命中记录 = 2 行
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("TRD-005");
    expect(lines[1]).toContain("跨分页靶标光子球管");
  });

  test("2. [P1] 任意前台子页顶部搜索统一进入无图表专属搜索页 /search；页内局部筛选与后台搜索保留当前分栏参数", async ({
    page,
  }) => {
    const searchInput = page.locator("#system-indicator-search");

    // 场景 A：即使当前身处「注册与产品」子页，在顶部搜索框搜「磁共振」也进入独立 /search 搜索页，且无任何宏观统计图遮挡
    await page.goto("/products");
    await searchInput.fill("磁共振");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("heading", { level: 1, name: /「磁共振」的搜索结果/ })).toBeVisible();
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText("磁共振成像系统 · uMR Jupiter");

    // 在 /search 页内切换至「注册与产品」分栏并再次按回车检索，保留 scope=products 参数且自动展开结构化字段
    await page.getByRole("tab", { name: /注册与产品/ }).click();
    await expect(page).toHaveURL(/scope=products/);
    await searchInput.fill("手术");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=.*&scope=products/);
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);

    // 场景 B：政策与报告页在旧技术标准书签（?tab=standards）使用本页局部筛选 GB 9706.1，保留 tab 且无宏观图表干扰
    await page.goto("/reports?tab=standards");
    await expect(page.getByRole("heading", { level: 1, name: "官方年报与技术标准资料查询入口" })).toBeVisible();
    await page.locator("#reports-local-filter").fill("GB 9706.1");
    await expect(page).toHaveURL(/tab=standards/);
    await expect(page).toHaveURL(/q=GB\+9706\.1|q=GB%209706\.1/);
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText("GB 9706.1");

    // 场景 C：后台观测值核查页已带 geo=440000 时按回车提交关键词，保留 geo 参数
    await page.goto("/admin/observations?geo=440000");
    await searchInput.fill("跨分页靶标");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/geo=440000/);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText(/共\s*1\s*条/).first()).toBeVisible();
  });

  test("3. [P2] 全站命中 → 专题库深链跳转 → 仍能命中且收起无关宏观图表（多词项拆分与指标 canAnswer 字段一致）", async ({
    page,
  }) => {
    // 非连续多词项：CT 9022.3000 在全站命中后跳转贸易页仍能命中，且自动收起顶部统计图
    await page.goto("/search?q=CT%209022.3000");
    const tradeJump = page.getByRole("link", { name: /进入进出口贸易深入筛选/ });
    await expect(tradeJump).toBeVisible();
    await tradeJump.click();

    await expect(page).toHaveURL(/\/trade\?q=CT%209022\.3000/);
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);
    await expect(page.locator("main table")).toContainText("9022.3000");
    await expect(page.locator("main table")).toContainText("CT 球管");

    // 指标目录 canAnswer 字段（「近五年国产第三类」仅出现在 01 指标的 canAnswer 中）
    await page.goto("/search?q=近五年国产第三类");
    const sysJump = page.getByRole("link", { name: /进入指标与口径深入筛选/ });
    await expect(sysJump).toBeVisible();
    await sysJump.click();

    await expect(page).toHaveURL(/\/system\?q=/);
    await expect(page.locator('[data-slot="figure-canvas"]')).toHaveCount(0);
    await expect(page.locator("main table").first()).toContainText("医疗器械注册与备案明细");
  });

  test("4. [P2] 后台搜索建议严格按所选范围过滤，且导入记录使用真实批次数据生成建议", async ({
    page,
  }) => {
    await page.goto("/admin/batches");
    const searchInput = page.locator("#system-indicator-search");

    // 在「导入记录」范围输入工程编码 TRD-001：本栏不应混入工程指标或新建导入项，而应归入「跨后台检索」
    await searchInput.fill("TRD-001");
    const region = page.getByRole("region", { name: "搜索建议" });
    await expect(region).toBeVisible();
    await expect(region.getByText(/当前「导入记录」范围未直接命中/)).toBeVisible();
    await expect(region.getByText("跨后台检索", { exact: true })).toBeVisible();

    // 输入刚才实际导入的批次文件名 review_regression_62.csv：本栏直接生成真实批次建议
    await searchInput.fill("review_regression_62");
    await expect(region.getByRole("button", { name: /review_regression_62\.csv/ }).first()).toBeVisible();
  });

  test("5. [P2] 全站跨库检索覆盖动态入库数据，实时展示新增观测记录并与核查总数一致", async ({
    page,
  }) => {
    await page.goto("/search?q=跨分页靶标光子球管");
    const liveSection = page.locator("#group-live-observations");
    await expect(liveSection).toBeVisible();
    await expect(liveSection).toContainText("实时入库观测记录");
    await expect(liveSection).toContainText("共 1 条");
    await expect(liveSection).toContainText("TRD-005");
  });

  test("6. [P2] StatistaFigure 导出的 SVG 包含完整出版物图卡要素（标题、副标题、徽标、图表与数据来源注释）", async ({
    page,
  }) => {
    await page.goto("/trade");
    const figure = page.locator("#fig-trade-concentration");
    await expect(figure.locator('[data-slot="figure-canvas"] svg')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      figure.getByRole("button", { name: /导出图卡\(SVG\)/ }).click(),
    ]);
    const svgPath = await download.path();
    expect(svgPath).toBeTruthy();
    const svgXml = fs.readFileSync(svgPath!, "utf8");

    expect(svgXml).toContain("图 2 · 供应链来源国集中度");
    expect(svgXml).toContain("高端影像与内镜核心部件进口高度集中");
    expect(svgXml).toContain("核心组件 CR3 最高 83.6%");
    // 同时校验 ECharts 绘图区真实图形节点与数值标签已被完整嵌入，而非误抓按钮图标 SVG
    expect(svgXml).toContain("83.6%");
    expect(svgXml).toContain("70% 高集中度线");
    expect(svgXml).toContain("数据来源：");
    expect(svgXml).toContain("中国海关 8 位 HS 商品编码原产国统计");
    expect(svgXml).toContain("CR3 指前三位进口原产国金额占同类进口总额比重");
  });

  test("7. [PR #3 P2×2] 新建导入：手动字段映射（corrected_amount=20 覆盖原 value_num=10、无标准列时保留面板恢复）与默认「融合更新」单条覆盖不重复", async ({
    page,
  }, testInfo) => {
    const csvV1Path = testInfo.outputPath("mapping_upsert_v1.csv");
    fs.writeFileSync(
      csvV1Path,
      ["indicator_id,period,value_num,corrected_amount,unit", "TRD-001,2099-12,10,20,亿美元"].join("\n"),
      "utf8",
    );

    await page.goto("/admin/import?seq=38");
    await page.locator('input[type="file"][accept*="csv"]').setInputFiles(csvV1Path);
    await expect(page.getByRole("heading", { level: 3, name: "字段对照" })).toBeVisible();

    // 手动将「金额/数值」从默认匹配的 value_num(10) 改绑为 corrected_amount(20)
    await page.getByLabel("金额/数值对应表头").selectOption("corrected_amount");
    await page.getByRole("button", { name: /写入 1 行/ }).click();
    await expect(page.getByText("导入完成，1 行全部写入")).toBeVisible();

    await page.goto("/admin/observations?indicator_id=TRD-001&period=2099-12");
    const obsTable = page.getByRole("table", { name: "观测值查询结果" });
    await expect(obsTable.locator("tbody tr")).toHaveCount(1);
    const firstRowValueCell = obsTable.locator("tbody tr").first().locator("td").nth(4);
    await expect(firstRowValueCell).toHaveText("20");

    // 第二批：表头不含 value_num（仅含 custom_revised=35），验证缺列时仍保留字段对照面板供手动映射，且默认融合更新不产生重复行
    const csvV2Path = testInfo.outputPath("mapping_upsert_v2.csv");
    fs.writeFileSync(
      csvV2Path,
      ["indicator_id,period,custom_revised,unit", "TRD-001,2099-12,35,亿美元"].join("\n"),
      "utf8",
    );

    await page.goto("/admin/import?seq=38");
    await page.locator('input[type="file"][accept*="csv"]').setInputFiles(csvV2Path);
    await expect(page.getByRole("heading", { level: 3, name: "字段对照" })).toBeVisible();
    await expect(page.getByRole("button", { name: /写入/ })).toBeDisabled();

    await page.getByLabel("金额/数值对应表头").selectOption("custom_revised");
    await expect(page.getByRole("button", { name: /写入 1 行/ })).toBeEnabled();
    await page.getByRole("button", { name: /写入 1 行/ }).click();
    await expect(page.getByText("导入完成，1 行全部写入")).toBeVisible();

    await page.goto("/admin/observations?indicator_id=TRD-001&period=2099-12");
    await expect(obsTable.locator("tbody tr")).toHaveCount(1);
    await expect(firstRowValueCell).toHaveText("35");
  });
});
