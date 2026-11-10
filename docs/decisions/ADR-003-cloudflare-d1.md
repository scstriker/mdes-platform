# ADR-003 — 数据库改用 Cloudflare D1，本轮不含向量

## Status

Accepted（2026-11-10，仓库所有者决定）。取代 ADR-001 中「DB → Neon Postgres + pgvector，经 Hyperdrive 连接；不用 D1 作主存储」的决定；ADR-001 其余部分（Pages + Workers、Hono、TypeScript）不变。

- **已决定**
  - 先不用 Neon，数据库改回 Cloudflare D1。
  - 数据库选型不用 PGlite，也不用 pgvector。
  - 向量本轮移除：保留知识库与 Agent 的预留表，去掉 `document_chunk.embedding` 列；健康检查只报告数据库状态。二期做知识库时另行选型（例如 Cloudflare Vectorize），届时另写 ADR。
  - 本地开发与测试用 wrangler / Miniflare 跑真正的 D1（本地 SQLite），不再需要 Docker。

## Context

- ADR-001 因「硬性要求 PostgreSQL + pgvector」选了 Neon，并排除了 D1。仓库所有者已撤销这条要求：一期只需要指标目录、观测值导入与查询，向量能力在二期之前用不上。
- D1 与 Workers 同在 Cloudflare：不需要 Hyperdrive 和外部数据库账号；本地 wrangler 自带 D1 模拟，开发与测试不依赖 Docker。
- D1 是 SQLite，有自己的限制（截至 2026-11 的官方限制，引用时以 Cloudflare 文档为准）：
  - 每条语句最多 100 个绑定参数；
  - 没有交互式事务，`db.batch()` 内的语句作为一个事务执行；
  - 每次 Worker 调用的查询数有上限（免费计划 50，付费计划 1000）；
  - 单库容量有上限（付费计划 10 GB）。

## Decision

| 项 | 做法 |
|---|---|
| 存储 | Cloudflare D1，Worker 绑定名 `DB`（`apps/api/wrangler.toml`），库名 `mdes` |
| 表结构 | `apps/api/migrations/0001_init.sql`，用 `wrangler d1 migrations apply` 执行 |
| 类型映射 | jsonb → `TEXT` + `json_valid` 约束，用 `json_extract` / `json_each` 读写；uuid → `TEXT`（Worker 里 `crypto.randomUUID()`）；timestamptz → ISO 8601 `TEXT`；bigserial → `INTEGER PRIMARY KEY AUTOINCREMENT`，API 仍按字符串返回；double precision → `REAL` |
| API 契约 | 不变（接口、字段、错误体、行错误都与 ADR-002 阶段 2 一致）。唯一变化：`/api/health` 不再返回 `vector`、`embedding_dims` |
| CSV 导入 | 批次与全部观测值放进一次 `db.batch()`，D1 把它当作一个事务：中途任何一条失败都整体回滚。观测值每 500 行一块，一块是一条 `insert … select … from json_each(?)`，整块作为一个 JSON 参数绑定，避开「每条语句 100 个参数」的限制；5000 行只需 1 + 10 条语句，在免费计划的查询数上限之内 |
| 种子数据 | `apps/api/src/seed.ts` 把 `data/indicators_seed.json` 转成幂等的 SQL，交给 `wrangler d1 execute`（默认本地，`--remote` 写线上） |
| 本地开发 | `npm run db:migrate` → `npm run seed` → `npm run dev:api`（`wrangler dev`，数据在 `apps/api/.wrangler/state`） |
| API 集成测试 | 用 esbuild 把真实 Worker 打包，放进 Miniflare（workerd + 本地 D1）运行，经 `dispatchFetch` 发请求；测试专用入口只用于建表、灌数据和查库，不进生产包 |
| 端到端测试 | `wrangler dev` 起 API（8788 端口），数据目录 `apps/api/.wrangler/e2e` 每次删掉重建 |
| 向量 | 本轮不存向量；`document` / `document_chunk` / `agent_run` / `tool_call_log` / `entity_*` 作为预留表保留 |

## 实施补记

- Miniflare 用 4.x 稳定版作测试依赖（`apps/api` 的 devDependencies）。wrangler 4.15x 自带的是 Miniflare 5.x beta，配置格式不同，不作为测试依赖。
- 测试不用 Miniflare 的 `getD1Database()`：它在 Node 侧通过代理访问 D1，在本项目的云端开发环境里会挂起。改为把 SQL 送进 workerd 里执行（`tests/helpers/harness-worker.ts`）。
- workerd 不允许模块路径用 `..` 跳出启动目录，测试打包产物放在 `apps/api/.wrangler/test/`。

## Consequences

**正面**

- 不再依赖 Neon 账号与 Hyperdrive；部署只涉及 Cloudflare 一家。
- 本地开发与全部测试不需要 Docker；测试跑在与线上相同的 workerd + D1 上。

**负面**

- PRD 的约束随之修改（第 3、7、8、9 节），AC-004 由「pgvector 就绪」改为「数据库可用、预留表可写入」。
- 二期知识库需要另行选型，向量检索不能沿用 pgvector 的方案。
- 现有的线上演示（`mdes-web.pages.dev` + `mdes-api` Worker + Neon）仍运行重构前的版本；重新部署前需先建 D1 库、迁移并灌数据，旧 Neon 库的数据不会自动迁移。

## 部署步骤

```bash
cd apps/api
npx wrangler d1 create mdes                          # 把返回的 database_id 填进 wrangler.toml
npx wrangler d1 migrations apply mdes --remote
npm run seed -- --remote
npx wrangler deploy
```

需要 Cloudflare 账号权限：Workers Scripts 与 D1 的编辑权限（部署 Pages 另需 Cloudflare Pages 编辑权限）。
