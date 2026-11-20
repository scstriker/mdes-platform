export type TradeKpi = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  subline: string;
};

export type TradeAnnualPoint = {
  period: string;
  exportUsd: number;
  importUsd: number;
  surplusUsd: number;
  exportYoy: string;
  importYoy: string;
};

export type TradePartnerRow = {
  country: string;
  iso: string;
  importShare: number;
  exportShare: number;
  focusCategory: string;
};

export type TradeCategoryRow = {
  id: string;
  category: string;
  hsRange: string;
  exportUsd: number;
  importUsd: number;
  importCr3: string;
  yoy: string;
  topOrigins: string;
};

export type HighConcentrationHsRow = {
  hsCode: string;
  itemName: string;
  topOrigins: string;
  cr3: string;
  linkedCode: string;
};

export const TRADE_KPIS: readonly TradeKpi[] = [
  {
    id: "export",
    label: "前三季度出口额",
    value: "312.6",
    unit: "亿美元",
    subline: "同比 +6.6% · 诊疗设备占比升至 47.0%",
  },
  {
    id: "import",
    label: "前三季度进口额",
    value: "268.4",
    unit: "亿美元",
    subline: "同比 -2.1% · 中高端整机国产替代提速",
  },
  {
    id: "surplus",
    label: "贸易顺差",
    value: "44.2",
    unit: "亿美元",
    subline: "结构持续优化 · 一般贸易顺差稳步扩大",
  },
  {
    id: "cr3",
    label: "高端影像进口来源 CR3",
    value: "43.0%",
    subline: "前三位来源国集中度（美 / 德 / 日）",
  },
];

export const TRADE_ANNUAL_SERIES: readonly TradeAnnualPoint[] = [
  { period: "2021", exportUsd: 418.2, importUsd: 389.4, surplusUsd: 28.8, exportYoy: "+9.4%", importYoy: "+8.1%" },
  { period: "2022", exportUsd: 409.5, importUsd: 378.1, surplusUsd: 31.4, exportYoy: "-2.1%", importYoy: "-2.9%" },
  { period: "2023", exportUsd: 421.8, importUsd: 374.6, surplusUsd: 47.2, exportYoy: "+3.0%", importYoy: "-0.9%" },
  { period: "2024", exportUsd: 443.6, importUsd: 366.2, surplusUsd: 77.4, exportYoy: "+5.2%", importYoy: "-2.2%" },
  { period: "2025", exportUsd: 468.4, importUsd: 358.9, surplusUsd: 109.5, exportYoy: "+5.6%", importYoy: "-2.0%" },
  { period: "2026Q1-Q3", exportUsd: 312.6, importUsd: 268.4, surplusUsd: 44.2, exportYoy: "+6.6%", importYoy: "-2.1%" },
];

export const TRADE_PARTNER_ROWS: readonly TradePartnerRow[] = [
  {
    country: "美国",
    iso: "US",
    importShare: 24.2,
    exportShare: 23.6,
    focusCategory: "高端影像部件、电生理介入与一次性耗材",
  },
  {
    country: "德国",
    iso: "DE",
    importShare: 17.8,
    exportShare: 7.4,
    focusCategory: "CT/磁共振整机、光学内窥镜与精密外科器械",
  },
  {
    country: "日本",
    iso: "JP",
    importShare: 11.4,
    exportShare: 6.2,
    focusCategory: "软式消化内镜、超声探头组件与血液净化耗材",
  },
  {
    country: "爱尔兰",
    iso: "IE",
    importShare: 7.6,
    exportShare: 1.8,
    focusCategory: "血管介入支架、起搏器与骨科植入物",
  },
  {
    country: "荷兰",
    iso: "NL",
    importShare: 5.9,
    exportShare: 5.4,
    focusCategory: "DSA 血管造影系统与欧洲分拨转口中枢",
  },
];

/** 五大品类出口合计 312.6 亿美元，进口合计 268.4 亿美元，顺差 44.2 亿美元 */
export const TRADE_CATEGORIES: readonly TradeCategoryRow[] = [
  {
    id: "equip",
    category: "医院诊断与治疗设备",
    hsRange: "9018.11–20 / 9022",
    exportUsd: 146.8,
    importUsd: 138.2,
    importCr3: "43.0%",
    yoy: "+8.9%",
    topOrigins: "美 / 德 / 日",
  },
  {
    id: "consumables",
    category: "一次性医用耗材",
    hsRange: "9018.31–39 / 3926",
    exportUsd: 74.5,
    importUsd: 46.8,
    importCr3: "34.2%",
    yoy: "+6.1%",
    topOrigins: "美 / 爱尔兰 / 德",
  },
  {
    id: "rehab",
    category: "保健康复用品",
    hsRange: "9019 / 9021 / 8713",
    exportUsd: 48.2,
    importUsd: 22.6,
    importCr3: "31.5%",
    yoy: "+4.8%",
    topOrigins: "美 / 瑞士 / 德",
  },
  {
    id: "dental",
    category: "口腔设备与材料",
    hsRange: "9018.41–49 / 3006.40",
    exportUsd: 21.4,
    importUsd: 39.5,
    importCr3: "52.4%",
    yoy: "+7.3%",
    topOrigins: "瑞士 / 德 / 韩",
  },
  {
    id: "dressing",
    category: "医用敷料",
    hsRange: "3005.10 / 3005.90",
    exportUsd: 21.7,
    importUsd: 21.3,
    importCr3: "28.6%",
    yoy: "+1.9%",
    topOrigins: "美 / 英 / 日",
  },
];

export const HIGH_CONCENTRATION_HS: readonly HighConcentrationHsRow[] = [
  {
    hsCode: "9022.3000",
    itemName: "医用高热容量 X 射线管（CT 球管）",
    topOrigins: "美国、德国、新加坡",
    cr3: "78.4%",
    linkedCode: "TRD-006",
  },
  {
    hsCode: "9018.1310",
    itemName: "高场强医用磁共振成像成套装置（3.0T 及以上）",
    topOrigins: "德国、美国、荷兰",
    cr3: "71.2%",
    linkedCode: "TRD-001",
  },
  {
    hsCode: "9018.9020",
    itemName: "电子消化内窥镜及光学成像核心组件",
    topOrigins: "日本、德国、美国",
    cr3: "83.6%",
    linkedCode: "TRD-006",
  },
];
