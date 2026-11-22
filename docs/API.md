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
{ "ok": true, "db": "ok" }
```

数据库不可用时返回 **503**：`{ "ok": false, "db": "error", "error": { "code": "INTERNAL_ERROR", … } }`。

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
| `q` | 多词项关键词检索（按空白分词，全部命中；匹配指标编码/名称、期间、地域编码及中文省市名、维度键值及中文标签、数值文本、单位与批次号） |
| `limit` | 每页条数，默认 100，最大 500 |
| `offset` | 偏移，默认 0 |

Returns：

```json
{ "items": [Observation], "total": 37, "limit": 100, "offset": 0 }
```

- `total` 是符合筛选条件的总条数，不受 `limit` / `offset` 影响。
- `items` 按 `period desc, id desc` 排序；`id` 为字符串（库里是自增整数）。

## GET /search

全站动态数据库统一检索接口。

| Query | 说明 |
|---|---|
| `q` | 多词项关键词检索（空白分隔，全部命中）；为空时返回空结果集 |
| `limit` | 每组最多返回条数，默认 12，最大 50 |

Returns：

```json
{
  "query": "广东 进口",
  "observations": { "items": [ObservationSearchHit], "total": 3 },
  "indicators": { "items": [IndicatorListItem], "total": 1 }
}
```

- `observations.total` 与 `GET /api/observations?q=...` 的 `total` 完全同源一致。

## POST /import/csv

Body：`multipart/form-data` 的 `file` 字段，**或** JSON `{ filename, csvText }`。

CSV 规则（前后端共用 `packages/shared/src/csv.ts`）：

- 必需列：`indicator_id`、`period`，以及 `value_num` / `value_text` 至少一列。可选列：`geo`（缺省 `CN`）、`unit`、`dims`（JSON 对象字符串）。列名不区分大小写，顺序不限。
- 按 RFC 4180 解析：双引号包裹的字段可含逗号与换行，`""` 表示一个双引号；兼容 BOM 与 CRLF。
- 行号是表格行号：表头为第 1 行，空行也计数。

处理方式：

- 文件级问题（`FILE_REQUIRED`、`EMPTY_CSV`、`MISSING_HEADER`、`ROW_LIMIT_EXCEEDED`）返回 400 错误体，不建批次。
- 其余情况都会建一个批次并返回 **200**。批次与全部观测值放进同一次 D1 `db.batch()`（单事务）写入，每 500 行一条批量插入；中途失败整体回滚，不留半批数据，返回 500 `INTERNAL_ERROR`。
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

## 贸易一期接口（待开发）

以下路径已包含 `/api` 前缀。贸易接口沿用现有中文错误体，响应契约由 `@mdes/shared` 提供。金额字段以美元计，份额与 CR 以百分数计，HHI 采用 0–10,000 刻度。

### POST /api/trade/import

本地管理端以 `multipart/form-data` 提交 UTF-8 JSON 字段 `manifest` 和原始证据。通常使用 `file` 上传海关原始 CSV。如果整个查询范围在官网明确显示无记录且无法下载 CSV，则使用 `emptyEvidence` 上传含查询条件与空结果的 PNG 截图。管理端在本机保留原件，Worker 根据接收字节计算 SHA-256。示例清单对应隔离验收库里的单码单月进口。

```json
{
  "dictVersion": "202601",
  "month": "2024-01",
  "flow": "import",
  "currency": "USD",
  "grouping": "product",
  "hs8": ["90181100"],
  "emptyHs8": []
}
```

`flow` 取 `import` 或 `export`。`grouping` 取 `product`（商品全国合计）、`partner`、`regime` 或 `region`。`hs8` 是实际请求集合。`emptyHs8` 是其中由海关明确返回无记录的税号，清单与官网结果一同归档。缺行本身不构成无记录证明。

仅上传 `emptyEvidence` 时，`emptyHs8` 必须与请求的 `hs8` 集合一致；提交一张覆盖本次查询范围的截图，回执以截图字节计算 `sourceSha256`，`rowCount` 为 0。若官网另有表头空 CSV，以 `file` 随截图交付。带明细的 CSV 同时声明其他税号无记录时，可多次提交同名 `emptyEvidence` 文件字段，分别对应补查截图。数据员核对截图上的查询条件与编码，服务端保存证据及摘要。尚无证明的税号从 `emptyHs8` 去除，列为待补采；HTML 错误页与下载失败也计入待补采。

有效请求返回 HTTP 200，包含 `batchId`、`sourceSha256`、`rowCount`、`coverage` 和 `status`。有 CSV 时 `sourceSha256` 为 CSV 原件摘要，附加证据摘要随批次保存。`coverage` 使用三个 HS8 数组：`received`、`confirmedEmpty`、`missing`。批次已接收而全月尚未齐备时为 `staged`，整月成功发布后为 `published`。相同范围、内容与覆盖声明的重传返回原批次；重传历史批次保留当前已发布版本。已发布范围收到修订时，按该覆盖集合整体替换。通用观测值 CSV 沿用原入口。

清单、编码或单位不符合约定时返回 HTTP 400，标出字段或 CSV 行号；修订与既有批次范围部分重叠时返回 HTTP 409 并指出冲突覆盖范围。校验失败时保留当前已发布结果。本期仅在本地管理环境启用写入。

### GET /api/trade/overview

`period` 支持月（`2024-12`）、季度（`2024-Q4`）、年度（`2024`）和截至指定月的年内累计（`2024-YTD-09`）。省略时返回最新已发布月份；空库返回 HTTP 200、`status: "empty"`、`period: null` 和空数据。显式请求未发布期间返回 HTTP 404；期间格式错误返回 HTTP 400。

| 已发布响应 | 含义 |
| --- | --- |
| `status`、`period`、`source`、`dictVersion`、`releaseId` | 状态为 `published`，来源为 `china_customs`。同一期间的图表、详情与导出引用同一发布版本。 |
| `coverage`、`sourceBatches` | 实际覆盖月份和税号数。列出来源批次标识及原件摘要，可在本地档案定位原件。 |
| `totals`、`trend`、`categories` | 返回期间、进口美元金额、出口美元金额、差额和同期变化率。分类按 HS8 所属一级类别汇总。金额值先保持原始精度，页面最后换算为亿美元。 |
| `partners`、`concentration`、`regimes`、`regions`、`hsItems` | 按海关原码和来源名称提供伙伴、方式及注册地分布；税号、品类及全篮子集中度区分流向。不可计算的同比或集中度为 `null`。 |

例如，以下是 AC-013 单码隔离库的**目标响应节选**。其中的金额来自验收金标准。同比百分数约定 `25` 表示 25%，基期未知时用 `null`。

```json
{
  "period": "2024",
  "dictVersion": "202601",
  "source": "china_customs",
  "totals": {
    "importUsd": 20375226,
    "exportUsd": 89723246,
    "balanceUsd": 69348020,
    "importYoyPct": null,
    "exportYoyPct": null
  }
}
```

查询只读取已发布快照。收件样例与归档方式见[海关原件采集规程](海关原件采集规程.md)，发布前后各接口的可见结果见[后端功能设计](贸易后端功能设计.md)。验收使用 AC-013 至 AC-017。
