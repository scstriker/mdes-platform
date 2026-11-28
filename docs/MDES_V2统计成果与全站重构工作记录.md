# MDES V2 统计成果产品化与全站页面重构工作记录

- **交付日期**：`2026-11-27`
- **基线分支与起点提交**：`origin/main` @ `057d2d2613715a322144034910ed6ede4f7b0294`（Tree `d08537dc82db50d5baec91c3bd089f9eb46b84cf`）
- **实施分支**：`feat/v2-statistics-portal`（在 `origin/main` 之上按 5 个独立可验证批次推进提交）
- **架构决策记录**：[ADR-005 列式不可变统计快照、一等公民拆页与零首屏出版导出栈](decisions/ADR-005-v2-statistics-and-entity-portal.md)
- **输入规格对齐**：统一收敛《PRD_V2_STATISTICS.md》《MDES全站页面改造设计记录.md》与《mdes-trade-5y-handoff-20261126.md》

---

## 一、第一性原理审视与重构定案

针对三份输入文档与 `main@057d2d2` 代码现状中的核心结构冲突，直接作出四项工程决断并全部落地：

### 1. 信息架构定案：废除“混杂子页 + `/topics/*` 绕行”，按一等公民实体直接拆页
- **桌面端 7 项研究主导航**：`产业总览 (/)` · `市场 (/markets)` · `技术 (/technologies)` · `产品 (/products)` · `企业 (/enterprises)` · `进出口贸易 (/trade)` · `研究报告 (/reports)`。
- **页眉「资料查询」7 项下拉入口**：`统计成果库 (/statistics)` · `注册与准入 (/regulation/registrations)` · `机构名录 (/institutions)` · `产业政策 (/policies)` · `技术标准 (/standards)` · `官方来源 (/sources)` · `指标与口径 (/system)`。
- **移动端 5 项底部导航栏**：`总览 (/)` · `市场 (/markets)` · `产品 (/products)` · `贸易 (/trade)` · `全部`（补齐原 `nav.ts` 缺失的移动端 `/trade` 入口，「全部」展开包含全部 14 项研究与资料入口的无障碍抽屉）。
- **实体与统计独立编址**：单项统计 `/statistics/:id`、产品型号 `/products/:slug`（支持双型号参数并排比较）、企业 8 模块研究档案 `/enterprises/:slug`（支持 2–5 家企业横向对比）、研究出版物 `/reports/:slug` 均直接作为一等路由；旧书签及 `/topics/products/:slug`、`/topics/enterprises/:slug` 通过 React Router 7 `loader` 与锚点监听零闪烁重定向。
- **首页重构**：取消自动轮播 `HeroCarousel`，确立「左本期核心判断与依据链接 + 右同源统计图 + 四组研究问题入口 + 最新发布统计 + 省域有效证存量与每百家企业持证密度比较」的高信噪比智库版式。

### 2. 数据与存储定案：双平面 D1 存储（`0010` 迁移）+ 列式不可变快照 + Worker 零解析直通
- **修正迁移编号冲突**：远端 `main` 已占用 `0001..0009`，新增迁移定为 `apps/api/migrations/0010_v2_statistics_entities.sql`，向后兼容扩展 `observation` 表（`value_type`、`forecast_as_of`、`revision_id`）。
- **平面一（实体与检索索引层）**：建立 `statistic_def`（内联 `< 1 KB` `summary_kpi_json`，列表与专题卡片免读完整数据包）、`catalog_record`（统一索引型号/注册/企业/机构/政策/标准/来源/招采/技术/报告 10 类对象）、`entity_relation` 关系图谱及 SQLite `FTS5` 虚拟表 `search_fts`（含中日文分词索引与旧别名优先召回）。
- **平面二（列式不可变快照层）**：`statistic_version(statistic_id, version)` 采用 OWID 列式数组 + OECD SDMX 状态码（`A` 实际 / `E` 估算 / `F` 预测 + `forecast_as_of` / `P` 非完整期）。Hono Worker 在 `?raw=1` 快照通道直接以 `new Response(verRow.payload_json)` 原样流式返回，在默认 SPA 详情通道通过 SQLite `json_extract` 仅提取轻量 `related_statistic_ids` 并直接拼装 `rawEnvelope`（双通道均免除对含大型列式 `dataset` 的 `payload_json` 执行 `JSON.parse / JSON.stringify`），主键查询恒定 `rows_read = 1`。
- **海关贸易历史版本锁版与离线同构**：复用 `trade.ts` 的 `DEFAULT_DICT_VERSION`，扩展 `GET /api/trade/overview?releaseId=...` 查询 `trade_period_snapshot`（`rows_read = 1`），并提供共享层零拷贝适配器 `adaptTradeSnapshotToStatistics` 同时接入线上 Worker 与离线 `demo-api.ts`（支持 `/api/statistics` 列表/详情、`/versions` 历史发布序列及 `?v=<period>.<releasePrefix>` 精确回查 `trade_period_snapshot` 历史锁版）。研究报告详情页对锁版统计禁用本地未锁版种子回退，接口报错或版本不一致时显式告警而绝不静默漂移。

