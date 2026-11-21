export type ReportTabKey = "briefings" | "policies" | "guidelines" | "standards";

export type SummaryStripItem = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  subline: string;
};

export type PolicyTopicDistItem = {
  topic: string;
  count: number;
  share: string;
  barLabel: string;
  focusMeasures: string;
};

export type GuidelineTrackDistItem = {
  track: string;
  count: number;
  share: string;
  barLabel: string;
  classScope: string;
};

export type BriefingCitedLink = {
  label: string;
  href: string;
};

export type BriefingItem = {
  id: string;
  date: string;
  series: string;
  title: string;
  summary: string;
  keyFindings: readonly string[];
  citedIndicators: readonly BriefingCitedLink[];
  citation: string;
};

export type PolicyLevel = "国家级部委" | "重点省市";

export type PolicyClauseRow = {
  id: string;
  docNo: string;
  publishDate: string;
  title: string;
  clauseSummary: string;
  agency: string;
  topic: string;
  level: PolicyLevel;
};

export type GuidelineCategory =
  | "有源手术与机器人"
  | "医学影像"
  | "人工智能软件"
  | "植介入与耗材"
  | "体外诊断";

export type GuidelineRow = {
  id: string;
  noticeNo: string;
  year: string;
  title: string;
  reviewPoints: string;
  category: GuidelineCategory;
  classCode: string;
  versionStatus: "现行有效" | "修订版";
};

export type AnnualReportRow = {
  seq: string;
  reportTitle: string;
  publisher: string;
  latestIssue: string;
  coverageLabel: "全文对账索引" | "年度公报索引";
  reconciliationScope: string;
};

export type StandardRow = {
  stdNo: string;
  stdName: string;
  keyClause: string;
  nature: "强制性国标" | "强制性行标" | "推荐性国标" | "推荐性行标";
  status: "现行有效" | "过渡实施";
  scope: string;
};

export const REPORTS_SUMMARY_STRIP: readonly SummaryStripItem[] = [
  {
    id: "briefings",
    label: "季度与专题研究报告",
    value: "12",
    unit: "篇",
    subline: "季度产业运行监测与供应链专题研判",
  },
  {
    id: "policies",
    label: "国家及地方政策条款",
    value: "418",
    unit: "份",
    subline: "覆盖国务院部委及重点省市",
  },
  {
    id: "guidelines",
    label: "注册审查指导原则",
    value: "506",
    unit: "份",
    subline: "药监器审现行有效目录",
  },
  {
    id: "standards",
    label: "监管年报与现行标准",
    value: "8",
    unit: "份年报",
    subline: "权威统计公报与标准索引",
  },
];

/** 图 1：418 份国家级部委及重点省市医疗器械政策主题分布（112+96+78+58+44+30 = 418） */
export const POLICY_TOPIC_DISTRIBUTION: readonly PolicyTopicDistItem[] = [
  {
    topic: "设备更新与配置支持",
    count: 112,
    share: "26.8%",
    barLabel: "112 份（26.8%）",
    focusMeasures: "高端影像、放疗与手术室装备更新贴息及专项债协同",
  },
  {
    topic: "创新审评前置与加速",
    count: 96,
    share: "23.0%",
    barLabel: "96 份（23.0%）",
    focusMeasures: "特别审查通道扩容、器审分中心前置指导与续证衔接",
  },
  {
    topic: "产业集群与全链条扶持",
    count: 78,
    share: "18.7%",
    barLabel: "78 份（18.7%）",
    focusMeasures: "专业园区CDMO平台、数智化示范工厂与产业化资助",
  },
  {
    topic: "医保立项与支付衔接",
    count: 58,
    share: "13.9%",
    barLabel: "58 份（13.9%）",
    focusMeasures: "创新医疗服务价格项目绿色立项与 DRG/DIP 特例单议",
  },
  {
    topic: "首台套与揭榜挂帅攻关",
    count: 44,
    share: "10.5%",
    barLabel: "44 份（10.5%）",
    focusMeasures: "核心元器件医工协同攻关、推广目录与首购保险补偿",
  },
  {
    topic: "出海合规与检测服务",
    count: 30,
    share: "7.2%",
    barLabel: "30 份（7.2%）",
    focusMeasures: "电磁兼容与生物学公共检验能力建设及海外注册支持",
  },
];

