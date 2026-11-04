# ADR-002 — 前端 UI 基座：shadcn/ui + Tailwind v4 + ITEI 组件层

## Status

Accepted（2026-11-04，仓库所有者选定）

- **已决定**
  - UI 基座采用方案 A。
  - 「交互与信息架构参考」全部保留，只借鉴设计，不引入代码。
  - 图表库采用 ECharts 6。
  - API 改动纳入本轮。
  - 视觉以参考页 `https://md.sensor-cloud.org/45` 为目标，已于 2026-11-04 核对。
- **待确认**：参考页与 ITEI 规范的差异如何处理，以及 API 补充项，见 Open Items。
- **数据来源**：调研数据截至 2026-11-04，取自 GitHub 搜索 API 与各仓库的 `package.json`。star 数和提交日期会变，后续引用以仓库实时数据为准。

## Context

### 现状

- 实际生效的前端代码只有三个文件：`App.tsx`（单文件，所有页面写在一起）、`tokens.css`、`itei-app.css`。
- 以下文件都没有被引用：`styles.css`、`itei-theme.css`、`itei-tokens.css`、`index.css` 以及 `src/pages/*`。
- Tailwind 插件已配置，但唯一导入它的 `index.css` 没被引用，所以实际一个工具类都没有生成。
- `react-router-dom` 已安装但未使用。
- 界面与 README / ACCEPTANCE 对不上：
  - 没有阶段筛选；
  - 没有观测值页；
  - 后期的 69 个指标在界面上看不到。
- 已确认的问题：
  - 窄屏下隐藏了顶部导航，却没有任何替代导航；
  - 页脚右侧文字被斜切装饰遮住；
  - 暗色主题下标志落在深蓝底上，违反 ITEI 规范；
  - 图表按期间直接把所有行加总，全国汇总与 31 省市的数据会被重复累加。

### 约束与需求

| 编号 | 需求 |
|---|---|
| R1 | 视觉目标是参考页，见「视觉参考核对结果」。ITEI 设计系统（`apps/web/design/itei/itei-design-system/`，与 2026-11-04 上传的 zip 逐字节一致）提供 token 与组件细则：<ul><li>直角，控件最多 2px</li><li>不靠投影分层</li><li>深蓝是唯一的大面积品牌色，红色每屏至多一处</li><li>微软雅黑字体栈，Tabler 图标</li><li>2px 焦点环</li><li>暗色主题由 token 驱动</li></ul> |
| R2 | 现有技术栈：<ul><li>React 19 + Vite + TypeScript</li><li>PRD 约定「Tailwind + shadcn」</li><li>Web 以 SPA 形式部署到 Cloudflare Pages</li><li>API 为 Hono on Workers</li></ul> |
| R3 | 功能：<ul><li>指标目录：7 簇 × 99 项，含筛选</li><li>指标档案：长文规格、图表、观测表</li><li>观测值查询：筛选、分页、导出</li><li>CSV 导入：拖拽上传、预校验、结果、历史</li><li>概览：覆盖率与系统状态</li><li>二期：知识库与智能问答面板</li></ul> |
| R4 | 可维护性、许可证（MIT / Apache 优先）、包体积、可访问性、中文语境、对 AI 编码工具友好 |

### 视觉参考

参考页 `https://md.sensor-cloud.org/45` 已于 2026-11-04 核对，结果见「视觉参考核对结果」。

## Decision

采用**方案 A：shadcn/ui + Tailwind v4，在仓库内自建组件层**。

- **基座**：shadcn/ui 的组件源码复制进仓库，按「方案 A 落地要点」换皮。Tailwind v4 只开放 ITEI token。
- **视觉**：采用参考页的报告式版式语言：
  - 报头加双线；
  - 编号条目；
  - 详情展开；
  - 事实行与行内比例条；
  - 深蓝页脚条。

  细则见「视觉参考核对结果」与「页面版式」。
- **骨架**：在现有仓库内自建，不 fork 模板。借鉴 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) 的全局搜索命令面板和 data-table 实现。
- **配套**：
  - 图表采用 ECharts 6，规范见「ECharts 使用规范」；
  - 路由 React Router 7、服务端状态 TanStack Query、表格 TanStack Table、token 流水线 Style Dictionary，这几项默认采用。
- **API**：本轮一并修改，范围见「API 改动」。
- **交互参考**：open-sdg、OWID Grapher、OpenMetadata / DataHub、GOV.UK Frontend / USWDS、Evidence 全部保留。只借鉴交互与信息架构，不复制它们的代码、样式或素材。

**选定理由**

- 组件源码完全受控，ITEI 规则可以在 token 层强制执行。
- 参考页完全由排版驱动。A 能逐像素控制版式；B、C 这类组件库自带的默认样式与它冲突更大。
- 与 PRD 约定的「Tailwind + shadcn」一致。
- 包体积最小，AI 编码工具对这套栈也最熟悉。

