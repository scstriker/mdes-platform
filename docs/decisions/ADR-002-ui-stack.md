# ADR-002 — 前端 UI 基座：shadcn/ui + Tailwind v4 + ITEI 组件层

## Status

Accepted（2026-11-04，仓库所有者选定）

- **已决定**
  - UI 基座采用方案 A。
  - 「交互与信息架构参考」全部保留，只借鉴设计，不引入代码。
  - 图表库采用 ECharts 6。
  - API 改动纳入本轮，包括 3 项补充改动。
  - 参考页 `https://md.sensor-cloud.org/45` 已于 2026-11-04 核对。只借鉴它的配色带来的第一眼效果；版式、组件和信息架构仍按 ITEI 设计系统。
  - 页眉改为白底加深蓝 / 亮蓝双线，不用渐变横幅（2026-11-05，仓库所有者授权按设计判断决定）。
  - 阶段 1 实施中的 7 项取舍（2026-11-05，仓库所有者确认），见「实施补记」。
  - API 错误处理的 3 项补充约定（2026-11-05，仓库所有者确认），见「API 改动 · 阶段 2 补充约定」。
  - 图表取值的 3 项约定（2026-11-05，仓库所有者确认），见「ECharts 使用规范 · 阶段 3 补充约定」。
  - 前台发布物 + 数据后台双壳信息架构（2026-11-14，仓库所有者确认），见「实施补记 · 发布物双壳」。
- **待确认**：无。
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
  - 窄屏下隐藏了顶部导航，却没有补底部 TabBar；
  - 页脚右侧文字被斜切装饰遮住；
  - 暗色主题下标志落在深蓝底上，违反 ITEI 规范；
  - 图表按期间直接把所有行加总，全国汇总与 31 省市的数据会被重复累加。

### 约束与需求

| 编号 | 需求 |
|---|---|
| R1 | 视觉遵循 ITEI 设计系统（`apps/web/design/itei/itei-design-system/`，与 2026-11-04 上传的 zip 逐字节一致）：<ul><li>直角，控件最多 2px</li><li>不靠投影分层</li><li>深蓝是唯一的大面积品牌色，红色每屏至多一处</li><li>45° 斜切</li><li>微软雅黑字体栈，Tabler 图标</li><li>2px 焦点环</li><li>暗色主题由 token 驱动</li></ul>配色的第一眼效果参照参考页，见「视觉参考：配色借鉴」。 |
| R2 | 现有技术栈：<ul><li>React 19 + Vite + TypeScript</li><li>PRD 约定「Tailwind + shadcn」</li><li>Web 以 SPA 形式部署到 Cloudflare Pages</li><li>API 为 Hono on Workers</li></ul> |
| R3 | 功能：<ul><li>指标目录：7 簇 × 99 项，树 + 筛选 + 表格 / 矩阵</li><li>指标档案：页签、长文规格、图表、观测表</li><li>观测值查询：筛选、分页、导出</li><li>CSV 导入：拖拽上传、预校验、结果、历史</li><li>概览：KPI、覆盖率</li><li>二期：知识库与智能问答面板</li></ul> |
| R4 | 可维护性、许可证（MIT / Apache 优先）、包体积、可访问性、中文语境、对 AI 编码工具友好 |

### 视觉参考

参考页 `https://md.sensor-cloud.org/45` 已于 2026-11-04 核对，只借鉴配色的第一眼效果，见「视觉参考：配色借鉴」。

## Decision

采用**方案 A：shadcn/ui + Tailwind v4，在仓库内自建一套与 ITEI 设计系统一一对应的组件层**。

