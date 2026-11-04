# Data Model — MDES Demo Phase 1

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
| spec_json | jsonb | V12 长文本字段打包 |

### import_batch

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| filename | text | |
| status | text | pending/completed/failed/completed_with_errors |
| row_ok | int | |
| row_err | int | |
| errors_json | jsonb | |
| created_at | timestamptz | |

### observation

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| indicator_id | text FK | |
| period | text | e.g. 2024-01 / 2024 |
| geo | text | CN / province code |
| dims | jsonb | 自由维度 |
| value_num | double precision | nullable |
| value_text | text | nullable |
| unit | text | |
| batch_id | uuid FK | |
| object_ref | text | 预留挂底座对象 |
| created_at | timestamptz | |

Indexes: `(indicator_id, period)`, GIN on `dims`.

## Reserved

- `entity_enterprise` / `entity_product` / `entity_license`
- `document` / `document_chunk`（`embedding vector(n)`，n 由配置）
- `agent_run` / `tool_call_log`

## Extension

`CREATE EXTENSION IF NOT EXISTS vector;`