### 后续步骤

1. **清理**
   - 删除未引用的 CSS 与页面；
   - token 改为直接引用设计系统里的正本；
   - 修复窄屏导航、页脚遮挡、滚动容器；
   - 仓库根目录增加 `CLAUDE.md` / `AGENTS.md`，指向 ITEI 规范；
   - 用 Playwright 截取基线图。
2. **基础设施**
   - Tailwind v4 主题；
   - shadcn 初始化与换皮；
   - 版式组件，以及用来对照参考页和 `showcase.html` 逐个核对的 `/__design` 验收页；
   - 报头字体子集；
   - ECharts 主题；
   - React Router 7 路由与 TanStack Query。
3. **API**：按「API 改动」实施，同步更新 `docs/API.md`、`docs/ACCEPTANCE.md` 与 API 测试。
4. **页面迁移**：概览 → 指标目录 → 指标档案 → 观测值 → 数据导入。
5. **打磨**
   - 窄屏布局；
   - 打印样式；
   - 暗色主题核对；
   - 无障碍检查；
   - 把 README 里的界面验收写成 e2e 测试。

## 视觉参考核对结果（2026-11-04）

### 页面概况

- 标题「国内医疗装备产业雷达｜2026 年第 45 周｜ITEI」，是一份单页周报。
- 纯静态 HTML：样式写在页内，没有外部脚本和样式表。唯一的内联脚本负责「详情」展开。
- 内容单栏居中，最大宽 880px；760px 以下切换为窄屏布局；带打印样式。
- 只有浅色，没有暗色主题。

参考页是一份报告，不是应用。本 ADR 把它的版式语言迁移到 MDES 的应用页面；导航、筛选、数据表这类应用元素在「页面版式」里另行设计。

### 版式要素

| 要素 | 参考页做法 | MDES 用法 |
|---|---|---|
| 报头 | <ul><li>左：彩色标志，高 34px，白底</li><li>中：衬线标题，brand-navy，28 / 34px，字距 0.06em</li><li>右：期次「2026 年第 45 周」，数字 24px brand-navy；下方是日期区间，13px ink-muted</li></ul> | 概览页用完整报头；其他页用紧凑报头：标志 + 无衬线系统名 + 模块导航 |
| 报头双线 | 上 3px brand-navy、下 2px brand-sky，总高 6px | 所有页面的报头下方 |
| 元信息行 | 13px。左侧是加粗标签 + 内容，右侧是「数据截止 2026-11-02」，ink-muted | 概览：指标簇、数据截止；其他页：当前位置或筛选摘要 |
| 要点框「本期」 | <ul><li>info-bg 底，左侧 4px brand-navy</li><li>小标题 13px 加粗，字距 0.08em</li><li>要点 18 / 28px 加粗，前面是 brand-navy 序号</li></ul> | 概览的「要点」；指标档案的「一期口径」 |
| 编号条目 | <ul><li>两列网格：序号 36px + 内容</li><li>序号「01」brand-navy 加粗、等宽数字</li><li>正文 16 / 26px，行间用 1px border 分隔</li></ul> | 簇列表、指标列表、关联指标、导入步骤 |
| 文字标记 | 条目开头的 brand-red 加粗文字「须跟进」，红色只用在这里 | 「待导入」，表示一期指标还没有观测值；每屏尽量少用 |
| 来源 | 紧跟正文，ink-muted | 指标所属簇、更新频率等次要信息 |
| 详情展开 | <ul><li>文字按钮「详情 / 收起」，link 色下划线，偏移 3px</li><li>面板左侧 2px brand-sky 线，条目前是 brand-navy 圆点，末尾是 13px ink-muted 的「来源：」</li><li>同一时间只展开一项；展开后超出视口会自动滚动</li><li>带 `aria-expanded` / `aria-controls`</li></ul> | 指标规格的各段、簇内指标清单、导入错误明细 |
| 事实行 | 两列网格：标签 48px + 内容。标签「数字 / 技术 / 本所」brand-navy 加粗，行间 1px border | 「覆盖 / 数据 / 导入 / 系统」；指标规格的键值列表 |
| 行内比例条 | 64 × 6px，brand-navy 填充 + 浅灰轨道，`role="img"` + `aria-label` | 一期覆盖率、各簇入库比例 |
| 页脚条 | brand-navy 底，13px on-brand 文字。左边是机构全称，右边是刊名与期次 | 左「机械工业仪器仪表综合技术经济研究所（ITEI）」，右「医疗器械产业数据系统 · 一期」 |
| 衬线字体 | Noto Serif CJK SC Bold 的子集，SIL OFL 1.1 许可。只含标题 10 个字，woff2 约 6.5 KB，以 `ITEIMastSerif` 的名称内嵌 | 构建时用 fontTools 的 `pyftsubset` 为报头标题生成子集 |
| 窄屏（≤ 760px） | 报头换行，期次移到标题下方；元信息改为竖排；序号列收窄到 32px；页脚上下排列 | 同参考页；模块导航放在报头下方一行 |
| 打印 | 隐藏「详情」按钮；页宽自适应；要点框与页脚强制打印背景色 | 概览、指标档案支持打印和另存 PDF |

