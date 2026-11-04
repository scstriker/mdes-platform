# ADR-001 — Cloudflare Pages/Workers + Neon Postgres/pgvector

## Status

Accepted

## Context

Demo 需优先部署 Cloudflare；同时硬性要求 PostgreSQL + pgvector。Workers 不能运行 FastAPI；D1/Vectorize 不能替代 pgvector 约束。

## Decision

- Web → Cloudflare Pages（Vite SPA）
- API → Hono on Cloudflare Workers（本地可用同一套 Hono + Node 适配）
- DB → Neon Postgres 启用 pgvector；Workers 经 Hyperdrive 连接
- 本地可用 Docker `pgvector/pgvector:pg16` 同构开发
- 不用 D1/Vectorize 作为主存储

## Consequences

- API 必须用 TypeScript，利于后续 Pi Agent 同语言演进
- 依赖外部 Neon（或兼容托管库）；无账号时仅能本地 Docker 验收
- 大文件 xlsx 解析放在本地 seed 脚本，Worker 只接收 CSV 文本