- **基座**：shadcn/ui 的组件源码复制进仓库，按「方案 A 落地要点」换皮。Tailwind v4 只开放 ITEI token。
- **视觉**：版式与组件按 ITEI 设计系统；配色的用法借鉴参考页的第一眼效果，页眉改为白底加双线，见「视觉参考：配色借鉴」与「页眉：白底加双线」。
- **骨架**：在现有仓库内自建，不 fork 模板。借鉴 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) 中这几部分的实现：sidebar、全局搜索命令面板、data-table、主题切换。
- **配套**：
  - 图表采用 ECharts 6，规范见「ECharts 使用规范」；
  - 路由 React Router 7、服务端状态 TanStack Query、表格 TanStack Table、token 流水线 Style Dictionary，这几项默认采用，见「配套子决策」。
- **API**：本轮一并修改，范围见「API 改动」。
- **交互参考**：open-sdg、OWID Grapher、OpenMetadata / DataHub、GOV.UK Frontend / USWDS、Evidence 全部保留。只借鉴交互与信息架构，不复制它们的代码、样式或素材，见「交互与信息架构参考」。

**选定理由**

- 组件源码完全受控，ITEI 规则可以在 token 层强制执行，对任何视觉目标的还原上限都最高。
- 与 PRD 约定的「Tailwind + shadcn」一致。
- 包体积最小，AI 编码工具对这套栈也最熟悉。

### 后续步骤

1. **清理**
   - 删除未引用的 CSS 与页面；
   - token 改为直接引用设计系统里的正本；
   - 仓库根目录增加 `CLAUDE.md` / `AGENTS.md`，指向 ITEI 规范；
   - 用 Playwright 截取基线图。
2. **基础设施**
   - Tailwind v4 主题；
   - shadcn 初始化与换皮；
   - 新的页面外框（页眉、页脚、窄屏 TabBar、滚动容器），一并解决「现状」里的窄屏导航、页脚遮挡、宽屏滚动条和暗色标志问题，不在旧代码上单独修；
   - ITEI 组件层，以及用来逐个核对组件的 `/__design` 验收页；
   - ECharts 主题；
   - React Router 7 路由与 TanStack Query。
3. **API**：按「API 改动」实施，同步更新 `docs/API.md`、`docs/ACCEPTANCE.md` 与 API 测试。
4. **页面迁移**：概览 → 指标目录 → 指标档案 → 观测值 → 数据导入。
5. **打磨**
   - 窄屏下表格改为卡片列表；
   - 暗色主题核对；
   - 无障碍检查；
   - 把 README 里的界面验收写成 e2e 测试。

## 视觉参考：配色借鉴（2026-11-04 核对）

参考页是一份单页周报「国内医疗装备产业雷达｜2026 年第 45 周」。它用的色值与 ITEI token 完全一致（brand-navy、brand-sky、brand-red、info-bg、ink-muted、border），第一眼观感来自这些颜色的用法和面积比例。本 ADR 只借鉴这一点，版式、组件和信息架构仍按 ITEI 设计系统。

| 颜色 | 参考页的用法 | MDES 落实 |
|---|---|---|
| 白（surface） | 页面底色，大面积留白 | 页面与内容区一律白底；分层靠 1px 边线，不靠灰底和阴影 |
| 深蓝（brand-navy） | 标题文字、序号、粗分隔线；实色块只有底部的页脚条 | 标题、序号、主按钮、当前导航用深蓝；同屏控制深蓝实色块的数量（ITEI 规定两块以上时其余降为 info-bg 底 + 深蓝文字） |
| 亮蓝（brand-sky） | 只做细线：标题下方的分隔线、展开内容左侧的细线、焦点环 | 只用于分隔线、标题下划线、焦点环、图表第二序列，不做文字色 |
| 红（brand-red） | 只做小面积的文字强调（「须跟进」） | 只用于小面积强调与错误，不做大色块 |
| 浅蓝底（info-bg） | 只用在一处重点区块（「本期」） | 用于当前项浅底和少量重点区块 |
| 灰（ink-muted、border） | 次要文字、1px 分隔线 | 说明、来源、时间戳用 ink-muted；行间分隔用 1px border |
| 渐变 / 阴影 / 圆角 | 都没有 | 无阴影分层、直角；页眉改为白底后，全站不再使用渐变（见「页眉：白底加双线」） |

