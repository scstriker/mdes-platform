# Technical Specification — MDES Demo Phase 1

## 1. Summary

Cloudflare 优先的 demo：`apps/web`（React/Vite → Pages）+ `apps/api`（Hono Worker）+ Cloudflare D1（SQLite，本地用 wrangler 的本地 D1）。种子数据来自 V12 JSON（由 xlsx 导出）。数据库选型见 `docs/decisions/ADR-003-cloudflare-d1.md`。

## 2. Current vs Target

| 区域 | 当前 | 目标（一期） |
|---|---|---|
| 前端 | 无（新仓） | 三页：目录 / 导入 / 观测 |
| API | 无 | Hono：health / indicators / import / observations |
| DB | 无 | Cloudflare D1；含预留表（本轮不存向量） |

参考仓 `medical-device-import-demo` **不纳入运行时依赖**。

## 3. Architecture

```text
Browser → Cloudflare Pages (web)
       → /api/* → Workers (Hono) → D1 (binding DB)
Local: Vite proxy → wrangler dev (8787) → 本地 D1（apps/api/.wrangler/state）
```

## 4. Stack

- Web: React 19, TypeScript, Vite, Tailwind CSS 4 + shadcn/ui（换皮）+ ITEI 组件层，React Router 7、TanStack Query / Table、ECharts 6（按需懒加载）；token 由 Style Dictionary 从 ITEI tokens.json 生成。见 `docs/decisions/ADR-002-ui-stack.md`
- API: Hono on Cloudflare Workers；本地用 `wrangler dev`
- DB: Cloudflare D1（SQLite）；迁移在 `apps/api/migrations/`，`wrangler d1 migrations apply` 执行
- Deploy: Wrangler（Pages + Worker + D1）
- Test: Vitest（CSV 解析、API 集成〔Miniflare：workerd + 本地 D1〕、客户端与错误文案、切片规则、token 同步、样式硬规则）；Playwright 端到端（README 验收、外框、出错与竞态回归、axe 无障碍检查）

## 5. Modules

- `apps/api/migrations/` — D1 表结构；`apps/api/src/db.ts` — 健康检查与 JSON 列解析
- `apps/api/src/routes` — REST（meta / indicators / observations / import / stats）
- `apps/api/src/import.ts` — CSV 导入：共享解析器校验 + 一次 `db.batch()`（单事务）分块写入
- `apps/api/src/errors.ts` — 统一错误体 `{ error: { code, message, params } }`
- `packages/shared` — 前后端共用的类型、错误码与 CSV 解析器
- `apps/web/src/app` — 路由（React Router 7）、页面外框、TanStack Query
- `apps/web/src/pages` — 概览 / 指标目录 / 指标档案 / 观测值 / 数据导入，`/__design` 组件验收页
- `apps/web/src/components/itei` — ITEI 组件层；`components/ui` — 换皮后的 shadcn/ui
- `apps/web/src/lib/api` — API 客户端、ApiError 与错误码中文文案
- `apps/web/scripts/tokens` — Style Dictionary token 流水线
- `apps/api/src/seed.ts` — 把 `data/indicators_seed.json` 转成 SQL 交给 `wrangler d1 execute`（`npm run seed`，`-- --remote` 写线上）
- `data/samples/trd_sample.csv` — 演示数据

## 6. Extension Seams（二期）

- `document` / `document_chunk` — 知识库（本轮不存向量，二期另行选型，见 ADR-003）
- `agent_run` — Pi Agent 运行记录
- `entity_*` — 所级底座对象
- `subsystem_id` — 仪器仪表等其它子系统

Agent 默认按 TechStack：TypeScript + Pi Agent，经 HTTP/MCP 调本 API；**一期不实现**。

## 7. Configuration

