# Acceptance Criteria — MDES Demo Phase 1

Traceability: FR → AC → verification.

自动化测试：

- API 集成测试 `apps/api/tests/api.integration.test.ts`：连本地 pgvector 的独立库 `mdes_test`（`TEST_DATABASE_URL` 可改），自动建库、建表、灌指标；连不上时整组跳过并提示。先 `npm run dev:db` 再 `npm test`。
- CSV 解析单元测试 `packages/shared/tests/csv.test.ts`。
- 前端：API 客户端与错误文案 `apps/web/tests/api-errors.test.ts`。

### AC-001 — 一期指标目录可见

**Covers:** FR-001  
**Verify:** 种子灌库后 `GET /api/indicators?phase=phase1` 返回 30 条；全部 99 条可按簇筛选；Web 目录页可见。  
**Method:** automated API test（「AC-001」）+ manual UI

### AC-002 — TRD 样例可导入

**Covers:** FR-002  
**Verify:** 上传 `data/samples/trd_sample.csv` 返回 200，`status=completed`、`row_ok=10`，10 行观测值带同一个批次号写入。  
**Method:** automated API test（「AC-002」）+ manual UI

### AC-003 — 观测值可查询

**Covers:** FR-003  
**Verify:** 导入后 `GET /api/observations?indicator_id=TRD-001` 返回 3 行，`total=3`，按期间倒序。  
**Method:** automated API test（「AC-003」）

### AC-004 — pgvector 就绪

**Covers:** FR-004  
**Verify:** `GET /api/health` 含 `db: ok` 与 `vector: true`；可向 `document_chunk` 写入一条 1536 维向量。数据库不可用时 `/api/health` 返回 503。  
**Method:** automated API test（「AC-004」）

### AC-005 — Cloudflare 部署路径文档完整

**Covers:** FR-005  
**Verify:** README 含 Neon 创建、`CREATE EXTENSION vector`、Hyperdrive、Pages/Worker 部署步骤；`wrangler` 配置文件存在且 `npx wrangler deploy --dry-run` 可打包（含 `packages/shared`）。  
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

### AC-010 — 导入单事务、分块批量写入

**Covers:** FR-002、NFR-001  
**Verify:**

- 批次与观测值在同一事务中写入，每 500 行一次批量插入；中途失败整体回滚，库里既没有半批观测值，也没有批次记录。
- 部分行失败时 `status=completed_with_errors`，只写入有效行；全部行失败时仍记录 `failed` 批次并返回 200，不写观测值。
- 5000 行文件一次导入成功（本地约 0.3 秒）。

**Method:** automated API test（「POST /api/import/csv」）