附注：参考页标题用的是 Noto Serif CJK SC Bold 的子集（SIL OFL 1.1 许可，只含标题里的 10 个字，约 6.5 KB）。如果 MDES 在欢迎页使用 ITEI 的 display 字体，可以照此做子集。ITEI 字体栈首选的汉仪粗宋是商业字体，网页内嵌需另行授权。

## 页眉：白底加双线（2026-11-05 决定）

仓库所有者授权按设计判断决定。页眉是每个页面面积最大的色块，ITEI 的渐变横幅会在顶部形成一大块深蓝，与参考页「白底为主、深蓝点缀」的第一眼效果不符，因此改为白底。

| 项 | 做法 |
|---|---|
| 背景与分隔 | 白底（surface）。下沿双线：上 3px brand-navy、下 2px brand-sky，中间留 1px 白缝 |
| 结构 | 沿用 ITEI AppHeader：高 56px；左侧标志、中间当前页标题、右侧主导航 |
| 标志 | 彩色标志（高 28px）直接放在白底上，符合 ITEI 标志规范，不再需要白色斜切标志区 |
| 标题 | brand-navy，20px 加粗 |
| 导航 | 文字用 ink，悬停变 brand-navy；当前项加 2px brand-navy 下划线 |
| 深色主题 | 页眉底色随 surface 变深。按 ITEI「深色底上用白色文字 ITEI 代替标志」的规定，标志换成 ink 色的文字「ITEI」 |
| 窄屏 | 沿用 ITEI：页眉保留标志与标题，导航移到底部 TabBar |

ITEI 的识别元素都保留：

- 45° 斜切留在一级 SectionTitle（每页一处深蓝斜切标题块）和应用页脚右端的装饰；
- 深蓝页脚条保留；
- 全站不再使用渐变。

这一点偏离了 ITEI AppHeader「背景只用渐变」的规定，落地时要在 AppHeader 组件文档里注明本项目的白底变体。

## 方案 A 落地要点

### Tailwind 主题

- **token 唯一来源**：tokens.css 用 `@import "…/tokens.css" layer(base)` 引入。不放进 layer 的样式优先级高于所有工具类，会悄悄覆盖它们。
- **清空默认命名空间**：把 `--color-*`、`--radius-*`、`--shadow-*` 置为 `initial`，只注册 ITEI token 和下表里的 shadcn 语义色。效果如下：
  - `bg-blue-500` 这类写法根本不存在；
  - shadcn 组件里的 `rounded-md/lg/xl` 不再生成样式，组件自动变为直角；需要 2px 圆角的控件要显式写 `rounded-sm`；
  - `shadow-sm` / `shadow-lg` 不再生成样式。浮层（Dialog、Sheet、Popover、DropdownMenu、Select 下拉）改用 `shadow-raised` / `shadow-modal`。
- **删除 shadcn 模板自带的定义**：`globals.css` 里的颜色、`--radius` 派生值和 `.dark` 定义都要删掉，否则会覆盖 ITEI token。
- **文字样式**：title-page、title-section、body、numeral 等注册为 `@utility`，这样才能配合响应式前缀使用。
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
| `--sidebar*` | `--surface-sunken`、`--info-bg`、`--brand-navy`、`--border`、`--focus` | 当前项另加左侧 4px brand-navy 边线（ITEI 桌面导航规范） |

### 组件换皮清单

以后升级 shadcn 时，按这张清单逐项复核。

