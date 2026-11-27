import type { TradeQuantityStat } from "@mdes/shared";

const YI_DIVISOR = 100_000_000;

export function usdToYiNumber(usd: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round((usd / YI_DIVISOR + Number.EPSILON) * factor) / factor;
}

export function formatUsdToYi(usd: number, decimals = 4): string {
  return (usd / YI_DIVISOR).toFixed(decimals);
}

export function formatBalanceYi(usd: number, decimals = 4): string {
  const abs = Math.abs(usd) / YI_DIVISOR;
  if (usd > 0) return `+${abs.toFixed(decimals)}`;
  if (usd < 0) return `-${abs.toFixed(decimals)}`;
  return abs.toFixed(decimals);
}

export function formatRawUsd(usd: number): string {
  return `${usd.toLocaleString("zh-CN")} 美元`;
}

export function formatYoyPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "暂无数据";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function formatSharePct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "暂无数据";
  return `${pct.toFixed(1)}%`;
}

export function formatQtyStat(q: TradeQuantityStat): string {
  if (q.value === null) return q.unit === "MIXED" ? "跨单位不可加总" : "—";
  return `${q.value.toLocaleString("zh-CN")}${q.unit ? ` ${q.unit}` : ""}`;
}
