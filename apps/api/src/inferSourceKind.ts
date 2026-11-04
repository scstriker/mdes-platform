export function inferSourceKind(source: string, collectMethod: string): string {
  const text = `${source} ${collectMethod}`.toLowerCase();
  const hasWind = text.includes("wind");
  const hasTopic =
    text.includes("专题") || text.includes("专家") || text.includes("人工维护");
  const hasPub =
    text.includes("海关") ||
    text.includes("药监") ||
    text.includes("udi") ||
    text.includes("公开") ||
    text.includes("年报") ||
    text.includes("comtrade");

  if (hasWind && (hasPub || hasTopic)) return "mixed";
  if (hasWind) return "wind";
  if (hasTopic && !hasPub) return "topic";
  if (hasPub) return "pub";
  if (hasTopic) return "topic";
  return "unknown";
}
