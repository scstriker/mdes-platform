# 给AI读的入口

压缩包已就绪。解压后目录 `itei-design-system/` 的内容：

**给 AI 工具读的入口**

- `AGENTS.md` — 通用说明：读取顺序、硬性规则缩写版、各工具接入方式。Codex、Gemini CLI、Antigravity 会自动识别这个文件名。
- `CLAUDE.md` / `GEMINI.md` — 一行转引到 AGENTS.md，放进仓库即生效。
- `prompt-snippet.txt` — 给 ChatGPT、Gemini、Claude 网页对话用的开场指令，配合上传 `README.md` + `tokens.css` + `platforms.md` 三个文件。

**规范本体**

- `README.md`（品牌手册）、`platforms.md`（跨端映射）
- `tokens.json`（完整定义，含用途与对比度）
- `tokens.css`（编译好的 CSS 变量 + 文字样式类，浅/深主题自动切换，Web 项目直接引入）
- `tokens.flat.json`（两主题已解析成十六进制的扁平版，给 Flutter / SwiftUI / Compose / 小程序 wxss / Matplotlib 用）
- `tailwind.preset.js`（Tailwind 预设）

**组件与资产**

- `components/<Name>/README.md` + `preview.html`，共 10 个组件加封面
- `showcase.html` — 离线总览页，双击打开即可看全部组件并切换深浅色（上面已截图核验）
- `assets/Logo/itei-logo.png`、`assets/Templates/` 两张 PPT 原始背景图

建议在实际项目里放到 `design/itei/`，然后在项目根的 CLAUDE.md 或 AGENTS.md 加一句「UI 规范见 design/itei/AGENTS.md」。