### 与 ITEI 规范的差异

按用户要求，视觉以参考页为准。下表列出参考页偏离 ITEI 规范的地方和处理方式。落地时要把这些新做法补写进 ITEI 组件文档。

| 项 | ITEI 规范 | 参考页 | 处理 |
|---|---|---|---|
| 页眉 | AppHeader：渐变横幅 + 斜切标志区 | 白底报头 + 双线，无渐变、无斜切 | 采用参考页做法，不再使用渐变横幅 |
| 左侧色条 | 只有三级 SectionTitle 能用左侧色条（红色），卡片不用 | 要点框用 4px brand-navy 左条；详情面板用 2px brand-sky 左线 | 采用参考页做法，作为新增的 Lead、Details 组件 |
| 正文字号 | body 15 / 24，body-lg 17 / 28 | 条目 16 / 26，要点 18 / 28 | 阅读类页面采用参考页数值 |
| 页脚 | 40px 深蓝条 + 右端斜切装饰；左日期 / 中机构 / 右页码 | 深蓝条，左机构、右刊名期次，无斜切 | 采用参考页做法 |
| 衬线字体 | display 字体栈首选汉仪粗宋 | Noto Serif CJK SC Bold 子集 | 采用参考页做法。汉仪粗宋是商业字体，网页内嵌需另行授权 |
| 状态标识 | Tag：24px 浅底 + 色点 | 条目内用加粗文字标记 | 条目内用文字标记；数据表的状态列仍用 Tag |
| 手机端导航 | 底部 TabBar | 无导航（单页） | 模块导航放在报头下方的一行文字链接里，不用底部 TabBar |
| 比例条轨道 | 规范不允许硬编码色值 | 轨道色写死为 `#c5d0da` | 改为新增 token，例如 `--meter-track` |
| 暗色主题 | token 自动切换 | 只有浅色 | 保留 token 级暗色支持；报头标志区固定白底 |

衬线标题只用在概览页的完整报头，这与 ITEI「display 只在封面出现一次」的规定一致。

## 页面版式（按参考页）

所有页面共用以下结构：

- 紧凑报头（概览页为完整报头）+ 双线 + 元信息行；
- 内容单栏居中；
- 深蓝页脚条。

阅读类页面最大宽 880px。数据表较宽的页面（观测值、导入历史）放宽到 1200px，即 ITEI 的 `content-max`；表格超宽时横向滚动。

| 页面 | 版式 |
|---|---|
| 概览 | <ul><li>完整报头：标志 + 衬线标题「医疗器械产业数据系统」，右侧是「V12 指标体系」与「一期 30 项」</li><li>元信息行：指标簇、数据截止</li><li>要点框：一期覆盖、最近一次导入、系统状态，各写一句</li><li>编号条目 01–07：7 个簇，每行写一期指标数、已入库数和比例条，「详情」展开簇内的指标；有一期指标未入库时标「待导入」</li><li>事实行：数据、导入、系统</li></ul> |
| 指标目录 | <ul><li>筛选行：簇、阶段、采集方式、数据状态、关键词，条件写进 URL</li><li>按簇分组的编号条目：编号（如 TRD-001）+ 名称 + 文字标记 + 更新频率</li><li>「详情」展开一期口径与来源类型；点击名称进入指标档案</li></ul> |
| 指标档案 | <ul><li>标题区：编号、名称、文字标记</li><li>要点框：一期口径</li><li>「数据」部分：ECharts 趋势图与结构图，下方是 DataTable</li><li>「规格」部分：用事实行列出业务价值、定义、来源、采集方式、计算与应用；正文按「一、二、三」分条，长段落用「详情」展开</li><li>「关联指标」：编号条目，由规格正文中出现的指标编号生成</li></ul> |
| 观测值 | 筛选行 + DataTable（1200px）+ 分页 + 导出 CSV |
| 数据导入 | <ul><li>步骤用编号条目表示：01 选择文件、02 校验预览、03 导入结果，当前步骤加粗</li><li>拖拽上传区</li><li>校验结果和导入结果用事实行；错误明细用「详情」展开</li><li>下方是导入历史 DataTable</li></ul> |

## 方案 A 落地要点

### Tailwind 主题

