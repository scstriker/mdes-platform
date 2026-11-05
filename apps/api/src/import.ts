import type postgres from "postgres";
import { parseObservationCsv, type ImportResult, type ImportStatus } from "@mdes/shared";
import type { Sql } from "./db";
import { AppError } from "./errors";

export const IMPORT_CHUNK_SIZE = 500;

type ImportOptions = {
  filename: string;
  csvText: string;
  maxRows: number;
  /** 每批插入的行数；500 行 × 8 列 = 4000 个参数，远低于 Postgres 的 65535 上限 */
  chunkSize?: number;
  /** 测试钩子：每插完一批调用一次，用来模拟中途失败 */
  afterChunk?: (index: number) => void | Promise<void>;
};

/**
 * CSV 导入（ADR-002「补充改动」）：
 * - 先用共享解析器校验（含指标编号），文件级错误抛 400，不建批次；
 * - 批次与全部观测值在同一个事务里写入，分块批量插入；中途失败整体回滚，不会留下半批数据，
 *   也不会出现「批次已完成、数据只写了一半」；
 * - 所有行都校验失败时仍记录一个 failed 批次，返回 200，导入历史里看得到。
 */
export async function importObservations(sql: Sql, options: ImportOptions): Promise<ImportResult> {
  const chunkSize = options.chunkSize ?? IMPORT_CHUNK_SIZE;
  const known = await sql<{ id: string }[]>`select id from indicator`;
  const parsed = parseObservationCsv(options.csvText, {
    maxRows: options.maxRows,
    knownIndicatorIds: new Set(known.map((r) => r.id)),
  });
  if (!parsed.ok) throw new AppError(400, parsed.fileError.code, parsed.fileError.params);

  const { rows, errors } = parsed;
  const status: ImportStatus = rows.length === 0 ? "failed" : errors.length > 0 ? "completed_with_errors" : "completed";

  const batchId = await sql.begin(async (tx) => {
    const [batch] = await tx<{ id: string }[]>`
      insert into import_batch (filename, status, row_ok, row_err, errors_json)
      values (${options.filename}, ${status}, ${rows.length}, ${errors.length}, ${tx.json(errors as unknown as postgres.JSONValue)})
      returning id
    `;
    for (let i = 0, chunk = 0; i < rows.length; i += chunkSize, chunk++) {
      const values = rows.slice(i, i + chunkSize).map((r) => ({
        indicator_id: r.indicator_id,
        period: r.period,
        geo: r.geo,
        dims: tx.json(r.dims as postgres.JSONValue),
        value_num: r.value_num,
        value_text: r.value_text,
        unit: r.unit,
        batch_id: batch.id,
      }));
      await tx`
        insert into observation ${tx(values, "indicator_id", "period", "geo", "dims", "value_num", "value_text", "unit", "batch_id")}
      `;
      await options.afterChunk?.(chunk);
    }
    return batch.id;
  });

  return { batch_id: batchId, status, row_ok: rows.length, row_err: errors.length, errors };
}
