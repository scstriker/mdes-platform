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

## Existing Architecture

贸易一期以 `main@7c5a265` 的 Hono Worker、D1 和共享 TypeScript 包为基础。已交付的专题页和 38 号导入向导位于 `ui/itei-refactor@49b8274`。本次文档提交以主线为父提交；后续开发从文档分支建功能分支并合入该 UI 提交。[D1 选型和测试环境](decisions/ADR-003-cloudflare-d1.md)

现有通用 CSV 入口解析指标观测值，按块写入一次 D1 事务。UI 分支的贸易专题、38 号详情和搜索索引引用静态数据，向导的写入模式尚未传到贸易后端。实施时保留通用入口及既有批次历史，38 号增加海关原件导入路径。

## 贸易一期目标架构

| 环节 | 输入、职责与输出 |
| --- | --- |
| 本机采集 | 在海关官网按单月、单流向、单分组查询一组 HS8，直接选择美元。保存原始 CSV 字节和配套查询清单。独立导出全国、伙伴、贸易方式、注册地四组。旧脚本可复用查询选项与编码识别；月份和流向来自本次查询。 |
| 管理端导入 | 38 号向导选择原件与清单，原件在本机按哈希归档。Worker 重新计算摘要，校验字典、表头、分组及金额单位；文件级错误带原因，数据行错误给出行号。通过校验的批次按块写入 D1，返回覆盖与发布状态。 |
| 汇总与发布 | 以商品全国金额计算进口、出口和差额。按伙伴计算份额和集中度，按贸易方式、注册地计算各自的结构。分组内汇总可与商品全国合计独立对账。按年和月份保留发布覆盖，历史修订触发受影响期间和同比重算。 |
| 门户读取 | Worker 获取已发布期间快照。专题、38 号详情、贸易搜索和图表导出共用该版本，后台观测值通过同版 TRD 派生行追溯。金额、图轴、期间、图注及导出数据由接口驱动，保留现有 ECharts 组件和搜索导航。 |

### 发布与运行

本期目标为本地 Wrangler/D1 联调。写入只在受控本地管理环境显式启用；生产部署和外部写入授权另行安排。首次回填从 2024 年 1 月至执行时最新公布的完整月。两种流向和四种分组覆盖当期适用税号后才切换发布版本。单码验证使用隔离库和显式单码范围。

月或季同比对比上年相同月份集合；缺比较期或基期金额为零时返回空值。伙伴集中度仅使用该流向已对账的非合计伙伴记录，先合并同一伙伴再排序。数量保留第一和第二数量及其单位。范围内尚无已发布数据时，门户显示数据状态。

门户按索引读快照，跟踪 D1 读取行数和同环境 API P95。迁移集成测试从原始库按编号执行全部 SQL，包括此次拟新增迁移。实施验收按[验收标准](ACCEPTANCE.md)执行。表和修订规则见[数据模型](DATA_MODEL.md)，传输约定见[接口文档](API.md)。
