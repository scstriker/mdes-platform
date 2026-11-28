/** 数字一律千分位；中文语境下用 zh-CN 格式 */
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined, digits?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (digits != null) {
    return new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
  return (Number.isInteger(value) ? integer : decimal).format(value);
}

/** 文件大小：KB / MB，数字与单位之间留一个空格 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimal.format(bytes / 1024)} KB`;
  return `${decimal.format(bytes / 1024 / 1024)} MB`;
}
