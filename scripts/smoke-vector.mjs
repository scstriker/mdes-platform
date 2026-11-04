import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 30,
});

try {
  const ext = await sql`select exists(select 1 from pg_extension where extname='vector') as ok`;
  console.log("vector", ext[0].ok);
  const phase = await sql`select phase, count(*)::int as n from indicator group by phase order by phase`;
  console.log(phase);
  const [doc] = await sql`
    insert into document (title, meta)
    values ('seed-smoke', ${sql.json({ kind: "smoke" })})
    returning id
  `;
  await sql`
    insert into document_chunk (document_id, chunk_index, content, embedding, meta)
    values (${doc.id}, 0, 'pgvector reserved table smoke', null, ${sql.json({})})
  `;
  console.log("chunk_ok", doc.id);
} finally {
  await sql.end({ timeout: 2 });
}
