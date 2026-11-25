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

## 中国海关贸易一期（目标模型）

海关原件是金额的来源，月度事实是聚合依据，发布快照是前台的读取入口。本节描述下一次 D1 迁移的目标。上文的通用观测值和导入批次已存在。

| 对象 | 一条记录代表什么 | 标识和读取方式 |
| --- | --- | --- |
| 税号字典 | 一个版本内的一个中国商品，保存 HS8、HS6、原名称、一级类别和来源 CSV 摘要 | 主键为 `(dict_version, hs8)`，编码按文本保存。`202601` 版的 164 个 HS8 对应 117 个 HS6、11 个一级类别。按 HS8 归类，同一个 HS6 可跨类别。 |
| 贸易导入批次 | 一份原始文件和一次查询范围。关联 `import_batch.id`，保存原件 SHA-256、归档引用、月份、流向、币种、分组和请求税号集合 | 查询范围由字典版本、月份、流向、币种、分组和排序去重后的 HS8 集合确定。同范围、同原件且覆盖声明和证据一致时，重试返回原批次。 |
| 税号覆盖记录 | 某批请求一个 HS8 的结果 | 按批次和 HS8 记录“已取得”“官网明确无记录”或“待补采”。没有返回的税号须有明确空结果才可计入已覆盖。原件和对应清单由本机管理端归档。 |
| 月度事实 | 一个 HS8 在当月、单流向、单分组中的一条官方统计值 | 业务键为字典版本、月、流向、HS8、分组和分组代码。商品全国合计使用固定分组代码 `ALL`。记录海关原码和原名、美元金额、第一及第二数量和各自单位、来源批次。候选版本与已发布版本分开存放。 |
| 期间快照 | 一版可供用户读取的月度、季度、年度或年内累计结果 | 按字典版本、期间和发布版本定位，附覆盖月份及来源批次集合。当前发布指针按字典版本、期间建立唯一索引。 |

### 汇总与精度

`product` 给出全国商品合计。`partner`、`regime`、`region` 分别描述伙伴、贸易方式和收发货人注册地；四种分组对同一笔贸易进行了不同汇总，查询必须指定分组。进口按原产国或地区，出口按目的国或地区。两侧均保存原始海关伙伴编码和名称。

来源档案区分数据 CSV 与官网空结果证据。两者均按原始字节取摘要，覆盖记录关联对应证据。一个税号在当年不适用时，字典另记年版目录依据；这一状态不计为海关明确无记录。参见[海关原件采集规程](海关原件采集规程.md)。

金额按原件精度以定点数累计，对外契约使用美元。界面最后换算为亿美元。数量只在同一税号、相同计量顺序和相同单位内相加。缺报为 `null`，原件明确给出的零保留为 `0`。HS8 按统计年份对照后使用，记录回溯年份和不可比项。

### 修订与发布

1. 保存原件和查询范围，校验表头、美元单位与覆盖记录，分块写入候选版本。同一月、流向和分组内，各批次按互不重叠的 HS8 集合划分。修订同一范围时以新文件整体替换该范围，旧文件仍可按哈希定位。
2. 两个流向、四个分组都覆盖当期清单后生成月快照。季度和年度只在所需月份齐备时生成，累计值使用从一月至截止月的连续月份。修订已发布月份时，重算该月所属期间及以其为上年同期的比较值。
3. 在短 D1 事务中切换已校验的快照和对应 TRD 派生观测值。发布时校验计算所基于的上一版本，若已有另一修订先发布，基于最新版本重算。读取端能看见旧版或新版中的一个完整版本。

迁移追加在 `0001_init.sql` 之后（现包含 `0002_trade_schema.sql` 至 `0007_trade_hs_2022_2026_applicability.sql`）：
- `0007_trade_hs_2022_2026_applicability.sql` 登记 `202601` 字典在 `2022–2026` 各年度税则适用性（`2022` 年 `90189080` 手术机器人标为 `applicable = 0` 并附 `2023 年自 90189099 析出增列` 依据，`2022` 年适用 163 码，`2023–2026` 适用全量 164 码）；
- `trade_current_snapshot.payload_json` 与 `trade_period_snapshot.payload_json` 同步物化 `totals.{totalUsd, totalYoyPct}`、跨年序列 `annualTrend`、`hsItems[].{importQty1YoyPct, exportQty1YoyPct}` 及确定性研判文段 `narrativeSummary`，使门户与报告导出保持 `O(1)` 单行主键读取；
- 已有观测值继续保留原批次；新生成的 `TRD-001/002/005/006/007` 记录标明来源与发布版本，修订时只替换对应的派生记录。字段传输和错误约定见 [API](API.md)，发布决策见 [ADR-004](decisions/ADR-004-trade-publication.md)。