/** 图 2：506 份现行医疗器械注册审查指导原则技术领域构成（156+124+98+76+52 = 506） */
export const GUIDELINE_TRACK_DISTRIBUTION: readonly GuidelineTrackDistItem[] = [
  {
    track: "植介入与医用耗材",
    count: 156,
    share: "30.8%",
    barLabel: "156 份（30.8%）",
    classScope: "心血管介入、骨科植入、生物材料与高值耗材",
  },
  {
    track: "体外诊断仪器与试剂",
    count: 124,
    share: "24.5%",
    barLabel: "124 份（24.5%）",
    classScope: "化学发光、高通量测序、肿瘤伴随诊断与分子检验",
  },
  {
    track: "医学影像与放疗装备",
    count: 98,
    share: "19.4%",
    barLabel: "98 份（19.4%）",
    classScope: "CT、超导磁共振、医用内窥镜、超声及放疗系统",
  },
  {
    track: "有源手术与医用机器人",
    count: 76,
    share: "15.0%",
    barLabel: "76 份（15.0%）",
    classScope: "腹腔镜与骨科手术导航系统、高频超声能量器械",
  },
  {
    track: "人工智能与医用软件",
    count: 52,
    share: "10.3%",
    barLabel: "52 份（10.3%）",
    classScope: "影像辅助分诊算法、医用独立软件与网络安全评价",
  },
];

