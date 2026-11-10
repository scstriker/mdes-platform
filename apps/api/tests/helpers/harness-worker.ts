/**
 * 集成测试用的 Worker：包住真实的 API（src/worker.ts），另加几个只在测试里存在的入口，
 * 用来建表、灌数据、直接查库和模拟导入中途失败。由 tests/helpers/harness.ts 用 esbuild 打包，
 * 在 Miniflare（workerd + 本地 D1）里运行；不会进生产包。
 */
import { buildImportStatements, importObservations } from "../../src/import";
import app from "../../src/worker";

type Env = { DB: D1Database; IMPORT_MAX_ROWS?: string };

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__test/sql") {
      const { statements } = await req.json<{ statements: string[] }>();
      await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__test/query") {
      const { sql } = await req.json<{ sql: string }>();
      return Response.json((await env.DB.prepare(sql).all()).results);
    }
    if (url.pathname === "/__test/chunks") {
      const { rows, chunkSize } = await req.json<{ rows: number; chunkSize: number }>();
      const fake = Array.from({ length: rows }, (_, i) => ({
        line: i + 2,
        indicator_id: "TRD-001",
        period: `P${i}`,
        geo: "CN",
        value_num: i,
        value_text: null,
        unit: "",
        dims: {},
      }));
      const batch = { id: "x", filename: "x.csv", status: "completed" as const, createdAt: new Date().toISOString() };
      return Response.json({ statements: buildImportStatements(env.DB, batch, fake, [], chunkSize).length });
    }
    if (url.pathname === "/__test/import") {
      const o = await req.json<{ csvText: string; chunkSize?: number; failAtEnd?: boolean }>();
      try {
        const result = await importObservations(env.DB, {
          filename: "harness.csv",
          csvText: o.csvText,
          maxRows: 5000,
          chunkSize: o.chunkSize,
          // 末尾追加一条违反外键的语句：整批应当回滚
          extraStatements: o.failAtEnd
            ? (db) => [db.prepare("insert into observation (indicator_id, period) values ('NO-SUCH-INDICATOR', 'x')")]
            : undefined,
        });
        return Response.json({ ok: true, result });
      } catch (err) {
        return Response.json({ ok: false, error: String(err) });
      }
    }
    return app.fetch(req, env, ctx);
  },
};
