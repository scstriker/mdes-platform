# ADR-005　列式不可变统计快照、一等公民拆页与零首屏出版导出栈

**状态**　已采纳（Accepted），2026-11-28（初拟 2026-11-27）。承接 [ADR-002 界面技术栈](ADR-002-ui-stack.md)、[ADR-003 Cloudflare D1 选型](ADR-003-cloudflare-d1.md) 与 [ADR-004 海关贸易快照发布](ADR-004-trade-publication.md)。

## 背景

一期门户将产品型号与注册证混于 `/products`、企业与服务机构及省域图混于 `/enterprises`、研究报告与政策/指导原则/标准/年报混于 `/reports`；各页图表直接绑定私有静态数组，缺少独立地址、版本锁与出版级导出；而 `chart.tsx` 在每次配置变化时销毁重建 ECharts 实例，DOM 抓取 SVG 在表格模式与深色主题下失效。

## 决定

1. **信息架构与领域拆页**：桌面主导航设为 **产业总览、市场、技术、产品、企业、进出口贸易、研究报告** 七项；页眉「资料查询」菜单收纳 **统计成果库、注册与准入、机构名录、产业政策、技术标准、官方来源、指标与口径** 七项；手机底栏固定为 **总览、市场、产品、贸易、全部**。型号、企业、报告、单项统计各自拥有独立稳定地址，旧书签由路由 `loader` 同步重定向。
2. **D1 双平面存储、零数据包解析信封与双路径历史锁版（`0010` 迁移）**：
   - 平面一：`statistic_def`（内联 `< 1 KB` `summary_kpi_json`）、`catalog_record`（统一索引型号/注册/企业/机构/政策/标准/来源/招采/技术/报告）、`entity_relation` 及 SQLite `FTS5` 全文索引 `search_fts`。
   - 平面二：`statistic_version` 按 `(statistic_id, version)` 主键保存列式数据数组与 SDMX 观测状态码（`A` 实际 / `E` 估算 / `F` 预测 / `P` 非完整期）及 `methodology_breaks`，单次主键查询恒定 `rows_read = 1`。`?raw=1`（或 `application/vnd.mdes.statistic.raw+json`）直接以 `new Response(payload_json)` 原样返回快照字节；SPA 默认详情读路径通过 SQLite `json_extract` 仅提取轻量 `related_statistic_ids`，在 Worker JS 层不对含大型列式 `dataset` 的 `payload_json` 执行 `JSON.parse / JSON.stringify`，直接拼装外层信封并输出强 `ETag`。
   - 海关贸易一等公民统计适配与版本锁：复用 `trade.ts` 的 `DEFAULT_DICT_VERSION`，将已发布海关快照通过 `adaptTradeSnapshotToStatistics` 同时合并入线上 Worker 与离线 `demo-api` 的 `/api/statistics` 列表/详情/版本接口；当请求携带历史 `?v=<period>.<releasePrefix>`（或 `GET /api/trade/overview?releaseId=`）时，精确回查 `trade_release` 与 `trade_period_snapshot`（唯一索引 `rows_read = 1`）。研究报告详情页对锁版统计禁用未锁版种子回退，接口失败或版本不匹配时显式告警而绝不静默漂移。
3. **图表生命周期与零首屏出版导出**：
   - `chart.tsx` 挂载仅初始化一次，数据与视图变更调用 `setOption(opt, { replaceMerge: ['series', 'xAxis', 'yAxis'], lazyUpdate: true })`，主题切换直接刷新 Token 配置。
   - 矢量与位图导出采用浏览器内存态离屏 ECharts SVG 实例（注入 `tokens.flat.json` 浅色出版常量，免疫深色主题与表格态卸载）。
   - 多格式底稿采用 MIT 轻量库按需动态 `import()`：**`write-excel-file@^4.1.1`**（约 36.6 KB gzip，生成 `Data / Metadata / Sources / Methodology` 4-Sheet 工作簿，替代约 280 KB 的 `ExcelJS`）与 **`pptxgenjs@^4.0.1`**（约 70 KB gzip，输出原生可编辑 OOXML 图表与内嵌数据表）；URL 视图状态采用 **`nuqs@^2.10.3`**（约 6.1 KB gzip）。首屏核心入口包体对导出库保持零增量。

## 影响

单项统计、品类市场、企业档案、研究报告与跨库检索共享同一套版本化数据契约，线上 Cloudflare 部署与离线单文件 `mdes-demo.html` 保持同构。历史报告锁定的统计版本在后续数据修订时永不漂移。详细比选与分批验收证据见 [MDES V2 统计成果与全站重构工作记录](../MDES_V2统计成果与全站重构工作记录.md)。
