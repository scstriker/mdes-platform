# 阶段 1 验收截图：ITEI 组件层与页面外框

- 截取时间：2026-11-05，`ui/itei-refactor` 阶段 1 完成时。
- 脚本：`node apps/web/scripts/design-screenshots.cjs docs/screenshots/phase1`（需先启动 Web dev server；「API 错误文案」一节的接口连通状态需要 API）。
- 字体：截图环境没有微软雅黑，按 `--font-sans` 栈回退到 Noto Sans CJK SC。

| 文件 | 内容 |
|---|---|
| `compare-light.png` / `compare-dark.png` | 左：设计系统 `showcase.html`；右：`/__design`。逐组件并排：色板、AppHeader、SectionTitle、NumberedNav、Button、Card、Input、Tag、Footer、DataTable、KpiTile |
| `design-desktop-{light,dark}.png` | `/__design` 整页，1440 宽，含 showcase 没有的 Stepper、TabBar、Tree、Dropzone、Descriptions、Tabs、浮层、Skeleton、ECharts、错误文案 |
| `design-mobile-{light,dark}.png` | `/__design` 整页，390 宽：表格改卡片列表、Stepper 竖排 |
| `shell-{desktop,mobile}-{light,dark}.png` | 新外框：白底页眉 + 双线；桌面深蓝页脚，窄屏底部 TabBar；深色主题标志换成文字「ITEI」 |

## 与 showcase.html 的已知差异（有意为之）

- AppHeader 用白底变体（ADR-002「页眉：白底加双线」），不用渐变。
- SectionTitle 一、二级宽度跟随文字（README 规则）；showcase 里是被父级 grid 撑满的。
- Button 横向内边距 24px（README `space-5`）；showcase 示例为 20px。
- 表格内状态标签用 Tag sm（带色点）；showcase 的表格示例是不带色点的简化写法。
- 下拉框用 Radix Select 而不是原生 `<select>`，外观按 Input 规则换皮。
