# MDES Platform Demo

Cloudflare 优先的医疗器械产业数据底座 demo：指标目录、CSV 导入、观测值查询。数据库为 **PostgreSQL + pgvector**（本地 Docker 或 Neon）。

## 本地启动

前置：Node 20+、Docker。

```bash
cd mdes-platform
npm install
npm run dev:db
# 等待 Postgres 就绪后
npm run seed
npm run dev:api
# 另开终端
npm run dev:web
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8787/api/health

默认库连接：`postgres://mdes:mdes@127.0.0.1:5433/mdes`

演示时如需更丰富的数据（多省份、多贸易伙伴、混合单位等，**虚构数据**，仅用于展示），可生成后在「数据导入」页上传：

```bash
node scripts/make-demo-csv.mjs > /tmp/trd_demo.csv
```

## 验收样例

1. 打开「指标目录」，阶段选「一期」，应约 30 项
2. 「数据导入」上传 `data/samples/trd_sample.csv`
3. 「观测值」查询 `TRD-001` 应有多行
4. `/api/health` 中 `vector: true`

```bash
npm test
```

`npm test` 依次跑 `packages/shared`（CSV 解析）、`apps/api`（API 集成测试）和 `apps/web`（客户端、token、样式规则）。API 集成测试连本地 pgvector 里的独立库 `mdes_test`（自动创建，不碰开发库）；没起 `npm run dev:db` 时这一组会跳过并提示。

## 线上 Demo（已部署）

- Web：https://mdes-web.pages.dev
- API：https://mdes-api.scstriker0120.workers.dev/api/health
- 数据库：Neon Postgres + pgvector（经 Cloudflare Hyperdrive）

## Cloudflare 重新部署

```bash
cd apps/api && npx wrangler deploy
cd ../web && VITE_API_BASE=https://mdes-api.scstriker0120.workers.dev npm run build
npx wrangler pages deploy dist --project-name mdes-web --commit-dirty=true
```

连接串与 Neon 密码勿写入仓库；Hyperdrive 已绑定在 `apps/api/wrangler.toml`。

## 文档

见 `docs/PRD.md`、`TECH_SPEC.md`、`ACCEPTANCE.md`、`DATA_MODEL.md`、`API.md`。
