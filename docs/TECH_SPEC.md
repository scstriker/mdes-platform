# Technical Specification — MDES Demo Phase 1

## 1. Summary

Cloudflare 优先的 demo：`apps/web`（React/Vite → Pages）+ `apps/api`（Hono Worker）+ Neon PostgreSQL/pgvector（本地可用 Docker 同构）。种子数据来自 V12 JSON（由 xlsx 导出）。

## 2. Current vs Target

| 区域 | 当前 | 目标（一期） |
|---|---|---|
| 前端 | 无（新仓） | 三页：目录 / 导入 / 观测 |
| API | 无 | Hono：health / indicators / import / observations |
| DB | 无 | Neon 或本地 pgvector；含预留表 |

参考仓 `medical-device-import-demo` **不纳入运行时依赖**。

## 3. Architecture

```text
Browser → Cloudflare Pages (web)
       → /api/* → Workers (Hono) → Hyperdrive → Neon (Postgres+pgvector)
Local: Vite proxy → Node/Wrangler dev → DATABASE_URL → Docker pgvector
```

## 4. Stack

- Web: React 19, TypeScript, Vite, Tailwind CSS 4, ITEI tokens（demo 用轻量组件；shadcn 可按需后补）
- API: Hono + postgres.js（可部署 Workers；本地 Node adapter）
- DB: PostgreSQL 16 + pgvector（本地 Docker / 云上 Neon + Hyperdrive）
- Deploy: Wrangler（Pages + Worker + Hyperdrive）
- Test: Vitest（CSV 解析等）

## 5. Modules

- `apps/api/src/db` — schema、client
- `apps/api/src/routes` — REST
- `apps/api/src/import` — CSV 校验
- `apps/web/src/pages` — Catalog / Import / Observations
- `scripts/seed.mjs` — 灌入 `data/indicators_seed.json`
- `data/samples/trd_sample.csv` — 演示数据

## 6. Extension Seams（二期）

- `document` / `document_chunk.embedding` — 知识库
- `agent_run` — Pi Agent 运行记录
- `entity_*` — 所级底座对象
- `subsystem_id` — 仪器仪表等其它子系统

Agent 默认按 TechStack：TypeScript + Pi Agent，经 HTTP/MCP 调本 API；**一期不实现**。

## 7. Configuration

| Name | Purpose |
|---|---|
| `DATABASE_URL` | 本地/脚本直连 |
| `HYPERDRIVE` | Worker 绑定 |
| `EMBEDDING_DIMS` | 向量维度配置（默认 1536） |
| `IMPORT_MAX_ROWS` | 默认 5000 |
