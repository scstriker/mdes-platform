export type ReportTabKey = "briefings" | "policies" | "guidelines" | "standards";

export type SummaryStripItem = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  subline: string;
};

export type BriefingCitedLink = {
  seq: string;
  label: string;
  href: string;
};

export type BriefingItem = {
  id: string;
  code: string;
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
  phaseLabel: "一期已纳入" | "二期规划";
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
    label: "国家及地方政策条款 (23)",
    value: "418 份",
    subline: "一期部分纳入 · 国务院部委及先行省市",
  },
  {
    id: "guidelines",
    label: "注册审查指导原则 (24)",
    value: "506 份",
    subline: "一期已纳入 · CMDE 章节级结构化检索",
  },
  {
    id: "standards",
    label: "监管年报与现行标准 (28–37)",
    value: "8 份年报",
    subline: "含官方对账公报 + GB/YY 核心标准索引",
  },
];

export const BRIEFING_LEDGER: readonly BriefingItem[] = [
  {
    id: "itei-2026q3",
    code: "ITEI-MDES-2026Q3",
    date: "2026-10-28",
    series: "季度运行报告",
    title: "2026 年第三季度中国医疗器械产业运行监测报告",
    summary:
      "前三季度境内第三类医疗器械首次注册批准 2,814 件（同比 +9.6%），创新特别审查通道获批 49 件；同期海关医疗器械出口 312.6 亿美元（+6.6%），诊疗装备对顺差贡献持续提升。",
    keyFindings: [
      "有源手术设备、医学影像及植介入耗材合计占国产三类首次注册增量的 68.4%，京苏粤沪浙五省市集中度保持在 63% 左右。",
      "与 28 号药监注册年度报告历史序列对账显示，本库日常公开批件聚合值与官方年报口径偏差稳定控制在 0.8% 以内。",
      "出口结构由低值医用敷料加速向彩色超声、监护仪及数字化 X 射线整机迁移，一般贸易占比提升 2.4 个百分点。",
    ],
    citedIndicators: [
      { seq: "01", label: "01 注册与备案明细", href: "/system/01" },
      { seq: "02", label: "02 创新医疗器械", href: "/system/02" },
      { seq: "28", label: "28 药监监管年报", href: "/system/28" },
      { seq: "38", label: "38 进出口贸易", href: "/system/38" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 2026 年第三季度中国医疗器械产业运行监测报告 [R]. 北京: 医疗器械产业数据系统（MDES）, 2026-10.",
  },
  {
    id: "itei-trd-cr3",
    code: "ITEI-TRD-2026-04",
    date: "2026-10-15",
    series: "供应链安全专题",
    title: "高端医学影像整机与核心零部件进口来源集中度（CR3）专题研判",
    summary:
      "穿透海关 8 位整机与专用零件 HS 税号测算表明，医院诊断与治疗设备大类进口 CR3 为 43.0%，而高热容量 CT 球管（9022.3000）与电子软镜核心组件进口 CR3 仍超过 78%。",
    keyFindings: [
      "3.0T 超导磁共振与中高端 CT 整机进口额连续六个季度小幅回落，反映国产高端整机院端配置替代稳步推进。",
      "上游核心元器件进口金额降幅显著慢于整机，关键球管、高频探头晶元与特种光学组件仍高度集中于美、德、日三国。",
      "建议结合 26 号首台（套）目录与 27 号揭榜挂帅验收进展，建立零部件税号月度 CR1/CR3 预警台账。",
    ],
    citedIndicators: [
      { seq: "38", label: "38 进出口贸易集中度", href: "/system/38" },
      { seq: "08", label: "08 大型设备配置装机", href: "/system/08" },
      { seq: "26", label: "26 首台（套）目录", href: "/system/26" },
      { seq: "TRD-006", label: "TRD-006 进口来源集中度", href: "/indicators/TRD-006" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 高端医学影像整机与核心零部件进口来源集中度（CR3）专题研判 [R]. 北京: MDES 智库专报, 2026-10.",
  },
  {
    id: "itei-robot-std",
    code: "ITEI-REG-2026-09",
    date: "2026-09-26",
    series: "审评与标准简报",
    title: "腔镜与骨科手术机器人审评指导原则及专用标准演进简报",
    summary:
      "梳理国家药监局器审中心（CMDE）手术机器人系列指导原则与 YY 9706.277 强制性专用安全标准衔接关系，拆解机械臂定位精度、主从延迟及临床评价路径核心条款。",
    keyFindings: [
      "新版电气安全体系（GB 9706.1-2020 配合 YY 9706.277）已全面纳入注册检验前置要求，承检机构 CMA 附表授权覆盖率显著提升。",
      "多适应症拓展申报需严格区分同品种比对边界与前瞻性临床试验要求，避免混用单中心科研论文替代法定审评证据。",
    ],
    citedIndicators: [
      { seq: "02", label: "02 创新审查与获批", href: "/system/02" },
      { seq: "21", label: "21 检验检测机构", href: "/system/21" },
      { seq: "24", label: "24 注册审查指导原则", href: "/system/24" },
      { seq: "37", label: "37 国家与行业标准", href: "/system/37" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 腔镜与骨科手术机器人审评指导原则及专用标准演进简报 [R]. 北京: MDES 审评与标准观察, 2026-09.",
  },
  {
    id: "itei-class3-5y",
    code: "ITEI-REG-2026-07",
    date: "2026-08-30",
    series: "准入结构专题",
    title: "国产第三类医疗器械首次注册结构五年复盘（2021—2025）",
    summary:
      "基于 34.2 万条注册与备案明细快照，严格剥离延续注册与著录事项变更后，系统复盘近五年国产三类首次注册在 22 个子目录中的结构跃迁。",
    keyFindings: [
      "无源植入物、有源手术器械与医用成像器械三类子目录五年复合增速位居前列，国产首次注册占比由 2021 年的 64.2% 升至 76.8%。",
      "单张注册证下挂载的 UDI-DI 规格型号中位数在骨科植入与血管介入赛道达 84 个，验证了 01 号与 05 号严禁混同计数的口径必要性。",
    ],
    citedIndicators: [
      { seq: "01", label: "01 注册与备案明细", href: "/system/01" },
      { seq: "03", label: "03 优先审批器械", href: "/system/03" },
      { seq: "05", label: "05 UDI 规格型号", href: "/system/05" },
      { seq: "10", label: "10 企业持证产品", href: "/system/10" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 国产第三类医疗器械首次注册结构五年复盘（2021—2025）[R]. 北京: MDES 产业准入研究, 2026-08.",
  },
  {
    id: "itei-listed-rd",
    code: "ITEI-ENT-2026-05",
    date: "2026-07-22",
    series: "企业年报专题",
    title: "医疗器械上市企业研发投入强度与境外营收统计口径辨析",
    summary:
      "依托 172 家 A+H 股去重标准样本池（13号），对比科创板与主板器械分部研发强度差异，并界定企业年报“境外营业收入”与海关“出口额”的统计鸿沟。",
    keyFindings: [
      "科创板医疗器械样本研发投入占营业收入比重中位数达 16.4%，显著高于行业整体中位数（9.8%）；资本化研发支出占比须单独列示。",
      "头部企业通过欧美并购工厂实现的本地生产本地销售计入年报境外收入，但不在中国海关报关出口统计（38号）范围内，两项指标严禁直接相除测算份额。",
    ],
    citedIndicators: [
      { seq: "13", label: "13 上市企业样本池", href: "/system/13" },
      { seq: "14", label: "14 经营与盈利", href: "/system/14" },
      { seq: "15", label: "15 研发投入", href: "/system/15" },
      { seq: "16", label: "16 上市企业境外信息", href: "/system/16" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 医疗器械上市企业研发投入强度与境外营收统计口径辨析 [R]. 北京: MDES 企业与资本专题, 2026-07.",
  },
  {
    id: "itei-pol-firstset",
    code: "ITEI-POL-2026-03",
    date: "2026-06-18",
    series: "政策跟踪简报",
    title: "国家及重点省市高端医疗装备更新与创新入院支持条款横向比对",
    summary:
      "对国务院大规模设备更新行动方案及京、沪、粤、苏、浙五省市配套医疗装备政策进行条款级拆解，梳理审评前置辅导、首台（套）保险补偿与医保新增立项通道。",
    keyFindings: [
      "国家层面聚焦县域医共体与三甲医院高端影像、放疗及手术室设备迭代，明确财政贴息与专项债支持方向。",
      "先行省市普遍建立“创新药械目录—医院药事/器械会限时议定—DRG/DIP 除外支付”联动机制，缩短创新获批后入院周期。",
    ],
    citedIndicators: [
      { seq: "23", label: "23 国家及地方政策条款", href: "/system/23" },
      { seq: "26", label: "26 首台（套）目录", href: "/system/26" },
      { seq: "27", label: "27 揭榜挂帅任务", href: "/system/27" },
      { seq: "32", label: "32 医保集采与支付公报", href: "/system/32" },
    ],
    citation:
      "机械工业仪器仪表综合技术经济研究所（ITEI）. 国家及重点省市高端医疗装备更新与创新入院支持条款横向比对 [R]. 北京: MDES 政策法规观察, 2026-06.",
  },
];

export const POLICY_CLAUSE_ROWS: readonly PolicyClauseRow[] = [
  {
    id: "pol-01",
    docNo: "国发〔2024〕7号",
    publishDate: "2024-03-07",
    title: "《推动大规模设备更新和消费品以旧换新行动方案》医疗装备条款",
    clauseSummary:
      "鼓励具备条件的医疗机构加快医学影像、放射治疗、远程诊疗、手术机器人等医疗装备更新改造，强化中央预算内投资与财政贴息协同。",
    agency: "国务院",
    topic: "设备更新改造",
    level: "国家级部委",
  },
  {
    id: "pol-02",
    docNo: "国药监械注〔2025〕18号",
    publishDate: "2025-06-20",
    title: "《关于进一步支持高端医疗器械创新发展的若干举措》",
    clauseSummary:
      "针对医用机器人、高端医学影像、人工智能医疗器械及新型生物材料实施审评前置指导，优化创新通道变更注册与续证审评衔接。",
    agency: "国家药监局",
    topic: "创新审评准入",
    level: "国家级部委",
  },
  {
    id: "pol-03",
    docNo: "工信部联规〔2025〕42号",
    publishDate: "2025-04-14",
    title: "《医药工业数智化转型实施方案（2025—2030年）》器械智造章节",
    clauseSummary:
      "支持高值医用耗材与有源医疗装备建设智能工厂，推进 UDI 全链条追溯与研发设计仿真工业软件攻关验证。",
    agency: "工信部等七部门",
    topic: "智能制造与补链",
    level: "国家级部委",
  },
  {
    id: "pol-04",
    docNo: "工信部重装〔2024〕89号",
    publishDate: "2024-09-09",
    title: "《首台（套）重大技术装备推广应用指导目录（2024年版）》医疗装备篇",
    clauseSummary:
      "将光子计数 CT、5.0T 磁共振、单孔腔镜手术系统及质子重离子放疗装备纳入国家级推广目录，明确关键探测器与定位精度门槛。",
    agency: "工业和信息化部",
    topic: "首台套推广",
    level: "国家级部委",
  },
  {
    id: "pol-05",
    docNo: "医保发〔2025〕11号",
    publishDate: "2025-03-28",
    title: "《关于完善创新医疗器械医疗服务价格项目立项与医保支付衔接的通知》",
    clauseSummary:
      "对获批进入国家药监局创新特别审查通道的器械设立价格立项绿色通道，支持符合条件的新技术按规定纳入 CHS-DRG 特例单议。",
    agency: "国家医保局",
    topic: "医保定价支付",
    level: "国家级部委",
  },
  {
    id: "pol-06",
    docNo: "京医保发〔2025〕6号",
    publishDate: "2025-04-08",
    title: "《北京市支持创新医药高质量发展若干措施（2025年）》器械专章",
    clauseSummary:
      "推动临床急需创新医疗器械“获批即挂网”，取消医院配备数量限制，对多中心临床试验牵头三甲医院给予科研绩效激励。",
    agency: "北京市医保局等九部门",
    topic: "创新入院应用",
    level: "重点省市",
  },
  {
    id: "pol-07",
    docNo: "沪府办发〔2025〕9号",
    publishDate: "2025-05-12",
    title: "《上海市促进高端医疗器械产业全链条发展行动方案》",
    clauseSummary:
      "围绕张江、嘉定、闵行特色产业集聚区支持核心元器件攻关，对首次取得三类创新注册证并实现产业化的产品给予分档资助。",
    agency: "上海市人民政府办公厅",
    topic: "全链条产业扶持",
    level: "重点省市",
  },
  {
    id: "pol-08",
    docNo: "粤工信生物〔2025〕15号",
    publishDate: "2025-07-03",
    title: "《广东省推动医疗器械产业高质量发展实施方案》",
    clauseSummary:
      "支持深圳、广州国家高性能医疗器械创新平台建设，强化大湾区电磁兼容与生物相容性公共检测服务能力及出海合规认证支持。",
    agency: "广东省工信厅等部门",
    topic: "集群与出海服务",
    level: "重点省市",
  },
  {
    id: "pol-09",
    docNo: "苏政办发〔2025〕21号",
    publishDate: "2025-06-05",
    title: "《江苏省全链条支持创新药械高质量发展若干政策措施》",
    clauseSummary:
      "依托省药监审评核查分中心下沉前置服务，将省产创新医疗器械纳入省级公立医院设备更新优先推荐清单与首购风险分担机制。",
    agency: "江苏省人民政府办公厅",
    topic: "审评与首购联动",
    level: "重点省市",
  },
];

export const GUIDELINE_ROWS: readonly GuidelineRow[] = [
  {
    id: "gd-01",
    noticeNo: "2023年第32号",
    year: "2023",
    title: "腹腔内窥镜手术系统注册审查指导原则（第1部分：手术器械及附件 / 第2部分：系统）",
    reviewPoints:
      "明确主从控制延迟、机械臂重复定位精度、紧急停机安全互锁、动物试验离体/活体模型设计及多中心临床试验主要疗效终点。",
    category: "有源手术与机器人",
    classCode: "01-07",
    versionStatus: "现行有效",
  },
  {
    id: "gd-02",
    noticeNo: "2024年第14号",
    year: "2024",
    title: "骨科手术导航定位系统技术审评要点（修订版）",
    reviewPoints:
      "规范光学/电磁配准误差评价方法、机械臂末端负载刚度测试、术前三维重建软件网络安全与适用关节/脊柱术式临床评价。",
    category: "有源手术与机器人",
    classCode: "01-07",
    versionStatus: "修订版",
  },
  {
    id: "gd-03",
    noticeNo: "2024年第21号",
    year: "2024",
    title: "磁共振成像系统注册审查指导原则（2024年修订版）",
    reviewPoints:
      "对齐 GB 9706.1-2020 与 YY 9706.233 专用标准，细化信噪比、场均匀度、比吸收率（SAR）控制及深度学习重建序列真实性验证。",
    category: "医学影像",
    classCode: "06-09",
    versionStatus: "修订版",
  },
  {
    id: "gd-04",
    noticeNo: "2023年第45号",
    year: "2023",
    title: "医用 X 射线计算机体层摄影（CT）设备注册审查指导原则",
    reviewPoints:
      "覆盖球管热容量与探测器排数核定、CTDIvol 辐射剂量控制、低剂量迭代算法伪影评估及心脏冠脉成像时间分辨率验证。",
    category: "医学影像",
    classCode: "06-05",
    versionStatus: "现行有效",
  },
  {
    id: "gd-05",
    noticeNo: "2022年第8号",
    year: "2022",
    title: "人工智能医疗器械注册审查指导原则",
    reviewPoints:
      "确立算法需求分析、训练/验证/测试数据集代表性与防数据泄露质控、泛化能力多中心测试及算法更新重大变更判定准则。",
    category: "人工智能软件",
    classCode: "21-04",
    versionStatus: "现行有效",
  },
  {
    id: "gd-06",
    noticeNo: "2024年第38号",
    year: "2024",
    title: "肺结节与冠脉 CT 影像辅助分诊软件临床评价注册审查指导原则",
    reviewPoints:
      "规定多阅片者多病例（MRMC）试验统计效能计算、独立测试集阳性金标准溯源及假阳性率上限控制。",
    category: "人工智能软件",
    classCode: "21-04",
    versionStatus: "现行有效",
  },
  {
    id: "gd-07",
    noticeNo: "2023年第19号",
    year: "2023",
    title: "冠状动脉药物洗脱支架系统临床评价注册审查指导原则",
    reviewPoints:
      "明确靶病变失败率（TLF）12 个月主终点、晚期管腔丢失影像随访亚组、涂层药物释放动力学及疲劳寿命体外验证。",
    category: "植介入与耗材",
    classCode: "13-07",
    versionStatus: "现行有效",
  },
  {
    id: "gd-08",
    noticeNo: "2024年第9号",
    year: "2024",
    title: "增材制造聚醚醚酮（PEEK）骨缺损填充植入物注册审查指导原则",
    reviewPoints:
      "规范医用级 PEEK 原材料主文档（MAF）引用、3D 打印粉末回收次数限制、残留颗粒清洗验证及骨整合动物试验周期。",
    category: "植介入与耗材",
    classCode: "13-05",
    versionStatus: "现行有效",
  },
  {
    id: "gd-09",
    noticeNo: "2023年第27号",
    year: "2023",
    title: "肿瘤伴随诊断试剂临床试验注册审查指导原则",
    reviewPoints:
      "规定与靶向药物共同开发及桥接临床试验路径、FFPE 样本基因突变最低检出限（LoD）及室间一致性评价。",
    category: "体外诊断",
    classCode: "6840",
    versionStatus: "现行有效",
  },
  {
    id: "gd-10",
    noticeNo: "2024年第31号",
    year: "2024",
    title: "高通量基因测序仪注册审查指导原则（修订版）",
    reviewPoints:
      "明确测序读长、Q30 碱基质量占比、有效通量稳定性、配套通用测序试剂边界及生物信息分析流程版本锁定。",
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
    latestIssue: "2025 年度（共 8 期入库）",
    phaseLabel: "一期已纳入",
    reconciliationScope: "提取备案、二/三类首次与延续注册、生产经营企业官方基准数，与本库 01/02/03/09 号双列对账。",
  },
  {
    seq: "29",
    reportTitle: "《国家医疗器械不良事件监测年度报告》",
    publisher: "国家药监局药品评价中心",
    latestIssue: "2025 年度公报",
    phaseLabel: "二期规划",
    reconciliationScope: "记录年度报告总数、每百万人口报告数、管理类别与临床使用场所构成（受上报覆盖率影响，禁直接解释为故障率）。",
  },
  {
    seq: "30",
    reportTitle: "《医药工业经济运行分析报告》（C2770 卫生材料 / C358 医疗仪器设备）",
    publisher: "工业和信息化部",
    latestIssue: "2025 年度及季度简况",
    phaseLabel: "二期规划",
    reconciliationScope: "提取年主营收入 2000 万元以上规上企业营收与利润序列，与 14 号上市企业合并报表分部走势交叉印证。",
  },
  {
    seq: "32",
    reportTitle: "《全国医疗保障事业发展统计公报》及国家组织高值医用耗材集采公告",
    publisher: "国家医保局（NHSA）",
    latestIssue: "第一批至第五批国采及年度公报",
    phaseLabel: "二期规划",
    reconciliationScope: "记录冠脉支架、人工关节、人工晶体、运动医学等国采品种中选规则与挂网基准价平均降幅。",
  },
];

export const STANDARD_CATALOG_ROWS: readonly StandardRow[] = [
  {
    stdNo: "GB 9706.1-2020",
    stdName: "医用电气设备 第1部分：基本安全和基本性能的通用要求",
    keyClause: "全行业有源医疗器械电气安全基础底座，强化全生命周期风险管理（ISO 14971）与关键元器件故障安全。",
    nature: "强制性国标",
    status: "现行有效",
    scope: "有源医疗器械通用安全",
  },
  {
    stdNo: "YY 9706.102-2021",
    stdName: "医用电气设备 第1-2部分：基本安全和基本性能的通用要求 并列标准：电磁兼容 要求和试验",
    keyClause: "规定专业医疗机构环境与家庭医疗环境下的电磁发射限值及抗扰度（EMS）等级。",
    nature: "强制性行标",
    status: "现行有效",
    scope: "医用电磁兼容（EMC）",
  },
  {
    stdNo: "YY 9706.277-2023",
    stdName: "医用电气设备 第2-77部分：采用机器人技术的辅助手术设备基本安全和基本性能专用要求",
    keyClause: "针对腹腔镜及能量辅助手术机器人规定主从运动映射安全、保护性停止与机械臂碰撞防护。",
    nature: "强制性行标",
    status: "现行有效",
    scope: "手术机器人专用安全",
  },
  {
    stdNo: "GB 9706.244-2020",
    stdName: "医用电气设备 第2-44部分：X射线计算机体层摄影设备基本安全和基本性能专用要求",
    keyClause: "规范 CT 扫描辐射剂量显示精度、自动曝光控制、机架旋转机械防护及图像性能基线。",
    nature: "强制性国标",
    status: "现行有效",
    scope: "医学影像 CT 装备",
  },
  {
    stdNo: "YY/T 0287-2017",
    stdName: "医疗器械 质量管理体系 用于法规的要求（ISO 13485:2016 IDT）",
    keyClause: "覆盖医疗器械设计开发转换、采购关键件供方控制、灭菌确认与上市后警戒体系规范。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "全生命周期质量体系",
  },
  {
    stdNo: "YY/T 1833.2-2022",
    stdName: "人工智能医疗器械 质量要求和评价 第2部分：数据集通用要求",
    keyClause: "规定训练/验证/测试医学数据集采集脱敏、多专家独立标注仲裁流程及元数据溯源规范。",
    nature: "推荐性行标",
    status: "现行有效",
    scope: "人工智能医疗器械软件",
  },
  {
    stdNo: "GB/T 16886.1-2022",
    stdName: "医疗器械生物学评价 第1部分：风险管理过程中的评价与试验",
    keyClause: "按人体接触性质与接触时间矩阵确立物理化学表征、细胞毒性、致敏及全身毒性评价终点。",
    nature: "推荐性国标",
    status: "现行有效",
    scope: "植介入物与医用生物材料",
  },
];
