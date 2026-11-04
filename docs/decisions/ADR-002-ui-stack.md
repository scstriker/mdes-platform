# ADR-002 — 前端 UI 基座与重构方案选型

## Status

Proposed（待决策）

调研数据截至 2026-11-04，来源为 GitHub 搜索 API 与各仓库 `package.json`。star 数和提交日期会变，决策时以仓库实时数据为准。

## Context

### 现状

- 实际生效的前端代码只有 `App.tsx`（单文件，所有页面写在一起）、`tokens.css`、`itei-app.css`。`styles.css`、`itei-theme.css`、`itei-tokens.css`、`index.css` 以及 `src/pages/*` 都没有被引用。
- Tailwind 插件已配置，但唯一导入它的 `index.css` 没被引用，所以实际没有生成任何工具类。`react-router-dom` 已安装但未使用。
- 界面与 README / ACCEPTANCE 不一致：没有阶段筛选，没有观测值页，后期 69 个指标在界面上不可见。
- 已确认的问题：
  - 窄屏下隐藏了顶部导航，却没有补底部 TabBar；
  - 页脚右侧文字被斜切装饰遮住；
  - 暗色主题下标志落在深蓝底上，违反 ITEI 规范；
  - 图表按期间把所有行直接加总，全国汇总与 31 省市的数据会被重复累加。

### 约束与需求

| 编号 | 需求 |
|---|---|
| R1 | 视觉遵循 ITEI 设计系统（`apps/web/design/itei/itei-design-system/`，与 2026-11-04 上传的 zip 逐字节一致）：直角（控件最多 2px）、不靠投影分层、深蓝为唯一大面积品牌色、红色每屏至多一处、45° 斜切、微软雅黑字体栈、Tabler 图标、2px 焦点环、暗色主题由 token 驱动 |
| R2 | 现有栈：React 19 + Vite + TypeScript；PRD 约定「Tailwind + shadcn」；Web 以 SPA 形式部署到 Cloudflare Pages，API 为 Hono on Workers |
| R3 | 功能：指标目录（7 簇 × 99 项：树 + 筛选 + 表格 / 矩阵）、指标档案（页签、长文规格、图表、观测表）、观测值查询（筛选、分页、导出）、CSV 导入（拖拽上传、预校验、结果、历史）、概览（KPI、覆盖率）。二期增加知识库与智能问答面板 |
| R4 | 可维护性、许可证（MIT / Apache 优先）、包体积、可访问性、中文语境、对 AI 编码工具友好 |

### 视觉参考

用户指定的参考页 `https://md.sensor-cloud.org/45` 被本次会话的网络策略拦截（代理 403），尚未核对，见 Open Items。本 ADR 以 ITEI 设计系统作为视觉基准。

## Decision Drivers

1. ITEI 还原度（最高权重）：能否在 token 层强制规范，而不是靠人工自觉
2. 与 PRD 及现有栈一致
3. MDES 功能覆盖
4. 一期工作量
5. 生态活跃度与许可证
6. 包体积，以及 AI 编码工具的生成质量

## 调研范围

覆盖以下几类，共筛选约 60 个仓库，下表记录其中约 45 个：

- shadcn / Tailwind 后台模板
- React 企业级组件库（含国产）
- 后台框架
- 数据目录 / 元数据平台
- 指标与统计门户（SDG）
- BI 平台
- 机构型设计系统
- Token 流水线
- 图表、表格、路由与状态管理

## Considered Options