- **token 唯一来源**：tokens.css 用 `@import "…/tokens.css" layer(base)` 引入。不放进 layer 的样式优先级高于所有工具类，会悄悄覆盖它们。
- **清空默认命名空间**：把 `--color-*`、`--radius-*`、`--shadow-*` 置为 `initial`，只注册 ITEI token 和下表里的 shadcn 语义色。效果如下：
  - `bg-blue-500` 这类写法根本不存在；
  - shadcn 组件里的 `rounded-md/lg/xl` 不再生成样式，组件自动变为直角；需要 2px 圆角的控件要显式写 `rounded-sm`；
  - `shadow-sm` / `shadow-lg` 不再生成样式。浮层（Dialog、Sheet、Popover、DropdownMenu、Select 下拉）改用 `shadow-raised` / `shadow-modal`。
- **删除 shadcn 模板自带的定义**：`globals.css` 里的颜色、`--radius` 派生值和 `.dark` 定义都要删掉，否则会覆盖 ITEI token。
- **文字样式**：ITEI 的文字样式（title-page、title-section、body、numeral 等）和参考页的阅读字号（16 / 26、18 / 28）都注册为 `@utility`，这样才能配合响应式前缀使用。
- **间距**：保留 Tailwind v4 默认的 4px 倍数，它本身就是 ITEI 的 4px 网格。不照搬 `tailwind.preset.js` 对数字的覆盖。

  | ITEI | Tailwind |
  |---|---|
  | space-5（24px） | `6` |
  | space-6（32px） | `8` |
  | space-7（48px） | `12` |
  | space-8（64px） | `16` |

### shadcn 语义变量映射

| shadcn 变量 | ITEI token | 说明 |
|---|---|---|
| `--background` / `--foreground` | `--surface` / `--ink` | |
| `--card`、`--popover` | `--surface-raised` | 前景都用 `--ink` |
| `--primary` / `--primary-foreground` | `--brand-navy` / `--on-brand` | 深色主题下 navy 已提亮，前景用 on-brand，不要写死白色 |
| `--muted` / `--muted-foreground` | `--surface-sunken` / `--ink-muted` | |
| `--accent` / `--accent-foreground` | `--info-bg` / `--brand-navy` | 用于悬停和当前项的浅底 |
| `--destructive` | `--danger` | 错误态必须带「错误」字样 |
| `--input` | `--border-strong` | ITEI Input 规范要求默认边线用 border-strong |
| `--ring` | `--focus` | |
| `--border`、`--chart-1`…`--chart-5` | 同名沿用 | 两边同名同义，只保留 ITEI 的定义 |

页面不使用侧栏，shadcn 的 `--sidebar*` 变量和 Sidebar 组件都不引入。

### 组件换皮清单

以后升级 shadcn 时，按这张清单逐项复核。

| 项 | shadcn 默认 | 要求 |
|---|---|---|
| Button | default / secondary / outline / destructive / ghost / link | <ul><li>改为 primary / secondary（深蓝描边）/ danger / ghost 四种</li><li>尺寸 md 40px、sm 32px</li><li>按下不缩放</li></ul> |
| 焦点环 | `ring-[3px] ring-ring/50` | 统一为 2px `--focus` 实线加 2px 偏移，抽成一个 `@utility` |
| Input / Select | 边线用 `--input`，没有标签约定 | <ul><li>标签放在上方</li><li>错误说明以「✕ 错误：」开头</li><li>必填星号用 brand-red</li><li>高 40px，窄屏 44px</li></ul> |
| Table | 无斑马纹 | <ul><li>表头 surface-sunken 底 + brand-navy 文字 + 2px brand-sky 下边线</li><li>偶数行 surface-sunken，无竖线</li><li>数字列右对齐、等宽数字、千分位</li><li>窄屏改为卡片列表</li></ul> |
| Collapsible | 无默认样式 | 按参考页的「详情展开」实现：<ul><li>文字按钮「详情 / 收起」</li><li>面板左侧 2px brand-sky</li><li>同一组内同时只展开一项</li><li>打印时隐藏按钮</li></ul> |
| Badge | 圆角胶囊 | <ul><li>条目内改用加粗文字标记</li><li>数据表的状态列用 ITEI Tag：高 24px、2px 圆角、浅底 + 色点，同一列表不超过 3 种色调</li></ul> |
| Skeleton | `animate-pulse` | 改为静态的 surface-sunken 色块，因为 ITEI 只允许 120–200ms 的过渡 |
| 浮层动画 | zoom / fade / slide | 保留 120–200ms 的淡入和位移，去掉缩放 |
| 暗色主题 | `.dark` 类 + `dark:` 前缀 | 改由 ITEI token 驱动（`[data-theme="dark"]` 与系统偏好），删掉组件里的 `dark:` 写法 |
| 图标 | lucide | Tabler（`@tabler/icons-react`），单色线性，颜色跟随 currentColor |

### 需要自建的组件

