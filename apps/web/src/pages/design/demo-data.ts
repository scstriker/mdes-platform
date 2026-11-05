/** /__design 的示例数据，内容取自 ITEI showcase 与 MDES 指标体系 */
export type HsRow = { hs: string; name: string; amount: number; yoy: number; status: "已核对" | "复核中" };

export const HS_ROWS: HsRow[] = [
  { hs: "9018.12", name: "超声扫描装置", amount: 38214, yoy: 6.2, status: "已核对" },
  { hs: "9018.13", name: "核磁共振成像装置", amount: 61907, yoy: -1.8, status: "已核对" },
  { hs: "9022.12", name: "X 射线断层检查仪", amount: 54330, yoy: 3.9, status: "复核中" },
  { hs: "9018.19", name: "其他电气诊断装置", amount: 27461.5, yoy: 12.4, status: "已核对" },
];

export const CLUSTER_TREE = [
  {
    id: "TRD",
    number: "07",
    label: "进出口贸易",
    count: 5,
    children: [
      { id: "TRD-001", label: "医疗装备进口金额", count: 3 },
      { id: "TRD-002", label: "医疗装备出口金额", count: 3 },
      { id: "TRD-003", label: "贸易伙伴结构", count: 0 },
    ],
  },
  { id: "REG", number: "06", label: "审评注册与上市准入", count: 4 },
  { id: "POL", number: "04", label: "国家和地方政策", count: 3 },
];

export const MONTHS = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"];
export const IMPORT_SERIES = [128.5, 131.2, 125.8, 133.4, 137.9, 135.1];
export const EXPORT_SERIES = [96.4, 99.1, 101.7, 98.2, 104.6, 108.3];
