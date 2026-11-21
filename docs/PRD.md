# Product Requirements Document — MDES Demo Phase 1

## 1. Context

医疗器械产业数据系统（MDES）需要一个可演示的数据底座：先把 V12 指标体系与观测值装进库、能导入能查看，再演进知识库与智能体。本仓库是 **Cloudflare 优先的轻量 demo**，不是所内生产平台。

产品对外呈现为**产业运行监测发布物**（态势总览、指标体系、三级指标解读），数据运维退到「数据后台」。定位：面向医疗器械产业运行监测、产业态势研判与政府决策支持的产业数据平台示意。

## 2. Problem Statement

指标规格已调研完成（V12），但缺少统一入库与浏览通路；后续知识库/智能体需要稳定的指标与事实层，不能从 mock 前端硬编码起步。同时，仅按「目录 / 导入 / 查询」组织的界面像内部后台，不利于向决策受众演示「产业现在怎么样」。

## 3. Goals

- 将 V12 指标元数据（含一期 30 项）入库并可浏览
- 支持 CSV 观测值导入与按指标/期间查询
- 使用 Cloudflare D1，并预留知识库文档与 Agent 表（本轮不存向量）
- 优先可部署到 Cloudflare（Pages + Workers + D1）
- **前台看、后台管**：前台以发布物版式展示态势与指标体系；入库、校验、批次管理在数据后台

## 4. Non-goals

- 智能问答、Agent 运行时、真实 embedding 管线
- Wind 直连、爬虫采集、复杂鉴权
- 报告导出、知识图谱、大屏可视化精修
- 所级多子系统生产治理流程
- 「本期发布」编辑 CMS、研判文案撰写流程（本轮用示意文案与编辑位占位）
- 登录与权限体系（仅数据管理员占位）

## 5. Users and Actors

| Actor | Need / Responsibility |
|---|---|
| 决策 / 研判读者（演示受众） | 在前台阅读本期态势、指标体系与三级指标解读 |
| 演示讲解人 | 展示发布物阅读与数据入库闭环 |
| 领域数据负责人 | 在数据后台用表格或文件+解析结果灌入样例 |
| 后续开发 | 在预留表/API 上接 KB 与 Pi Agent |

## 6. Usage Scenarios

### Scenario 1 — 阅读本期态势

打开「态势总览」，按发布物阅读顺序看到：期次与编制信息、结论式标题、研判要点、通栏核心指标、本期焦点图与七维态势；屏末可有至多 3 条「延伸阅读」（链到指标或「研究发布」栏目），首页不做政策/研究资讯列表。经「指标体系」进入方法论与三级指标页。

### Scenario 2 — 后台导入样例

从页眉进入「数据后台」，在概况查看入库状态；经表格导入或文件配对导入写入数据（CSV 观测值路径仍可用）。

## 7. Functional Requirements

### FR-001 — 指标目录

**Requirement:** 系统展示 V12 指标元数据；一期 30 项可识别；支持按簇筛选。

**Acceptance:** AC-001

### FR-002 — 观测值导入

**Requirement:** 支持 CSV 上传导入观测值（demo 行数上限），记录导入批次与错误。

**Acceptance:** AC-002

### FR-003 — 观测值查询

**Requirement:** 可按 indicator_id、period 查询已导入观测值。

**Acceptance:** AC-003

### FR-004 — 健康检查与预留表

**Requirement:** 健康检查报告数据库可用；知识库预留表（`document` / `document_chunk`）可写入（可不经 UI）。本轮不含向量（ADR-003）。

**Acceptance:** AC-004

### FR-005 — Cloudflare 部署路径

**Requirement:** 文档与配置支持将 Web 部署到 Pages、API 部署到 Workers，数据存于 D1。

**Acceptance:** AC-005

## 8. Non-functional Requirements

### NFR-001 — Demo 体量

**Requirement:** 单次 CSV 导入默认上限 5000 行，避免 Worker CPU/内存打满。

**Measurement / verification:** 超限返回 400 与明确错误信息。

### NFR-002 — 可扩展元模型

**Requirement:** 观测值使用通用表 + JSON 文本 dims，不为每指标建物理表；预留 subsystem / entity / document_chunk / agent_run。

**Measurement / verification:** DATA_MODEL 与迁移一致。

## 9. Constraints and Assumptions

- 数据库使用 Cloudflare D1；不用 Neon、PGlite 或 pgvector（ADR-003，2026-11-10 仓库所有者决定）
- UI 遵循 ITEI 视觉；组件栈 Tailwind + shadcn
- 现有 `medical-device-import-demo` 仅思路参考

## 10. Product Edge Cases

- 重复导入同一期间：允许追加；demo 不做复杂 upsert 策略（可后续 ADR）
- 未知 indicator_id：拒绝该行并记入批次错误

## 11. Open Questions

- 生产 Cloudflare 账号与 D1 库由部署者提供
- 二期知识库的向量检索方案（如 Cloudflare Vectorize）待定