- **报告式版式组件**（来自参考页，用 ITEI token 实现）：
  - Masthead：完整版与紧凑版；
  - NavLinks：报头里的模块导航，当前项加 2px brand-navy 下划线；
  - Lead：要点框；
  - NumberedRow：编号条目，含文字标记、来源、详情按钮；
  - Details：详情展开；
  - FactRow：事实行，兼作键值列表；
  - RatioBar：行内比例条；
  - FooterBar：深蓝页脚条。
- **沿用 ITEI 规范的组件**：
  - SectionTitle 二级，用于「数据」「规格」分节；
  - Button；
  - Field；
  - Tag，只用于数据表的状态列；
  - DataTable。
- **shadcn 没有、MDES 需要的**：Dropzone，用于 CSV 上传。之前列出的 Tree、Stepper、Descriptions 分别由按簇分组的编号条目、编号条目、事实行代替。
- **暂不使用**（参考页没有对应元素）：AppHeader 渐变横幅、TabBar、KpiTile、Card、NumberedNav。

## ECharts 使用规范

- **按需引入**：只引入 `echarts/core` 和实际用到的部分（折线、柱状、网格、提示框、aria）。渲染器用 SVG：打印和导出 PDF 更清晰，数据量小时性能也够用。
- **懒加载**：只在指标档案和观测值页加载。行内比例条这类微型图用 CSS 组件实现，不加载 ECharts。
- **主题从 CSS 变量读取**：
  - 序列色依次用 chart-1 → chart-5；单序列只用 chart-1；需要强调的点（最新期或峰值）用 chart-3；
  - 网格线用 border，坐标文字 ink-muted 12px，字体用 font-sans；
  - 图内不放标题，标题写在页面里、左对齐；单序列不显示图例；
  - 提示框直角、1px border、无阴影。
- **动画**：ECharts 默认动画时长是 1000ms，要显式设为 200ms 以内或直接关闭（ITEI 只允许 120–200ms 的过渡）。
- **无障碍**：开启 `aria`，自动生成图表描述；图下方保留数据表。
- **主题切换**：切换时重建图表实例，以读取新的 token 值。
- **地图**：ECharts 从 5.0 起不再内置中国地图，需要自己注册 GeoJSON。对外展示时必须使用带审图号的合规底图。

## API 改动（本轮）

### 已确认纳入

| 改动 | 说明 |
|---|---|
| `GET /api/indicators` 列表增加 `obs_count` | 用一次 LEFT JOIN 聚合返回每个指标的观测值条数。同一接口建议再带上两个字段：<ul><li>`latest_period`：最近期间</li><li>`automation`：采集方式，取自 `spec_json`，供目录筛选</li></ul> |
| 新增 `GET /api/stats` | 返回概览页需要的统计：<ul><li>指标总数、一期数、一期已入库数</li><li>观测值总数与数据截止期间</li><li>各簇的一期数、一期已入库数、后期数、观测值数</li><li>最近一次导入批次</li></ul> |
| 错误码与中文文案 | <ul><li>错误统一返回 `{ error: { code, message, params } }`</li><li>CSV 行错误返回 `{ line, code, params }`</li><li>前端按 code 映射成中文提示，例如「第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试」</li><li>code 列表：`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`、`ROW_LIMIT_EXCEEDED`、`REQUIRED_FIELD_MISSING`、`INVALID_VALUE_NUM`、`VALUE_MISSING`、`DIMS_INVALID_JSON`、`DIMS_NOT_OBJECT`、`UNKNOWN_INDICATOR`、`NOT_FOUND`</li></ul> |

### 建议一并纳入（页面功能依赖，待确认）

| 改动 | 原因 |
|---|---|
| `GET /api/observations` 增加 `geo`、`batch_id`、`period_from`、`period_to`、`offset` 参数，并返回 `total` | 观测值页的筛选与分页、导入结果里的「查看本批次数据」都依赖它 |
| `POST /api/import/csv` 改为单事务 + 分块批量插入 | 现在是逐行插入，而且不在事务里：5000 行要 5000 次数据库往返；中途失败会留下一部分数据，批次却已经标为完成 |
| 新建 `packages/shared` | 存放共享类型和 CSV 解析器（从 `apps/api/src/csv.ts` 移入），导入页可以用同一套规则在前端做预校验 |

实施时同步更新 `docs/API.md`、`docs/ACCEPTANCE.md` 与 API 测试。

## Decision Drivers

1. ITEI 还原度（权重最高）：能否在 token 层强制规范，而不是靠人工自觉
2. 与 PRD 及现有栈一致
3. MDES 功能覆盖
4. 一期工作量
5. 生态活跃度与许可证
6. 包体积，以及 AI 编码工具的生成质量

## 调研范围

共筛选约 60 个仓库，下表记录了其中约 45 个，覆盖以下几类：

- shadcn / Tailwind 后台模板
- React 企业级组件库（含国产）
- 后台框架
- 数据目录 / 元数据平台
- 指标与统计门户（SDG）
- BI 平台
- 机构型设计系统
- token 流水线
- 图表、表格、路由与状态管理