| 项 | shadcn 默认 | ITEI 要求 |
|---|---|---|
| Button | default / secondary / outline / destructive / ghost / link | <ul><li>改为 primary / secondary（深蓝描边）/ danger / ghost 四种</li><li>尺寸 md 40px、sm 32px</li><li>按下不缩放</li></ul> |
| 焦点环 | `ring-[3px] ring-ring/50` | 统一为 2px `--focus` 实线加 2px 偏移，抽成一个 `@utility` |
| Input / Select | 边线用 `--input`，没有标签约定 | <ul><li>标签放在上方</li><li>错误说明以「✕ 错误：」开头</li><li>必填星号用 brand-red</li><li>高 40px，窄屏 44px</li></ul> |
| Table | 无斑马纹 | <ul><li>表头 surface-sunken 底 + brand-navy 文字 + 2px brand-sky 下边线</li><li>偶数行 surface-sunken，无竖线</li><li>数字列右对齐、等宽数字、千分位</li><li>窄屏改为卡片列表</li></ul> |
| Badge | 圆角胶囊 | <ul><li>改为 ITEI Tag：高 24px、2px 圆角</li><li>浅底 + 前景色 + 6px 色点</li><li>同一列表不超过 3 种色调</li></ul> |
| Skeleton | `animate-pulse` | 改为静态的 surface-sunken 色块，因为 ITEI 只允许 120–200ms 的过渡 |
| 浮层动画 | zoom / fade / slide | 保留 120–200ms 的淡入和位移，去掉缩放 |
| 暗色主题 | `.dark` 类 + `dark:` 前缀 | 改由 ITEI token 驱动（`[data-theme="dark"]` 与系统偏好），删掉组件里的 `dark:` 写法 |
| 图标 | lucide | Tabler（`@tabler/icons-react`），单色线性，颜色跟随 currentColor |

### 需要自建的组件

- **与设计系统一一对应**：AppHeader（白底变体，见「页眉：白底加双线」）、AppFooter、TabBar（窄屏用）、SectionTitle（含 45° 斜切）、NumberedNav、KpiTile、Card、Tag、DataTable、Field。
- **shadcn 没有、MDES 又需要的**：
  - Tree：簇树；
  - Stepper：基于 NumberedNav，用于导入向导；
  - Dropzone：CSV 上传；
  - Descriptions：规格与元数据的键值列表。

## ECharts 使用规范

- **按需引入**：只引入 `echarts/core` 和实际用到的部分（折线、柱状、网格、提示框、aria）。渲染器用 SVG：打印和导出 PDF 更清晰，数据量小时性能也够用。
- **懒加载**：只在指标档案和观测值页加载。KPI 卡片里的迷你图这类简单图形用 CSS / SVG 组件实现，不加载 ECharts。
- **主题从 CSS 变量读取**：
  - 序列色依次用 chart-1 → chart-5；单序列只用 chart-1；需要强调的点（最新期或峰值）用 chart-3；
  - 网格线用 border，坐标文字 ink-muted 12px，字体用 font-sans；
  - 图表标题用 title-sub、左对齐，写在图表外；单序列不显示图例；
  - 提示框直角、1px border、无阴影。
- **动画**：ECharts 默认动画时长是 1000ms，要显式设为 200ms 以内或直接关闭（ITEI 只允许 120–200ms 的过渡）。
- **无障碍**：开启 `aria`，自动生成图表描述；图下方保留数据表。
- **主题切换**：切换时重建图表实例，以读取新的 token 值。
- **地图**：ECharts 从 5.0 起不再内置中国地图，需要自己注册 GeoJSON。对外展示时必须使用带审图号的合规底图。

### 阶段 3 补充约定（2026-11-05 仓库所有者确认）

图表先选切片再画：周期粒度、地域、单位与 dims 各键各选定一个值，不跨维度、跨单位、跨周期粒度加总；只有地域或某个 dims 键可以展开成对比序列（实现见 `apps/web/src/lib/observations/slice.ts`）。在此基础上：

