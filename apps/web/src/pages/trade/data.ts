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

export type TradeCr3Point = {
  name: string;
  tier: "关键核心部件" | "高端整机装备" | "海关五大品类";
  cr3: number;
  topOrigins: string;
  hsScope: string;
};

export type TradePartnerRow = {
  country: string;
  iso: string;
  exportUsd: number;
  importUsd: number;
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
  surplusUsd: number;
  importCr3: string;
  yoy: string;
  topOrigins: string;
};

export type HighConcentrationHsRow = {
  hsCode: string;
  itemName: string;
  category: string;
  importUsd: number;
  topOrigins: string;
  cr3: string;
  supplyNote: string;
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
    subline: "同比 -2.1% · 中高端整机本土替代提速",
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
    label: "核心部件最高进口 CR3",
    value: "83.6%",
    subline: "电子内镜核心组件（日本 / 德国 / 美国）",
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

/** 图 2：关键整机零部件与五大品类进口来源国 CR3 对比（单位：%） */
export const TRADE_CR3_RANKING: readonly TradeCr3Point[] = [
  {
    name: "电子内镜核心组件",
    tier: "关键核心部件",
    cr3: 83.6,
    topOrigins: "日本 / 德国 / 美国",
    hsScope: "9018.9030",
  },
  {
    name: "医用CT球管",
    tier: "关键核心部件",
    cr3: 78.4,
    topOrigins: "美国 / 德国 / 新加坡",
    hsScope: "9022.3000",
  },
  {
    name: "3.0T及以上磁共振",
    tier: "高端整机装备",
    cr3: 71.2,
    topOrigins: "德国 / 美国 / 荷兰",
    hsScope: "9018.1310",
  },
  {
    name: "口腔设备与材料",
    tier: "海关五大品类",
    cr3: 52.4,
    topOrigins: "瑞士 / 德国 / 韩国",
    hsScope: "9018.41–49 / 3006.40",
  },
  {
    name: "医院诊断与治疗设备",
    tier: "海关五大品类",
    cr3: 43.0,
    topOrigins: "美国 / 德国 / 日本",
    hsScope: "9018.11–20 / 9022",
  },
  {
    name: "一次性医用耗材",
    tier: "海关五大品类",
    cr3: 34.2,
    topOrigins: "美国 / 爱尔兰 / 德国",
    hsScope: "9018.31–39 / 3926",
  },
  {
    name: "保健康复用品",
    tier: "海关五大品类",
    cr3: 31.5,
    topOrigins: "美国 / 瑞士 / 德国",
    hsScope: "9019 / 9021 / 8713",
  },
  {
    name: "医用敷料",
    tier: "海关五大品类",
    cr3: 28.6,
    topOrigins: "美国 / 英国 / 日本",
    hsScope: "3005.10 / 3005.90",
  },
];

export const TRADE_PARTNER_ROWS: readonly TradePartnerRow[] = [
  {
    country: "美国",
    iso: "US",
    exportUsd: 73.8,
    importUsd: 65.0,
    importShare: 24.2,
    exportShare: 23.6,
    focusCategory: "高端影像核心部件、电生理介入导管与一次性医用耗材",
  },
  {
    country: "德国",
    iso: "DE",
    exportUsd: 23.1,
    importUsd: 47.8,
    importShare: 17.8,
    exportShare: 7.4,
    focusCategory: "CT 与磁共振整机、硬式光学内窥镜与精密外科器械",
  },
  {
    country: "日本",
    iso: "JP",
    exportUsd: 19.4,
    importUsd: 30.6,
    importShare: 11.4,
    exportShare: 6.2,
    focusCategory: "电子消化内镜、高频超声探头晶元与血液净化耗材",
  },
  {
    country: "爱尔兰",
    iso: "IE",
    exportUsd: 5.6,
    importUsd: 20.4,
    importShare: 7.6,
    exportShare: 1.8,
    focusCategory: "结构性心脏病介入瓣膜、起搏器与骨科植入物",
  },
  {
    country: "荷兰",
    iso: "NL",
    exportUsd: 16.9,
    importUsd: 15.8,
    importShare: 5.9,
    exportShare: 5.4,
    focusCategory: "血管造影系统（DSA）与欧洲市场分拨转口中枢",
  },
  {
    country: "瑞士",
    iso: "CH",
    exportUsd: 4.1,
    importUsd: 13.7,
    importShare: 5.1,
    exportShare: 1.3,
    focusCategory: "高端口腔种植体、精密骨科内固定与实验室自动化系统",
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
    surplusUsd: 8.6,
    importCr3: "43.0%",
    yoy: "+8.9%",
    topOrigins: "美国 / 德国 / 日本",
  },
  {
    id: "consumables",
    category: "一次性医用耗材",
    hsRange: "9018.31–39 / 3926",
    exportUsd: 74.5,
    importUsd: 46.8,
    surplusUsd: 27.7,
    importCr3: "34.2%",
    yoy: "+6.1%",
    topOrigins: "美国 / 爱尔兰 / 德国",
  },
  {
    id: "rehab",
    category: "保健康复用品",
    hsRange: "9019 / 9021 / 8713",
    exportUsd: 48.2,
    importUsd: 22.6,
    surplusUsd: 25.6,
    importCr3: "31.5%",
    yoy: "+4.8%",
    topOrigins: "美国 / 瑞士 / 德国",
  },
  {
    id: "dental",
    category: "口腔设备与材料",
    hsRange: "9018.41–49 / 3006.40",
    exportUsd: 21.4,
    importUsd: 39.5,
    surplusUsd: -18.1,
    importCr3: "52.4%",
    yoy: "+7.3%",
    topOrigins: "瑞士 / 德国 / 韩国",
  },
  {
    id: "dressing",
    category: "医用敷料",
    hsRange: "3005.10 / 3005.90",
    exportUsd: 21.7,
    importUsd: 21.3,
    surplusUsd: 0.4,
    importCr3: "28.6%",
    yoy: "+1.9%",
    topOrigins: "美国 / 英国 / 日本",
  },
];

export const HIGH_CONCENTRATION_HS: readonly HighConcentrationHsRow[] = [
  {
    hsCode: "9018.9030",
    itemName: "电子消化内窥镜及光学成像核心组件",
    category: "医院诊断与治疗设备",
    importUsd: 8.4,
    topOrigins: "日本、德国、美国",
    cr3: "83.6%",
    supplyNote: "微型高帧率图像传感器与精密导光束供应高度集中",
  },
  {
    hsCode: "9022.3000",
    itemName: "医用高热容量 X 射线管（CT 球管）",
    category: "医院诊断与治疗设备",
    importUsd: 6.9,
    topOrigins: "美国、德国、新加坡",
    cr3: "78.4%",
    supplyNote: "8MHU 及以上液态金属轴承球管仍以跨国原厂配套为主",
  },
  {
    hsCode: "9021.3900",
    itemName: "人工心脏瓣膜、耳蜗及神经调控植入体",
    category: "保健康复用品",
    importUsd: 14.2,
    topOrigins: "美国、爱尔兰、瑞士",
    cr3: "74.5%",
    supplyNote: "经导管介入瓣膜与有源神经刺激器进口来源集中",
  },
  {
    hsCode: "9018.1310",
    itemName: "高场强医用磁共振成像成套装置（3.0T 及以上）",
    category: "医院诊断与治疗设备",
    importUsd: 11.6,
    topOrigins: "德国、美国、荷兰",
    cr3: "71.2%",
    supplyNote: "整机进口额稳步回落，超高场超导磁体与射频部件仍集中",
  },
  {
    hsCode: "9022.1400",
    itemName: "医用血管造影 X 射线装置（DSA）及平板探测器",
    category: "医院诊断与治疗设备",
    importUsd: 7.8,
    topOrigins: "德国、荷兰、美国",
    cr3: "68.5%",
    supplyNote: "复合手术室多轴悬吊 DSA 系统由欧美头部厂商主导",
  },
  {
    hsCode: "9018.4910",
    itemName: "口腔种植体及数字化椅旁修复设备",
    category: "口腔设备与材料",
    importUsd: 15.3,
    topOrigins: "瑞士、德国、韩国",
    cr3: "64.8%",
    supplyNote: "集采放量带动进口量增长，高端活性表面种植体集中度高",
  },
];