## Considered Options

### 方案 A：shadcn/ui + Tailwind v4，自建 ITEI 组件层（选定）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 127,358 | 2026-11-04 | MIT | 组件源码复制进仓库，完全可控 |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | 16,544 | 2026-09-10 | MIT | Vite 8 / React 19.2 / Tailwind 4.2 / TanStack Router + Query + Table / Recharts 3；README 自述「不是 starter 模板」 |
| [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template) | 1,256 | 2026-10-28 | MIT | 有 Vite 版：React 19.3 / Tailwind 4.3 / React Router 7 / TanStack Table 9 |
| [sadmann7/tablecn](https://github.com/sadmann7/tablecn) | 6,375 | 2026-11-03 | MIT | 基于 shadcn 的数据表，支持排序、筛选、分页 |
| [jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) | 10,519 | 2026-09-03 | Apache-2.0 | shadcn 主题可视化编辑器，可以用来预览 ITEI 换皮效果 |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 7,227 | 2026-11-03 | MIT | Next.js 16，不是 Vite SPA，仅作参考 |
| [vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) | 33,746 | 2026-11-04 | MIT | Vue 3 + shadcn 风格，技术栈不符；说明 shadcn 路线在国内中后台已有大规模实践 |

**优点**

- 与 PRD 一致。
- ITEI 规则可以在 token 层强制执行。
- 包体积最小。
- AI 编码工具对这套栈最熟悉。

**缺点**

- 部分组件需要自建，见「需要自建的组件」。
- 上游更新要手动合并，按「组件换皮清单」复核。

### 方案 B：Mantine v9（未选）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [mantinedev/mantine](https://github.com/mantinedev/mantine) | 31,907 | 2026-11-04 | MIT | v9.7.5、React 19.3；组件齐全：Stepper、Dropzone、Tree、Spotlight、Charts（基于 Recharts） |
| [icflorescu/mantine-datatable](https://github.com/icflorescu/mantine-datatable) | 1,263 | 2026-09-11 | MIT | 数据表 |
| [KevinVandy/mantine-react-table](https://github.com/KevinVandy/mantine-react-table) | 1,105 | 2026-06-05 | MIT | 自述为「Mantine V7 实现」，与 v9 的兼容性需核实 |

**优点**

- 开箱即用：导入向导、拖拽上传、簇树、命令面板都有现成组件。
- 设置 `defaultRadius: 0` 即可得到直角。
- 官方文档示例用的就是 Tabler 图标。

**缺点**

- 偏离 PRD：Mantine 自带一套样式体系，实际上会取代 Tailwind；两者混用要额外处理 preflight 等样式冲突。
- ITEI token 需要映射到 Mantine 的 theme 对象。
- 包体积比 A 大。

**未选原因**：会取代 Tailwind，与 PRD 约定不一致。ITEI 规则只能靠 theme 对象约束，没法像清空 Tailwind 命名空间那样，在类名层面直接拦截违规写法。

### 方案 C：Ant Design 6 + ProComponents（未选）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | 100,076 | 2026-11-04 | MIT | v6.7.0，peer React ≥ 18 |
| [ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro) | 38,929 | 2026-11-04 | MIT | v6.0.3：Umi Max 4.7 / antd 6.6 / pro-components 3.1 / React 19.3 / Tailwind 4.3 |
| [ant-design/pro-components](https://github.com/ant-design/pro-components) | 4,853 | 2026-11-01 | MIT | ProTable、ProLayout、ProForm |
| [antvis/G2](https://github.com/antvis/G2) / [ant-design/ant-design-charts](https://github.com/ant-design/ant-design-charts) | 12,654 / 2,243 | 2026-10-28 / 2026-03-26 | MIT | 配套图表 |

antd 6 默认使用纯 CSS 变量模式，可以开启 `zeroRuntime`，也不再需要 React 19 补丁（[公告](https://github.com/ant-design/ant-design/issues/55804)、[发布说明](https://dev.to/zombiej/ant-design-60-is-released-bfa)）。

**优点**

- 功能最全，一期最快：ProTable 自带查询表单、表格和分页；Steps、Upload.Dragger、Tree、Descriptions 都是现成的。
- 内置中文语言包。
- 国内机构的数据平台普遍采用，维护者和干系人都熟悉。

**缺点**

- 偏离 PRD。
- ITEI 还原度受限：主色、圆角、阴影、字体靠 token 能覆盖大部分，但组件内置的 `@ant-design/icons` 图标和动效很难完全换掉，界面容易带「antd 后台感」，削弱 PPT 式的 ITEI 识别度。
- Ant Design Pro 依赖 Umi Max，会取代现有的 Vite 配置。
- 包体积最大。

**未选原因**：偏离 PRD，ITEI 识别度受限，而且与参考页的报告式版式差距最大。

### 方案 D：其他国产企业级组件库，TDesign / Semi / Arco（未选）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [DouyinFE/semi-design](https://github.com/DouyinFE/semi-design) | 10,466 | 2026-11-04 | GitHub 未识别 | 活跃，主题工具完善 |
| [arco-design/arco-design](https://github.com/arco-design/arco-design) | 5,755 | 2026-10-12 | MIT | 配套的 [arco-design-pro](https://github.com/arco-design/arco-design-pro) 最近提交是 2024-04-26，已停更 |
| [Tencent/tdesign-react](https://github.com/Tencent/tdesign-react) | 974 | 2026-11-04 | MIT | 配套的 [tdesign-react-starter](https://github.com/Tencent/tdesign-react-starter) 仍是 React 18 / Vite 2.9 |

**未选原因**：适配方式与 C 类似，但生态更小，配套模板停更或偏旧。

### 方案 E：IBM Carbon（未选，仅作参考）

| 仓库 | ★ | 最近提交 | 许可证 |
|---|---|---|---|
| [carbon-design-system/carbon](https://github.com/carbon-design-system/carbon) | 9,603 | 2026-11-04 | Apache-2.0 |
| [carbon-design-system/carbon-charts](https://github.com/carbon-design-system/carbon-charts) | 1,054 | 2026-10-29 | Apache-2.0 |

Carbon 的视觉气质与 ITEI 最接近：直角、扁平、靠边线分层、2px 焦点环、数据密度高。

**未选原因**：主题基于 Sass，与 Tailwind 体系不兼容；默认字体是 IBM Plex，IBM 的品牌识别很强，去除成本高；包体积大。表格、表单、焦点等交互细节可以作为参考。

### 方案 F：在 A 之上叠加后台框架，Refine / ra-core（未选，二期按需叠加）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [refinedev/refine](https://github.com/refinedev/refine) | 35,997 | 2026-09-10 | MIT | 有[官方 shadcn/ui 集成](https://refine.dev/docs/ui-integrations/shadcn/introduction)：registry 加 Vite 预设 |
| [marmelab/react-admin](https://github.com/marmelab/react-admin) | 26,984 | 2026-11-04 | MIT | — |
| [marmelab/shadcn-admin-kit](https://github.com/marmelab/shadcn-admin-kit) | 1,143 | 2026-11-03 | MIT | ra-core + shadcn / Base UI + React Router 7 + TanStack Query + ECharts 6 |

**未选原因**：这两者都是 CRUD 框架，提供列表、详情、编辑、新建，以及鉴权和权限。MDES 一期以浏览和分析为主，只有一个导入流程，引入框架的抽象成本大于收益。它们都基于 shadcn，与 A 兼容。如果二期出现指标元数据编辑、用户与权限这类后台需求，再评估叠加。

## 对比矩阵

| 维度 | A shadcn + TW4 | B Mantine 9 | C antd 6 + Pro | D TDesign / Semi / Arco | E Carbon | F A + 后台框架 |
|---|---|---|---|---|---|---|
| ITEI 还原度 | 高：源码在仓库，token 层强制 | 中高 | 中：内置图标和动效难以完全替换 | 中 | 高（需去除 IBM 识别） | 高（同 A） |
| 与 PRD / 现有栈一致 | 高 | 低 | 低 | 低 | 低 | 中高 |
| MDES 功能覆盖 | 中：有少量组件需自建 | 高 | 高 | 中高 | 中高 | 中：偏 CRUD |
| 一期工作量 | 中 | 中低 | 低 | 中 | 中高 | 中 |
| 生态与活跃度 | 高 | 高 | 高 | 中：模板偏旧 | 中 | 高 |
| 包体积 | 小 | 中 | 大 | 中 | 大 | 中 |
| 结论 | **选定** | 未选 | 未选 | 未选 | 仅作参考 | 二期按需叠加 |

## 配套子决策

「默认采用」的意思是：随方案 A 一起落地，实施前如有异议可以调整。

| 子项 | 状态 | 选择 | 备选 / 不采用 |
|---|---|---|---|
| 图表 | **采用** | [ECharts 6](https://github.com/apache/echarts)（67,680★），按需引入加懒加载，规范见「ECharts 使用规范」。ITEI `platforms.md` 点名了它，31 省市的数据也适合做省级地图 | 未选：[Recharts](https://github.com/recharts/recharts)（27,685★），更轻但没有地图；[Tremor](https://github.com/tremorlabs/tremor) 最近提交是 2025-10，活跃度在下降 |
| 路由 | 默认采用 | [React Router 7](https://github.com/remix-run/react-router)（56,634★）：已在依赖中，筛选条件放进 URL query | [TanStack Router](https://github.com/TanStack/router)（15,281★）：search params 的类型安全更强，shadcn-admin 用的就是它 |
| 服务端状态 | 默认采用 | [TanStack Query](https://github.com/TanStack/query)（50,525★）：缓存、取消过期请求、导入后让相关数据失效重拉 | — |
| 表格 | 默认采用 | [TanStack Table](https://github.com/TanStack/table)（28,546★），参考 tablecn | [AG Grid](https://github.com/ag-grid/ag-grid)：一期用不上 |
| token 流水线 | 默认采用 | [Style Dictionary](https://github.com/style-dictionary/style-dictionary)（4,876★）：从 `tokens.json` 统一生成 `tokens.css`、Tailwind theme 和 `tokens.flat.json` | [Tokens Studio](https://github.com/tokens-studio/figma-plugin)：有 Figma 流程时再引入 |
| 整平台替换 | 不采用 | 它们会取代整个应用，而不只是 UI 层，视觉也没法按 ITEI 控制 | [Superset](https://github.com/apache/superset)、[Metabase](https://github.com/metabase/metabase)、[Redash](https://github.com/getredash/redash)、[CKAN](https://github.com/ckan/ckan)、[Cube](https://github.com/cube-js/cube) |

## 交互与信息架构参考（全部保留）

原则：只借鉴交互与信息架构，不复制这些项目的代码、样式或素材，因此不涉及它们的许可证。视觉一律以参考页和 ITEI 设计系统为准。

| 参考 | 借鉴点 | MDES 落点 |
|---|---|---|
| [open-sdg/open-sdg](https://github.com/open-sdg/open-sdg)（实例：[statisticspoland/sdg-indicators-pl](https://github.com/statisticspoland/sdg-indicators-pl)；数据工具：[sdg-build](https://github.com/open-sdg/sdg-build)） | <ul><li>目标 → 指标的层级导航</li><li>指标页分「数据（图 / 表 / 地图）」和「元数据（定义、来源、方法）」两部分</li><li>CSV 驱动的数据流水线</li><li>指标报告状态标识</li></ul> | <ul><li>概览的簇条目</li><li>指标档案的「数据」「规格」两部分</li><li>导入流程</li><li>「待导入」文字标记</li></ul> |
| [owid/owid-grapher](https://github.com/owid/owid-grapher) | <ul><li>图 / 表 / 地图 / 来源的切换</li><li>图表状态（期间、地域、切片）写进 URL，链接可分享</li><li>数据下载</li></ul> | <ul><li>指标档案「数据」部分的图表区，状态写成 `?view=chart&geo=…&period=…`</li><li>导出 CSV</li></ul> |
| [OpenMetadata](https://github.com/open-metadata/OpenMetadata)、[DataHub](https://github.com/datahub-project/datahub)（[Amundsen](https://github.com/amundsen-io/amundsen) 已归档，仅作历史参考） | <ul><li>目录的分面筛选与搜索</li><li>实体详情的分区组织</li><li>lineage 关系展示</li></ul> | <ul><li>指标目录的筛选行</li><li>指标档案的「关联指标」，由规格正文中出现的指标编号生成</li></ul> |
| [alphagov/govuk-frontend](https://github.com/alphagov/govuk-frontend)、[uswds/uswds](https://github.com/uswds/uswds) | 机构型设计系统的落地方式：<ul><li>组件文档写明 do / don't</li><li>可访问性测试</li><li>强约束的 token</li><li>错误信息的写法</li></ul> | <ul><li>版式组件的文档，以及 `/__design` 验收页</li><li>axe 无障碍检查</li><li>错误提示文案</li></ul> |
| [evidence-dev/evidence](https://github.com/evidence-dev/evidence) | 用 SQL + Markdown 生成报告页，报告即代码 | 二期的「专题报告 / 周报」。参考页本身就是周报，可以直接复用本 ADR 的版式组件 |

## Consequences

**正面**

- 规范在 token 层被强制，不存在的类名根本用不了。
- 版式组件与参考页的要素一一对应，可以拿参考页逐项比对验收。
- 包体积小：ECharts 懒加载，微型图不依赖 ECharts。
- 与 PRD 一致。

**负面**

- 参考页与 ITEI 规范有 9 处差异，需要补写进组件文档，否则规范与实现会脱节。
- shadcn 上游更新要手动合并，每次都得按「组件换皮清单」复核。
- 报头字体子集需要一个构建步骤；标题改字时要重新生成。
- API 的错误响应结构会变化，需要同步更新文档与测试。
- 用地图就必须使用合规底图。

## Open Items

1. **差异处理确认**：参考页与 ITEI 规范的 9 处差异，拟按「以参考页为准」处理，见「与 ITEI 规范的差异」。最需要确认的三点：
   - 不再使用渐变页眉；
   - 要点框使用左侧深蓝条；
   - 窄屏不用底部 TabBar。
2. **API 补充项**：是否纳入本轮。
   - 观测值筛选与分页；
   - 导入改为单事务批量插入；
   - 新建 `packages/shared`。