| 项 | 结论 |
|---|---|
| 重复期间 | 同一切片同一期间有多条记录（如重复导入）时，图表取最近导入的一条，不加总；页面注明重复条数，数据表把未采用的记录标为「重复」。只约定显示方式，入库仍按 PRD「允许追加、不做 upsert」 |
| 序列上限 | 对比序列最多 5 条（chart-1…5），按最新一期数值取前 5 条；其余不画进图，在数据表里标为「未画出」，并有提示 |
| 序列标记 | 多序列折线按顺序使用圆、方、三角、菱形、空心圆五种标记，图例显示形状，序列不只靠颜色区分。起因：深色主题下 chart-1（#5cb3ea）与 chart-2（#4fa3dc）几乎无法区分；token 不在本项目里改，需反馈给设计系统维护方 |

## API 改动（本轮）

### 核心改动

| 改动 | 说明 |
|---|---|
| `GET /api/indicators` 列表增加 `obs_count` | 用一次 LEFT JOIN 聚合返回每个指标的观测值条数。同一接口建议再带上两个字段：<ul><li>`latest_period`：最近期间</li><li>`automation`：采集方式，取自 `spec_json`，供目录筛选</li></ul> |
| 新增 `GET /api/stats` | 返回概览页需要的统计：<ul><li>指标总数、一期数、一期已入库数</li><li>观测值总数与数据截止期间</li><li>各簇的一期数、一期已入库数、后期数、观测值数</li><li>最近一次导入批次</li></ul> |
| 错误码与中文文案 | <ul><li>错误统一返回 `{ error: { code, message, params } }`</li><li>CSV 行错误返回 `{ line, code, params }`</li><li>前端按 code 映射成中文提示，例如「第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试」</li><li>code 列表：`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`、`ROW_LIMIT_EXCEEDED`、`REQUIRED_FIELD_MISSING`、`INVALID_VALUE_NUM`、`VALUE_MISSING`、`DIMS_INVALID_JSON`、`DIMS_NOT_OBJECT`、`UNKNOWN_INDICATOR`、`NOT_FOUND`</li></ul> |

### 补充改动（2026-11-05 确认纳入）

| 改动 | 原因 |
|---|---|
| `GET /api/observations` 增加 `geo`、`batch_id`、`period_from`、`period_to`、`offset` 参数，并返回 `total` | 观测值页的筛选与分页、导入结果里的「查看本批次数据」都依赖它 |
| `POST /api/import/csv` 改为单事务 + 分块批量插入 | 现在是逐行插入，而且不在事务里：5000 行要 5000 次数据库往返；中途失败会留下一部分数据，批次却已经标为完成 |
| 新建 `packages/shared` | 存放共享类型和 CSV 解析器（从 `apps/api/src/csv.ts` 移入），导入页可以用同一套规则在前端做预校验 |

实施时同步更新 `docs/API.md`、`docs/ACCEPTANCE.md` 与 API 测试。

### 阶段 2 补充约定（2026-11-05 仓库所有者确认）

| 项 | 结论 |
|---|---|
| 意外异常 | 新增错误码 `INTERNAL_ERROR`（HTTP 500，`/api/health` 为 503），不暴露内部细节。查询参数宽松处理：非法 `limit` / `offset` 回落到默认值，格式不对的 `batch_id` 查不到数据，不新增 `INVALID_PARAM` |
| 导入全部行失败 | 仍记录 `failed` 批次并返回 200 `{ batch_id, status, row_ok, row_err, errors }`；文件级问题（`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`、`ROW_LIMIT_EXCEEDED`）返回 400、不建批次 |
| 错误体的 `message` | 英文开发者说明（如 `unknown indicator_id: TRD-099`）；中文文案只在前端按 `code` 生成，`packages/shared` 只放错误码与参数类型 |

## 实施补记（2026-11-05 阶段 1 确认）

阶段 1 实施中遇到 ADR 没写到的情况，以下 7 项由仓库所有者确认。

