# MDES Platform Demo

Cloudflare 优先的医疗器械产业数据底座 demo：**前台**为产业运行监测发布物（态势总览 / 指标体系），**数据后台**承担导入与批次管理。数据库为 **Cloudflare D1**（本地用 wrangler 自带的本地 D1，不需要 Docker）。

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

演示时如需更丰富的数据（多省份、多贸易伙伴、混合单位等，**虚构数据**，仅用于展示），可生成后在「数据后台 → 新建导入」上传：

```bash
node scripts/make-demo-csv.mjs > /tmp/trd_demo.csv
```

### 离线演示版

不连后端、可交互的单文件演示（数据为样例与上面的虚构数据，存在浏览器内存里，刷新即重置）：

```bash
npm run build:demo -w @mdes/web   # 输出 apps/web/dist-demo/mdes-demo.html，双击即可打开
```

## 验收样例

1. 打开「指标目录」（`/indicators`），阶段选「一期」，应约 30 项
2. 「数据后台 → 新建导入」选表格类指标（如 38），上传 `data/samples/trd_sample.csv` 并写入
3. 「观测值」（`/observations`）查询 `TRD-001` 应有多行
4. `/api/health` 中 `db: "ok"`
5. 前台「态势总览」「指标体系」「/system/01」为发布物版式示意

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
- 数据库：Cloudflare D1（库名 `mdes`，2026-11-10 起；Neon 里的旧观测值没有迁移过来）

## Cloudflare 重新部署

### 自动部署（GitHub Actions）

`.github/workflows/deploy-cloudflare.yml`：推送到 `ui/itei-refactor` 或 `main` 时自动执行。依次是测试、构建、D1 迁移、部署 `mdes-api` Worker、部署 `mdes-web` Pages（生产），最后做冒烟检查。也可以在 Actions 页手动运行。

需要一个仓库机密（Settings → Secrets and variables → Actions → New repository secret）：

- `CLOUDFLARE_API_TOKEN`：账号级权限 D1 编辑、Workers Scripts 编辑、Cloudflare Pages 编辑。
- `CLOUDFLARE_ACCOUNT_ID`（选填）：不填时取令牌能访问的唯一账号。

种子数据不在工作流里灌；指标清单有变动时按下面的手动步骤执行 `npm run seed -- --remote`。

### 手动部署

线上 D1 库已建好，`database_id` 已写在 `apps/api/wrangler.toml`。换到新的 Cloudflare 账号时才需要先 `npx wrangler d1 create mdes`，再把返回的 `database_id` 填进去。

迁移、灌数据（幂等，可重复执行）、部署 Worker 与 Pages：

```bash
cd apps/api
npx wrangler d1 migrations apply mdes --remote
npm run seed -- --remote
npx wrangler deploy
cd ../web && VITE_API_BASE=https://mdes-api.scstriker0120.workers.dev npm run build
npx wrangler pages deploy dist --project-name mdes-web --branch main --commit-dirty=true
```

`mdes-web` 的生产分支是 `main`，不加 `--branch main` 时 wrangler 会按当前 git 分支发成预览部署。

在 Claude 云端会话里，Cloudflare 令牌由网络代理注入，`wrangler pages deploy` 会因此失败（见 ADR-003「实施补记」）；Pages 改由上面的 GitHub Actions 部署，或在本机执行上面的命令。Worker 与 D1 的命令不受影响。

Cloudflare 的 API 令牌等凭据不要写进仓库。选型说明见 `docs/decisions/ADR-003-cloudflare-d1.md`。

## 文档

见 `docs/PRD.md`、`TECH_SPEC.md`、`ACCEPTANCE.md`、`DATA_MODEL.md`、`API.md`；架构决定见 `docs/decisions/`。
