import type { Hono } from "hono";
import {
  resolveObservationTokenAliases,
  tokenizeQuery,
  type Observation,
  type ObservationPage,
} from "@mdes/shared";
import { parseJson } from "../db";
import { intParam, textParam } from "../errors";
import type { AppEnv } from "../env";

export const OBSERVATION_LIMIT_DEFAULT = 100;
export const OBSERVATION_LIMIT_MAX = 500;

export type ObservationFilterParams = {
  indicator_id?: string | null;
  period?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  geo?: string | null;
  batch_id?: string | null;
  q?: string | null;
};

const HAYSTACK_SQL =
  "lower(o.indicator_id || ' ' || coalesce(i.name, '') || ' ' || o.period || ' ' || o.geo || ' ' || o.dims || ' ' || coalesce(cast(o.value_num as text), '') || ' ' || coalesce(o.value_text, '') || ' ' || o.unit || ' ' || coalesce(o.batch_id, ''))";

/**
 * 构造观测值查询与统计共用的 FROM + WHERE 子句及绑定参数，
 * 确保分页列表、总条数（total）、CSV 批量导出与全站动态搜索完全同源。
 */
export function buildObservationWhere(filters: ObservationFilterParams): {
  fromSql: string;
  whereSql: string;
  bindings: unknown[];
} {
  const clauses: string[] = [];
  const bindings: unknown[] = [];

  if (filters.indicator_id) {
    clauses.push("o.indicator_id = ?");
    bindings.push(filters.indicator_id);
  }
  if (filters.period) {
    clauses.push("o.period = ?");
    bindings.push(filters.period);
  }
  if (filters.period_from) {
    clauses.push("o.period >= ?");
    bindings.push(filters.period_from);
  }
  if (filters.period_to) {
    clauses.push("substr(o.period, 1, length(?)) <= ?");
    bindings.push(filters.period_to, filters.period_to);
  }
  if (filters.geo) {
    clauses.push("o.geo = ?");
    bindings.push(filters.geo);
  }
  if (filters.batch_id) {
    clauses.push("o.batch_id = ?");
    bindings.push(filters.batch_id);
  }

  for (const tk of tokenizeQuery(filters.q)) {
    const tokenPredicates = [`instr(${HAYSTACK_SQL}, ?) > 0`];
    bindings.push(tk);

    const { geoCodes, dimHints } = resolveObservationTokenAliases(tk);
    if (geoCodes.length > 0) {
      tokenPredicates.push(`o.geo in (${geoCodes.map(() => "?").join(", ")})`);
      bindings.push(...geoCodes);
    }
    for (const hint of dimHints) {
      tokenPredicates.push("instr(lower(o.dims), ?) > 0");
      bindings.push(hint);
    }
    clauses.push(`(${tokenPredicates.join(" or ")})`);
  }

  return {
    fromSql: "from observation o left join indicator i on i.id = o.indicator_id",
    whereSql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    bindings,
  };
}

export function bindIfNeeded(stmt: D1PreparedStatement, bindings: unknown[]): D1PreparedStatement {
  return bindings.length > 0 ? stmt.bind(...bindings) : stmt;
}

export function observationRoutes(app: Hono<AppEnv>) {
  /**
   * 观测值查询：indicator_id、period（精确）、period_from / period_to（含，按字符串比较，
   * period_to 同时包含以它为前缀的子期间）、geo、batch_id、q（多词项服务端检索）；
   * limit / offset 分页，返回与当前筛选完全一致的 total。
   */
  app.get("/api/observations", async (c) => {
    const db = c.get("db");
    const q = (name: string) => textParam(c.req.query(name));
    const { fromSql, whereSql, bindings } = buildObservationWhere({
      indicator_id: q("indicator_id"),
      period: q("period"),
      period_from: q("period_from"),
      period_to: q("period_to"),
      geo: q("geo"),
      batch_id: q("batch_id"),
      q: q("q"),
    });
    const limit = intParam(c.req.query("limit"), OBSERVATION_LIMIT_DEFAULT, {
      min: 1,
      max: OBSERVATION_LIMIT_MAX,
    });
    const offset = intParam(c.req.query("offset"), 0, { min: 0 });

    const pageStmt = db
      .prepare(
        `select cast(o.id as text) as id, o.indicator_id, o.period, o.geo, o.dims,
                o.value_num, o.value_text, o.unit, o.batch_id, o.created_at
         ${fromSql} ${whereSql}
         order by o.period desc, o.id desc
         limit ? offset ?`,
      )
      .bind(...bindings, limit, offset);
    const countStmt = bindIfNeeded(
      db.prepare(`select count(*) as total ${fromSql} ${whereSql}`),
      bindings,
    );

    const [page, count] = await db.batch<Record<string, unknown>>([pageStmt, countStmt]);
    const items = page.results.map((r) => ({ ...r, dims: parseJson(r.dims, {}) })) as Observation[];
    const total = Number(count.results[0]?.total ?? 0);
    const body: ObservationPage = { items, total, limit, offset };
    return c.json(body);
  });
}
