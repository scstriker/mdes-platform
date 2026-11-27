# MDES V2 统计成果产品化与全站页面重构工作记录

- **建立日期**：`2026-11-27`
- **基线分支与起点提交**：`origin/main` @ `057d2d2613715a322144034910ed6ede4f7b0294`（Tree `d08537dc82db50d5baec91c3bd089f9eb46b84cf`）
- **实施分支**：`feat/v2-statistics-portal`
- **关联架构决策**：[ADR-005 列式不可变统计快照、一等公民拆页与零首屏出版导出栈](decisions/ADR-005-v2-statistics-and-entity-portal.md)

---

## 一、第一性原理审视与总体定案

针对前期《PRD_V2_STATISTICS.md》《MDES全站页面改造设计记录.md》及 2022–2026 海关五年实采底座（`main@057d2d2`）之间的冲突与次优设计，确立四项核心重构定论：

1. **废除“混杂栏目 + `/topics/*` 外挂”，直接按领域实体拆页**
   - 将原四栏混杂结构重整为 **7 项研究主导航**（`产业总览 /`、`市场 /markets`、`技术 /technologies`、`产品 /products`、`企业 /enterprises`、`进出口贸易 /trade`、`研究报告 /reports`）+ **页眉「资料查询」7 项入口**（`统计成果库 /statistics`、`注册与准入 /regulation/registrations`、`机构名录 /institutions`、`产业政策 /policies`、`技术标准 /standards`、`官方来源 /sources`、`指标与口径 /system`）；手机底栏定为 **`总览 / 市场 / 产品 / 贸易 / 全部`**，补齐此前缺失的移动端贸易直达入口。
   - 产品型号（`/products/:slug`）、企业档案（`/enterprises/:slug`）、研究报告（`/reports/:slug`）与单项统计（`/statistics/:id`）直接拥有稳定一等公民路由；旧书签及 `/topics/products/:slug`、`/topics/enterprises/:slug` 通过路由 `loader` 同步无闪烁重定向。
   - 首页撤除自动轮播，升级为「左本期核心判断与依据 + 右支撑统计图 + 四组研究问题入口 + 最新发布统计 + 省域注册与密度比较」。

2. **采用“列式不可变快照 + 双平面索引 + Worker 零解析直通”守住毫秒级性能**
   - 远端 `main` 已占用 `0001..0009` 迁移，本轮新增 **`0010_v2_statistics_entities.sql`**：
     - **平面一（实体与检索索引层）**：`statistic_def`（含 `< 1 KB` `summary_kpi_json`）、`catalog_record`、`entity_relation` 与 SQLite `FTS5` 虚拟表 `search_fts`，消除跨库检索的全表扫描。
     - **平面二（不可变快照层）**：`statistic_version(statistic_id, version)` 存储列式数值数组与 SDMX 状态码（`A` 实际 / `E` 估算 / `F` 预测 + `forecast_as_of` / `P` 非完整期），单次读取恒定 `rows_read = 1`，Hono Worker 直接 `new Response(row.payload_json)` 原样流式返回并输出 `ETag`；同时为 `GET /api/trade/overview` 补齐 `?releaseId=` 读取 `trade_period_snapshot`，实现研究报告对贸易与常规统计的统一版本锁定。

3. **重构 ECharts 6.1 生命周期，用轻量按需分包替代重型导出库**
   - 修复 `chart.tsx` 每次 `option` 变化即 `dispose() + init()` 的缺陷，改为挂载单次初始化 + `setOption(opt, { replaceMerge: ['series', 'xAxis', 'yAxis'], lazyUpdate: true })` + `UniversalTransition` 平滑过渡。
   - 出版图卡导出采用浏览器内存态离屏 ECharts SVG 实例 + `tokens.flat.json` 浅色出版 Token（免疫深色模式与表格态卸载，耗时 `< 10 ms`）。
   - 淘汰 280 KB 的 `ExcelJS`，改用 **`write-excel-file@^4.1.1`**（MIT，仅 **36.6 KB** gzip）生成 `Data / Metadata / Sources / Methodology` 4-Sheet 标准工作簿；搭配 **`pptxgenjs@^4.0.1`**（MIT，约 **70 KB** gzip）生成带内嵌数据表的原生可编辑 PowerPoint 图表；全部导出器按需动态 `import()`，**首屏入口包体对导出库保持 0 KB 增量**。
   - 交付零运行时负担的 `Copy for AI` 结构化 Markdown 与 `GB/T 7714-2015` / `APA 7` 引文复制；裁剪无向量底座支撑的聊天抽屉、赛马图与外部 `<iframe>`。

4. **清零现网静态样本中的 4 处事实偏差并贯通真实证据链**
   - `uMR Jupiter` 5T 注册证纠正为 `国械注准20223061141`（器审受理号 `CQZ2200057` 报告第 4 页），补齐与 `uMR 880`（3T）同品类并排比较、西安交大二附院 `WXZB(2024)-016`（1 套，`4,980 万元`）成交公告及深圳龙华区中心医院开机启用记录；
   - 联影医疗 2025 年研发投入占营业收入比例纠正为 `18.99%`（2024 年 `21.95%`，2025 年报正文第 87 页）；
   - 磁共振安全专用标准纠正为 `YY 9706.233-2021`（强制性行业标准，替代 `YY 0319-2008`），并为旧词 `GB 9706.233-2020` 提供检索纠偏提示；
   - 补齐湖北省医疗器械质量监督检验研究院（武汉·医用超声设备检验职责），修正 `trade/data.ts` 中 `90189020` / `90189030` 税号示例映射，打通 `90181310`（MRI 整机）与 `90181390`（MRI 零件）贸易快照引用。

---

