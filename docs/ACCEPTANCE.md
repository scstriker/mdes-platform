# Acceptance Criteria — MDES Demo Phase 1

Traceability: FR → AC → verification.

自动化测试：

- API 集成测试 `apps/api/tests/api.integration.test.ts`：用 esbuild 打包真实 Worker，在 Miniflare（workerd + 本地 D1）里运行；每组测试一个全新的库，自动建表、灌指标。不需要 Docker 或外部数据库，`npm test` 直接跑。
- CSV 解析单元测试 `packages/shared/tests/csv.test.ts`。
- 前端：API 客户端与错误文案 `apps/web/tests/api-errors.test.ts`；图表切片 `apps/web/tests/slice.test.ts`；目录筛选 `apps/web/tests/catalog-filter.test.ts`。
- 端到端：`apps/web/e2e/`（`npm run e2e`），自带 API（`wrangler dev`，8788 端口）与 Web；本地 D1 数据放在 `apps/api/.wrangler/e2e`，每次运行删掉重建。

### AC-001 — 一期指标目录可见

**Covers:** FR-001  
**Verify:** 种子灌库后 `GET /api/indicators?phase=phase1` 返回 30 条；全部 99 条可按簇筛选；Web「指标目录」阶段选「一期」显示「共 30 项」。  
**Method:** automated API test（「AC-001」）+ e2e（`01-readme-acceptance`「1.」）

### AC-002 — TRD 样例可导入

**Covers:** FR-002  
**Verify:** 上传 `data/samples/trd_sample.csv` 返回 200，`status=completed`、`row_ok=10`，10 行观测值带同一个批次号写入；Web「数据导入」预校验 10 行可导入，导入后显示「导入完成，10 行全部写入」。  
**Method:** automated API test（「AC-002」）+ e2e（「2.」）

### AC-003 — 观测值可查询

**Covers:** FR-003  
**Verify:** 导入后 `GET /api/observations?indicator_id=TRD-001` 返回 3 行，`total=3`，按期间倒序；Web「观测值」选 TRD-001 查询显示「共 3 条」。  
**Method:** automated API test（「AC-003」）+ e2e（「3.」）

### AC-004 — 数据库可用、预留表可写入

**Covers:** FR-004  
**Verify:** `GET /api/health` 返回 `{ ok: true, db: "ok" }`；知识库预留表 `document` / `document_chunk` 可写入，且 `document_chunk` 不含 `embedding` 列（本轮不含向量，见 ADR-003）。数据库不可用时 `/api/health` 返回 503。  
**Method:** automated API test（「AC-004」）

### AC-005 — Cloudflare 部署路径文档完整

**Covers:** FR-005  
**Verify:** README 含 D1 建库（`wrangler d1 create`）、迁移（`wrangler d1 migrations apply --remote`）、灌种子数据、Pages/Worker 部署步骤；`wrangler` 配置文件含 D1 绑定 `DB`，且 `npx wrangler deploy --dry-run` 可打包（含 `packages/shared`）。  
**Method:** manual review

### AC-006 — 指标列表带数据状态

**Covers:** FR-001  
**Verify:** `GET /api/indicators` 每项含 `obs_count`、`latest_period`、`automation`；导入样例后 TRD-001 为 `obs_count=3`、`latest_period=2024-03`，没有数据的指标为 `0` / `null`；列表不含 `spec_json`，详情接口才有。  
**Method:** automated API test（「GET /api/indicators」）

### AC-007 — 概览统计

**Covers:** FR-001、FR-003  
**Verify:** `GET /api/stats` 返回指标总数 99、一期 30、一期已入库数，观测值总数与数据截止期间，7 个簇各自的一期数 / 一期已入库数 / 后期数 / 观测值数，以及最近一次导入批次；空库时观测值为 0、截止期间与最近批次为 `null`。  
**Method:** automated API test（「GET /api/stats」）

### AC-008 — 错误码与中文文案

**Covers:** FR-002、FR-003  
**Verify:**

- 接口错误统一返回 `{ error: { code, message, params } }`：未知指标 404 `NOT_FOUND`，未知路由 404 `NOT_FOUND`，意外异常 500 `INTERNAL_ERROR`（不暴露内部细节）。
- 文件级导入错误返回 400：`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`（`params.header`）、`ROW_LIMIT_EXCEEDED`（`params.max` / `actual`），不建批次。
- CSV 行错误为 `{ line, code, params }`，行号是表格行号；前端按 code 显示中文，例如「第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试」。

**Method:** automated API test（「统一错误体」「文件级错误」「部分行失败」）+ web unit test

### AC-009 — 观测值筛选与分页

**Covers:** FR-003  
**Verify:** `GET /api/observations` 支持 `geo`、`batch_id`、`period_from`、`period_to`、`limit`、`offset`，返回 `total`（不受分页影响）；`period_to=2024` 含 2024 年各月；按 `batch_id` 可查出单个批次的全部数据；非法 `limit` 回落到 100、超过 500 截到 500，格式不对的 `batch_id` 查不到数据而不报错。  
**Method:** automated API test（「GET /api/observations」）

### AC-010 — 导入单事务（D1 batch）、分块批量写入

**Covers:** FR-002、NFR-001  
**Verify:**

- 批次与观测值放进同一次 `db.batch()`（D1 把它当作一个事务）写入，每 500 行一条批量插入语句（整块作为一个 JSON 参数，避开每条语句 100 个参数的限制）；中途失败整体回滚，库里既没有半批观测值，也没有批次记录。
- 部分行失败时 `status=completed_with_errors`，只写入有效行；全部行失败时仍记录 `failed` 批次并返回 200，不写观测值。
- 5000 行文件一次导入成功（本地约 0.3 秒）。

