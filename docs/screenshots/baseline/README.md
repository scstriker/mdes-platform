# 重构前界面基线（阶段 0）

- 截取时间：2026-11-05，代码为 `ui/itei-refactor` 上清理之前的状态（与 `main` 的 `0f29064` 相同）。
- 数据：`npm run seed` 后导入 `data/samples/trd_sample.csv`（10 行）。
- 脚本：`node apps/web/scripts/baseline-screenshots.cjs docs/screenshots/baseline`（需先启动 API 与 Web dev server）。
- 字体：截图环境没有微软雅黑，按 `--font-sans` 栈回退到 Noto Sans CJK SC。
- 深色：旧界面没有主题开关，用浏览器 `prefers-color-scheme: dark` 触发 tokens.css 的系统偏好分支。

文件名为 `{视图}-{设备}-{主题}.png`：

| 视图 | 进入方式 |
|---|---|
| `home` | 默认首页 |
| `catalog` | 页眉「指标」，默认第一个簇 |
| `indicator` | 侧栏「07 进出口贸易」→「医疗装备进口金额」（TRD-001） |
| `charts` | 打开 TRD-001 后点页眉「图表」 |
| `import` | 页眉「导入」 |

设备：`desktop` 1440×900，`mobile` 390×844，均为 2 倍像素密度；另有一张 `indicator-wide1920-light.png`（1920×1080）。

## 基线里能看到的已知问题

ADR-002「现状」所列问题，在这些截图中的位置：

| 问题 | 见 |
|---|---|
| 窄屏隐藏了页眉导航，没有底部 TabBar，用户到不了其他页面（脚本用 DOM 点击才进得去） | `*-mobile-*` |
| 页脚第三段文字「一期」被右端斜切装饰盖住 | 所有截图的页脚右端 |
| 宽屏下内容区限宽 1200px 且自带滚动，滚动条停在屏幕中间 | `indicator-wide1920-light.png` |
| 深色主题下彩色标志落在深色底上 | `*-dark` 页眉左端 |
| 页眉使用渐变横幅（ADR 已改为白底双线） | 所有截图 |
