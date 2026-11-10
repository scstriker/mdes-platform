/** D1 小工具：JSON 列在 SQLite 里是 TEXT，读出时还原成对象 */
export async function checkHealth(db: D1Database) {
  await db.prepare("select 1 as ok").first();
  return { db: "ok" as const };
}

export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string" || text === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
