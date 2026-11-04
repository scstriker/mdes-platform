# Acceptance Criteria — MDES Demo Phase 1

Traceability: FR → AC → verification.

### AC-001 — 一期指标目录可见

**Covers:** FR-001  
**Verify:** 种子灌库后 `GET /api/indicators?phase=phase1` 返回 30 条；Web 目录页可见。  
**Method:** automated API test + manual UI

### AC-002 — TRD 样例可导入

**Covers:** FR-002  
**Verify:** 上传 `data/samples/trd_sample.csv` 返回批次 `status=completed`（或 `completed_with_errors` 且成功行 > 0）。  
**Method:** automated API test + manual UI

### AC-003 — 观测值可查询

**Covers:** FR-003  
**Verify:** 导入后 `GET /api/observations?indicator_id=TRD-001` 至少 1 行。  
**Method:** automated API test

### AC-004 — pgvector 就绪

**Covers:** FR-004  
**Verify:** `GET /api/health` 含 `db: ok` 与 `vector: true`；可向 `document_chunks` 插入一行（脚本或测试）。  
**Method:** automated API test

### AC-005 — Cloudflare 部署路径文档完整

**Covers:** FR-005  
**Verify:** README 含 Neon 创建、`CREATE EXTENSION vector`、Hyperdrive、Pages/Worker 部署步骤；`wrangler` 配置文件存在且可 `dry-run`。  
**Method:** manual review
