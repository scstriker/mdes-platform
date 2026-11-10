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
