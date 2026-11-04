import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createSql(connectionString: string, max = 5): Sql {
  const needsSsl =
    /sslmode=require/i.test(connectionString) ||
    /\.neon\.tech/i.test(connectionString);
  return postgres(connectionString, {
    max,
    prepare: false,
    ssl: needsSsl ? "require" : undefined,
    fetch_types: false,
  });
}

export async function checkHealth(sql: Sql) {
  await sql`select 1 as ok`;
  const rows = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from pg_extension where extname = 'vector'
    ) as exists
  `;
  return {
    db: "ok" as const,
    vector: Boolean(rows[0]?.exists),
  };
}
