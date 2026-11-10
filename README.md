# MDES Platform Demo

Cloudflare 优先的医疗器械产业数据底座 demo：指标目录、CSV 导入、观测值查询。数据库为 **Cloudflare D1**（本地用 wrangler 自带的本地 D1，不需要 Docker）。

## 本地启动

前置：Node 20+。

```bash
cd mdes-platform
npm install
npm run db:migrate   # 在本地 D1 建表（apps/api/migrations）
npm run seed         # 灌入 99 项指标
npm run dev:api      # wrangler dev
# 另开终端
npm run dev:web
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8787/api/health

本地 D1 的数据在 `apps/api/.wrangler/state`，删掉这个目录再执行 `npm run db:migrate` 和 `npm run seed` 即可重置。

演示时如需更丰富的数据（多省份、多贸易伙伴、混合单位等，**虚构数据**，仅用于展示），可生成后在「数据导入」页上传：

```bash
node scripts/make-demo-csv.mjs > /tmp/trd_demo.csv
```

### 离线演示版

不连后端、可交互的单文件演示（数据为样例与上面的虚构数据，存在浏览器内存里，刷新即重置）：

```bash
npm run build:demo -w @mdes/web   # 输出 apps/web/dist-demo/mdes-demo.html，双击即可打开
```

## 验收样例

1. 打开「指标目录」，阶段选「一期」，应约 30 项
2. 「数据导入」上传 `data/samples/trd_sample.csv`
3. 「观测值」查询 `TRD-001` 应有多行
4. `/api/health` 中 `db: "ok"`

```bash
npm test
```

### 界面验收（端到端）

上面四步已写成 Playwright 端到端测试，另含外框、出错与竞态回归、axe 无障碍检查（WCAG 2.1 AA，桌面 / 手机 × 浅色 / 深色）：

```bash
npm run e2e
```

`npm run e2e` 自己起 API（`wrangler dev`，8788 端口，本地 D1 数据放在 `apps/api/.wrangler/e2e`，每次重建）和 Web（5174 端口），不影响正在运行的开发服务与开发库。

### 单元与集成测试

`npm test` 依次跑 `packages/shared`（CSV 解析）、`apps/api`（API 集成测试）和 `apps/web`（客户端、token、样式规则）。API 集成测试把真实 Worker 放进 Miniflare（workerd + 本地 D1）运行，每组测试一个全新的库，不碰开发库，也不需要 Docker。

## 线上 Demo（已部署）

- Web：https://mdes-web.pages.dev
- API：https://mdes-api.scstriker0120.workers.dev/api/health
- 数据库：Neon Postgres（经 Cloudflare Hyperdrive）

线上仍是改用 D1 之前的版本。按下面的步骤重新部署后，API 改用 D1；Neon 里的旧数据不会自动迁移。

## Cloudflare 重新部署

首次部署先建 D1 库，把返回的 `database_id` 填进 `apps/api/wrangler.toml`：

```bash
cd apps/api && npx wrangler d1 create mdes
```

然后迁移、灌数据、部署 Worker 与 Pages：

```bash
cd apps/api
npx wrangler d1 migrations apply mdes --remote
npm run seed -- --remote
npx wrangler deploy
cd ../web && VITE_API_BASE=https://mdes-api.scstriker0120.workers.dev npm run build
npx wrangler pages deploy dist --project-name mdes-web --commit-dirty=true
```

Cloudflare 的 API 令牌等凭据不要写进仓库。选型说明见 `docs/decisions/ADR-003-cloudflare-d1.md`。

## 文档

见 `docs/PRD.md`、`TECH_SPEC.md`、`ACCEPTANCE.md`、`DATA_MODEL.md`、`API.md`；架构决定见 `docs/decisions/`。
