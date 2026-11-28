/** 规格正文里提到的其他指标编号（如 REG-021、PRD-056），用来生成「关联指标」 */
export const INDICATOR_ID_RE = /\b[A-Z]{3}-\d{3}\b/g;

export type Mention = { id: string; fields: string[] };

export function findMentions(selfId: string, texts: Record<string, unknown>): Mention[] {
  const byId = new Map<string, Set<string>>();
  for (const [field, text] of Object.entries(texts)) {
    if (typeof text !== "string") continue;
    for (const m of text.matchAll(INDICATOR_ID_RE)) {
      if (m[0] === selfId) continue;
      const set = byId.get(m[0]) ?? new Set<string>();
      set.add(field);
      byId.set(m[0], set);
    }
  }
  return [...byId.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, fields]) => ({ id, fields: [...fields] }));
}
