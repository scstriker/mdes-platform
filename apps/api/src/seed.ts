import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSql, type Sql } from "./db";
import { inferSourceKind } from "./inferSourceKind";

type SeedFile = {
  clusters: { code: string; name: string }[];
  indicators: {
    id: string;
    cluster_code: string;
    name: string;
    business_value: string;
    definition: string;
    source: string;
    collect_method: string;
    update_freq: string;
    usage: string;
    automation: string;
    note: string;
    phase: string;
    phase_scope: string;
  }[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
export const SEED_PATH = resolve(root, "data/indicators_seed.json");

/** 灌入簇与指标（幂等，可重复执行）；集成测试也用它准备测试库 */
export async function seedIndicators(sql: Sql, { seedPath = SEED_PATH, log = console.log } = {}) {
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;

  await sql`insert into subsystem (id, name) values ('med', '医疗装备') on conflict do nothing`;

  if (seed.clusters.length > 0) {
    const codes = seed.clusters.map((c) => c.code);
    const names = seed.clusters.map((c) => c.name);
    const subs = seed.clusters.map(() => "med");
    await sql`
      insert into indicator_cluster ${sql(
        codes.map((code, i) => ({
          code,
          name: names[i],
          subsystem_id: subs[i],
        })),
      )}
      on conflict (code) do update set name = excluded.name
    `;
  }

  const indicatorRows = seed.indicators.map((ind) => ({
    id: ind.id,
    cluster_code: ind.cluster_code,
    name: ind.name,
    phase: ind.phase,
    update_freq: ind.update_freq,
    source_kind: inferSourceKind(ind.source, ind.collect_method),
    phase_scope: ind.phase_scope,
    spec_json: {
      business_value: ind.business_value,
      definition: ind.definition,
      source: ind.source,
      collect_method: ind.collect_method,
      usage: ind.usage,
      automation: ind.automation,
      note: ind.note,
    },
  }));

  // batch in chunks to keep payload reasonable
  const chunkSize = 25;
  for (let i = 0; i < indicatorRows.length; i += chunkSize) {
    const chunk = indicatorRows.slice(i, i + chunkSize);
    await sql.begin(async (tx) => {
      for (const row of chunk) {
        await tx`
          insert into indicator (
            id, cluster_code, name, phase, update_freq, source_kind, phase_scope, spec_json
          ) values (
            ${row.id},
            ${row.cluster_code},
            ${row.name},
            ${row.phase},
            ${row.update_freq},
            ${row.source_kind},
            ${row.phase_scope},
            ${tx.json(row.spec_json)}
          )
          on conflict (id) do update set
            cluster_code = excluded.cluster_code,
            name = excluded.name,
            phase = excluded.phase,
            update_freq = excluded.update_freq,
            source_kind = excluded.source_kind,
            phase_scope = excluded.phase_scope,
            spec_json = excluded.spec_json
        `;
      }
    });
    log(`seeded indicators ${Math.min(i + chunkSize, indicatorRows.length)}/${indicatorRows.length}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgres://mdes:mdes@127.0.0.1:5433/mdes";
  const sql = createSql(databaseUrl);
  await seedIndicators(sql);

  const [doc] = await sql<{ id: string }[]>`
    insert into document (title, source_uri, meta)
    values ('seed-smoke', null, ${sql.json({ kind: "smoke" })})
    returning id
  `;
  await sql`
    insert into document_chunk (document_id, chunk_index, content, embedding, meta)
    values (${doc.id}, 0, 'pgvector reserved table smoke', null, ${sql.json({})})
  `;

  const counts = await sql<{ phase: string; n: string }[]>`
    select phase, count(*)::text as n from indicator group by phase order by phase
  `;
  console.log("seeded", counts);
  await sql.end({ timeout: 5 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
