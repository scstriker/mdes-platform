/**
 * 首页运行监测基准与专题发布数据（2026 年第 3 季度 · 总第 3 期）。
 * 对应《医疗器械产业数据系统指标体系 V3.0》（6 大领域、14 个二级分类、33 项三级指标）。
 */

export type KpiDirection = "up" | "down" | "flat";

export type BaselineKpi = {
  id: string;
  seq: string;
  label: string;
  value: number;
  digits?: number;
  unit: string;
  delta: string;
  direction: KpiDirection;
  href: string;
  trend: readonly number[];
};

export type ExecutiveInsight = {
  id: string;
  title: string;
  text: string;
  emphasize: boolean;
  evidenceLabel: string;
  evidenceHref: string;
};

export type ApprovedInnovation = {
  name: string;
  applicant: string;
  region: string;
  category: string;
  date: string;
};

export type ProvinceDistribution = {
  rank: string;
  province: string;
  regCount: number;
  sharePct: number;
  championCount: number;
};

export type TradeCategoryRow = {
  category: string;
  exportUsd: number;
  importUsd: number;
  importCr3Pct: number;
  yoySummary: string;
};

export type ResearchBriefing = {
  id: string;
  date: string;
  reportType: string;
  title: string;
  takeaway: string;
  citedSeqs: readonly { seq: string; label: string }[];
};

export type ArchiveCategory = "policy" | "guideline" | "standard";

export type RegulatoryArchiveItem = {
  id: string;
  category: ArchiveCategory;
  categoryLabel: string;
  seq: string;
  title: string;
  docNo: string;
  authority: string;
  date: string;
};

export type HeroSlideKind = "bluebook" | "medtech" | "reg-chart" | "trade-chart";

export type HeroCarouselSlide = {
  id: string;
  kind: HeroSlideKind;
  thumbLabel: string;
  title: string;
  synopsis: string;
  href: string;
  ctaLabel: string;
  /** 仅海报帧使用，叠加在无文字 Gemini 智库底图左侧留白处 */
  posterKicker?: string;
  posterLines?: readonly [string, string];
  posterFoot?: string;
};

export type HomepageStat = {
  id: string;
  label: string;
  value: number;
  digits?: number;
  unit: string;
  href: string;
};

export type HomepageInsight = {
  id: string;
  title: string;
  href: string;
  featured?: boolean;
};

export type HomepageBriefing = {
  id: string;
  coverVariant: "quarterly" | "domestic";
  coverLabel: string;
  title: string;
  href: string;
};

