# API — MDES Demo Phase 1

Base path: `/api`

## GET /health

Returns `{ ok, db, vector, embedding_dims }`.

## GET /indicators

Query: `phase?=phase1|later`, `cluster?=TRD`

Returns `{ items: Indicator[] }`.

## GET /indicators/:id

Returns one indicator or 404.

## GET /clusters

Returns `{ items: Cluster[] }`.

## POST /import/csv

Body: `multipart/form-data` with `file` **or** JSON `{ filename, csvText }`.

CSV headers (required): `indicator_id,period,geo,value_num,unit`  
Optional: `value_text,dims`（dims 为 JSON 对象字符串）

Returns `{ batch_id, status, row_ok, row_err, errors }`.

`errors` is `{ line, message }[]`, sorted by `line`. `line` is the 1-based line in the uploaded file, counting blank lines; `0` means a whole-file error (empty file, row limit exceeded).

## GET /import/batches

Lists recent batches.

## GET /observations

Query: `indicator_id?`, `period?`, `limit?=100`

Returns `{ items: Observation[] }`.
