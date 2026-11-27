export type ProductChannel = "all" | "reg" | "innov" | "priority" | "udi";

export type ProductOrigin = "国产" | "进口";

export type ProductCategory =
  | "医学影像"
  | "有源手术与机器人"
  | "心血管与神经植入"
  | "体外诊断"
  | "医用软件";

export type ProductKpiItem = {
  label: string;
  value: string;
  unit: string;
  subnote: string;
};

export const PRODUCT_KPIS: readonly ProductKpiItem[] = [
  {
    label: "境内有效三类注册证",
    value: "24,680",
    unit: "件",
    subnote: "期末存量快照 · 国产占 74.2%",
  },
  {
    label: "前三季度三类首次注册",
    value: "2,814",
    unit: "件",
    subnote: "同比 +9.6% · 国产占 71.2%",
  },
  {
    label: "前三季度获批创新器械",
    value: "49",
    unit: "件",
    subnote: "累计正式获批上市 318 件",
  },
  {
    label: "优先审批在审/本年批准",
    value: "12 / 8",
    unit: "项",
    subnote: "临床急需与罕见病诊断通道",
  },
  {
    label: "UDI 规格型号明细",
    value: "186.4",
    unit: "万条",
    subnote: "覆盖 9.7 万证 · 最小销售单元",
  },
];

export type RegTrendPoint = {
  period: string;
  domestic: number;
  imported: number;
  innovApproved: number;
};

export const REG_TREND_SERIES: readonly RegTrendPoint[] = [
  { period: "2021", domestic: 1138, imported: 1046, innovApproved: 35 },
  { period: "2022", domestic: 1342, imported: 1037, innovApproved: 55 },
  { period: "2023", domestic: 1625, imported: 1004, innovApproved: 61 },
  { period: "2024", domestic: 1894, imported: 1006, innovApproved: 65 },
  { period: "2025", domestic: 2218, imported: 1001, innovApproved: 68 },
  { period: "2026Q1-Q3", domestic: 2004, imported: 810, innovApproved: 49 },
];

export type TrackDistributionItem = {
  track: string;
  domesticValid: number;
  importedValid: number;
  sharePct: string;
};

/** 六大重点赛道有效三类注册证分布（国内 18,315 + 进口 6,365 = 24,680 件） */
export const TRACK_DISTRIBUTION: readonly TrackDistributionItem[] = [
  { track: "无源植介入", domesticValid: 6420, importedValid: 2510, sharePct: "36.2%" },
  { track: "体外诊断", domesticValid: 5680, importedValid: 1640, sharePct: "29.7%" },
  { track: "医学影像", domesticValid: 2490, importedValid: 1080, sharePct: "14.5%" },
  { track: "有源手术与机器人", domesticValid: 1860, importedValid: 690, sharePct: "10.3%" },
  { track: "医用软件", domesticValid: 1120, importedValid: 260, sharePct: "5.6%" },
  { track: "康复护理", domesticValid: 745, importedValid: 185, sharePct: "3.8%" },
];

export type AnnualReconciliationRow = {
  year: string;
  dbInitialCount: string;
  officialReportCount: string;
  deviation: string;
  note: string;
};

export const ANNUAL_RECONCILIATION: readonly AnnualReconciliationRow[] = [
  {
    year: "2025",
    dbInitialCount: "3,219",
    officialReportCount: "3,231",
    deviation: "-0.37%",
    note: "年末跨月挂网批件次年补录，对账误差 <0.5%",
  },
  {
    year: "2024",
    dbInitialCount: "2,900",
    officialReportCount: "2,908",
    deviation: "-0.28%",
    note: "港澳台注册证（国械注许）单列归口核验一致",
  },
  {
    year: "2023",
    dbInitialCount: "2,629",
    officialReportCount: "2,638",
    deviation: "-0.34%",
    note: "勘误重发批件按首次批准文号去重",
  },
  {
    year: "2022",
    dbInitialCount: "2,379",
    officialReportCount: "2,388",
    deviation: "-0.38%",
    note: "三类体外诊断试剂集中换发批次复核",
  },
  {
    year: "2021",
    dbInitialCount: "2,184",
    officialReportCount: "2,194",
    deviation: "-0.46%",
    note: "历史批件扫描件解析补齐后双源锁定",
  },
  {
    year: "2026Q1-Q3",
    dbInitialCount: "2,814",
    officialReportCount: "待年报发布",
    deviation: "—",
    note: "器审公开批件日更聚合快照（截至 09-30，国产占 71.2%）",
  },
];

export type ProductExplorerRow = {
  id: string;
  certOrCode: string;
  productName: string;
  specAndScope: string;
  channel: Exclude<ProductChannel, "all">;
  channelLabel: string;
  category: ProductCategory;
  registrant: string;
  origin: ProductOrigin;
  originRegion: string;
  approvalDate: string;
};