| Name | Purpose |
|---|---|
| `DB` | Worker 的 D1 绑定（`apps/api/wrangler.toml`） |
| `IMPORT_MAX_ROWS` | 默认 5000 |
| `ENABLE_TRADE_WRITE` | 默认关闭（`wrangler.toml` 不启用），仅受控本地管理环境通过 `--var ENABLE_TRADE_WRITE:1` 显式开启；公开部署未开启时写路由一律返回 `403 TRADE_WRITE_DISABLED` |
| `TRADE_WRITE_TOKEN` | 可选远端管理写令牌（Secret）；配置后所有贸易写路由均须携带匹配的 `X-Admin-Token` 或 `Authorization: Bearer` 请求头 |

## Existing Architecture

贸易一期以 `main@7c5a265` 的 Hono Worker、D1 和共享 TypeScript 包为基础。已交付的专题页和 38 号导入向导位于 `ui/itei-refactor@49b8274`。本次文档提交以主线为父提交；后续开发从文档分支建功能分支并合入该 UI 提交。[D1 选型和测试环境](decisions/ADR-003-cloudflare-d1.md)

现有通用 CSV 入口解析指标观测值，按块写入一次 D1 事务。UI 分支的贸易专题、38 号详情和搜索索引引用静态数据，向导的写入模式尚未传到贸易后端。实施时保留通用入口及既有批次历史，38 号增加海关原件导入路径。

## 贸易一期目标架构

实施时按[后端功能设计](贸易后端功能设计.md)确定导入、修订、统计和门户各自的行为。数据员按[海关原件采集规程](海关原件采集规程.md)交付可重放的输入。业务人员按[业务验收用例](贸易业务验收用例.md)完成对账并留证。

| 环节 | 输入、职责与输出 |
| --- | --- |
| 本机采集 | 在海关官网通过 `china_customs_suite.user.js` v4.0 与 `scripts/harness/collect_customs_5y.py`（基于 `browser-harness` 单持久 CDP 连接）低频单飞串行查询（`MAX_INFLIGHT = 1`，`3.5s–6.5s` 抖动 + 分组/跨年冷却），锁定 USD 与 `202601` 164 码字典，支持 `monthFlag="1"` 年度分月原字节经本地 IPC 零弹窗落盘及超 9,000 行自动二分时间窗。 |
| 管理端导入 | 支持 38 号单批向导（`POST /api/trade/import`）与历史回填批量拆解入口（`POST /api/trade/import-bulk`，默认 `deferPublish=true`）及 CLI 工具 `scripts/import-customs-archive.mjs`。Worker 核验字典、历年适用性（`0007` 迁移）、表头与美元精度，按块写入候选表。 |
| 汇总与发布 | 支持单月自动发布或 `POST /api/trade/publish` 单次向量化全周期发布。一次性计算进出口总额、跨年序列 `annualTrend`、同单位第一数量同比与确定性研判摘要 `narrativeSummary`，以 `trade_release` 乐观锁切换多期快照。 |
| 门户读取 | Worker 主键单行读取 `trade_current_snapshot`（`rows_read = 1`）。`/trade` 渲染 5 栏核心 KPI、研判摘要卡片、2×2 四维 ECharts 6 SVG 图表矩阵（跨年/月度走势、11 类构成环形图、伙伴/国内省市/贸易方式 Top 10、一级类别 CR3 警戒图），并由 `@mdes/shared/src/trade-report.ts` 生成 A4 打印报告与双表汇总 CSV。 |

### 发布与运行

本期目标为本地 Wrangler/D1 联调。写入只在受控本地管理环境显式启用；生产部署和外部写入授权另行安排。首次回填从 2024 年 1 月至执行时最新公布的完整月。两种流向和四种分组覆盖当期适用税号后才切换发布版本。单码验证使用隔离库和显式单码范围。

月或季同比对比上年相同月份集合；缺比较期或基期金额为零时返回空值。伙伴集中度仅使用该流向已对账的非合计伙伴记录，先合并同一伙伴再排序。数量保留第一和第二数量及其单位。范围内尚无已发布数据时，门户显示数据状态。

门户按索引读快照，跟踪 D1 读取行数和同环境 API P95。迁移集成测试从原始库按编号执行全部 SQL，包括此次拟新增迁移。实施验收按[验收标准](ACCEPTANCE.md)执行。表和修订规则见[数据模型](DATA_MODEL.md)，传输约定见[接口文档](API.md)。
