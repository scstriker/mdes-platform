# ADR-002 — 前端 UI 基座：shadcn/ui + Tailwind v4 + ITEI 组件层

## Status

Accepted（2026-11-04，仓库所有者选定方案 A）

- **已决定**：UI 基座采用方案 A；「交互与信息架构参考」全部保留，只借鉴设计，不引入代码。
- **待决定**：图表库、本轮是否同步修改 API、视觉参考页核对，详见 Open Items。
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
| R1 | 视觉遵循 ITEI 设计系统（`apps/web/design/itei/itei-design-system/`，与 2026-11-04 上传的 zip 逐字节一致）：<ul><li>直角，控件最多 2px</li><li>不靠投影分层</li><li>深蓝是唯一的大面积品牌色，红色每屏至多一处</li><li>45° 斜切</li><li>微软雅黑字体栈，Tabler 图标</li><li>2px 焦点环</li><li>暗色主题由 token 驱动</li></ul> |
| R2 | 现有技术栈：<ul><li>React 19 + Vite + TypeScript</li><li>PRD 约定「Tailwind + shadcn」</li><li>Web 以 SPA 形式部署到 Cloudflare Pages</li><li>API 为 Hono on Workers</li></ul> |
| R3 | 功能：<ul><li>指标目录：7 簇 × 99 项，树 + 筛选 + 表格 / 矩阵</li><li>指标档案：页签、长文规格、图表、观测表</li><li>观测值查询：筛选、分页、导出</li><li>CSV 导入：拖拽上传、预校验、结果、历史</li><li>概览：KPI、覆盖率</li><li>二期：知识库与智能问答面板</li></ul> |
| R4 | 可维护性、许可证（MIT / Apache 优先）、包体积、可访问性、中文语境、对 AI 编码工具友好 |

### 视觉参考

用户指定的参考页 `https://md.sensor-cloud.org/45` 被本次会话的网络策略拦截（代理返回 403），尚未核对，见 Open Items。本 ADR 以 ITEI 设计系统作为视觉基准。

## Decision

采用**方案 A：shadcn/ui + Tailwind v4，在仓库内自建一套与 ITEI 设计系统一一对应的组件层**。

- **基座**：shadcn/ui 的组件源码复制进仓库，按下文「方案 A 落地要点」换皮。Tailwind v4 只开放 ITEI token。
- **骨架**：在现有仓库内自建，不 fork 模板。借鉴 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) 中这几部分的实现：sidebar、全局搜索命令面板、data-table、主题切换。
- **配套**：以下几项默认采用，见「配套子决策」。图表库待定。
  - 路由：React Router 7
  - 服务端状态：TanStack Query
  - 表格：TanStack Table
  - token 流水线：Style Dictionary
- **交互参考**：open-sdg、OWID Grapher、OpenMetadata / DataHub、GOV.UK Frontend / USWDS、Evidence 全部保留。只借鉴交互与信息架构，不复制它们的代码、样式或素材，见「交互与信息架构参考」。

**选定理由**

- 组件源码完全受控，ITEI 规则可以在 token 层强制执行，对任何视觉目标的还原上限都最高。参考站目前还没核对，这一点尤其重要。
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
   - ITEI 组件层，以及用来逐个核对组件的 `/__design` 验收页；
   - React Router 7 路由与 TanStack Query。
3. **页面迁移**：概览 → 指标目录 → 指标档案 → 观测值 → 数据导入。
4. **打磨**
   - 窄屏下表格改为卡片列表；
   - 暗色主题核对；
   - 无障碍检查；
   - 把 README 里的界面验收写成 e2e 测试。

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

- **与设计系统一一对应**：AppHeader、AppFooter、TabBar（窄屏用）、SectionTitle（含 45° 斜切）、NumberedNav、KpiTile、Card、Tag、DataTable、Field。
- **shadcn 没有、MDES 又需要的**：
  - Tree：簇树；
  - Stepper：基于 NumberedNav，用于导入向导；
  - Dropzone：CSV 上传；
  - Descriptions：规格与元数据的键值列表。

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
| 路由 | 默认采用 | [React Router 7](https://github.com/remix-run/react-router)（56,634★）：已在依赖中，筛选条件放进 URL query | [TanStack Router](https://github.com/TanStack/router)（15,281★）：search params 的类型安全更强，shadcn-admin 用的就是它 |
| 服务端状态 | 默认采用 | [TanStack Query](https://github.com/TanStack/query)（50,525★）：缓存、取消过期请求、导入后让相关数据失效重拉 | — |
| 表格 | 默认采用 | [TanStack Table](https://github.com/TanStack/table)（28,546★），参考 tablecn | [AG Grid](https://github.com/ag-grid/ag-grid)：一期用不上 |
| 图表 | **待定** | 建议 [ECharts 6](https://github.com/apache/echarts)（67,680★），按需引入加懒加载。ITEI `platforms.md` 点名了它，31 省市的数据也适合做省级地图 | [Recharts](https://github.com/recharts/recharts)（27,685★）：shadcn charts 的底层，更轻但没有地图；[Tremor](https://github.com/tremorlabs/tremor) 最近提交是 2025-10，活跃度在下降 |
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
- 包体积小。
- 与 PRD 一致。
- 组件层与 ITEI 的 10 个组件一一对应，可以对照 `showcase.html` 逐个验收。

**负面**

- 需要自建 Tree、Stepper、Dropzone、Descriptions。
- shadcn 上游更新要手动合并，每次都得按「组件换皮清单」复核。
- 如果选用 ECharts，体积要靠懒加载控制，地图还需要合规底图。

## Open Items

1. **视觉参考待核对**：`md.sensor-cloud.org` 被会话网络策略拦截。放行方式有两种：
   - 在环境设置的 Network access → Allowed domains 中添加该域名；
   - 或者直接提供截图。

   核对后可能要调整组件细节，基座选型预计不受影响。
2. **图表库**：ECharts 6（建议）还是 Recharts。
3. **本轮是否同步修改 API**：
   - 指标列表返回 `obs_count`；
   - 新增 `/api/stats`；
   - 错误码中文化。
