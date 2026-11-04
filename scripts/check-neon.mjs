import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
});

try {
  const rows = await sql`select count(*)::int as n from indicator`;
  console.log("indicator_count", rows[0].n);
} finally {
  await sql.end({ timeout: 2 });
}