**Method:** automated API test（「POST /api/import/csv」）

### AC-011 — 界面：外框、出错与竞态

**Covers:** FR-001、FR-003、ADR-002  
**Verify:**

- 窄屏有底部 TabBar 可切换页面，内容不被挡住；桌面页脚文字不被斜切装饰遮住；宽屏由文档滚动、页眉吸顶；深色主题页眉用文字「ITEI」代替彩色标志。
- 接口 500 或网络断开时显示原因与「重试」，不显示为空数据；先点的指标响应更慢也不会覆盖后打开的指标。
- 指标档案图表先选切片：样例 TRD-005 三个贸易伙伴不被加总。

**Method:** e2e（`02-shell`、`03-resilience`、`01-readme-acceptance`）

### AC-012 — 无障碍

**Covers:** NFR（可访问性，ADR-002 R4）  
**Verify:** axe（WCAG 2.1 A / AA）检查概览、指标目录（表格 / 矩阵）、指标档案（数据 / 对比 / 规格 / 关联）、观测值、数据导入、`/__design`，桌面与手机、浅色与深色各一遍，无违规。  
**Method:** e2e（`04-a11y`）

## 中国海关医疗器械进出口一期

AC-013 至 AC-017 均为**待开发验收**。金额对账使用中国海关原生美元，页面显示的亿美元按显示精度核对。以下样表坐标均指《我国海关平台-2024年度仪器仪表海关进出口年度数据统计.xlsx》的 `Sheet1`。样表用于独立核对，原始输入取自海关月度导出。

### AC-013 — 一个真实税号从月度文件到年度结果

**关联需求** FR-006、FR-007、FR-009。

采集心电图记录仪 `90181100` 在 2024 年各月的进、出口美元文件。记录查询条件、期间、原文件和摘要，以字典 `202601` 导入后查询年度结果。样表第 105 行的进口额（H105）为 20,375,226 美元，出口额（N105）为 89,723,246 美元，顺差应为 69,348,020 美元。核对双数量及各自单位与导出文件一致，并从发布结果追溯至月份、流向和原文件。

**验证方式** 在隔离的单税号验收库用真实导出做端到端核对，再将同一批输入作为本地 D1 集成测试的固定样例，保留实际值、期望值和差额。验收库将统计范围显式标为该单码；正式门户按 AC-017 的覆盖规则发布。

### AC-014 — 重放、修订和中断

**关联需求** FR-007。

在隔离库准备已完整发布的月份；重放其中一个流向、一个分组的原件，核对有效记录数和发布金额。两次结果应相同。制作同一范围的修订样例，更正一行金额并移除原有一行。发布中途注入失败，查询应继续返回旧版完整结果；重试成功后，返回修订金额，移除的行消失。核对其余月份及另一流向的金额。

**验证方式** 在本地 D1 的导入与查询接口上运行集成测试，检查两次发布、一次失败和重试后的可见结果。

### AC-015 — 伙伴排名、集中度和跨期统计

**关联需求** FR-008。

在同一税号、同一流向下建立 6 个伙伴。第一个月金额依次为 40、25、15、10、6、4 美元，合计 100 美元。预期 CR1 为 40%，CR3 为 80%，CR5 为 96%，HHI 为 2602。第二个月前两个伙伴金额互换，其余相同。合并两个月后，前两名各占 32.5%，CR1 为 32.5%，CR3 为 80%，CR5 为 96%，HHI 为 2489.5。按进口、出口分别运行这一组验证。用有上年基期的数据核对同比，并检查缺基期时返回空值。

**验证方式** 用这组独立算例做金额和派生指标的自动化测试，核对月度及跨月接口返回值。

### AC-016 — 三个页面的数据一致性和读取成本

**关联需求** FR-008、FR-009、NFR-003。

在同一批已发布数据上打开贸易专题、38 号指标详情、后台观测值，选相同年度、流向和统计范围。核对三个页面的共同指标、单位换算和期间，再用税号搜索并导出图表数据。各入口显示相同发布版本和数值；缺期时，页面标明可用期间。

**验证方式** 用 Playwright 走通三个页面并保存断言结果。对其主要数据查询记录 `EXPLAIN QUERY PLAN` 与 D1 读取行数，确认按期间和流向查到汇总或对应索引、没有全表扫描贸易明细。固定同一环境、已发布数据和查询参数，先预热，再记录重复请求的次数及 API 响应时间 P95。

### AC-017 — 164 码覆盖与年度对账

**关联需求** FR-006、FR-007、FR-009。

校验字典 `202601` 含 164 个唯一八位码、117 个唯一六位码、11 个一级类别。按 2024 年的 12 个月、两个流向核查 164 个税号的采集覆盖。逐项区分有记录、来源已确认无记录、缺采及当年不适用，记录依据。完整年度汇总仅使用已核实的期间。来源缺失的金额保留空值。

对账只取样表八位商品代码与字典的交集。共有 37 个税号，按 H 列逐项核对 2024 年进口，合计应为 17,410,795,225 美元。按 N 列核对 36 个有出口额的税号，合计应为 13,792,423,197 美元。`90222190` 的 N126 为空，标为样表无出口对账值。全国行、类别小计行及“汇总表”的万美元列均在此次比较范围之外。

**验证方式** 为 164 码出具按月、流向、四种分组分别记录的覆盖清单，列出各税号的样表值、采集值和差额。对已有对照值要求逐项一致；遇官方修订，保存两个来源版本及差异依据，再标记对账结论。默认回填至最新公布的完整月份，每月都须有覆盖记录，年份内标为不适用的税号随清单附当年目录依据。