### 3. 图表生命周期与出版导出定案：零首屏增量，用 `22 KB` 轻量方案淘汰 `280 KB` 重型库
- **ECharts 6.1 三阶段生命周期（`chart.tsx`）**：挂载仅执行一次 `echarts.init`，筛选/排序/图形切换调用 `chart.setOption(..., { replaceMerge: ["series", "xAxis", "yAxis"], lazyUpdate: true })` 并开启 `UniversalTransition` 平滑形变，彻底消除反复 `dispose()` 重建；`ResizeObserver` 经 `requestAnimationFrame` 与非零尺寸守卫保护，自动响应 `prefers-reduced-motion: reduce`。
- **收敛 6 类高密度统计语法构建器（`templates.ts`）**：实现 `time_series`（实绩实线 + 预测/非完整期虚线无缝衔接 + 色带 + `methodology_breaks` 竖线 + 长周期自动 `DataZoom`）、`growth_rate`（突出零轴、深蓝/灰蓝无红绿涨跌偏见）、`entity_ranking`（含 70% 集中度警戒参考线）、`grouped_comparison`、`structure_change`（堆叠与 100% 百分比堆叠）、`share_composition`（≤6 项环形图或自动合并「其他」），严控 `allowed_chart_types` 白名单与多序列 Top 5 绘制上限（超出项在数据表标注「未画出」）。
- **离屏白底矢量/高清位图与按需 Office 导出栈**：
  - 浏览器内存态离屏 ECharts SVG 实例直接读取 `tokens.flat.json` 浅色出版常量（零硬编码色值，免疫深色主题与表格态卸载，同步修复 `/trade` A4 报告深色主题导出问题），支持出版物图卡 SVG、纯图 SVG 与 Canvas `2x` 高清 PNG；
  - 4-Sheet Excel 底稿（`Data / Metadata / Sources / Methodology` 含冻结首行与禁止推断红线）采用 `write-excel-file@^4.1.1`，生产构建异步 chunk 压缩后仅 **`22.05 kB` gzip**（约为 `ExcelJS` 的 **1/12**）；
  - 可编辑原生 PowerPoint 图表（16:9 ITEI 母版 + 真 OOXML `ppt/charts/chart1.xml` 及内嵌工作表）采用 `pptxgenjs@^4.0.1` 独立异步分包；
  - 内置 `GB/T 7714-2015`、`APA 7`、公文简注引文生成器与 9 要素 `Copy for AI` 结构化 Markdown，裁剪无向量库支撑的聊天抽屉、赛马图与外部 `<iframe>`。

### 4. 现网静态样本 4 处事实偏差全部纠偏并贯通权威出处
1. `uMR Jupiter`（5.0T 超导磁共振）注册证由原虚构编号纠正为 **`国械注准20223061141`**，独立列示器审受理号 **`CQZ2200057`**（定位器审中心技术审评报告第 4 页），补齐与 `uMR 880`（3.0T）并排参数对比、西安交大二附院 **`WXZB(2024)-016`**（`2024-12-13`，`1 套`，`人民币 4,980 万元`）公开成交记录及深圳市龙华区中心医院（`2024-08-10` 正式启用）实际应用记录；
2. 上海联影医疗 2025 年研发投入占营业收入比例由 `17.8%` 纠正为 **`18.99%`**（2024 年为 **`21.95%`**，定位 2025 年年度报告正文第 87 页）；
3. 医疗诊断用磁共振设备安全专用标准由 `GB 9706.233-2020（强制性国标）` 纠正为 **`YY 9706.233-2021`（强制性行业标准，2023-05-01 实施，代替 `YY 0319-2008`）**，检索旧误称自动弹出纠偏横幅并链向全国标准信息公共服务平台备案页；
4. 补齐**湖北省医疗器械质量监督检验研究院**（武汉 · 检验检测 · 医用超声设备监督检验职责及湖北省药监局公开链接），并将 `trade/data.ts` 内窥镜核心组件示例税号由血压计税号 `9018.9020` 纠正为 `9018.9030`，同时打通磁共振整机 `90181310`（2024 进口 `263,110,996` 美元）与零件 `90181390`（2024 进口 `312,475,459` 美元）跨页深链（兼容带点与无点 8 位税号检索）。

