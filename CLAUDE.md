# MDES Platform

- UI 规范见 `apps/web/design/itei/itei-design-system/AGENTS.md`（按其中的读取顺序读 README.md、platforms.md、tokens.css、components/*/README.md；`showcase.html` 是组件的视觉基准）。
- 重构决定见 `docs/decisions/ADR-002-ui-stack.md`。ADR 没覆盖、或必须偏离 ADR 的情况，先找仓库所有者确认，定下来后在 ADR 里补记。
- 产品与接口文档：`docs/PRD.md`、`docs/TECH_SPEC.md`、`docs/API.md`、`docs/DATA_MODEL.md`、`docs/ACCEPTANCE.md`。

## 前端硬性规则

- token 唯一来源是设计系统目录里的 `tokens.json`；改了它就运行 `npm run tokens`，由 Style Dictionary 重新生成 `tokens.css`、`tokens.flat.json` 和 `apps/web/src/styles/generated/itei-theme.css`。`apps/web/src` 下不另存 token 副本。
- 组件优先用 `apps/web/src/components/itei`（ITEI 组件层，说明见同目录 README.md）与 `components/ui`（换皮后的 shadcn）；新组件先加到 `/__design` 验收页。
- 页面代码不写色值和任意值（如 `bg-[#...]`、`text-[13px]`），不写 `dark:` 前缀；只用 token 和 ITEI 组件。深色主题由 `[data-theme="dark"]` 与系统偏好驱动。`apps/web/tests/style-rules.test.ts` 会拦截违规写法。
- Cloudflare Pages 在没有 `404.html` 时才做 SPA 回退，`apps/web/dist` 里不要放 `404.html`。

## 常用命令

```bash
npm install
npm run dev:db      # Docker 起 pgvector（docker-compose.yml）
npm run seed
npm run dev:api     # http://127.0.0.1:8787
npm run dev:web     # http://127.0.0.1:5173
npm run tokens      # tokens.json 改动后重新生成 token 产物
npm test
npm run build
npm run e2e          # Playwright：README 验收 + 外框 + 回归 + axe（需 pgvector，独立端口与独立库）
```

每完成一块改动都跑 `npm test` 和 `npm run build`，界面改动再跑 `npm run e2e`；界面改动用 Playwright 截图自查（桌面 1440 / 手机 390，浅色 / 深色）。

- 重构前的界面基线：`docs/screenshots/baseline/`
- 组件验收截图（与 showcase.html 并排）：`node apps/web/scripts/design-screenshots.cjs`，输出到 `docs/screenshots/phase1/`
- 页面截图自查（五个页面 × 桌面 / 手机 × 浅色 / 深色）：`node apps/web/scripts/page-screenshots.cjs <输出目录>`；自查截图不入库
- 演示数据（虚构，覆盖多省份、多序列、混合单位、重复期间等切片情形）：`node scripts/make-demo-csv.mjs > /tmp/trd_demo.csv`，再在「数据导入」页上传