### 方案 A：shadcn/ui + Tailwind v4，自建 ITEI 组件层

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 127,358 | 2026-11-04 | MIT | 组件源码复制进仓库，完全可控 |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | 16,544 | 2026-09-10 | MIT | Vite 8 / React 19.2 / Tailwind 4.2 / TanStack Router + Query + Table / Recharts 3；README 自述「不是 starter 模板」 |
| [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template) | 1,256 | 2026-10-28 | MIT | 有 Vite 版：React 19.3 / Tailwind 4.3 / React Router 7 / TanStack Table 9 |
| [sadmann7/tablecn](https://github.com/sadmann7/tablecn) | 6,375 | 2026-11-03 | MIT | 基于 shadcn 的数据表：排序、筛选、分页 |
| [jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) | 10,519 | 2026-09-03 | Apache-2.0 | shadcn 主题可视化编辑器，可用来预览 ITEI 换皮效果 |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 7,227 | 2026-11-03 | MIT | Next.js 16，不是 Vite SPA，仅作参考 |
| [vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) | 33,746 | 2026-11-04 | MIT | Vue 3 + shadcn 风格，技术栈不符；说明 shadcn 路线在国内中后台已有大规模实践 |

**ITEI 适配要点**

- shadcn 的语义变量直接映射到 ITEI token：`--background → --surface`、`--foreground → --ink`、`--primary → --brand-navy`、`--primary-foreground → --on-brand`、`--muted → --surface-sunken`、`--accent → --info-bg`、`--ring → --focus`、`--destructive → --danger`。两边都叫 `--border`，语义也相同。
- `--radius` 及其派生值置 0（控件 2px），所有组件自动变为直角。
- 清空 Tailwind 默认的阴影和颜色命名空间：组件里残留的 `shadow-sm` 不再生成样式，`bg-blue-500` 这类写法根本不存在。
- 图标从 lucide 换成 Tabler（`@tabler/icons-react`），这是 ITEI 规范指定的图标库。
- 45° 斜切做成独立组件：AppHeader 标志区、一级 SectionTitle、NumberedNav、Footer。
- tokens.css 用 `@import … layer(base)` 引入。不进层的样式优先级高于所有工具类。

**优点**

- 与 PRD 一致。
- ITEI 规则可以在 token 层强制执行。
- 包体积最小。
- AI 编码工具对这套栈最熟悉。

**缺点**

- 缺少 Tree、Stepper、Dropzone、Descriptions，需要自建。这几个组件都比较简单。
- 上游更新需要手动合并。

### 方案 B：Mantine v9

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [mantinedev/mantine](https://github.com/mantinedev/mantine) | 31,907 | 2026-11-04 | MIT | v9.7.5、React 19.3；组件齐全：Stepper、Dropzone、Tree、Spotlight、Charts（基于 Recharts） |
| [icflorescu/mantine-datatable](https://github.com/icflorescu/mantine-datatable) | 1,263 | 2026-09-11 | MIT | 数据表 |
| [KevinVandy/mantine-react-table](https://github.com/KevinVandy/mantine-react-table) | 1,105 | 2026-06-05 | MIT | 自述为「Mantine V7 实现」，与 v9 的兼容性需核实 |

**优点**

- 开箱即用，导入向导、拖拽上传、簇树、命令面板都有现成组件。
- `defaultRadius: 0` 即可得到直角。
- 官方文档示例使用的就是 Tabler 图标。

**缺点**

- 偏离 PRD：Mantine 自带一套样式体系，实际上会取代 Tailwind；两者混用需要额外处理 preflight 等样式冲突。
- ITEI token 需要映射到 Mantine 的 theme 对象。
- 包体积比 A 大。

### 方案 C：Ant Design 6 + ProComponents

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | 100,076 | 2026-11-04 | MIT | v6.7.0，peer React ≥ 18 |
| [ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro) | 38,929 | 2026-11-04 | MIT | v6.0.3：Umi Max 4.7 / antd 6.6 / pro-components 3.1 / React 19.3 / Tailwind 4.3 |
| [ant-design/pro-components](https://github.com/ant-design/pro-components) | 4,853 | 2026-11-01 | MIT | ProTable、ProLayout、ProForm |
| [antvis/G2](https://github.com/antvis/G2) / [ant-design/ant-design-charts](https://github.com/ant-design/ant-design-charts) | 12,654 / 2,243 | 2026-10-28 / 2026-03-26 | MIT | 配套图表 |

antd 6 默认使用纯 CSS 变量模式，可开启 `zeroRuntime`，不再需要 React 19 补丁（[公告](https://github.com/ant-design/ant-design/issues/55804)、[发布说明](https://dev.to/zombiej/ant-design-60-is-released-bfa)）。

**优点**

- 功能最全，一期最快：ProTable 自带查询表单、表格和分页；Steps、Upload.Dragger、Tree、Descriptions 都是现成的。
- 内置中文语言包。
- 国内机构数据平台普遍采用，维护者和干系人都熟悉。

**缺点**

- 偏离 PRD。
- ITEI 还原度受限：主色、圆角、阴影、字体靠 token 可以覆盖大部分，但组件内置的 `@ant-design/icons` 图标和动效很难完全换掉，界面容易带「antd 后台感」，削弱 PPT 式的 ITEI 识别度。
- Ant Design Pro 依赖 Umi Max，会取代现有的 Vite 配置。如果选这条路线，建议直接在 Vite 上用 antd + pro-components，不引入 Umi。
- 包体积最大。

### 方案 D：其他国产企业级组件库（TDesign / Semi / Arco）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [DouyinFE/semi-design](https://github.com/DouyinFE/semi-design) | 10,466 | 2026-11-04 | GitHub 未识别 | 活跃，主题工具完善 |
| [arco-design/arco-design](https://github.com/arco-design/arco-design) | 5,755 | 2026-10-12 | MIT | 配套的 [arco-design-pro](https://github.com/arco-design/arco-design-pro) 最近提交为 2024-04-26，已停更 |
| [Tencent/tdesign-react](https://github.com/Tencent/tdesign-react) | 974 | 2026-11-04 | MIT | 配套的 [tdesign-react-starter](https://github.com/Tencent/tdesign-react-starter) 仍是 React 18 / Vite 2.9 |

适配方式与 C 类似，但生态更小，配套模板停更或偏旧。除非机构内部已有既定偏好，否则不推荐。

### 方案 E：IBM Carbon

| 仓库 | ★ | 最近提交 | 许可证 |
|---|---|---|---|
| [carbon-design-system/carbon](https://github.com/carbon-design-system/carbon) | 9,603 | 2026-11-04 | Apache-2.0 |
| [carbon-design-system/carbon-charts](https://github.com/carbon-design-system/carbon-charts) | 1,054 | 2026-10-29 | Apache-2.0 |

Carbon 的视觉气质与 ITEI 最接近：直角、扁平、靠边线分层、2px 焦点环、数据密度高。

不推荐直接采用：

- 主题基于 Sass，默认字体是 IBM Plex，IBM 的品牌识别很强，去除成本高；
- 与 Tailwind 体系不兼容；
- 包体积大。

建议只作为表格、表单、焦点等交互细节的参考。

### 方案 F：在 A 之上叠加后台框架（Refine / ra-core）

| 仓库 | ★ | 最近提交 | 许可证 | 要点 |
|---|---|---|---|---|
| [refinedev/refine](https://github.com/refinedev/refine) | 35,997 | 2026-09-10 | MIT | 有[官方 shadcn/ui 集成](https://refine.dev/docs/ui-integrations/shadcn/introduction)：registry 加 Vite 预设 |
| [marmelab/react-admin](https://github.com/marmelab/react-admin) | 26,984 | 2026-11-04 | MIT | — |
| [marmelab/shadcn-admin-kit](https://github.com/marmelab/shadcn-admin-kit) | 1,143 | 2026-11-03 | MIT | ra-core + shadcn / Base UI + React Router 7 + TanStack Query + ECharts 6 |

这两者都是 CRUD 框架：列表、详情、编辑、新建，加上鉴权和权限。MDES 一期以浏览和分析为主，只有一个导入流程，框架带来的抽象成本大于收益。

它们都基于 shadcn，与 A 兼容。如果二期出现指标元数据编辑、用户与权限等后台需求，可以再叠加。

## 对比矩阵

| 维度 | A shadcn + TW4 | B Mantine 9 | C antd 6 + Pro | D TDesign / Semi / Arco | E Carbon | F A + 后台框架 |
|---|---|---|---|---|---|---|
| ITEI 还原度 | 高：源码在仓库，token 层强制 | 中高 | 中：内置图标和动效难以完全替换 | 中 | 高（需去除 IBM 识别） | 高（同 A） |
| 与 PRD / 现有栈一致 | 高 | 低 | 低 | 低 | 低 | 中高 |
| MDES 功能覆盖 | 中：需自建 4 个组件 | 高 | 高 | 中高 | 中高 | 中：偏 CRUD |
| 一期工作量 | 中 | 中低 | 低 | 中 | 中高 | 中 |
| 生态与活跃度 | 高 | 高 | 高 | 中：模板偏旧 | 中 | 高 |
| 包体积 | 小 | 中 | 大 | 中 | 大 | 中 |
| 结论 | **推荐** | 备选：看重开箱即用 | 备选：看重速度和国内熟悉度 | 不推荐 | 仅作参考 | 二期按需叠加 |

## 配套子决策

以下选择与基座无关，A、B、C 都适用。

| 子项 | 建议 | 备选 / 不采用 |
|---|---|---|
| 路由 | [React Router 7](https://github.com/remix-run/react-router)（56,634★）：已在依赖中，筛选条件放进 URL query | [TanStack Router](https://github.com/TanStack/router)（15,281★）：search params 类型安全更强，shadcn-admin 用的就是它 |
| 服务端状态 | [TanStack Query](https://github.com/TanStack/query)（50,525★）：缓存、取消请求、导入后失效重拉 | — |
| 表格 | [TanStack Table](https://github.com/TanStack/table)（28,546★），参考 tablecn | [AG Grid](https://github.com/ag-grid/ag-grid)：一期用不上 |
| 图表 | [ECharts 6](https://github.com/apache/echarts)（67,680★），按需引入加懒加载。ITEI `platforms.md` 点名了它；31 省市数据适合做省级地图 | [Recharts](https://github.com/recharts/recharts)（27,685★）：shadcn charts 的底层，更轻但没有地图；[Tremor](https://github.com/tremorlabs/tremor) 最近提交为 2025-10，活跃度下降 |
| Token 流水线 | [Style Dictionary](https://github.com/style-dictionary/style-dictionary)（4,876★）：从 `tokens.json` 生成 `tokens.css`、Tailwind theme 和 `tokens.flat.json`，单一来源 | [Tokens Studio](https://github.com/tokens-studio/figma-plugin)：有 Figma 流程时再引入 |
| 整平台替换 | 不采用。它们会取代整个应用而不只是 UI 层，视觉也无法按 ITEI 控制 | [Superset](https://github.com/apache/superset)、[Metabase](https://github.com/metabase/metabase)、[Redash](https://github.com/getredash/redash)、[CKAN](https://github.com/ckan/ckan)、[Cube](https://github.com/cube-js/cube) |

ECharts 5 起不再内置中国地图，需要自行注册 GeoJSON。对外展示时必须使用带审图号的合规底图。

## 交互与信息架构参考（只借鉴，不引入依赖）

| 参考 | 可借鉴之处 |
|---|---|
| [open-sdg/open-sdg](https://github.com/open-sdg/open-sdg)（[波兰统计局实例](https://github.com/statisticspoland/sdg-indicators-pl)） | 国家级指标报告平台，与 MDES 同构：目标 → 指标对应簇 → 指标；指标页包含图 / 表 / 地图页签和元数据页签（定义、来源、方法）；数据流水线由 CSV 驱动（[sdg-build](https://github.com/open-sdg/sdg-build)）。是「指标档案」页的直接参照 |
| [owid/owid-grapher](https://github.com/owid/owid-grapher) | 图 / 表 / 地图 / 来源四个页签；图表状态编码进 URL，可分享；支持数据下载 |
| [OpenMetadata](https://github.com/open-metadata/OpenMetadata)、[DataHub](https://github.com/datahub-project/datahub) | 目录页的分面筛选，实体详情页签，lineage（可对应 MDES 的「关联指标」）。[Amundsen](https://github.com/amundsen-io/amundsen) 已归档 |
| [alphagov/govuk-frontend](https://github.com/alphagov/govuk-frontend)、[uswds/uswds](https://github.com/uswds/uswds) | 机构型设计系统的落地方式：组件文档写明 do / don't、可访问性测试、强约束的 token。与 ITEI README 的结构一致 |
| [evidence-dev/evidence](https://github.com/evidence-dev/evidence) | 用 SQL + Markdown 生成报告页，可作为二期「专题报告」的参考 |

## Decision Outcome（建议）

建议选择**方案 A**，具体组合如下：

- **基座**：shadcn/ui + Tailwind v4。ITEI token 映射为 shadcn 语义变量，`--radius` 置 0，清空默认的阴影和颜色命名空间，图标换成 Tabler。
- **骨架**：在现有仓库内自建，不 fork 模板。从 satnaing/shadcn-admin 借鉴 sidebar、全局搜索命令面板、data-table、主题切换的实现。路由沿用 React Router 7。
- **数据与图表**：TanStack Query + TanStack Table；ECharts 6 按需引入加懒加载。
- **Token**：用 Style Dictionary 统一生成，删除仓库里另外两份 token 拷贝。
- **信息架构**：借鉴 open-sdg、OWID、OpenMetadata。

选 A 的理由：参考站最终是什么视觉效果，现在还不确定。在所有方案里，只有 A 能让组件源码完全受控，因此对任何视觉目标的还原上限最高。

**备选**：如果更看重一期交付速度和国内中后台的熟悉度，并且能接受偏离 PRD 和 ITEI 识别度，就选 C：在 Vite 上直接用 antd 6 + pro-components，不引入 Umi Max。

## Consequences

**正面**

- 规范在 token 层被强制，不存在的类名无法使用。
- 包体积小。
- 与 PRD 一致。
- 组件层与 ITEI 的 10 个组件一一对应，便于对照 `showcase.html` 验收。

**负面**

- 需要自建 Tree、Stepper、Dropzone、Descriptions。
- shadcn 上游更新需要手动合并。
- ECharts 体积需要靠懒加载控制。
- 地图需要合规底图。

## Open Items

1. **视觉参考待核对**：`md.sensor-cloud.org` 被会话网络策略拦截。放行方式：在环境设置的 Network access → Allowed domains 中添加该域名，或直接提供截图。核对后可能调整组件细节，基座选型预计不受影响。
2. **待拍板**：
   - 基座（A / C）；
   - 图表库（ECharts / Recharts）；
   - 本轮是否同步修改 API（在指标列表中返回 `obs_count`、新增 `/api/stats`、错误码中文化）。
