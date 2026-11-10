# Data Model — MDES Demo Phase 1

存储为 Cloudflare D1（SQLite），表结构见 `apps/api/migrations/0001_init.sql`，选型见 `docs/decisions/ADR-003-cloudflare-d1.md`。

类型约定：

- JSON 字段存 `text`，带 `json_valid` 约束，用 `json_extract` / `json_each` 读写；
- 主键 uuid 存 `text`，由 Worker 用 `crypto.randomUUID()` 生成；
- 时间存 ISO 8601 `text`，例如 `2026-11-10T08:00:00.000Z`。

## Core（一期使用）

### subsystem

| Column | Type | Notes |
|---|---|---|
| id | text PK | 默认 `med` |
| name | text | |

### indicator_cluster

| Column | Type | Notes |
|---|---|---|
| code | text PK | TRD / REG / … |
| name | text | |
| subsystem_id | text FK | default med |

### indicator

| Column | Type | Notes |
|---|---|---|
| id | text PK | TRD-001 |
| cluster_code | text FK | |
| name | text | |
| phase | text | phase1 / later |
| update_freq | text | |
| source_kind | text | pub / wind / topic / mixed / unknown |
| phase_scope | text | 一期承诺口径 |
| spec_json | text（JSON） | V12 长文本字段打包 |

### import_batch

| Column | Type | Notes |
|---|---|---|
| id | text PK（uuid） | |
| filename | text | |
| status | text | completed / completed_with_errors / failed；批次与观测值在同一次 `db.batch()`（单事务）里写入，状态一次写定 |
| row_ok | integer | |
| row_err | integer | |
| errors_json | text（JSON） | 行错误 `[{ line, code, params }]`，见 docs/API.md |
| created_at | text（ISO 8601） | |

Indexes: `(created_at)`.

### observation

| Column | Type | Notes |
|---|---|---|
| id | integer PK autoincrement | API 按字符串返回 |
| indicator_id | text FK | |
| period | text | e.g. 2024-01 / 2024 |
| geo | text | CN / province code |
| dims | text（JSON） | 自由维度 |
| value_num | real | nullable |
| value_text | text | nullable |
| unit | text | |
| batch_id | text FK | |
| object_ref | text | 预留挂底座对象 |
| created_at | text（ISO 8601） | |

Indexes: `(indicator_id, period)`, `(batch_id)`.

## Reserved

- `entity_enterprise` / `entity_product` / `entity_license`
- `document` / `document_chunk`：知识库；本轮不存向量（无 `embedding` 列），二期另行选型
- `agent_run` / `tool_call_log`