| # | 项 | 结论 | 理由 |
|---|---|---|---|
| 1 | Tailwind 命名空间 | 在 `--color-*`、`--radius-*`、`--shadow-*` 之外，再清空 `--text-*`、`--font-*`、`--inset-shadow-*`、`--drop-shadow-*`、`--text-shadow-*`；渐变色（`gradient-start`、`gradient-end`、`on-gradient`）与 `radius-md` 不注册为工具类 | 只留 ITEI 字号体系；在 token 层执行「全站不用渐变」和「`rounded-md` 不生成样式」 |
| 2 | 依赖版本 | `react-router-dom` 换成同为 7.x 的 `react-router`；TanStack Table 用 v9 | React Router v7 已把两个包合并；v9 是 TanStack Table 当前主版本 |
| 3 | Stepper 未开始项 | 用 `surface-sunken` 底 + `ink-muted` 字，不用 NumberedNav 默认的深蓝实底；已完成 `info-bg` + 对勾，当前项 `brand-red` | ITEI「同屏深蓝实色块两块以上时其余降为浅底」 |
| 4 | 对话框 / 抽屉遮罩 | `surface-sunken` 80% 半透明，不用黑色 | 浅色主题是白雾、深色主题是深底，两边都不写死颜色 |
| 5 | showcase 与 README 冲突 | Button 横向内边距按 README 取 `space-5`（24px）；DataTable 表头文字按 showcase 用 13px 加粗 | README 是规则；表头 16px 在数据表里过大，showcase 的 13px 更贴近实际用法 |
| 6 | `/__design` | 随生产包发布，不放进导航 | 部署后可以直接对照验收 |
| 7 | shadcn 组件来源 | 当前环境的网络策略拦截 ui.shadcn.com，组件源码从 GitHub 上 shadcn 仓库（`apps/v4/registry/new-york-v4/ui`）手工复制，等同 CLI 添加；保留 `apps/web/components.json`，以后可照常用 CLI | 源码与 CLI 拉取的一致，换皮按「组件换皮清单」 |

## 实施补记（阶段 4）

- 端到端测试用 `@playwright/test`（与环境预装浏览器同版本 1.63.0），配置见 `apps/web/playwright.config.ts`：自带 API（8788）与 Web（5174）；API 原先连独立库 `mdes_e2e`，改用 D1 后为 `wrangler dev` + 本地 D1（`apps/api/.wrangler/e2e`，每次重建），见 ADR-003。
- axe 检查用 `@axe-core/playwright`，许可证 MPL-2.0（不在 R4 优先的 MIT / Apache 之列）；只作为开发依赖跑测试，不进产品包。
- axe 发现并已修复：页眉标志链接的可访问名称不含可见文字（WCAG 2.5.3）；段落里的链接只靠颜色区分（WCAG 1.4.1），`TextLink` 增加常显下划线的 `inline` 用法，用于正文中的链接。

## 实施补记 · 发布物双壳（2026-11-14）

仓库所有者确认：产品定位改为「前台看、后台管」。PRD 同步补记。

| # | 项 | 结论 |
|---|---|---|
| 1 | 信息架构 | 前台主导航：态势总览 / 运行监测 / 区域画像 / 研究发布 / 指标体系；「数据后台」放页眉右侧工具区。观测值与导入退出主导航，迁入 `/admin/*` |
| 2 | 页眉标题位 | 放产品名「医疗器械产业运行监测」，不再跟路由 handle 换页名 |
| 3 | 刊头字体 | 结论式大标题用 `display-hero`（一屏一次）；网页内嵌用 Noto Serif SC 子集（OFL），不嵌入商业汉仪粗宋 |
| 4 | 大号数字 | 新增文字样式 `numeral-lg`（36px / 40px，sans），用于发布物通栏核心指标；写入 `tokens.json` |
| 5 | 涨跌色 | 涨跌只用箭头与文字，不用红绿；红色只表示强调或危险 |
| 6 | 本期发布 / 研判 | 本轮不做编辑 CMS；首页用示意文案与编辑位占位 |
| 7 | 导入通道 | 后台分「表格导入」与「文件+解析结果配对」两条通道；不按指标开长期 git branch，指标差异用 mapper 模块叠 PR |

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

