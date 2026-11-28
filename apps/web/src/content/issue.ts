/**
 * 首页运行监测基准与专题发布数据（2026 年第 3 期 · 2026Q3）。
 * 对应《医疗器械产业数据系统指标体系 V3.0》与 V2 单项统计及一等公民实体契约。
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
  delta: string;
  direction: KpiDirection;
  trend: readonly number[];
  href: string;
};

export type HomepageInsight = {
  id: string;
  domainTag: string;
  title: string;
  href: string;
  featured?: boolean;
};

export type HomepageBriefing = {
  id: string;
  coverVariant: "quarterly" | "domestic";
  coverLabel: string;
  issueTag: string;
  date: string;
  title: string;
  takeaway: string;
  href: string;
};

export type ResearchQuestionStripItem = {
  id: string;
  domainLabel: string;
  channelHref: string;
  question: string;
  summary: string;
  entityLinks: readonly { label: string; href: string }[];
};

export const ISSUE = {
  eyebrow: "机械工业仪器仪表综合技术经济研究所（ITEI） · 产业数据与决策支撑系统",
  heroTitle: "中国医疗器械产业运行监测报告（2026 年第 3 期）",
  heroCoverage:
    "整合境内与进口器械审评准入、产品规格型号、重点生产与上市企业、技术标准及海关进出口多源权威证据，支撑从本期判断直达可复现统计快照与原始出处。",
  periodCode: "2026Q3",
  periodEyebrow: "本期监测基准 · 2026Q3（2026 年第 3 期）",
  periodLabel: "2026 年第三季度",
  issueNo: "2026 年第 3 期",
  publishedAt: "2026-11-15",
  dataAsOf: "2026-09-30",
  dataSyncNote: "截至 2026-09-30（贸易快照同步至 2026-YTD-10）",
  coreSources: "国家药监局（NMPA） · 海关总署 · 上交所/深交所年报 · 政府采购网",
  systemScope: "《指标体系 V3.0》6 大领域 · 33 项三级指标",
  publisher: "机械工业仪器仪表综合技术经济研究所",

  heroStatisticId: "STAT-REG-CLASS3-TREND",
  heroStatisticVersion: "2026.09.1",
  heroEvidenceHref: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
  latestReportHref: "/reports/mdes-2026q3-high-end-imaging-report",

  headline: "境内第三类医疗器械首次注册占比升至 77.6%，超高场影像等创新装备进入临床与招采兑现期",
  lead: "2025 年境内第三类首次注册获批 2,386 件（同比 +12.87%），占全部三类首次注册比重达 77.6%；2026 年前三季度境内三类首次注册累计获批 1,890 件、创新医疗器械获批 56 件，延续结构性增长。",

  heroBullets: [
    {
      label: "准入结构跃迁",
      text: "境内第三类首次注册由 2021 年 1,185 件增至 2025 年 2,386 件，2026Q1-Q3 获批 1,890 件（非完整期累计）。",
      href: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
    },
    {
      label: "商业化闭环核验",
      text: "联影 5.0T 磁共振 uMR Jupiter（国械注准20223061141）在西安交大二附院以 4,980 万元中标，并在深圳龙华区中心医院开机启用。",
      href: "/products/umr-jupiter",
    },
    {
      label: "研发与核心部件",
      text: "联影医疗 2025 年研发投入占营业收入 18.99%；海关端核磁共振零件进口额（3.12 亿美元）仍高于成套整机（2.63 亿美元）。",
      href: "/reports/mdes-2026q3-high-end-imaging-report",
    },
  ] as const,

  researchQuestions: [
    {
      id: "rq-markets",
      domainLabel: "市场",
      channelHref: "/markets",
      question: "公立医院高端影像设备公开采购成交单价如何核验？全国市场规模与单笔中标记录如何区分？",
      summary: "分列全国规模核算（2025 年医用 MRI 达 124.6 亿元）与可逐笔核查公告原文的公立三甲医院成交样本。",
      entityLinks: [
        { label: "磁共振市场样本", href: "/markets?category=mri" },
        { label: "陕西 2024 招采核验", href: "/markets?category=mri&region=陕西&period=2024" },
      ],
    },
    {
      id: "rq-technologies",
      domainLabel: "技术",
      channelHref: "/technologies",
      question: "超高场磁共振如何兼顾脑功能微血管分辨与体部均匀全身成像？",
      summary: "对比 5.0 T 全身 8 通道并行射频发射（213 MHz）与 3.0 T 大孔径路线，直连器审报告与强制性行标。",
      entityLinks: [
        { label: "5T 超导磁共振技术", href: "/technologies/ultra-high-field-5t-mri" },
        { label: "YY 9706.233-2021 标准", href: "/standards?q=YY+9706.233-2021" },
      ],
    },
    {
      id: "rq-products",
      domainLabel: "产品",
      channelHref: "/products",
      question: "同一张注册证覆盖哪些规格型号？5.0 T 与 3.0 T 代表机型核心参数与证据链有何差异？",
      summary: "按型号去重建档，将 UDI-DI 包装层级内折至规格区，支持同品类双型号逐项参数与审评出处并排比较。",
      entityLinks: [
        { label: "uMR Jupiter 型号", href: "/products/umr-jupiter" },
        { label: "与 uMR 880 并排比较", href: "/products?compare=umr-jupiter,umr-880" },
      ],
    },
    {
      id: "rq-enterprises",
      domainLabel: "企业",
      channelHref: "/enterprises",
      question: "本土高端医疗装备龙头研发投入强度、分产品线营收与境外收入口径如何穿透对标？",
      summary: "聚焦医疗器械生产与上市主体（研发检测与 GCP 机构独立归入机构名录），支持 2–5 家企业多维横向对标。",
      entityLinks: [
        { label: "联影医疗档案", href: "/enterprises/united-imaging" },
        { label: "上海 A 股器械企业", href: "/enterprises?group=ashare&province=上海" },
      ],
    },
  ] satisfies readonly ResearchQuestionStripItem[],

  searchScopes: [
    { label: "全站跨库检索", path: "/search" },
    { label: "产品型号", path: "/products" },
    { label: "企业主体", path: "/enterprises" },
    { label: "进出口贸易", path: "/trade" },
    { label: "研究报告", path: "/reports" },
  ] as const,

  hotQueries: [
    { label: "uMR Jupiter", href: "/products/umr-jupiter" },
    { label: "国械注准20223061141", href: "/regulation/registrations?q=国械注准20223061141" },
    { label: "联影医疗", href: "/enterprises/united-imaging" },
    { label: "YY 9706.233-2021", href: "/standards?q=YY+9706.233-2021" },
    { label: "90181310 磁共振进口", href: "/trade?q=90181310" },
  ] as const,

  kpis: [
    {
      id: "reg-c3",
      seq: "01",
      label: "境内三类首次注册（2025）",
      value: 2386,
      unit: "件",
      delta: "同比 +12.87%",
      direction: "up",
      href: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
      trend: [1185, 1796, 1982, 2114, 2386, 1890],
    },
    {
      id: "innov-approved",
      seq: "02",
      label: "获批创新器械（2026Q1-Q3）",
      value: 56,
      unit: "件",
      delta: "2025 全年 73 件",
      direction: "up",
      href: "/regulation/registrations?channel=innov",
      trend: [35, 55, 61, 65, 73, 56],
    },
    {
      id: "priority-review",
      seq: "03",
      label: "磁共振国内市场（2025）",
      value: 124.6,
      digits: 1,
      unit: "亿元",
      delta: "2026 预测 136.0 亿",
      direction: "up",
      href: "/markets?category=mri",
      trend: [102.4, 115.8, 118.2, 108.5, 124.6],
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
    { period: "2021", domesticCount: 1185, importCount: 763, domesticShare: 60.8 },
    { period: "2022", domesticCount: 1796, importCount: 704, domesticShare: 71.8 },
    { period: "2023", domesticCount: 1982, importCount: 672, domesticShare: 74.7 },
    { period: "2024", domesticCount: 2114, importCount: 698, domesticShare: 75.2 },
    { period: "2025", domesticCount: 2386, importCount: 688, domesticShare: 77.6 },
    { period: "2026Q1-Q3", domesticCount: 1890, importCount: 512, domesticShare: 78.7 },
  ] as const,

  tradeTrendSeries: [
    { period: "2025Q1", exportUsd: 96.2, importUsd: 90.8, surplusUsd: 5.4 },
    { period: "2025Q2", exportUsd: 99.4, importUsd: 92.1, surplusUsd: 7.3 },
    { period: "2025Q3", exportUsd: 97.6, importUsd: 91.3, surplusUsd: 6.3 },
    { period: "2025Q4", exportUsd: 104.8, importUsd: 93.5, surplusUsd: 11.3 },
    { period: "2026Q1", exportUsd: 101.5, importUsd: 88.6, surplusUsd: 12.9 },
    { period: "2026Q2", exportUsd: 104.3, importUsd: 89.5, surplusUsd: 14.8 },
    { period: "2026Q3", exportUsd: 106.8, importUsd: 90.3, surplusUsd: 16.5 },
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
      title: "磁共振零件进口额仍高于成套整机，核心部件自主化是下一阶段重点",
      text: "2024 年成套核磁共振成像装置（90181310）进口额 263.11 百万美元，零件（90181390）进口额 312.48 百万美元，零件占比达 54.29%。",
      emphasize: true,
      evidenceLabel: "核查磁共振整机与零件进口（STAT-TRD-MRI-HS8）",
      evidenceHref: "/statistics/STAT-TRD-MRI-HS8",
    },
    {
      id: "02",
      title: "境内三类首次注册占比升至 77.6%，创新通道向超高场影像与手术机器人集中",
      text: "2025 年境内第三类首次注册获批 2,386 件，2026 年前三季度累计获批 1,890 件，创新特别审查获批产品加速落地三甲医院临床。",
      emphasize: false,
      evidenceLabel: "查看三类首次注册趋势依据",
      evidenceHref: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
    },
    {
      id: "03",
      title: "苏粤京沪四省市持有逾六成三类有效证，京沪呈高研发持证密度特征",
      text: "江苏（3,420 件）、广东（3,190 件）领跑期末有效证存量；按生产企业数分母折算，北京（273.5 件/百家）与上海（218.4 件/百家）密度最高。",
      emphasize: false,
      evidenceLabel: "查看省域存量与密度对比",
      evidenceHref: "/#fig-overview-provinces",
    },
  ] satisfies readonly ExecutiveInsight[],

  innovations: [
    {
      name: "磁共振成像系统（uMR Jupiter）",
      applicant: "联影医疗",
      region: "上海",
      category: "06 医用成像器械",
      date: "2022-08-24",
    },
    {
      name: "腹腔内窥镜手术系统（图迈 MT-1000）",
      applicant: "微创医疗机器人",
      region: "上海",
      category: "01 有源手术器械",
      date: "2022-01-27",
    },
  ] satisfies readonly ApprovedInnovation[],

  provincesTop8: [
    { rank: "01", province: "江苏", regCount: 3420, sharePct: 18.7, championCount: 5 },
    { rank: "02", province: "广东", regCount: 3190, sharePct: 17.4, championCount: 6 },
    { rank: "03", province: "北京", regCount: 2680, sharePct: 14.6, championCount: 5 },
    { rank: "04", province: "上海", regCount: 2140, sharePct: 11.7, championCount: 4 },
    { rank: "05", province: "浙江", regCount: 1490, sharePct: 8.1, championCount: 3 },
    { rank: "06", province: "山东", regCount: 1180, sharePct: 6.4, championCount: 2 },
    { rank: "07", province: "湖北", regCount: 760, sharePct: 4.1, championCount: 1 },
    { rank: "08", province: "四川", regCount: 690, sharePct: 3.8, championCount: 1 },
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
  ] satisfies readonly TradeCategoryRow[],

  briefings: [
    {
      id: "br-2026q3",
      date: "2026-11-15",
      reportType: "季度专题报告",
      title: "中国高端医学影像装备运行监测与磁共振产业链专题报告（2026 年第 3 期）",
      takeaway:
        "贯通 5.0T 超高场磁共振审评准入（国械注准20223061141）、公立三甲医院招采与临床启用、联影医疗 18.99% 研发投入强度及海关整机/零件进口对账。",
      citedSeqs: [
        { seq: "01", label: "注册明细 (01)" },
        { seq: "15", label: "研发投入 (15)" },
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
      title: "推动大规模设备更新和消费品以旧换新行动方案（医疗卫生装备专项条款）",
      docNo: "国发〔2024〕7号",
      authority: "国务院",
      date: "2024-03-07",
    },
    {
      id: "std-01",
      category: "standard",
      categoryLabel: "强制性行业标准",
      seq: "37",
      title: "医用电气设备 第2-33部分：医疗诊断用磁共振设备的基本安全和基本性能专用要求",
      docNo: "YY 9706.233-2021",
      authority: "国家药监局",
      date: "2023-05-01",
    },
  ] satisfies readonly RegulatoryArchiveItem[],

  heroSlides: [
    {
      id: "slide-bluebook",
      kind: "bluebook",
      thumbLabel: "季度监测报告",
      title: "《中国高端医学影像装备运行监测与磁共振产业链专题报告（2026 年第 3 期）》发布",
      synopsis:
        "机械工业仪器仪表综合技术经济研究所发布 2026 年第 3 期专题报告，永久锁定引用统计版本快照，贯通审评准入、公开招采、企业年报与海关整机零件进口证据链。",
      href: "/reports/mdes-2026q3-high-end-imaging-report",
      ctaLabel: "阅读本期报告",
      posterKicker: "ITEI · 2026 年第 3 期",
      posterLines: ["医疗器械产业运行", "监测报告"],
      posterFoot: "机械工业仪器仪表综合技术经济研究所",
    },
  ] satisfies readonly HeroCarouselSlide[],

  homepageStats: [
    {
      id: "stat-reg",
      label: "境内三类首次注册（2025）",
      value: 2386,
      unit: "件",
      delta: "同比 +12.87%",
      direction: "up",
      trend: [1185, 1796, 1982, 2114, 2386],
      href: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
    },
    {
      id: "stat-innov",
      label: "创新器械获批（2026Q1-Q3）",
      value: 56,
      unit: "件",
      delta: "2025 全年 73 件",
      direction: "up",
      trend: [35, 55, 61, 65, 73, 56],
      href: "/regulation/registrations?channel=innov",
    },
    {
      id: "stat-exp",
      label: "海关器械出口（2025）",
      value: 673.74,
      digits: 2,
      unit: "亿美元",
      delta: "同比 +2.30%",
      direction: "up",
      trend: [762.27, 611.46, 658.57, 673.74],
      href: "/trade",
    },
    {
      id: "stat-imp",
      label: "MRI 整机与零件进口（2024）",
      value: 575.59,
      digits: 2,
      unit: "百万美元",
      delta: "零件占比 54.29%",
      direction: "down",
      trend: [684.2, 641.5, 575.59, 538.4],
      href: "/statistics/STAT-TRD-MRI-HS8",
    },
  ] satisfies readonly HomepageStat[],

  homepageInsights: [
    {
      id: "ins-1",
      domainTag: "供应链",
      title: "磁共振核心零件进口额持续高于成套整机，进口来源 CR3 集中度逾七成",
      href: "/statistics/STAT-TRD-MRI-HS8",
      featured: true,
    },
    {
      id: "ins-2",
      domainTag: "创新准入",
      title: "境内第三类首次注册占比升至 77.6%，超高场影像进入临床兑现期",
      href: "/statistics/STAT-REG-CLASS3-TREND?v=2026.09.1",
    },
    {
      id: "ins-3",
      domainTag: "区域集聚",
      title: "苏粤京沪四省市持有全国逾 62% 境内三类有效注册证",
      href: "/#fig-overview-provinces",
    },
    {
      id: "ins-4",
      domainTag: "研发对标",
      title: "联影医疗 2025 年研发投入占营业收入比例达 18.99%",
      href: "/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1",
    },
    {
      id: "ins-5",
      domainTag: "标准核验",
      title: "医用磁共振安全专用标准现行有效版次为强制性行业标准 YY 9706.233-2021",
      href: "/standards?q=YY+9706.233-2021",
    },
  ] satisfies readonly HomepageInsight[],

  homepageBriefings: [
    {
      id: "pub-1",
      coverVariant: "quarterly",
      coverLabel: "季度专报",
      issueTag: "2026 年第 3 期 · 版本锁定",
      date: "2026-11-15",
      title: "中国高端医学影像装备运行监测与磁共振产业链专题报告（2026 年第 3 期）",
      takeaway:
        "贯通 uMR Jupiter 审评准入（国械注准20223061141）、西安交大二附院 4,980 万元招采成交、联影 18.99% 研发占比与海关整机零件进口对账。",
      href: "/reports/mdes-2026q3-high-end-imaging-report",
    },
    {
      id: "pub-2",
      coverVariant: "domestic",
      coverLabel: "供应链专报",
      issueTag: "2026 年第 2 期 · 集中度评估",
      date: "2026-08-20",
      title: "中国医疗装备关键零部件进口集中度与供应链韧性评估（2026 年第 2 期）",
      takeaway: "医用X射线及CT核心部件、内窥镜及微创器械等四大品类进口伙伴国 CR3 超过 70% 参考线。",
      href: "/reports/mdes-2026q2-customs-supply-chain-briefing",
    },
  ] satisfies readonly HomepageBriefing[],
} as const;
