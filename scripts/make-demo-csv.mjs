#!/usr/bin/env node
/**
 * 生成演示用 CSV（虚构数据，不是真实统计），用于截图与界面自查：
 * 多省份 + 全国、多贸易伙伴、混合单位、年度与月度、重复期间、纯文本值等切片情形。
 * 结果固定（带种子的随机数），重复运行得到同一份文件。
 *
 * 用法：node scripts/make-demo-csv.mjs > /tmp/trd_demo.csv
 * 然后在「数据导入」页上传，或：curl -F file=@/tmp/trd_demo.csv http://127.0.0.1:8787/api/import/csv
 */
let seed = 7;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + (b - a) * rand();
const dims = (o) => `"${JSON.stringify(o).replace(/"/g, '""')}"`;

const rows = ["indicator_id,period,geo,value_num,unit,value_text,dims"];
const months = [2023, 2024].flatMap((y) => Array.from({ length: 12 }, (_, m) => `${y}-${String(m + 1).padStart(2, "0")}`));

const geos = { CN: 120, 440000: 28, 310000: 22, 320000: 19, 330000: 14, 110000: 11 };
for (const [geo, base] of Object.entries(geos)) {
  months.forEach((p, i) => {
    const v = base * (1 + 0.004 * i) + base * 0.06 * Math.sin(i / 2) + between(-0.02, 0.02) * base;
    rows.push(`TRD-001,${p},${geo},${v.toFixed(1)},亿元,,${dims({ trade_type: "import" })}`);
  });
}
months.forEach((p, i) => {
  rows.push(`TRD-002,${p},CN,${(95 * (1 + 0.006 * i) + 5 * Math.cos(i / 3)).toFixed(1)},亿元,,${dims({ trade_type: "export" })}`);
});
for (const p of months.slice(12, 18)) {
  rows.push(`TRD-002,${p},CN,${between(130000, 150000).toFixed(0)},万美元,,${dims({ trade_type: "export" })}`);
}
for (const [partner, base] of Object.entries({ US: 22, DE: 18, JP: 15, NL: 9, KR: 7 })) {
  months.slice(12).forEach((p, i) => {
    rows.push(`TRD-005,${p},CN,${(base * (1 + 0.01 * i) + between(-1, 1)).toFixed(1)},亿元,,${dims({ partner })}`);
  });
}
for (let y = 2019; y <= 2024; y++) {
  rows.push(`TRD-006,${y},CN,${(0.36 + 0.012 * (y - 2019)).toFixed(3)},,,${dims({ metric: "CR3" })}`);
  rows.push(`TRD-007,${y},CN,${(0.31 + 0.014 * (y - 2019)).toFixed(3)},,,${dims({ metric: "CR3" })}`);
}
rows.push("TRD-008,2024,CN,,,数据待专题论证,");

process.stdout.write(rows.join("\n") + "\n");
