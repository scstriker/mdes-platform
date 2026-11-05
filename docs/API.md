# API — MDES Demo Phase 1

Base path: `/api`。共享类型见 `packages/shared/src/types.ts`，错误码见 `packages/shared/src/errors.ts`。

## 错误响应

除 `/api/health` 外，所有错误都返回统一结构：

```json
{ "error": { "code": "NOT_FOUND", "message": "indicator not found: TRD-999", "params": { "resource": "indicator", "id": "TRD-999" } } }
```

- `code`：错误码，见下表。界面文案由前端按 `code` 与 `params` 生成（`apps/web/src/lib/api/errors.ts`）。
- `message`：给开发者看的英文说明，不直接展示给用户。
- `params`：生成文案所需的参数，没有时为 `{}`。

| code | HTTP | 场景 | params |
|---|---|---|---|
| `FILE_REQUIRED` | 400 | 导入没有上传文件，或 JSON 体缺少 `csvText` / 不是合法 JSON | — |
| `EMPTY_CSV` | 400 | CSV 没有内容，或只有表头 | — |
| `MISSING_HEADER` | 400 | 缺少必需列 | `header` |
| `ROW_LIMIT_EXCEEDED` | 400 | 数据行数超过上限（默认 5000，`IMPORT_MAX_ROWS`） | `max`、`actual` |
| `NOT_FOUND` | 404 | 指标不存在；未知路由 | `resource`、`id` |
| `INTERNAL_ERROR` | 500 | 意外异常（如数据库不可用）；不暴露内部细节 | — |

CSV 行错误不走上表，而是放在导入结果的 `errors` 里，见「POST /import/csv」。

查询参数采用宽松处理：非法的 `limit` / `offset` 回落到默认值，格式不对的 `batch_id` 查不到数据，都不报错。

## GET /health

```json
{ "ok": true, "db": "ok", "vector": true, "embedding_dims": 1536 }
```

数据库不可用时返回 **503**：`{ "ok": false, "db": "error", "vector": false, "embedding_dims": 1536, "error": { "code": "INTERNAL_ERROR", … } }`。

## GET /clusters

Returns `{ items: Cluster[] }`，按 `code` 排序。`Cluster = { code, name, subsystem_id }`。

## GET /indicators

Query：`phase?=phase1|later`、`cluster?=TRD`。

Returns `{ items: IndicatorListItem[] }`，按 `id` 排序。列表不含 `spec_json` 长文。

| 字段 | 说明 |
|---|---|
| `id`、`cluster_code`、`name`、`phase`、`update_freq`、`source_kind`、`phase_scope` | 指标元数据 |
| `obs_count` | 观测值条数（一次 LEFT JOIN 聚合） |
| `latest_period` | 最近期间，按字符串取最大值；没有观测值时为 `null` |
| `automation` | 采集方式，取自 `spec_json.automation`（如「全自动」「半自动」「人工整理」「授权/专题论证」），供目录筛选；空时为 `null` |

## GET /indicators/:id

Returns 一条 `Indicator`：列表字段加 `spec_json`（V12 长文本字段：`business_value`、`definition`、`source`、`collect_method`、`usage`、`automation`、`note`）。不存在时 404 `NOT_FOUND`。

## GET /observations

| Query | 说明 |
|---|---|
| `indicator_id` | 指标编号 |
| `period` | 期间，精确匹配 |
| `period_from` | 起始期间（含），按字符串比较：`2024-02` 含 `2024-02`、`2024-03`… |
| `period_to` | 截止期间（含）；以它为前缀的子期间也算在内：`2024` 含 `2024-12` |
| `geo` | 地域，精确匹配（如 `CN`、`110000`） |
| `batch_id` | 导入批次号，用于「查看本批次数据」 |
| `limit` | 每页条数，默认 100，最大 500 |
| `offset` | 偏移，默认 0 |

Returns：

```json
{ "items": [Observation], "total": 37, "limit": 100, "offset": 0 }
```

- `total` 是符合筛选条件的总条数，不受 `limit` / `offset` 影响。
- `items` 按 `period desc, id desc` 排序；`id` 为字符串（bigserial）。

## POST /import/csv

Body：`multipart/form-data` 的 `file` 字段，**或** JSON `{ filename, csvText }`。

CSV 规则（前后端共用 `packages/shared/src/csv.ts`）：

- 必需列：`indicator_id`、`period`，以及 `value_num` / `value_text` 至少一列。可选列：`geo`（缺省 `CN`）、`unit`、`dims`（JSON 对象字符串）。列名不区分大小写，顺序不限。
- 按 RFC 4180 解析：双引号包裹的字段可含逗号与换行，`""` 表示一个双引号；兼容 BOM 与 CRLF。
- 行号是表格行号：表头为第 1 行，空行也计数。

处理方式：

- 文件级问题（`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`、`ROW_LIMIT_EXCEEDED`）返回 400 错误体，不建批次。
- 其余情况都会建一个批次并返回 **200**。批次与全部观测值在同一个事务里写入，每 500 行一次批量插入；中途失败整体回滚，不留半批数据，返回 500 `INTERNAL_ERROR`。
- 校验失败的行跳过，其余行照常写入；所有行都失败时批次状态为 `failed`，同样记录在导入历史里。

Returns：

```json
{
  "batch_id": "8906a7d3-…",
  "status": "completed_with_errors",
  "row_ok": 9,
  "row_err": 1,
  "errors": [{ "line": 5, "code": "UNKNOWN_INDICATOR", "params": { "indicator_id": "TRD-099" } }]
}
```

`status`：`completed`（全部成功）/ `completed_with_errors`（部分失败）/ `failed`（全部失败）。

行错误码：

| code | 场景 | params |
|---|---|---|
| `REQUIRED_FIELD_MISSING` | `indicator_id` 或 `period` 为空 | `field` |
| `UNKNOWN_INDICATOR` | 指标编号不在指标目录中 | `indicator_id` |
| `INVALID_VALUE_NUM` | `value_num` 不是有限数字（不允许单位、千分位） | `value` |
| `DIMS_INVALID_JSON` | `dims` 不是合法 JSON | — |
| `DIMS_NOT_OBJECT` | `dims` 不是 JSON 对象 | — |
| `VALUE_MISSING` | `value_num` 与 `value_text` 都为空 | — |

每行只报第一个错误。前端示例文案：「第 5 行：指标编号 TRD-099 不存在，请核对指标目录后重试」。

## GET /import/batches

最近 50 个批次，按时间倒序：`{ items: ImportBatch[] }`，`ImportBatch = { id, filename, status, row_ok, row_err, errors_json, created_at }`，`errors_json` 与导入结果的 `errors` 结构相同。

## GET /stats

概览页统计：

```json
{
  "indicators": { "total": 99, "phase1": 30, "phase1_with_data": 5 },
  "observations": { "total": 10, "latest_period": "2024-03" },
  "clusters": [
    { "code": "TRD", "name": "进出口贸易（TRD）", "phase1": 5, "phase1_with_data": 5, "later": 2, "observations": 10 }
  ],
  "latest_batch": { "id": "…", "filename": "trd_sample.csv", "status": "completed", "row_ok": 10, "row_err": 0, "created_at": "…" }
}
```

- `phase1_with_data`：至少有一条观测值的一期指标数。
- `latest_period`：全部观测值的最大期间（数据截止期间），没有数据时为 `null`。
- `clusters` 按 `code` 排序，覆盖全部 7 个簇；`latest_batch` 没有导入记录时为 `null`。