---

## 二、GitHub 同类开源实现调研与选型对比表

| 评估维度 | 对标开源仓库 | Star / 许可证 | 核心工程机制 | 本项目落地方式 |
| :--- | :--- | :--- | :--- | :--- |
| **列式统计数据模型** | `owid/owid-grapher` (https://github.com/owid/owid-grapher) | 1,575 ★ · Open | 列式数组传输 + 客户端单表派生投影驱动图/表/导出 + 增量 URL 参数 | `packages/shared/src/statistics.ts` `StatisticDataset` 与 `projectStatisticView` |
| **统计严谨性与断点** | `sdmx-twg/sdmx-json` & OECD `.Stat` (https://github.com/sdmx-twg/sdmx-json) | 56 ★ · MIT | SDMX 2.0 观测状态码（`A`/`E`/`F`/`P`）与方法论断点元数据分离 | 单字节状态数组、历史预测时点 `forecast_as_of` 冻结与 `methodology_breaks` 竖线 |
| **出版物版本锁与底稿** | `ONSdigital/gptables` (https://github.com/ONSdigital/gptables) | 46 ★ · MIT | `/versions/{v}` 永久不可变快照 + 冻结表头政府标准多工作表 Excel | `/statistics/:id?v=` 锁版提示、报告章节锁版引用与 4-Sheet `.xlsx` 结构 |
| **ECharts 出版级封装** | `evidence-dev/evidence` (https://github.com/evidence-dev/evidence) | 7,151 ★ · MIT | 纯 ECharts 构建高信噪比研报图卡，不叠加第二图表框架 | `StatisticFigure 2.0` 四段式去卡片化容器与 6 类语法构建器 |
| **内容寻址快照缓存** | `observablehq/framework` (https://github.com/observablehq/framework) | 3,691 ★ · ISC | 发布期烘焙 `content_hash` + `Cache-Control: immutable` | `statistic_version.content_hash` + Worker 强 `ETag` / `304` 校验 |
| **离屏矢量渲染** | `apache/echarts` v6.1 (https://github.com/apache/echarts) | 67.8k ★ · Apache-2.0 | `ssr: true` + `renderToSVGString()` 结合浏览器真实中文字宽测量 | `export-svg-png.ts` 白底出版物/纯图双预设 SVG 与 `2x` 高清 PNG |
| **4-Sheet Excel 生成** | `catamphetamine/write-excel-file` v4.1 (https://github.com/catamphetamine/write-excel-file) | 36 ★ · MIT | 仅依赖 `fflate`，异步分包实测 **`22.05 kB` gzip**，原生样式与冻结行 | `export-xlsx.ts` 动态 `import()`（淘汰臃肿的 `ExcelJS` 与无样式 `SheetJS CE`） |
| **原生可编辑 PPTX** | `gitbrent/PptxGenJS` v4.0.1 (https://github.com/gitbrent/PptxGenJS) | 6,418 ★ · MIT | 浏览器端免 `node:fs` 报错，输出真 OOXML Chart XML 与内嵌工作簿 | `export-pptx.ts` 动态 `import()` 生成 16:9 ITEI 汇报页 |
| **URL 视图状态同步** | `47ng/nuqs` v2.10 (https://github.com/47ng/nuqs) | 10,918 ★ · MIT | React Router v7 适配器（约 6 KB gzip），键级重渲染隔离与节流保护 | 全站目录分面筛选与 `/statistics/:id` 视角分享链接 |

---

## 三、分批提交记录与验证证据台账

| 批次 | 提交范围与核心产出 | 关键验证结果 | Commit SHA |
| :--- | :--- | :--- | :--- |
| **Batch 1** | 同步 `origin/main (057d2d2)`，建立 `ADR-005` 与本工作记录主文档 | 分支基线与构建校验通过 | `9a7e3ef` |
| **Batch 2** | `@mdes/shared` 列式 `Statistic` 与实体契约、核验样板种子库、D1 `0010` 双平面 + FTS5 迁移、`/api/statistics` 零解析直通、`/api/catalog`、`/api/trade/overview?releaseId=`、`demo-api.ts` 同构 | Miniflare D1 断言 `statistic_version` 与 `trade_period_snapshot` 均恒定 `rows_read = 1`；全量 API 集成测试 74/74 通过 | `7dc840e` |
| **Batch 3** | `chart.tsx` 三阶段实例复用、6 类统计语法模板、离屏白底 SVG/2xPNG、动态分包 `write-excel-file` 4-Sheet XLSX & `pptxgenjs` 原生 PPTX、`StatisticFigure 2.0`、`/__design` 展示 | Spy 断言筛选/切图零 `dispose` 重建；XLSX 4-Sheet 与 PPTX `ppt/charts/chart1.xml` 二进制结构校验通过；`style-rules.test.ts` 13/13 通过 | `38e3f4c` |
| **Batch 4** | 7+7 导航与移动端 5 项底栏、旧书签 `loader`/锚点迁移、`/statistics` 及 `:id` 工作台、`/markets`、`/technologies`、`/products` 及 `:slug` 双型号比较、`/enterprises` 及 `:slug` 8 模块档案、5 大资料查询页、智库首页、锁版 `/reports` | 全仓 Vitest 26 套件 186/186 通过；生产构建与离线单文件 `dist-demo/mdes-demo.html`（`2.96 MB`）构建通过 | `4b443f6` |
| **Batch 5** | 新增 `08-v2-portal-acceptance.spec.ts` 端到端验收套件、扩展 `02/04/05/06/07` E2E 与 28 路由无障碍矩阵、修复窄屏工具栏弹性换行与无点号 HS8 深链匹配、回填全套工作记录收口 | Playwright E2E 与全仓单测通过 | `90ab36d` |
| **Batch 6** | **PR #5 独立审查全部 1 项 P1 + 6 项 P2 缺陷修复与跨平台硬化**：新增 `.gitattributes` 锁定全仓 LF 换行并重整索引（根治 Windows `core.autocrlf=true` 干净检出下 `tokens:check` 与 `trade-g5` 字典哈希失败并消除 CRLF diff 噪声）；`report-detail` 移除未锁版 seed 回退并区分 loading/error/版本漂移；`demo-api.ts` 合并海关快照适配统计与历史 `?v=`；`statistics.ts` 复用 `DEFAULT_DICT_VERSION`、实现贸易适配统计历史 `?v=` 锁版并在默认详情路径免除 `payload_json` 解析；`customs-suite-v4` 改用静态相对导入；扩展 `04-a11y` 至 **35 路由（140 项 WCAG 扫描）**、收紧 `06` 数值单元格断言、补齐 2–5 家企业横向对比与锁版容错 E2E、更新 `ADR-005` 为已采纳 | **`tokens:check` 通过**；**全仓单测 `27` 套件 `188/188` 全绿**；**Playwright E2E `177/177` 全绿（含 140 项 WCAG 2.1 AA 零违规）** | 本批审查修复提交 |

---

## 四、性能、包体积与五项业务验收实测指标

### 1. 构建分包与性能基线实测
- **首屏入口零导出库污染**：`dist/index.html`（`0.68 kB` gzip）与全站样式 `index.css`（`11.26 kB` gzip，较重构前 `12.17 kB` 进一步缩减）完全不含任何导出库预加载；`export-xlsx-*.js` 独立异步包仅 **`22.05 kB` gzip**，`export-pptx-*.js`（`2.28 kB` gzip）+ `pptxgen.es-*.js`（`126.77 kB` gzip）仅在点击导出 PPT 时异步拉取；全部 12 个新增路由页面均按路由拆分为 `3–10 kB` gzip 轻量异步块。
- **D1 查询复杂度恒定 `O(1)`**：`apps/api/tests/v2-statistics-catalog.test.ts` 在真实 Miniflare D1 上验证 `GET /api/statistics/:id`（含 `?v=` 历史版本）与 `GET /api/trade/overview?period=2024&releaseId=...` 均走主键/唯一索引，`meta.rows_read === 1`。
- **单测与端到端门禁全绿**：
  - `npm run tokens:check -w @mdes/web`：通过（`token 产物与 tokens.json 一致`，且由根目录 `.gitattributes` 锁定跨平台 LF 检出）
  - `npm test`：**`27` 个测试文件，`188` 项测试全部通过**（`@mdes/shared` 49 项、`@mdes/api` 74 项、`@mdes/web` 65 项）
  - `npm run build` & `npm run build:demo -w @mdes/web`：0 错误，离线演示单文件 `mdes-demo.html`（`2.97 MB`）正常产出
  - `npm run e2e`：**`8` 个 E2E 规格文件，`177` 项端到端用例全部通过**（含 **35 路由** × `1440×900` / `390×844` × 浅色 / 深色共 **`140` 项** `@axe-core/playwright` WCAG 2.1 A/AA 扫描零违规，完整覆盖 `/technologies`、`/policies`、`/sources`、锁版报告详情、历史 `?v=` 统计及多企业/双型号对比态）

### 2. 五项核心业务验收任务与旧书签抽查逐项核验结果（`08-v2-portal-acceptance.spec.ts`）
1. **按型号查采购与双型号对比**：全站检索 `uMR Jupiter` → 进入 `/products/umr-jupiter` 核对西安交大二附院 `WXZB(2024)-016`（`1 套`、`人民币 4,980 万元`、成交公告链接）与实际应用区深圳龙华区中心医院（`2024-08-10` 启用）；点击「与 uMR 880 比较」核对 `5.0 T` vs `3.0 T` 参数及出处；从 `/markets?category=mri&region=陕西&period=2024` 筛选命中同一 `WXZB(2024)-016` 项目 —— **自动化验证通过**。
2. **按证号查型号与一证多型号/包装展开**：在 `/regulation/registrations` 检索 `国械注准20223061141` 命中 1 条证书记录，独立显示受理号 `CQZ2200057`，覆盖型号列 `uMR Jupiter` 与 `uMR 880` 双向可达，型号页定位审评报告 `#page=4` 并在规格内展开 2 条 UDI-DI 包装标识；`/products?cert=国械注准20223061141` 精确计为 2 个产品型号 —— **自动化验证通过**。
3. **按专业找检测机构**：进入 `/institutions` 依次筛选「检验检测 · 湖北 · 医用超声设备」，命中武汉「湖北省医疗器械质量监督检验研究院」，显示医用超声质量监督检验职责、委托试验资质核查提示及湖北省药监局直属单位公开资料链接 —— **自动化验证通过**。
4. **从报告核对当期统计、隔离修订锁版与标准纠偏**：从 `/reports/mdes-2026q3-high-end-imaging-report` 打开锁版统计 `/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1`，2025 年值为 `18.99%`（年报正文第 87 页），图表/数据表切换与引文一致；通过接口独立发布新版本 `2026.09.1`（`19.50%`）后，最新统计页更新为 `2026.09.1`，而重开原报告及 `?v=2026.06.1` 链接仍精确锁定 `18.99%` 并展示历史归档版提示横幅；检索 `/standards?q=GB+9706.233-2020` 自动显示纠偏提示并定位至强制性行标 `YY 9706.233-2021` 官方登记 —— **自动化验证通过**。
5. **原入口贸易查询导出、跨页深链、旧书签抽查与多格式下载**：`/trade` 一级入口、图表/表格切换、SVG/CSV 导出及从 `/markets` 跳转 `/trade?q=90181310` 均正常还原；四组旧书签（`/products?channel=priority`、`/enterprises?group=ashare&province=上海`、`/reports?tab=standards`、`/search?item=rep-ann-28`）全部落到预期目标；统计工作台切换图形后复制 URL 在新窗口 100% 复现视图状态，且 `.xlsx`（4-Sheet）与 `.pptx`（原生可编辑图表）均生成非空合规 OOXML 文件 —— **自动化验证通过**。

### 3. E2E 实测捕获并根治的 3 项细节缺陷记录
1. **手机端 `390px` 视口横向撑宽修复**：`StatisticFigure` 页眉/页脚操作组原使用 `shrink-0`，在 `390×844` 窄屏下将最小内容宽度撑至 `602px`；改为 `min-w-0 max-w-full` 弹性折行并为首页网格补齐 `min-w-0`，实测 `390px` 视口 `scrollWidth === 390` 零溢出。
2. **海关 8 位无点号税号深链兼容**：跨页链接 `/trade?q=90181310` 在未导入自定义快照回落至基准表（展示格式 `9018.1310`）时补齐去点号归一化匹配，`90181310` 与 `9018.1310` 均可精确命中。
3. **11 并发 Miniflare Workerd 实例启动超时余量**：新增 `0010` 迁移后 API 单测套件增至 11 个并行文件，新增 `apps/api/vitest.config.ts`（`testTimeout: 30_000`），确保高负载并行下 Miniflare 沙箱稳定零抖动。
