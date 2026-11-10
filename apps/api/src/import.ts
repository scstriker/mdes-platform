import { parseObservationCsv, type CsvObservationRow, type ImportResult, type ImportStatus, type RowError } from "@mdes/shared";
import { AppError } from "./errors";

export const IMPORT_CHUNK_SIZE = 500;

type ImportOptions = {
  filename: string;
  csvText: string;
  maxRows: number;
  /** 每块行数：一块是一条 insert … select from json_each(?)，只绑定 3 个参数 */
  chunkSize?: number;
  /** 测试钩子：追加到批量语句末尾，用来模拟中途失败、验证整体回滚 */
  extraStatements?: (db: D1Database) => D1PreparedStatement[];
};

/** 一块观测值的 insert：整块作为一个 JSON 参数传入，不受 D1 每条语句 100 个参数的限制 */
const INSERT_CHUNK = `
  insert into observation (indicator_id, period, geo, dims, value_num, value_text, unit, batch_id, created_at)
  select
    json_extract(value, '$.indicator_id'),
    json_extract(value, '$.period'),
    json_extract(value, '$.geo'),
    json_extract(value, '$.dims'),
    json_extract(value, '$.value_num'),
    json_extract(value, '$.value_text'),
    json_extract(value, '$.unit'),
    ?1,
    ?2
  from json_each(?3)`;

export function buildImportStatements(
  db: D1Database,
  batch: { id: string; filename: string; status: ImportStatus; createdAt: string },
  rows: CsvObservationRow[],
  errors: RowError[],
  chunkSize = IMPORT_CHUNK_SIZE,
): D1PreparedStatement[] {
  const statements = [
    db
      .prepare(
        `insert into import_batch (id, filename, status, row_ok, row_err, errors_json, created_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(batch.id, batch.filename, batch.status, rows.length, errors.length, JSON.stringify(errors), batch.createdAt),
  ];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(({ line: _line, ...r }) => {
      void _line;
      return r;
    });
    statements.push(db.prepare(INSERT_CHUNK).bind(batch.id, batch.createdAt, JSON.stringify(chunk)));
  }
  return statements;
}

/**
 * CSV 导入（ADR-002「补充改动」，ADR-003 改用 D1）：
 * - 先用共享解析器校验（含指标编号），文件级错误抛 400，不建批次；
 * - 批次与全部观测值放进同一个 db.batch() 里写入：D1 把一次 batch 当作一个事务，
 *   中途任何一条失败都整体回滚，不会留下半批数据，也不会出现「批次已完成、数据只写了一半」；
 * - 所有行都校验失败时仍记录一个 failed 批次，返回 200，导入历史里看得到。
 */
export async function importObservations(db: D1Database, options: ImportOptions): Promise<ImportResult> {
  const { results: known } = await db.prepare("select id from indicator").all<{ id: string }>();
  const parsed = parseObservationCsv(options.csvText, {
    maxRows: options.maxRows,
    knownIndicatorIds: new Set(known.map((r) => r.id)),
  });
  if (!parsed.ok) throw new AppError(400, parsed.fileError.code, parsed.fileError.params);

  const { rows, errors } = parsed;
  const status: ImportStatus = rows.length === 0 ? "failed" : errors.length > 0 ? "completed_with_errors" : "completed";
  const batch = { id: crypto.randomUUID(), filename: options.filename, status, createdAt: new Date().toISOString() };
  const statements = buildImportStatements(db, batch, rows, errors, options.chunkSize);
  await db.batch([...statements, ...(options.extraStatements?.(db) ?? [])]);

  return { batch_id: batch.id, status, row_ok: rows.length, row_err: errors.length, errors };
}
