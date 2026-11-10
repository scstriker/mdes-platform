# ITEI 组件层

与设计系统 `apps/web/design/itei/itei-design-system/components/` 一一对应，外加 MDES 需要、shadcn 没有的 Tree / Stepper / Dropzone / Descriptions。规范以设计系统为准，本文只记 MDES 的用法与偏离。逐个状态的验收页是 `/__design`。

- 页面代码只用这里和 `components/ui/`（换皮后的 shadcn）里的组件，不写色值、任意值和 `dark:` 前缀；`tests/style-rules.test.ts` 会拦截。
- 深色主题全由 token 驱动；组件里没有主题分支。唯一的例外是标志（见 AppHeader）。

| 组件 | 对应 | 要点 |
|---|---|---|
| `AppHeader` | AppHeader（**白底变体**） | 见下节 |
| `AppFooter` | Footer · 应用页脚 | 40px 深蓝条，三段 caption 文字；右端 120px 斜切装饰，右段文字留 96px 内边距并压在装饰上，不再被遮住。窄屏不显示 |
| `TabBar` | platforms.md 手机端 | 窄屏底部导航，5 项以内；当前项 brand-navy 图标 + 文字，不用红。md 及以上隐藏 |
| `SectionTitle` | SectionTitle | 一级深蓝斜切块（每页一次，由 `Page` 渲染）；二级亮蓝下划线；三级红色左条 |
| `NumberedNav` | NumberedNav | 当前项整条红（每屏一条），已完成 info-bg；≤ 8 条 |
| `Stepper` | 基于 NumberedNav | 导入向导。已完成 info-bg + 对勾，当前红，**未开始 surface-sunken + ink-muted**：按 ITEI「同屏深蓝实色块两块以上时其余降为浅底」，不用深蓝实底 |
| `KpiTile` | KpiTile | 千分位、等宽数字；`highlight` 顶部红条一组至多一块；`trend` 画 SVG 迷你线（不加载 ECharts） |
| `Card` | Card | 1px border 分层；`raised` 才有投影；`flush` 用于内嵌表格 |
| `Tag` | Tag（替代 shadcn Badge） | md 24px / sm 20px（表格内），色点 + 文字；同一列表 ≤ 3 种色调；不可点击 |
| `DataTable` | DataTable | 基于 TanStack Table v9。列声明 `type: text / number / code / status`；加载、空、**请求失败**三态分开；`pagination` 服务端分页；`stickyFirstColumn`；窄屏自动改卡片列表 |
| `Field` | Input | 标签在上、6px 间距；必填红星；`error` 自动加「✕ 错误：」；内部控件自动获得 id 与 aria 属性 |
| `Tree` | MDES 自建 | 簇树，ARIA tree；当前项 info-bg + 左 4px brand-navy；方向键操作 |
| `Dropzone` | MDES 自建 | CSV 拖拽上传；拖入态、已选文件、错误态；校验类型与大小 |
| `Descriptions` | MDES 自建 | 规格与元数据键值列表；`long` 用 body-lg 并保留换行 |

## AppHeader：白底变体（ADR-002「页眉：白底加双线」）

本项目偏离 ITEI AppHeader「背景只用渐变」的规定，改为白底：

- 背景 `surface`；下沿双线：3px `brand-navy` + 1px 白缝 + 2px `brand-sky`。
- 高 56px：左标志、中间当前页标题（`title-header`，brand-navy 20px 加粗）、右主导航。
- 导航文字 `ink`，悬停 `brand-navy`；当前项 2px `brand-navy` 下划线。
- 彩色标志直接放在白底上，不再需要白色斜切标志区。
- 深色主题：页眉随 `surface` 变深；按 ITEI「深色底上用文字 ITEI 代替标志」，标志换成 `ink` 色文字「ITEI」。切换由 `styles/itei-components.css` 里的主题变量驱动，局部 `data-theme` 容器同样生效。
- 窄屏保留标志与标题，导航移到 `TabBar`。
- 全站不再使用渐变，渐变 token 也不注册为 Tailwind 工具类。

## 与 showcase.html 的细节差异

- Button 横向内边距按 README 取 `space-5`（24px）；showcase 示例写的是 20px。
- DataTable 表头文字按 showcase 用 13px 加粗（`label font-bold`）；README 写的是 `title-nav`（16px）。
- 焦点环一律 2px 偏移（ADR-002）；showcase 的输入框示例偏移 1px。
