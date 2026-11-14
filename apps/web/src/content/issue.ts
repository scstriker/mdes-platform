/**
 * 本期发布示意文案（本轮不做 CMS；带「编辑位」注释方便后续接后台）。
 * 首页 IA：刊头 → 研判 → 通栏 KPI → 焦点分析 → 七维态势 → 延伸阅读（至多 3 条）；不做资讯流。
 */
export const ISSUE = {
  periodLabel: "2026 年第三季度",
  issueNo: "第 3 期",
  publishedAt: "2026-10-28",
  dataAsOf: "2026-09-30",
  publisher: "机械工业仪器仪表综合技术经济研究所",
  headline: "前三季度创新医疗器械审评提速，国产三类注册新增占比升至七成",
  lead: "本期共监测第三类医疗器械新注册 2,814 件，同比上升 9.6%；创新医疗器械获批 49 件。出口额 312.6 亿美元、同比上升 6.6%，进口额 268.4 亿美元、同比下降 2.1%。",
  insights: [
    {
      id: "01",
      text: "进口额同比下降，并不必然意味着产业走弱，需结合国产替代与出口结构一并研判。",
      emphasize: true,
    },
    {
      id: "02",
      text: "创新通道与手术机器人等赛道获批提速，审评资源继续向高技术产品倾斜。",
      emphasize: false,
    },
    {
      id: "03",
      text: "东部五省仍集中承载六成以上三类首次注册，区域格局相对稳定。",
      emphasize: false,
    },
  ],
  kpis: [
    {
      label: "三类注册",
      value: 2814,
      unit: "件",
      delta: "同比上升 9.6%",
      direction: "up" as const,
      trend: [2100, 2280, 2410, 2550, 2680, 2814],
    },
    {
      label: "创新医疗器械",
      value: 49,
      unit: "件",
      delta: "较上期增加 11 件",
      direction: "up" as const,
      trend: [28, 32, 35, 38, 42, 49],
    },
    {
      label: "优先审评",
      value: 12,
      unit: "件",
      delta: "持平",
      direction: "flat" as const,
      trend: [10, 11, 12, 11, 12, 12],
    },
    {
      label: "出口额",
      value: 312.6,
      unit: "亿美元",
      delta: "同比上升 6.6%",
      direction: "up" as const,
      digits: 1,
      trend: [260, 275, 288, 295, 305, 312.6],
    },
    {
      label: "进口额",
      value: 268.4,
      unit: "亿美元",
      delta: "同比下降 2.1%",
      direction: "down" as const,
      digits: 1,
      trend: [290, 285, 280, 278, 274, 268.4],
    },
  ],
  chartTitle: "国产三类首次注册占比持续抬升，2026 年预计超过七成",
  chartSubtitle: "口径：年度首次注册；国产 / 进口结构",
  chartNote: "注：口径为年度首次注册；2026 年为监测推算示意。来源：国家药监局公开数据整理。",
  chartEvent: { year: "2024", label: "审评提速政策落地" },
  chartSeries: [
    { year: "2021", domestic: 52.1, import: 47.9 },
    { year: "2022", domestic: 56.4, import: 43.6 },
    { year: "2023", domestic: 61.8, import: 38.2 },
    { year: "2024", domestic: 65.3, import: 34.7 },
    { year: "2025", domestic: 68.9, import: 31.1 },
    { year: "2026E", domestic: 71.2, import: 28.8 },
  ],
  innovations: [
    { name: "腹腔内窥镜手术系统", region: "广东", date: "2026-09-26" },
    { name: "高场磁共振成像系统", region: "北京", date: "2026-09-18" },
    { name: "植入式脑机接口试验系统", region: "上海", date: "2026-08-30" },
    { name: "血管内超声成像导管", region: "江苏", date: "2026-08-12" },
  ],
  /** 示意：六领域（V3 一级）+ 综合，对应「七维」编号 01–07 */
  dimensions: [
    {
      code: "01",
      name: "审评注册与上市准入",
      stance: "向好",
      highlight: "三类新注册同比 +9.6%",
      segments: [62, 38],
    },
    { code: "02", name: "产品", stance: "平稳", highlight: "UDI 规格型号持续入库", segments: [48, 52] },
    { code: "03", name: "企业与机构", stance: "向好", highlight: "单项冠军与上市企业池", segments: [55, 45] },
    { code: "04", name: "政策与监管", stance: "需关注", highlight: "政策条款解析待补全", segments: [40, 35, 25] },
    { code: "05", name: "知识产权与标准", stance: "平稳", highlight: "专利与标准监测", segments: [33, 67] },
    { code: "06", name: "进出口贸易", stance: "向好", highlight: "出口回升、进口回落", segments: [58, 42] },
    { code: "07", name: "产业运行综合", stance: "平稳", highlight: "跨维度合成观察", segments: [45, 55] },
  ],
  /** 首页收束：与本期监测相关的报告/政策摘要，完整目录在「研究发布」 */
  furtherReading: [
    {
      title: "2026 年第三季度医疗器械产业运行监测报告",
      date: "2026-10-28",
      kind: "PDF",
      context: "本期发布物全文",
      relatedTo: { label: "对应七维综合观察", href: "/system" },
    },
    {
      title: "手术机器人产品注册审查指导原则（修订）",
      date: "2026-09",
      kind: "指导原则",
      context: "审评注册维度监测上下文",
      relatedTo: { label: "审评注册指标簇", href: "/system/01" },
    },
    {
      title: "国产三类注册结构变化专题简报",
      date: "2026-09-15",
      kind: "PDF",
      context: "支撑图 1 国产占比研判",
      relatedTo: { label: "相关三级指标", href: "/system/01" },
    },
  ],
} as const;