export const CHANNEL_TABS: readonly { id: ProductChannel; label: string }[] = [
  { id: "all", label: "全部记录" },
  { id: "reg", label: "常规三类注册" },
  { id: "innov", label: "创新器械获批" },
  { id: "priority", label: "优先审批通道" },
  { id: "udi", label: "UDI 规格样本" },
];

export const ORIGIN_OPTIONS: readonly ProductOrigin[] = ["国产", "进口"];

export const CATEGORY_OPTIONS: readonly ProductCategory[] = [
  "医学影像",
  "有源手术与机器人",
  "心血管与神经植入",
  "体外诊断",
  "医用软件",
];

export const PRODUCT_EXPLORER_ROWS: readonly ProductExplorerRow[] = [
  {
    id: "prd-01",
    certOrCode: "国械注准20223061141",
    productName: "磁共振成像系统（uMR Jupiter）",
    specAndScope: "型号 uMR Jupiter · 5.0T 超导磁体与 8 通道全身并行射频发射（器审受理号 CQZ2200057），适用全身磁共振成像诊断",
    channel: "innov",
    channelLabel: "创新获批",
    category: "医学影像",
    registrant: "上海联影医疗科技股份有限公司",
    origin: "国产",
    originRegion: "上海",
    approvalDate: "2022-08-24",
  },
  {
    id: "prd-02",
    certOrCode: "国械注进20263060198",
    productName: "光子计数探测器计算机体层摄影设备（PCCT）",
    specAndScope: "型号 NAEOTOM Alpha · 碲化镉半导体光子直转探测器，支持多能谱冠脉高分辨成像",
    channel: "innov",
    channelLabel: "创新获批",
    category: "医学影像",
    registrant: "西门子医疗系统",
    origin: "进口",
    originRegion: "德国",
    approvalDate: "2026-07-04",
  },
  {
    id: "prd-03",
    certOrCode: "国械注准20263010537",
    productName: "腹腔内窥镜单孔手术系统",
    specAndScope: "型号 SR-ENS-600 · 蛇形连续体多自由度可弯机械臂，适用泌尿外科与妇科单孔微创手术",
    channel: "innov",
    channelLabel: "创新获批",
    category: "有源手术与机器人",
    registrant: "北京术锐机器人",
    origin: "国产",
    originRegion: "北京",
    approvalDate: "2026-09-11",
  },
  {
    id: "prd-04",
    certOrCode: "国械注准20263120309",
    productName: "植入式左心室辅助系统（全磁悬浮人工心脏）",
    specAndScope: "型号 Corheart 6 · 微型全磁悬浮离心血泵（泵体 90g），用于终末期心衰机械循环支持",
    channel: "innov",
    channelLabel: "创新获批",
    category: "心血管与神经植入",
    registrant: "深圳核心医疗科技",
    origin: "国产",
    originRegion: "广东",
    approvalDate: "2026-08-03",
  },
  {
    id: "prd-05",
    certOrCode: "国械注准20263060621",
    productName: "血管内超声与光学相干断层成像一体机（IVUS-OCT）",
    specAndScope: "型号 Cornaris P80 · 双模态同步配准回撤导管系统，单次推注评估冠脉斑块与支架贴壁",
    channel: "innov",
    channelLabel: "创新获批",
    category: "医学影像",
    registrant: "深圳中科微光医疗",
    origin: "国产",
    originRegion: "广东",
    approvalDate: "2026-09-02",
  },
  {
    id: "prd-06",
    certOrCode: "国械注进20263120145",
    productName: "双腔无导线心脏起搏器系统",
    specAndScope: "型号 AVEIR DR · 心房与心室双植入体无线导电脉冲同步，减少囊袋与电极导线并发症",
    channel: "innov",
    channelLabel: "创新获批",
    category: "心血管与神经植入",
    registrant: "雅培医疗器械",
    origin: "进口",
    originRegion: "美国",
    approvalDate: "2026-05-28",
  },
  {
    id: "prd-07",
    certOrCode: "国械注准20263010284",
    productName: "骨科关节置换手术导航定位系统",
    specAndScope: "型号 TiRobot Recon · 膝髋一体亚毫米级光学追踪与截骨机械臂控制主机",
    channel: "reg",
    channelLabel: "常规三类",
    category: "有源手术与机器人",
    registrant: "北京天智航医疗",
    origin: "国产",
    originRegion: "北京",
    approvalDate: "2026-06-22",
  },
  {
    id: "prd-08",
    certOrCode: "国械注准20263210176",
    productName: "冠状动脉 CT 血流储备分数计算软件（CT-FFR）",
    specAndScope: "型号 CoronaryDoc FFR V3 · 基于冠脉 CTA 影像流体力学建模评估心肌缺血功能学意义",
    channel: "reg",
    channelLabel: "常规三类",
    category: "医用软件",
    registrant: "数坤（北京）网络科技",
    origin: "国产",
    originRegion: "北京",
    approvalDate: "2026-04-17",
  },
  {
    id: "prd-09",
    certOrCode: "国械注准20263130488",
    productName: "颅内动脉瘤血流导向密网支架",
    specAndScope: "型号 Tubridge Plus · 铂钨显影丝与镍钛丝混编高金属覆盖率构型，适用大型宽颈动脉瘤",
    channel: "reg",
    channelLabel: "常规三类",
    category: "心血管与神经植入",
    registrant: "微创神通医疗科技",
    origin: "国产",
    originRegion: "上海",
    approvalDate: "2026-07-29",
  },
  {
    id: "prd-10",
    certOrCode: "国械注准20263400512",
    productName: "人类泛癌种多基因突变联合检测试剂盒（可逆末端终止测序法）",
    specAndScope: "型号 ADx-NGS 32 · 肺癌/结直肠癌 FFPE 组织样本靶向伴随诊断三类试剂",
    channel: "reg",
    channelLabel: "常规三类",
    category: "体外诊断",
    registrant: "厦门艾德生物医药",
    origin: "国产",
    originRegion: "福建",
    approvalDate: "2026-08-26",
  },
  {
    id: "prd-11",
    certOrCode: "优审受字2026-009号",
    productName: "脊髓性肌萎缩症（SMA）SMN1 基因外显子缺失检测试剂盒",
    specAndScope: "罕见病诊断优先通道 · 新生儿干血斑荧光 PCR 定性检测 · 本年已批准上市",
    channel: "priority",
    channelLabel: "优先审批",
    category: "体外诊断",
    registrant: "圣湘生物科技",
    origin: "国产",
    originRegion: "湖南",
    approvalDate: "2026-07-15",
  },
  {
    id: "prd-12",
    certOrCode: "优审受字2026-014号",
    productName: "儿童专用生物可降解房间隔缺损封堵器",
    specAndScope: "儿童临床急需优先通道 · 聚左旋乳酸全降解编织骨架 · 技术审评在审公示",
    channel: "priority",
    channelLabel: "优先审批",
    category: "心血管与神经植入",
    registrant: "先健科技（深圳）",
    origin: "国产",
    originRegion: "广东",
    approvalDate: "2026-09-08",
  },
  {
    id: "prd-13",
    certOrCode: "优审受字2026-011号",
    productName: "质子放射治疗在线自适应图像引导计划软件",
    specAndScope: "恶性肿瘤精准放疗优先通道 · 锥形束 CT 变形配准与蒙特卡洛剂量重算 · 本年已批准",
    channel: "priority",
    channelLabel: "优先审批",
    category: "医用软件",
    registrant: "瓦里安医疗系统",
    origin: "进口",
    originRegion: "美国",
    approvalDate: "2026-06-30",
  },
  {
    id: "prd-14",
    certOrCode: "06941289003152",
    productName: "紫杉醇释放冠脉球囊扩张导管（UDI-DI 规格明细）",
    specAndScope: "规格 Ø2.75mm×20mm · 最小销售单元（盒=1支） · 关联国械注准20233030811",
    channel: "udi",
    channelLabel: "UDI 样本",
    category: "心血管与神经植入",
    registrant: "山东吉威医疗制品",
    origin: "国产",
    originRegion: "山东",
    approvalDate: "2026-09-18",
  },
  {
    id: "prd-15",
    certOrCode: "06970345210884",
    productName: "一次性使用电动腔镜直线型切割吻合器钉仓组件（UDI-DI）",
    specAndScope: "规格 EC60A-Blue 3.5mm · 中盒包装单元（6把/盒） · 关联国械注准20243010209",
    channel: "udi",
    channelLabel: "UDI 样本",
    category: "有源手术与机器人",
    registrant: "天臣国际医疗科技",
    origin: "国产",
    originRegion: "江苏",
    approvalDate: "2026-09-12",
  },
  {
    id: "prd-16",
    certOrCode: "04056869104227",
    productName: "高敏肌钙蛋白 T 检测试剂盒（电化学发光法 UDI-DI）",
    specAndScope: "规格 200测试/盒（Elecsys cobas e） · 2–8℃冷链赋码 · 关联国械注进20223400317",
    channel: "udi",
    channelLabel: "UDI 样本",
    category: "体外诊断",
    registrant: "罗氏诊断产品",
    origin: "进口",
    originRegion: "德国",
    approvalDate: "2026-08-30",
  },
];