export const BRIEFING_LEDGER: readonly BriefingItem[] = [
  {
    id: "itei-2026q3",
    date: "2026-10-28",
    series: "季度运行报告",
    title: "2026 年第三季度中国医疗器械产业运行监测报告",
    summary:
      "前三季度境内第三类医疗器械首次注册批准 2,814 件（同比 +9.6%），创新特别审查通道获批 49 件；同期海关医疗器械出口 312.6 亿美元（+6.6%），诊疗装备对贸易顺差贡献持续提升。",
    keyFindings: [
      "有源手术设备、医学影像及植介入耗材合计占国产三类首次注册增量的 68.4%，京苏粤沪浙五省市集中度保持在 63% 左右。",
      "与国家药监局注册工作年度报告历史序列交叉核验显示，日常公开批件聚合值与官方年度统计公报偏差稳定控制在 0.8% 以内。",
      "出口结构由低值医用敷料加速向彩色超声、监护仪及数字化 X 射线整机迁移，一般贸易占比提升 2.4 个百分点。",
    ],
    citedIndicators: [
      { label: "注册与备案明细口径", href: "/system/01" },
      { label: "创新医疗器械口径", href: "/system/02" },
      { label: "药监注册统计年报", href: "/system/28" },
      { label: "海关进出口贸易统计", href: "/system/38" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 2026 年第三季度中国医疗器械产业运行监测报告 [R]. 北京: 医疗器械产业数据系统, 2026-10.",
  },
  {
    id: "itei-trd-cr3",
    date: "2026-10-15",
    series: "供应链安全专题",
    title: "高端医学影像整机与核心零部件进口来源集中度（CR3）专题研判",
    summary:
      "穿透海关 8 位整机与专用零件 HS 税号测算表明，医院诊断与治疗设备大类进口 CR3 为 43.0%，而高热容量 CT 球管与电子软镜核心组件进口 CR3 仍超过 78%。",
    keyFindings: [
      "3.0T 超导磁共振与中高端 CT 整机进口额连续六个季度小幅回落，反映国产高端整机院端配置替代稳步推进。",
      "上游核心元器件进口金额降幅显著慢于整机，关键球管、高频探头晶元与特种光学组件仍高度集中于美、德、日三国。",
      "建议结合首台（套）重大技术装备推广目录与医疗装备揭榜挂帅验收进展，建立核心零部件税号月度来源集中度跟踪机制。",
    ],
    citedIndicators: [
      { label: "海关进出口与来源集中度", href: "/system/38" },
      { label: "大型医用设备配置装机", href: "/system/08" },
      { label: "首台（套）医疗装备目录", href: "/system/26" },
      { label: "医疗装备揭榜挂帅任务", href: "/system/27" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 高端医学影像整机与核心零部件进口来源集中度（CR3）专题研判 [R]. 北京: 智库专题简报, 2026-10.",
  },
  {
    id: "itei-robot-std",
    date: "2026-09-26",
    series: "审评与标准简报",
    title: "腔镜与骨科手术机器人审评指导原则及专用标准演进简报",
    summary:
      "梳理国家药监局器审中心（CMDE）手术机器人系列指导原则与 YY 9706.277 强制性专用安全标准衔接关系，拆解机械臂定位精度、主从控制延迟及临床评价路径核心条款。",
    keyFindings: [
      "新版医用电气安全体系（GB 9706.1-2020 配合 YY 9706.277）已全面纳入注册检验前置要求，国家级检验院承检资质覆盖率显著提升。",
      "多适应症拓展申报需严格区分同品种临床比对边界与前瞻性多中心临床试验要求，科研论文不直接替代法定审评证据。",
    ],
    citedIndicators: [
      { label: "创新特别审查与获批", href: "/system/02" },
      { label: "医疗器械检验检测机构", href: "/system/21" },
      { label: "注册审查指导原则目录", href: "/system/24" },
      { label: "国家与行业标准目录", href: "/system/37" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 腔镜与骨科手术机器人审评指导原则及专用标准演进简报 [R]. 北京: 审评与标准观察, 2026-09.",
  },
  {
    id: "itei-class3-5y",
    date: "2026-08-30",
    series: "准入结构专题",
    title: "国产第三类医疗器械首次注册结构五年复盘（2021—2025）",
    summary:
      "基于公开注册与备案明细快照，严格剥离延续注册与著录事项变更后，系统复盘近五年国产三类首次注册在 22 个医疗器械分类子目录中的结构跃迁。",
    keyFindings: [
      "无源植入物、有源手术器械与医用成像器械三类子目录五年复合增速位居前列，国产首次注册占比由 2021 年的 64.2% 升至 76.8%。",
      "单张注册证下挂载的 UDI-DI 规格型号中位数在骨科植入与血管介入赛道达 84 个，注册证批件数与规格型号条码数须严格分列统计。",
    ],
    citedIndicators: [
      { label: "注册与备案批件明细", href: "/system/01" },
      { label: "优先审批医疗器械", href: "/system/03" },
      { label: "UDI 唯一标识规格目录", href: "/system/05" },
      { label: "生产企业持证产品结构", href: "/system/10" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 国产第三类医疗器械首次注册结构五年复盘（2021—2025）[R]. 北京: 产业准入研究, 2026-08.",
  },
  {
    id: "itei-listed-rd",
    date: "2026-07-22",
    series: "企业年报专题",
    title: "医疗器械上市企业研发投入强度与境外营收统计口径辨析",
    summary:
      "依托 172 家 A+H 股去重上市企业样本池，对比科创板与主板医疗器械分部研发强度差异，并界定企业年报“境外营业收入”与海关“出口额”的统计边界。",
    keyFindings: [
      "科创板医疗器械样本研发投入占营业收入比重中位数达 16.4%，显著高于行业整体中位数（9.8%）；资本化研发支出占比须单独列示。",
      "头部企业通过海外并购工厂实现的本地生产本地销售计入年报境外收入，但不在中国海关报关出口统计范围内，两项口径不可直接相除。",
    ],
    citedIndicators: [
      { label: "医疗器械上市企业样本池", href: "/system/13" },
      { label: "上市企业经营与盈利", href: "/system/14" },
      { label: "上市企业研发投入", href: "/system/15" },
      { label: "上市企业境外经营信息", href: "/system/16" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 医疗器械上市企业研发投入强度与境外营收统计口径辨析 [R]. 北京: 企业与资本专题, 2026-07.",
  },
  {
    id: "itei-pol-firstset",
    date: "2026-06-18",
    series: "政策跟踪简报",
    title: "国家及重点省市高端医疗装备更新与创新入院支持条款横向比对",
    summary:
      "对国务院大规模设备更新行动方案及京、沪、粤、苏、浙五省市配套医疗装备政策进行条款级拆解，梳理审评前置辅导、首台（套）保险补偿与医保新增立项通道。",
    keyFindings: [
      "国家层面聚焦县域医共体与三甲医院高端影像、放疗及手术室设备迭代，明确中央预算内投资、财政贴息与超长期特别国债支持方向。",
      "重点省市普遍建立“创新药械目录—医院器械委员会限时议定—DRG/DIP 除外支付”联动机制，缩短创新产品获批后入院周期。",
    ],
    citedIndicators: [
      { label: "国家及地方政策条款库", href: "/system/23" },
      { label: "首台（套）医疗装备目录", href: "/system/26" },
      { label: "医疗装备揭榜挂帅任务", href: "/system/27" },
      { label: "医保集采与支付统计公报", href: "/system/32" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 国家及重点省市高端医疗装备更新与创新入院支持条款横向比对 [R]. 北京: 政策法规观察, 2026-06.",
  },
];

export const POLICY_CLAUSE_ROWS: readonly PolicyClauseRow[] = [
  {
    id: "pol-01",
    docNo: "国发〔2024〕7号",
    publishDate: "2024-03-07",
    title: "《推动大规模设备更新和消费品以旧换新行动方案》医疗装备条款",
    clauseSummary: "推进医疗机构医学影像、放射治疗、远程诊疗与手术机器人更新改造，强化中央预算内投资与贴息协同。",
    agency: "国务院",
    topic: "设备更新与配置支持",
    level: "国家级部委",
  },
  {
    id: "pol-02",
    docNo: "国药监械注〔2025〕18号",
    publishDate: "2025-06-20",
    title: "《关于进一步支持高端医疗器械创新发展的若干举措》",
    clauseSummary: "针对医用机器人、高端影像、人工智能器械及新型生物材料实施审评前置指导，优化变更与续证审评衔接。",
    agency: "国家药监局",
    topic: "创新审评前置与加速",
    level: "国家级部委",
  },
  {
    id: "pol-03",
    docNo: "工信部联规〔2025〕42号",
    publishDate: "2025-04-14",
    title: "《医药工业数智化转型实施方案（2025—2030年）》器械智造章节",
    clauseSummary: "支持高值耗材与有源装备建设卓越级智能工厂，推进 UDI 全链条追溯与研发设计仿真软件攻关。",
    agency: "工信部等七部门",
    topic: "产业集群与全链条扶持",
    level: "国家级部委",
  },
  {
    id: "pol-04",
    docNo: "工信部重装〔2024〕89号",
    publishDate: "2024-09-09",
    title: "《首台（套）重大技术装备推广应用指导目录》医疗装备篇",
    clauseSummary: "将光子计数 CT、5.0T 磁共振、单孔腔镜手术系统及质子放疗装备纳入推广目录并配套保险补偿。",
    agency: "工业和信息化部",
    topic: "首台套与揭榜挂帅攻关",
    level: "国家级部委",
  },
  {
    id: "pol-05",
    docNo: "医保发〔2025〕11号",
    publishDate: "2025-03-28",
    title: "《关于完善创新医疗器械价格立项与医保支付衔接的通知》",
    clauseSummary: "对进入国家创新特别审查通道的器械开辟价格立项绿色通道，支持符合条件的新技术纳入 DRG 特例单议。",
    agency: "国家医保局",
    topic: "医保立项与支付衔接",
    level: "国家级部委",
  },
  {
    id: "pol-06",
    docNo: "国卫财务发〔2024〕22号",
    publishDate: "2024-05-29",
    title: "《县域医共体设备更新建设实施方案》医学装备配置标准",
    clauseSummary: "支持县级医院及基层放射、超声、急救监护与血液透析设备成套升级，明确国产合规装备公平参与采购。",
    agency: "国家卫生健康委等部门",
    topic: "设备更新与配置支持",
    level: "国家级部委",
  },
  {
    id: "pol-07",
    docNo: "京医保发〔2025〕6号",
    publishDate: "2025-04-08",
    title: "《北京市支持创新医药高质量发展若干措施》器械专章",
    clauseSummary: "推动临床急需创新器械“获批即挂网”，取消医院配备数量限制，强化多中心临床试验牵头医院激励。",
    agency: "北京市医保局等九部门",
    topic: "医保立项与支付衔接",
    level: "重点省市",
  },
  {
    id: "pol-08",
    docNo: "沪府办发〔2025〕9号",
    publishDate: "2025-05-12",
    title: "《上海市促进高端医疗器械产业全链条发展行动方案》",
    clauseSummary: "围绕张江、嘉定、闵行集聚区支持核心元器件攻关，对首次取得三类创新证并产业化的产品给予分档资助。",
    agency: "上海市人民政府办公厅",
    topic: "产业集群与全链条扶持",
    level: "重点省市",
  },
  {
    id: "pol-09",
    docNo: "粤工信生物〔2025〕15号",
    publishDate: "2025-07-03",
    title: "《广东省推动医疗器械产业高质量发展实施方案》",
    clauseSummary: "强化深圳、广州高性能器械创新平台及电磁兼容、生物相容性公共检测能力，完善海外法规认证辅导。",
    agency: "广东省工信厅等部门",
    topic: "出海合规与检测服务",
    level: "重点省市",
  },
  {
    id: "pol-10",
    docNo: "苏政办发〔2025〕21号",
    publishDate: "2025-06-05",
    title: "《江苏省全链条支持创新药械高质量发展若干政策措施》",
    clauseSummary: "依托器审长三角分中心下沉前置服务，将省产创新器械纳入公立医院设备更新推荐清单与首购风险分担。",
    agency: "江苏省人民政府办公厅",
    topic: "创新审评前置与加速",
    level: "重点省市",
  },
  {
    id: "pol-11",
    docNo: "浙政办发〔2025〕14号",
    publishDate: "2025-04-26",
    title: "《浙江省加快打造高端医疗装备产业高地若干举措》",
    clauseSummary: "实施高精尖内窥镜、超导磁体及体外诊断核心原料揭榜攻关，健全临床研究伦理互认与院企医工转化机制。",
    agency: "浙江省人民政府办公厅",
    topic: "首台套与揭榜挂帅攻关",
    level: "重点省市",
  },
];

export const GUIDELINE_ROWS: readonly GuidelineRow[] = [
  {
    id: "gd-01",
    noticeNo: "2023年第32号",
    year: "2023",
    title: "腹腔内窥镜手术系统注册审查指导原则（手术器械及系统）",
    reviewPoints: "明确主从控制延迟、机械臂重复定位精度、紧急停机互锁及多中心临床主要疗效终点。",
    category: "有源手术与机器人",
    classCode: "01-07",
    versionStatus: "现行有效",
  },
  {
    id: "gd-02",
    noticeNo: "2024年第14号",
    year: "2024",
    title: "骨科手术导航定位系统技术审评要点（修订版）",
    reviewPoints: "规范光学与电磁配准误差评价、机械臂末端负载刚度、术前三维重建网络安全及临床评价。",
    category: "有源手术与机器人",
    classCode: "01-07",
    versionStatus: "修订版",
  },
  {
    id: "gd-03",
    noticeNo: "2024年第21号",
    year: "2024",
    title: "磁共振成像系统注册审查指导原则（修订版）",
    reviewPoints: "对齐新版电气安全与专用标准，细化信噪比、场均匀度、比吸收率控制及深度学习重建验证。",
    category: "医学影像",
    classCode: "06-09",
    versionStatus: "修订版",
  },
  {
    id: "gd-04",
    noticeNo: "2023年第45号",
    year: "2023",
    title: "医用 X 射线计算机体层摄影（CT）设备注册审查指导原则",
    reviewPoints: "覆盖球管热容量与探测器排数核定、辐射剂量控制、低剂量重建伪影评估及冠脉成像分辨率验证。",
    category: "医学影像",
    classCode: "06-05",
    versionStatus: "现行有效",
  },
  {
    id: "gd-05",
    noticeNo: "2022年第8号",
    year: "2022",
    title: "人工智能医疗器械注册审查指导原则",
    reviewPoints: "确立算法需求分析、训练与测试集防数据泄露质控、跨院泛化测试及算法更新重大变更判定准则。",
    category: "人工智能软件",
    classCode: "21-04",
    versionStatus: "现行有效",
  },
  {
    id: "gd-06",
    noticeNo: "2024年第38号",
    year: "2024",
    title: "肺结节与冠脉 CT 影像辅助分诊软件临床评价指导原则",
    reviewPoints: "规定多阅片者多病例（MRMC）试验统计效能、独立测试集金标准溯源及假阳性率上限控制。",
    category: "人工智能软件",
    classCode: "21-04",
    versionStatus: "现行有效",
  },
  {
    id: "gd-07",
    noticeNo: "2023年第19号",
    year: "2023",
    title: "冠状动脉药物洗脱支架系统临床评价注册审查指导原则",
    reviewPoints: "明确 12 个月靶病变失败率主终点、晚期管腔丢失影像亚组、涂层药物释放动力学及疲劳寿命测试。",
    category: "植介入与耗材",
    classCode: "13-07",
    versionStatus: "现行有效",
  },
  {
    id: "gd-08",
    noticeNo: "2024年第9号",
    year: "2024",
    title: "增材制造聚醚醚酮（PEEK）骨缺损填充植入物指导原则",
    reviewPoints: "规范医用级 PEEK 原材料主文档引用、打印粉末回收次数限制、残留清洗验证及骨整合试验周期。",
    category: "植介入与耗材",
    classCode: "13-05",
    versionStatus: "现行有效",
  },
  {
    id: "gd-09",
    noticeNo: "2023年第27号",
    year: "2023",
    title: "肿瘤伴随诊断试剂临床试验注册审查指导原则",
    reviewPoints: "规定与靶向药物同步开发及桥接临床试验路径、组织样本基因突变最低检出限及室间一致性评价。",
    category: "体外诊断",
    classCode: "6840",
    versionStatus: "现行有效",
  },
  {
    id: "gd-10",
    noticeNo: "2024年第31号",
    year: "2024",
    title: "高通量基因测序仪注册审查指导原则（修订版）",
    reviewPoints: "明确测序读长、Q30 碱基质量占比、有效通量稳定性、通用测序试剂边界及生信流程版本锁定。",
    category: "体外诊断",
    classCode: "22-07",
    versionStatus: "修订版",
  },
];

export const ANNUAL_REPORTS_ROWS: readonly AnnualReportRow[] = [
  {
    seq: "28",
    reportTitle: "《医疗器械注册工作年度报告》及《药品监督管理统计年度数据》",
    publisher: "国家药监局（NMPA）",
    latestIssue: "2025 年度（连续 8 期）",
    coverageLabel: "全文对账索引",
    reconciliationScope: "提取备案、二/三类首次与延续注册、生产经营企业官方基准数，与日常公开批件聚合值双列核验。",
  },
  {
    seq: "29",
    reportTitle: "《国家医疗器械不良事件监测年度报告》",
    publisher: "国家药监局药品评价中心",
    latestIssue: "2025 年度公报",
    coverageLabel: "年度公报索引",
    reconciliationScope: "记录年度报告总数、每百万人口报告数与临床使用场所构成（受主动上报率影响，不直接等同于产品故障率）。",
  },
  {
    seq: "30",
    reportTitle: "《医药工业经济运行分析报告》（卫生材料与医疗仪器设备制造）",
    publisher: "工业和信息化部",
    latestIssue: "2025 年度及季度简况",
    coverageLabel: "年度公报索引",
    reconciliationScope: "提取规模以上医疗器械工业企业营业收入与利润总额序列，与上市企业器械分部走势交叉印证。",
  },
  {
    seq: "32",
    reportTitle: "《全国医疗保障事业发展统计公报》及国家组织高值耗材集采公告",
    publisher: "国家医保局（NHSA）",
    latestIssue: "第一批至第五批国采及年度公报",
    coverageLabel: "年度公报索引",
    reconciliationScope: "汇总冠脉支架、人工关节、人工晶体、运动医学等国采中选规则与挂网基准价变动情况。",
  },
];

export const STANDARD_CATALOG_ROWS: readonly StandardRow[] = [
  {
    stdNo: "GB 9706.1-2020",
    stdName: "医用电气设备 第1部分：基本安全和基本性能的通用要求",
    keyClause: "有源医疗器械电气安全通用底座，强化全生命周期风险管理与关键元器件单一故障安全。",
    nature: "强制性国标",
    status: "现行有效",
    scope: "有源医疗器械通用安全",
  },
  {
    stdNo: "YY 9706.102-2021",
    stdName: "医用电气设备 第1-2部分：并列标准 电磁兼容要求和试验",
    keyClause: "规定专业医疗机构与家用医疗环境下的电磁发射限值及静电、射频抗扰度试验等级。",
    nature: "强制性行标",
    status: "现行有效",
    scope: "医用电磁兼容（EMC）",
  },
  {
    stdNo: "YY 9706.277-2023",
    stdName: "医用电气设备 第2-77部分：采用机器人技术的辅助手术设备专用要求",
    keyClause: "针对腹腔镜及能量辅助手术机器人规定主从运动映射安全、保护性停止与机械臂碰撞防护。",
    nature: "强制性行标",
    status: "现行有效",
    scope: "手术机器人专用安全",
  },
  {
    stdNo: "GB 9706.244-2020",
    stdName: "医用电气设备 第2-44部分：X射线计算机体层摄影设备专用要求",
    keyClause: "规范 CT 扫描辐射剂量显示精度、自动曝光控制、机架旋转机械防护及图像性能基线。",
    nature: "强制性国标",
    status: "现行有效",
    scope: "医学影像 CT 装备",
  },
  {
    stdNo: "GB 9706.233-2020",
    stdName: "医用电气设备 第2-33部分：医疗诊断用磁共振设备专用要求",
    keyClause: "规定静磁场安全警戒区、梯度磁场外周神经刺激限值、射频比吸收率监控与失超排风安全。",
    nature: "强制性国标",
    status: "现行有效",
    scope: "超导磁共振成像装备",
  },
  {
    stdNo: "YY/T 0287-2017",
    stdName: "医疗器械 质量管理体系 用于法规的要求（ISO 13485 等同采用）",
    keyClause: "覆盖设计开发转换、关键原材料供方受控、无菌屏障确认与上市后警戒体系规范。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "全生命周期质量体系",
  },
  {
    stdNo: "YY/T 0664-2020",
    stdName: "医疗器械软件 软件生存周期过程",
    keyClause: "按软件安全性级别（A/B/C级）规范需求追溯、架构设计、单元集成验证与已知剩余缺陷受控。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "医用软件与嵌入式系统",
  },
  {
    stdNo: "YY/T 1833.2-2022",
    stdName: "人工智能医疗器械 质量要求和评价 第2部分：数据集通用要求",
    keyClause: "规定医学影像与生理信号数据集采集脱敏、多专家独立标注仲裁流程及元数据质控。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "人工智能医疗器械软件",
  },
  {
    stdNo: "GB/T 16886.1-2022",
    stdName: "医疗器械生物学评价 第1部分：风险管理过程中的评价与试验",
    keyClause: "按人体接触性质与接触时长矩阵确立可沥滤物化学表征、细胞毒性、致敏及植入反应终点。",
    nature: "推荐性国标",
    status: "现行有效",
    scope: "植介入物与医用生物材料",
  },
  {
    stdNo: "YY/T 1474-2016",
    stdName: "医疗器械 可用性工程对医疗器械的应用",
    keyClause: "针对高风险有源装备与家用器械开展关键任务使用错误识别、人机界面形成性与总结性可用性测试。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "人机交互与临床使用安全",
  },
];