export const ISSUE = {
  eyebrow: "机械工业仪器仪表综合技术经济研究所（ITEI） · 产业数据与决策支撑系统",
  heroTitle: "医疗器械产业数据与运行分析平台",
  heroCoverage:
    "整合境内与进口器械审评注册、UDI规格型号、重点生产与上市企业、政策技术标准及海关进出口 6 大领域 33 项核心指标。",
  periodEyebrow: "本期监测基准 · 2026年第3季度（总第3期）",
  periodLabel: "2026 年第三季度",
  issueNo: "总第 3 期",
  publishedAt: "2026-10-28",
  dataAsOf: "2026-09-30",
  dataSyncNote: "2026-09-30（日/月度增量同步）",
  coreSources: "国家药监局 · 工信部 · 海关总署 · Wind",
  systemScope: "《指标体系 V3.0》6 大领域 · 33 项三级指标（一期纳入 10 项）",
  publisher: "机械工业仪器仪表综合技术经济研究所",
  headline: "前三季度创新医疗器械审评提速，国产三类首次注册占比升至七成",
  lead: "本期共监测第三类医疗器械首次注册 2,814 件（同比 +9.6%），获批创新医疗器械 49 件；医疗器械出口额 312.6 亿美元（+6.6%），进口额 268.4 亿美元（-2.1%）。",

  searchScopes: [
    { label: "全部指标与数据", path: "/system" },
    { label: "注册与产品", path: "/products" },
    { label: "企业与机构", path: "/enterprises" },
    { label: "进出口贸易", path: "/trade" },
    { label: "政策与报告", path: "/reports" },
  ] as const,

  hotQueries: [
    { label: "第三类首次注册", href: "/products?q=第三类首次注册" },
    { label: "创新医疗器械", href: "/products?channel=innov" },
    { label: "制造业单项冠军", href: "/enterprises?q=单项冠军" },
    { label: "手术机器人指导原则", href: "/reports?q=手术机器人" },
    { label: "海关进出口", href: "/trade" },
  ] as const,

  kpis: [
    {
      id: "reg-c3",
      seq: "01",
      label: "三类首次注册",
      value: 2814,
      unit: "件",
      delta: "同比 +9.6%",
      direction: "up",
      href: "/products",
      trend: [2184, 2379, 2629, 2900, 3219, 2814],
    },
    {
      id: "innov-approved",
      seq: "02",
      label: "获批创新器械",
      value: 49,
      unit: "件",
      delta: "较上年同期 +11 件",
      direction: "up",
      href: "/products?channel=innov",
      trend: [28, 32, 35, 38, 42, 49],
    },
    {
      id: "priority-review",
      seq: "03",
      label: "优先审批在审",
      value: 12,
      unit: "项",
      delta: "较上期持平",
      direction: "flat",
      href: "/products?channel=priority",
      trend: [10, 11, 12, 11, 12, 12],
    },
    {
      id: "trade-export",
      seq: "38",
      label: "器械出口额",
      value: 312.6,
      digits: 1,
      unit: "亿美元",
      delta: "同比 +6.6%",
      direction: "up",
      href: "/trade",
      trend: [275.4, 286.0, 291.8, 293.2, 304.5, 312.6],
    },
    {
      id: "trade-import",
      seq: "38",
      label: "器械进口额",
      value: 268.4,
      digits: 1,
      unit: "亿美元",
      delta: "同比 -2.1%",
      direction: "down",
      href: "/trade",
      trend: [289.6, 284.2, 279.5, 274.2, 271.0, 268.4],
    },
  ] satisfies readonly BaselineKpi[],

  regTrendSeries: [
    { period: "2021", domesticCount: 1138, importCount: 1046, domesticShare: 52.1 },
    { period: "2022", domesticCount: 1342, importCount: 1037, domesticShare: 56.4 },
    { period: "2023", domesticCount: 1625, importCount: 1004, domesticShare: 61.8 },
    { period: "2024", domesticCount: 1894, importCount: 1006, domesticShare: 65.3 },
    { period: "2025", domesticCount: 2218, importCount: 1001, domesticShare: 68.9 },
    { period: "2026Q1-Q3", domesticCount: 2004, importCount: 810, domesticShare: 71.2 },
  ] as const,

  tradeTrendSeries: [
    { period: "2025Q1", exportUsd: 96.2, importUsd: 90.8 },
    { period: "2025Q2", exportUsd: 99.4, importUsd: 92.1 },
    { period: "2025Q3", exportUsd: 97.6, importUsd: 91.3 },
    { period: "2025Q4", exportUsd: 104.8, importUsd: 93.5 },
    { period: "2026Q1", exportUsd: 101.5, importUsd: 88.6 },
    { period: "2026Q2", exportUsd: 104.3, importUsd: 89.5 },
    { period: "2026Q3", exportUsd: 106.8, importUsd: 90.3 },
  ] as const,

  innovTrackSeries: [
    { track: "有源手术与机器人", prevCount: 8, currCount: 12 },
    { track: "医学影像设备", prevCount: 7, currCount: 9 },
    { track: "心血管植介入", prevCount: 9, currCount: 10 },
    { track: "神经与脑机接口", prevCount: 4, currCount: 6 },
    { track: "体外诊断仪器试剂", prevCount: 6, currCount: 7 },
    { track: "骨科与生物材料", prevCount: 4, currCount: 5 },
  ] as const,

  insights: [
    {
      id: "01",
      title: "进口回落伴随结构升级，贸易顺差扩大但高端核心部件仍高集中",
      text: "前三季度器械进口额同比下降 2.1%，主要系中端常规影像与低值耗材本土替代加速；同期诊断与治疗设备出口增长 8.4%，但超导与核心探测器进口 CR3 仍逾七成。",
      emphasize: true,
      evidenceLabel: "核查进出口结构（指标 38）",
      evidenceHref: "/trade",
    },
    {
      id: "02",
      title: "创新审查资源持续向有源手术装备与高端植介入倾斜",
      text: "前三季度获批创新医疗器械 49 件，较上年同期增加 11 件；腔镜手术机器人、高场磁共振及电生理导管占比超过五成，审评转正周期稳步缩短。",
      emphasize: false,
      evidenceLabel: "核查创新获批明细（指标 02）",
      evidenceHref: "/products?channel=innov",
    },
    {
      id: "03",
      title: "东部五省市承载逾六成三类首次注册，须严格区分存量与新增口径",
      text: "粤苏沪京浙合计占全国第三类首次注册新增量 65.2%，区域集聚格局稳固；跨年度对比须与药监注册监管年报（28 号）首次注册口径交叉对账。",
      emphasize: false,
      evidenceLabel: "查阅药监年报口径（指标 28）",
      evidenceHref: "/system/28",
    },
  ] satisfies readonly ExecutiveInsight[],

  innovations: [
    {
      name: "腹腔内窥镜单孔手术系统",
      applicant: "精锋医疗",
      region: "广东",
      category: "01 有源手术器械",
      date: "2026-09-26",
    },
    {
      name: "5.0T 超高场磁共振成像系统",
      applicant: "联影医疗",
      region: "上海",
      category: "06 医用成像器械",
      date: "2026-09-18",
    },
    {
      name: "植入式闭环脑机接口神经刺激系统",
      applicant: "品驰医疗",
      region: "北京",
      category: "12 有源植入器械",
      date: "2026-08-30",
    },
    {
      name: "高频血管内超声与光学相干断层成像导管",
      applicant: "北芯生命",
      region: "江苏",
      category: "07 医用诊察监护",
      date: "2026-08-12",
    },
  ] satisfies readonly ApprovedInnovation[],

  provincesTop8: [
    { rank: "01", province: "广东", regCount: 512, sharePct: 18.2, championCount: 6 },
    { rank: "02", province: "江苏", regCount: 439, sharePct: 15.6, championCount: 5 },
    { rank: "03", province: "上海", regCount: 332, sharePct: 11.8, championCount: 4 },
    { rank: "04", province: "北京", regCount: 315, sharePct: 11.2, championCount: 5 },
    { rank: "05", province: "浙江", regCount: 236, sharePct: 8.4, championCount: 3 },
    { rank: "06", province: "山东", regCount: 163, sharePct: 5.8, championCount: 2 },
    { rank: "07", province: "湖北", regCount: 110, sharePct: 3.9, championCount: 1 },
    { rank: "08", province: "四川", regCount: 96, sharePct: 3.4, championCount: 1 },
  ] satisfies readonly ProvinceDistribution[],

  tradeCategories: [
    {
      category: "医院诊断与治疗设备",
      exportUsd: 142.8,
      importUsd: 181.5,
      importCr3Pct: 74.6,
      yoySummary: "出口 +8.4% / 进口 -3.2%",
    },
    {
      category: "一次性医用耗材",
      exportUsd: 78.4,
      importUsd: 41.2,
      importCr3Pct: 61.8,
      yoySummary: "出口 +6.1% / 进口 -1.4%",
    },
    {
      category: "保健康复用品",
      exportUsd: 46.5,
      importUsd: 16.8,
      importCr3Pct: 53.2,
      yoySummary: "出口 +4.9% / 进口 +0.8%",
    },
    {
      category: "口腔设备与材料",
      exportUsd: 21.7,
      importUsd: 19.6,
      importCr3Pct: 68.5,
      yoySummary: "出口 +7.2% / 进口 -0.9%",
    },
    {
      category: "医用敷料",
      exportUsd: 23.2,
      importUsd: 9.3,
      importCr3Pct: 49.4,
      yoySummary: "出口 +2.8% / 进口 -1.6%",
    },
  ] satisfies readonly TradeCategoryRow[],

  briefings: [
    {
      id: "br-2026q3",
      date: "2026-10-28",
      reportType: "季度运行监测报告",
      title: "2026 年前三季度医疗器械产业运行与审评准入监测报告（总第 3 期）",
      takeaway:
        "系统评估前三季度境内与进口第三类首次注册结构变化、创新通道转正节奏及五大品类进出口顺差演变，附药监年报与海关口径交叉对账说明。",
      citedSeqs: [
        { seq: "01", label: "注册明细 (01)" },
        { seq: "02", label: "创新器械 (02)" },
        { seq: "38", label: "进出口贸易 (38)" },
      ],
    },
    {
      id: "br-dom-c3",
      date: "2026-09-19",
      reportType: "专题研究简报",
      title: "国产第三类医疗器械首次注册占比突破七成的赛道解构与区域集聚分析",
      takeaway:
        "拆解 22 大类器械子目录国产替代斜率：有源手术、医用成像与无源植入拉动最为显著，而高场磁共振关键部件及神经介入高端导管仍存进口依赖。",
      citedSeqs: [
        { seq: "01", label: "注册明细 (01)" },
        { seq: "12", label: "单项冠军 (12)" },
        { seq: "28", label: "药监年报 (28)" },
      ],
    },
    {
      id: "br-supply-cr3",
      date: "2026-08-25",
      reportType: "供应链风险评估",
      title: "高端诊疗装备海关进口来源集中度（CR3）与上市龙头境外布局对照研究",
      takeaway:
        "辨析海关出口贸易额与上市药械企业年报境外营业收入的统计边界，定位进口来源国 CR3 高于 70% 的细分 HS 税号及国产首台套突破进展。",
      citedSeqs: [
        { seq: "13", label: "上市企业 (13)" },
        { seq: "16", label: "境外信息 (16)" },
        { seq: "38", label: "进出口贸易 (38)" },
      ],
    },
  ] satisfies readonly ResearchBriefing[],

  regulatoryArchive: [
    {
      id: "pol-01",
      category: "policy",
      categoryLabel: "政策条款",
      seq: "23",
      title: "关于进一步优化高端医疗装备创新审评审批与首台（套）应用推广协同机制的通知",
      docNo: "工信部联装〔2026〕114号",
      authority: "工业和信息化部 · 国家药监局",
      date: "2026-09-24",
    },
    {
      id: "gdl-01",
      category: "guideline",
      categoryLabel: "审查指导原则",
      seq: "24",
      title: "腹腔内窥镜手术系统注册审查指导原则（2026 年修订版）",
      docNo: "国家药监局器审中心通告 2026年第31号",
      authority: "国家药监局器审中心（CMDE）",
      date: "2026-09-16",
    },
    {
      id: "std-01",
      category: "standard",
      categoryLabel: "国家标准",
      seq: "37",
      title: "医用电气设备 第1-2部分：基本安全和基本性能的通用要求 并列标准：电磁兼容",
      docNo: "GB 9706.102—2026（替代过渡期核查）",
      authority: "国家市场监督管理总局 · 国家标准委",
      date: "2026-09-05",
    },
    {
      id: "gdl-02",
      category: "guideline",
      categoryLabel: "审查指导原则",
      seq: "24",
      title: "人工智能辅助诊断医疗器械临床评价注册审查指导原则",
      docNo: "国家药监局器审中心通告 2026年第27号",
      authority: "国家药监局器审中心（CMDE）",
      date: "2026-08-28",
    },
    {
      id: "pol-02",
      category: "policy",
      categoryLabel: "政策条款",
      seq: "23",
      title: "医疗器械唯一标识（UDI）在第三类与重点第二类品种全链条贯通实施细则",
      docNo: "国药监械注〔2026〕48号",
      authority: "国家药监局 · 国家卫生健康委 · 国家医保局",
      date: "2026-08-14",
    },
    {
      id: "std-02",
      category: "standard",
      categoryLabel: "行业标准",
      seq: "37",
      title: "采用机器人技术的辅助手术设备和辅助手术系统 性能评价方法",
      docNo: "YY/T 1942—2026",
      authority: "国家药监局",
      date: "2026-07-30",
    },
  ] satisfies readonly RegulatoryArchiveItem[],

  /** 首页 4 帧经典克制轮播：2 张 Gemini 多模态智库视觉 + 2 张 ECharts 真实趋势主图 */
  heroSlides: [
    {
      id: "slide-bluebook",
      kind: "bluebook",
      thumbLabel: "季度监测报告",
      title: "《2026 年前三季度医疗器械产业运行监测报告》发布",
      synopsis:
        "2026 年 10 月，机械工业仪器仪表综合技术经济研究所依托《指标体系 V3.0》发布总第 3 期季度监测报告。前三季度批准第三类首次注册 2,814 件、国产占比升至 71.2%，获批创新器械 49 件，海关出口 312.6 亿美元。",
      href: "/reports",
      ctaLabel: "查看报告详情",
      posterKicker: "ITEI · 2026 年第 3 季度",
      posterLines: ["医疗器械产业运行", "监测报告"],
      posterFoot: "机械工业仪器仪表综合技术经济研究所",
    },
    {
      id: "slide-medtech",
      kind: "medtech",
      thumbLabel: "创新器械专题",
      title: "创新医疗器械审评提速，高端影像与有源手术装备成核心拉动力",
      synopsis:
        "2026 年前三季度国家药监局正式批准创新医疗器械 49 件，较上年同期增加 11 件。腔镜手术机器人、5.0T 超高场磁共振、植入式脑机接口等高端装备集中获批，审评转正周期稳步缩短。",
      href: "/products?channel=innov",
      ctaLabel: "进入注册与产品库",
      posterKicker: "创新审查专题 · 指标 02",
      posterLines: ["高端医疗装备创新", "获批态势观察"],
      posterFoot: "前三季度获批 49 件 · 同比增 11 件",
    },
    {
      id: "slide-reg",
      kind: "reg-chart",
      thumbLabel: "三类注册趋势",
      title: "第三类医疗器械首次注册国产占比连续五年攀升至七成",
      synopsis:
        "2021 年至 2026 年前三季度，境内第三类首次注册占比由 52.1% 提升至 71.2%。有源手术器械、医用成像设备与无源植入成为本土替代主要拉动赛道，粤苏沪京浙五省市承载逾六成新增量。",
      href: "/products",
      ctaLabel: "查看注册结构明细",
    },
    {
      id: "slide-trade",
      kind: "trade-chart",
      thumbLabel: "海关进出口走势",
      title: "医疗器械贸易顺差稳步扩大，高端核心部件集中度仍须关注",
      synopsis:
        "2026 年前三季度医疗器械累计出口 312.6 亿美元（同比 +6.6%），进口 268.4 亿美元（同比 -2.1%）。中端常规设备本土替代提速，但超导磁体与高端探测器进口来源集中度仍逾七成。",
      href: "/trade",
      ctaLabel: "进入进出口贸易库",
    },
  ] satisfies readonly HeroCarouselSlide[],

  /** 首页极静单行 4 项压舱石核心数字 */
  homepageStats: [
    { id: "stat-reg", label: "三类首次注册", value: 2814, unit: "件", href: "/products" },
    { id: "stat-innov", label: "获批创新器械", value: 49, unit: "件", href: "/products?channel=innov" },
    { id: "stat-exp", label: "器械出口额", value: 312.6, digits: 1, unit: "亿美元", href: "/trade" },
    { id: "stat-imp", label: "器械进口额", value: 268.4, digits: 1, unit: "亿美元", href: "/trade" },
  ] satisfies readonly HomepageStat[],

  /** 首页「ITEI 研判」5 条纯单行（零摘要段落，对标信通院 CAICT 观点） */
  homepageInsights: [
    {
      id: "ins-1",
      title: "进口回落伴随结构升级，高端影像核心部件来源集中度仍逾七成",
      href: "/trade",
      featured: true,
    },
    {
      id: "ins-2",
      title: "创新审查持续向有源手术装备与高端植介入倾斜",
      href: "/products?channel=innov",
    },
    {
      id: "ins-3",
      title: "粤苏沪京浙五省市承载逾六成第三类首次注册新增量",
      href: "/enterprises",
    },
    {
      id: "ins-4",
      title: "国产第三类医疗器械首次注册占比连续五年稳步攀升",
      href: "/products",
    },
    {
      id: "ins-5",
      title: "海关出口额与上市龙头境外营收口径差异辨析",
      href: "/reports",
    },
  ] satisfies readonly HomepageInsight[],

  /** 首页「权威发布」2 份旗舰报告（Gemini 封面图 + 纯单行报告名） */
  homepageBriefings: [
    {
      id: "pub-1",
      coverVariant: "quarterly",
      coverLabel: "监测报告",
      title: "2026 年前三季度医疗器械产业运行监测报告",
      href: "/reports",
    },
    {
      id: "pub-2",
      coverVariant: "domestic",
      coverLabel: "专题简报",
      title: "国产第三类首次注册突破七成赛道解构简报",
      href: "/reports",
    },
  ] satisfies readonly HomepageBriefing[],
} as const;
