# Product Requirements Document — MDES Demo Phase 1

## 1. Context

医疗器械产业数据系统（MDES）需要一个可演示的数据底座：先把 V12 指标体系与观测值装进库、能导入能查看，再演进知识库与智能体。本仓库是 **Cloudflare 优先的轻量 demo**，不是所内生产平台。

## 2. Problem Statement

指标规格已调研完成（V12），但缺少统一入库与浏览通路；后续知识库/智能体需要稳定的指标与事实层，不能从 mock 前端硬编码起步。

## 3. Goals

- 将 V12 指标元数据（含一期 30 项）入库并可浏览
- 支持 CSV 观测值导入与按指标/期间查询
- 使用 Cloudflare D1，并预留知识库文档与 Agent 表（本轮不存向量）
- 优先可部署到 Cloudflare（Pages + Workers + D1）

## 4. Non-goals

- 智能问答、Agent 运行时、真实 embedding 管线
- Wind 直连、爬虫采集、复杂鉴权
- 报告导出、知识图谱、大屏可视化精修
- 所级多子系统生产治理流程

## 5. Users and Actors

| Actor | Need / Responsibility |
|---|---|
| 演示讲解人 | 展示目录、导入、查询闭环 |
| 领域数据负责人 | 用 CSV 灌入样例观测值 |
| 后续开发 | 在预留表/API 上接 KB 与 Pi Agent |

## 6. Usage Scenarios

### Scenario 1 — 浏览一期指标

打开「指标目录」，筛选簇或一期标记，查看 `TRD-001` 等口径与来源说明。

### Scenario 2 — 导入 TRD 样例

上传样例 CSV，系统校验并写入观测值；在「观测值」页按指标与期间查出。

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