## 二、GitHub 同类开源方案调研与选型对比矩阵

| 架构领域 | 对标 / 候选仓库 | Star / 许可 | 核心机制与实测特征 | 本项目决策 |
| :--- | :--- | :--- | :--- | :--- |
| **列式统计数据契约** | `owid/owid-grapher` (https://github.com/owid/owid-grapher) | 1,575 ★ · Open | `.data.json` + `.metadata.json` 列式数组与统一内存表投影，体积较行对象缩减 60%–75% | **采纳**：用于 `Statistic.dataset` 列式结构与图表/表格/导出统一派生层 |
| **官方统计状态与断点** | `sdmx-twg/sdmx-json` & OECD `.Stat Suite` (https://github.com/sdmx-twg/sdmx-json) | 56 ★ · MIT | SDMX 2.0 观测状态码（`A`/`E`/`F`/`P`）与结构化方法论断点标注 | **采纳**：驱动实绩/预测虚线分层、历史预测冻结与 `methodology_breaks` 竖线 |
| **政府出版物锁版与底稿** | `ONSdigital/gptables` (https://github.com/ONSdigital/gptables) | 46 ★ · MIT | `/versions/{v}` 永久快照锁 + 无空行冻结表头政府标准多 Sheet 工作簿 | **采纳**：`?v=:version` 历史锁版与 4-Sheet `.xlsx` 版式规范 |
| **ECharts 出版排版** | `evidence-dev/evidence` (https://github.com/evidence-dev/evidence) | 7,151 ★ · MIT | 纯 ECharts 封装高信噪比研报图卡，零第二图表库依赖 | **采纳**：沉淀 6 类核心统计语法模板与对标矩阵 |
| **预计算边缘快照** | `observablehq/framework` (https://github.com/observablehq/framework) | 3,691 ★ · ISC | 内容哈希不可变快照（`content_hash` + 强缓存校验） | **采纳**：`statistic_version.content_hash` + Worker `ETag` 零解析直通 |
| **离屏矢量/高清图导出** | `apache/echarts` v6.1 `renderToSVGString` (https://github.com/apache/echarts) | 67.8k ★ · Apache-2.0 | 浏览器离屏 SVG 渲染兼具 `< 6 ms` 速度与真实 Canvas 2D 中文字宽测量（优于无字宽测量的 Worker SSR 与易受深色污染的挂载 DOM） | **采纳**：浏览器内存态浅色出版 SVG + Canvas `2x` PNG 光栅化 |
| **多 Sheet Excel 导出** | `catamphetamine/write-excel-file` v4.1 (https://github.com/catamphetamine/write-excel-file) | 36 ★ · MIT | 仅依赖 `fflate`，懒加载包 **36.6 KB** gzip，支持多 Sheet/列宽/冻结/样式/公式，仅为 `exceljs`（~280 KB）的 **1/7** | **采纳（淘汰 `ExcelJS` 与 `SheetJS CE`）** |
| **原生可编辑 PPTX** | `gitbrent/PptxGenJS` v4.0.1 (https://github.com/gitbrent/PptxGenJS) | 6,418 ★ · MIT | 懒加载包约 **70 KB** gzip，v4.0.1 修复 Vite `node:fs` 兼容，`addChart` 生成真 OOXML 图表与内嵌工作表 | **采纳**：动态 `import()` 按需加载 |
| **URL 视图状态管理** | `47ng/nuqs` v2.10 (https://github.com/47ng/nuqs) | 10,918 ★ · MIT | React Router v7 适配器仅 **6.1 KB** gzip，键级重渲染隔离与 `replaceState` 节流保护 | **采纳**：驱动统计工作台与目录分面 URL 状态分享 |

---

## 三、分批实施与验证台账

| 批次 | 范围与核心交付物 | 验证命令与关键指标 | 状态 | Commit SHA |
| :--- | :--- | :--- | :--- | :--- |
| **Batch 1** | 同步 `origin/main (057d2d2)`，建立 `ADR-005` 与本工作记录主文档 | `git rev-parse HEAD`、基线构建校验 | 进行中 | 待回填 |
| **Batch 2** | `@mdes/shared` 列式 `Statistic` 与实体契约、核验样板种子、D1 `0010` 迁移（双平面 + FTS5）、`/api/statistics` 零解析直通、`/api/catalog`、`/api/trade/overview?releaseId=`、`demo-api.ts` 同构 | `npm test -w @mdes/shared`、`npm test -w @mdes/api`（断言 `rows_read = 1` 与锁版一致性） | 待执行 | 待回填 |
| **Batch 3** | `chart.tsx` 实例复用重构、6 类统计模板、离屏白底 SVG/2xPNG、动态分包 `write-excel-file` 4-Sheet XLSX & `pptxgenjs` 原生 PPTX、`StatisticFigure 2.0`、`/__design` 验收 | `npm test -w @mdes/web`、`npm run build`（核验入口包零导出库混入） | 待执行 | 待回填 |
| **Batch 4** | 7+7 全站导航与手机底栏重构、旧书签 `loader` 迁移、`/statistics` 及 `:id` 工作台、`/markets`、`/technologies`、`/products` 及 `:slug` 对比、`/enterprises` 及 `:slug` 档案、6 大资料查询页、智库首页与锁版 `/reports` | `npm test`、`npm run build`、`npm run build:demo -w @mdes/web` | 待执行 | 待回填 |
| **Batch 5** | 5 项端到端业务验收用例 + 旧书签抽查 + URL 复现 + 桌面/手机浅深主题 WCAG 2.1 AA 无障碍 E2E、全量指标与提交号回填 | `npm run tokens:check`、`npm test`、`npm run build`、`npm run e2e` | 待执行 | 待回填 |