- 缺少 Tree、Stepper、Dropzone、Descriptions，需要自建，这几个组件都不复杂。
- 上游更新要手动合并，按「组件换皮清单」复核。

适配做法见上文「方案 A 落地要点」。

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

**未选原因**：偏离 PRD，ITEI 识别度受限。

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
| MDES 功能覆盖 | 中：需自建 4 个组件 | 高 | 高 | 中高 | 中高 | 中：偏 CRUD |
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

ECharts 从 5.0 起不再内置中国地图，需要自己注册 GeoJSON。对外展示时必须使用带审图号的合规底图。

## 交互与信息架构参考（全部保留）

原则：只借鉴交互与信息架构，不复制这些项目的代码、样式或素材，因此不涉及它们的许可证。视觉一律以 ITEI 设计系统为准。

| 参考 | 借鉴点 | MDES 落点 |
|---|---|---|
| [open-sdg/open-sdg](https://github.com/open-sdg/open-sdg)（实例：[statisticspoland/sdg-indicators-pl](https://github.com/statisticspoland/sdg-indicators-pl)；数据工具：[sdg-build](https://github.com/open-sdg/sdg-build)） | <ul><li>目标 → 指标的层级导航</li><li>指标页分「数据（图 / 表 / 地图）」和「元数据（定义、来源、方法）」两个页签</li><li>CSV 驱动的数据流水线</li><li>指标报告状态标识</li></ul> | <ul><li>概览页的簇导航</li><li>指标档案的「数据 / 规格」页签</li><li>导入流程</li><li>数据状态 Tag（已入库 / 未入库）</li></ul> |
| [owid/owid-grapher](https://github.com/owid/owid-grapher) | <ul><li>图 / 表 / 地图 / 来源四个页签</li><li>图表状态（期间、地域、切片）写进 URL，链接可分享</li><li>数据下载</li></ul> | <ul><li>指标档案「数据」页签的图表区，状态写成 `?tab=chart&geo=…&period=…`</li><li>导出 CSV</li></ul> |
| [OpenMetadata](https://github.com/open-metadata/OpenMetadata)、[DataHub](https://github.com/datahub-project/datahub)（[Amundsen](https://github.com/amundsen-io/amundsen) 已归档，仅作历史参考） | <ul><li>目录的分面筛选与搜索</li><li>实体详情的多页签</li><li>lineage 关系展示</li></ul> | <ul><li>指标目录的筛选栏</li><li>指标档案的「关联指标」页签，由规格正文中出现的指标编号生成</li></ul> |
| [alphagov/govuk-frontend](https://github.com/alphagov/govuk-frontend)、[uswds/uswds](https://github.com/uswds/uswds) | 机构型设计系统的落地方式：<ul><li>组件文档写明 do / don't</li><li>可访问性测试</li><li>强约束的 token</li><li>错误信息的写法</li></ul> | <ul><li>`components/itei` 的组件文档与 `/__design` 验收页</li><li>axe 无障碍检查</li><li>错误提示文案</li></ul> |
| [evidence-dev/evidence](https://github.com/evidence-dev/evidence) | 用 SQL + Markdown 生成报告页，报告即代码 | 二期的「专题报告」（PPT 式报告页） |

## Consequences

**正面**

- 规范在 token 层被强制，不存在的类名根本用不了。
- 包体积小：ECharts 只在需要的页面懒加载。
- 与 PRD 一致。
- 组件层与 ITEI 的 10 个组件一一对应，可以对照 `showcase.html` 逐个验收。

**负面**

- 需要自建 Tree、Stepper、Dropzone、Descriptions。
- shadcn 上游更新要手动合并，每次都得按「组件换皮清单」复核。
- 用地图就必须使用合规底图。
- API 的错误响应结构会变化，需要同步更新文档与测试。
- 页眉偏离 ITEI AppHeader 的渐变要求，需要在组件文档中注明。

## Open Items

无。实施中遇到需要决策的问题，在本 ADR 中补记结论。
