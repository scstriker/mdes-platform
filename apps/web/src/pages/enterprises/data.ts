export type EnterpriseGroup = "all" | "champion" | "ashare" | "hk";

export type EnterpriseKpiItem = {
  label: string;
  value: string;
  unit: string;
  subnote: string;
  seqDisplay: string;
  seqHref: string;
};

export const ENTERPRISE_KPIS: readonly EnterpriseKpiItem[] = [
  {
    label: "二三类生产企业主体",
    value: "16,420",
    unit: "家",
    subnote: "按统一社会信用代码法人去重",
    seqDisplay: "09",
    seqHref: "/system/09",
  },
  {
    label: "国家级制造业单项冠军",
    value: "27",
    unit: "家/项",
    subnote: "第 1–8 批示范企业与冠军产品",
    seqDisplay: "12",
    seqHref: "/system/12",
  },
  {
    label: "医疗器械上市企业样本池",
    value: "172",
    unit: "家",
    subnote: "A/H 去重 · 含科创板与港股 18A",
    seqDisplay: "13",
    seqHref: "/system/13",
  },
  {
    label: "国家研发与临床医学中心",
    value: "68",
    unit: "个",
    subnote: "制造业创新中心与国家临床中心",
    seqDisplay: "19–20",
    seqHref: "/system/19",
  },
  {
    label: "检验检测与临床试验备案机构",
    value: "1,340",
    unit: "家",
    subnote: "CMA 承检院所与药监备案医院",
    seqDisplay: "21–22",
    seqHref: "/system/21",
  },
];

export type ProvincialConcentrationRow = {
  province: string;
  manufacturers: number;
  class3ValidCerts: number;
  class3SharePct: string;
  champions: number;
  listedFirms: number;
  gcpInstitutions: number;
};

export const PROVINCIAL_CONCENTRATION: readonly ProvincialConcentrationRow[] = [
  {
    province: "广东",
    manufacturers: 3380,
    class3ValidCerts: 4120,
    class3SharePct: "22.5%",
    champions: 6,
    listedFirms: 36,
    gcpInstitutions: 148,
  },
  {
    province: "江苏",
    manufacturers: 2690,
    class3ValidCerts: 3390,
    class3SharePct: "18.5%",
    champions: 5,
    listedFirms: 31,
    gcpInstitutions: 132,
  },
  {
    province: "北京",
    manufacturers: 980,
    class3ValidCerts: 2490,
    class3SharePct: "13.6%",
    champions: 4,
    listedFirms: 24,
    gcpInstitutions: 116,
  },
  {
    province: "上海",
    manufacturers: 1060,
    class3ValidCerts: 2050,
    class3SharePct: "11.2%",
    champions: 4,
    listedFirms: 22,
    gcpInstitutions: 94,
  },
  {
    province: "浙江",
    manufacturers: 1840,
    class3ValidCerts: 1520,
    class3SharePct: "8.3%",
    champions: 3,
    listedFirms: 19,
    gcpInstitutions: 88,
  },
  {
    province: "山东",
    manufacturers: 1390,
    class3ValidCerts: 1170,
    class3SharePct: "6.4%",
    champions: 2,
    listedFirms: 11,
    gcpInstitutions: 96,
  },
  {
    province: "湖南",
    manufacturers: 860,
    class3ValidCerts: 640,
    class3SharePct: "3.5%",
    champions: 1,
    listedFirms: 7,
    gcpInstitutions: 58,
  },
  {
    province: "湖北",
    manufacturers: 720,
    class3ValidCerts: 570,
    class3SharePct: "3.1%",
    champions: 1,
    listedFirms: 6,
    gcpInstitutions: 64,
  },
  {
    province: "四川",
    manufacturers: 690,
    class3ValidCerts: 530,
    class3SharePct: "2.9%",
    champions: 1,
    listedFirms: 6,
    gcpInstitutions: 62,
  },
  {
    province: "天津",
    manufacturers: 540,
    class3ValidCerts: 495,
    class3SharePct: "2.7%",
    champions: 0,
    listedFirms: 4,
    gcpInstitutions: 44,
  },
];

export type EnterprisePoolRow = {
  id: string;
  entityCode: string;
  shortName: string;
  coreBusiness: string;
  groups: readonly Exclude<EnterpriseGroup, "all">[];
  boardLabel: string;
  tagTone: "info" | "warning" | "neutral";
  province: string;
  revenueAndRd: string;
  overseasNote: string;
  statusBatch: string;
};

export const GROUP_TABS: readonly { id: EnterpriseGroup; label: string }[] = [
  { id: "all", label: "全部重点主体" },
  { id: "champion", label: "制造业单项冠军 (12)" },
  { id: "ashare", label: "A股上市企业 (13)" },
  { id: "hk", label: "港股及A+H上市 (13)" },
];

export const ENTERPRISE_PROVINCE_OPTIONS: readonly string[] = [
  "广东",
  "上海",
  "北京",
  "江苏",
  "山东",
  "浙江",
  "湖南",
];

export const ENTERPRISE_POOL_ROWS: readonly EnterprisePoolRow[] = [
  {
    id: "ent-01",
    entityCode: "300760.SZ",
    shortName: "迈瑞医疗",
    coreBusiness: "生命信息与支持、体外诊断、医学影像；监护仪与除颤设备获评单项冠军",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 创业板",
    tagTone: "info",
    province: "广东",
    revenueAndRd: "367.3 亿元 · R&D 10.9%",
    overseasNote: "2025年报器械主业 · 境外收入占 44.7%",
    statusBatch: "第3/6批复核",
  },
  {
    id: "ent-02",
    entityCode: "688271.SH",
    shortName: "联影医疗",
    coreBusiness: "MR、CT、PET/CT、XR 及放疗装备；高端分子影像与超导磁共振整机及核心部件",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 科创板",
    tagTone: "info",
    province: "上海",
    revenueAndRd: "114.2 亿元 · R&D 17.8%",
    overseasNote: "2025年报器械主业 · 境外收入占 21.9%",
    statusBatch: "第7批冠军产品",
  },
  {
    id: "ent-03",
    entityCode: "688212.SH",
    shortName: "奕瑞科技",
    coreBusiness: "数字化 X 线平板探测器、CMOS 与光子计数核心影像传感器部件",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 科创板",
    tagTone: "info",
    province: "上海",
    revenueAndRd: "20.6 亿元 · R&D 15.4%",
    overseasNote: "核心部件上游口径 · 境外供应链占 36.2%",
    statusBatch: "第5批示范企业",
  },
  {
    id: "ent-04",
    entityCode: "300633.SZ",
    shortName: "开立医疗",
    coreBusiness: "医用超声诊断系统、高清电子软式内窥镜及血管内超声成像系统",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 创业板",
    tagTone: "info",
    province: "广东",
    revenueAndRd: "22.8 亿元 · R&D 19.6%",
    overseasNote: "2025年报器械主业 · 境外收入占 43.1%",
    statusBatch: "第8批冠军产品",
  },
  {
    id: "ent-05",
    entityCode: "688029.SH",
    shortName: "南微医学",
    coreBusiness: "内镜诊疗微创耗材、止血闭合夹、肿瘤消融及一次性胆胰子镜系统",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 科创板",
    tagTone: "info",
    province: "江苏",
    revenueAndRd: "27.4 亿元 · R&D 6.8%",
    overseasNote: "欧美直销子公司并表 · 境外收入占 46.5%",
    statusBatch: "第7批冠军产品",
  },
  {
    id: "ent-06",
    entityCode: "002223.SZ",
    shortName: "鱼跃医疗",
    coreBusiness: "呼吸制氧、家用慢病监测、高流量呼吸湿化与急救自动体外除颤器（AED）",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 深市主板",
    tagTone: "info",
    province: "江苏",
    revenueAndRd: "79.8 亿元 · R&D 6.9%",
    overseasNote: "医用制氧机冠军品类 · 境外收入占 13.4%",
    statusBatch: "第6批冠军产品",
  },
  {
    id: "ent-07",
    entityCode: "688114.SH",
    shortName: "华大智造",
    coreBusiness: "高通量基因测序仪、临床分子诊断自动化样本制备工作站及核心酶原料",
    groups: ["champion", "ashare"],
    boardLabel: "单项冠军 · 科创板",
    tagTone: "info",
    province: "广东",
    revenueAndRd: "30.1 亿元 · R&D 26.4%",
    overseasNote: "临床测序仪分部 · 境外收入占 31.8%",
    statusBatch: "第8批冠军产品",
  },
  {
    id: "ent-08",
    entityCode: "300832.SZ",
    shortName: "新产业生物",
    coreBusiness: "全自动化学发光免疫分析仪及配套三类/二类体外诊断试剂流水线",
    groups: ["ashare"],
    boardLabel: "A股样本 · 创业板",
    tagTone: "neutral",
    province: "广东",
    revenueAndRd: "45.4 亿元 · R&D 9.7%",
    overseasNote: "2025年报器械主业 · 境外装机占 37.9%",
    statusBatch: "样本池在册",
  },
  {
    id: "ent-09",
    entityCode: "688050.SH",
    shortName: "爱博医疗",
    coreBusiness: "疏水性丙烯酸酯人工晶状体、角膜塑形用硬性透气接触镜（OK镜）",
    groups: ["ashare"],
    boardLabel: "A股样本 · 科创板",
    tagTone: "neutral",
    province: "北京",
    revenueAndRd: "14.1 亿元 · R&D 9.8%",
    overseasNote: "眼科植介入纯器械主体 · 境内为主",
    statusBatch: "样本池在册",
  },
  {
    id: "ent-10",
    entityCode: "688289.SH",
    shortName: "圣湘生物",
    coreBusiness: "呼吸道与妇幼感染核酸分子诊断试剂、POCT 快速检测与基因测序方案",
    groups: ["ashare"],
    boardLabel: "A股样本 · 科创板",
    tagTone: "neutral",
    province: "湖南",
    revenueAndRd: "14.9 亿元 · R&D 16.5%",
    overseasNote: "2025年报体外诊断主业 · 境外占 18.2%",
    statusBatch: "样本池在册",
  },
  {
    id: "ent-11",
    entityCode: "688236.SH",
    shortName: "春立医疗",
    coreBusiness: "人工髋膝肩关节假体、脊柱内固定系统与运动医学植入物（688236.SH / 01858.HK）",
    groups: ["ashare", "hk"],
    boardLabel: "A+H 两地上市",
    tagTone: "warning",
    province: "北京",
    revenueAndRd: "11.8 亿元 · R&D 13.2%",
    overseasNote: "按信用代码去重计 1 家 · 境外占 22.6%",
    statusBatch: "A+H去重计1",
  },
  {
    id: "ent-12",
    entityCode: "01066.HK",
    shortName: "山东威高股份",
    coreBusiness: "临床护理耗材、骨科植入（威高骨科并表协同）、血液净化与预灌封给药器械",
    groups: ["champion", "hk"],
    boardLabel: "单项冠军 · 港股主板",
    tagTone: "info",
    province: "山东",
    revenueAndRd: "136.5 亿元 · R&D 4.8%",
    overseasNote: "港币折算人民币口径 · 标注集团并表关系",
    statusBatch: "第4批示范企业",
  },
  {
    id: "ent-13",
    entityCode: "00853.HK",
    shortName: "微创医疗科学",
    coreBusiness: "冠脉植介入、心律管理、大动脉及外周介入（含科创板子公司并表注释）",
    groups: ["hk"],
    boardLabel: "港股主板 · 集团母体",
    tagTone: "warning",
    province: "上海",
    revenueAndRd: "74.2 亿元 · R&D 24.1%",
    overseasNote: "美元财报折算 · 含欧美 CRM 本地工厂产销",
    statusBatch: "母子并表标注",
  },
  {
    id: "ent-14",
    entityCode: "02252.HK",
    shortName: "微创医疗机器人",
    coreBusiness: "图迈四臂腔镜手术机器人、鸿鹄骨科手术导航系统及支气管镜介入机器人",
    groups: ["hk"],
    boardLabel: "港股 18A 生物科技",
    tagTone: "neutral",
    province: "上海",
    revenueAndRd: "2.6 亿元 · R&D 138.0%",
    overseasNote: "商业化放量初期 · 海外 CE 获批装机",
    statusBatch: "18A样本在册",
  },
  {
    id: "ent-15",
    entityCode: "01302.HK",
    shortName: "先健科技",
    coreBusiness: "先天性心脏病封堵器、主动脉覆膜支架系统及左心耳封堵器（单项冠军产品）",
    groups: ["champion", "hk"],
    boardLabel: "单项冠军 · 港股主板",
    tagTone: "info",
    province: "广东",
    revenueAndRd: "13.2 亿元 · R&D 18.9%",
    overseasNote: "先心封堵器全球份额领先 · 境外占 24.5%",
    statusBatch: "第6批冠军产品",
  },
];

export type ServiceInstitutionRow = {
  id: string;
  seq: "19" | "20" | "21" | "22";
  name: string;
  hostUnit: string;
  categoryLabel: string;
  province: string;
  specialtyScope: string;
  qualificationNote: string;
};

export const RD_CLINICAL_PLATFORMS: readonly ServiceInstitutionRow[] = [
  {
    id: "inst-01",
    seq: "19",
    name: "国家高性能医疗器械创新中心",
    hostUnit: "深圳高性能医疗器械国家研究院有限公司",
    categoryLabel: "国家制造业创新中心",
    province: "广东",
    specialtyScope: "高端医学影像、体外诊断核心元器件、生命支持与植介入材料共性技术攻关",
    qualificationNote: "工信部批复国家级制造业创新中心",
  },
  {
    id: "inst-02",
    seq: "19",
    name: "国家生物医学材料工程技术研究中心",
    hostUnit: "四川大学",
    categoryLabel: "国家工程技术研究中心",
    province: "四川",
    specialtyScope: "组织诱导性生物材料、可降解心血管植入物与再生医学器械评价",
    qualificationNote: "科技部认定国家级工程技术平台",
  },
  {
    id: "inst-03",
    seq: "19",
    name: "高端医疗装备应用示范与医工转化重点实验室",
    hostUnit: "中国科学院苏州生物医学工程技术研究所",
    categoryLabel: "国立科研工程平台",
    province: "江苏",
    specialtyScope: "医用光学显微、流式细胞分析与高端体外诊断仪器工程化",
    qualificationNote: "部省共建医工交叉转化基地",
  },
  {
    id: "inst-04",
    seq: "20",
    name: "国家心血管病中心 / 国家心血管病临床医学研究中心",
    hostUnit: "中国医学科学院阜外医院",
    categoryLabel: "国家临床医学研究中心",
    province: "北京",
    specialtyScope: "经导管瓣膜置换、人工心脏（LVAD）、冠脉介入与电生理器械多中心临床评价",
    qualificationNote: "卫健委/科技部联合认定（第1批）",
  },
  {
    id: "inst-05",
    seq: "20",
    name: "国家神经系统疾病临床医学研究中心",
    hostUnit: "首都医科大学附属北京天坛医院",
    categoryLabel: "国家临床医学研究中心",
    province: "北京",
    specialtyScope: "颅内取栓/密网支架、脑机接口神经调控与神经外科手术机器人临床验证",
    qualificationNote: "卫健委/科技部联合认定（第1批）",
  },
  {
    id: "inst-06",
    seq: "20",
    name: "国家骨科与运动康复临床医学研究中心",
    hostUnit: "北京积水潭医院",
    categoryLabel: "国家临床医学研究中心",
    province: "北京",
    specialtyScope: "骨科手术定位导航机器人、3D打印定制假体与运动医学植入物临床研究",
    qualificationNote: "国家骨科医学中心双依托主体",
  },
  {
    id: "inst-07",
    seq: "20",
    name: "国家放射与治疗临床医学研究中心",
    hostUnit: "复旦大学附属中山医院",
    categoryLabel: "国家临床医学研究中心",
    province: "上海",
    specialtyScope: "超高场磁共振、分子影像、外周血管介入与内镜微创器械临床转化",
    qualificationNote: "综合类国家医学中心联动平台",
  },
  {
    id: "inst-08",
    seq: "20",
    name: "国家口腔疾病临床医学研究中心",
    hostUnit: "四川大学华西口腔医院",
    categoryLabel: "国家临床医学研究中心",
    province: "四川",
    specialtyScope: "数字化口腔种植体、颌面修复材料与口腔扫描导航设备临床评价",
    qualificationNote: "口腔专科国家级临床研究网络",
  },
];

export const TESTING_GCP_INSTITUTIONS: readonly ServiceInstitutionRow[] = [
  {
    id: "test-01",
    seq: "21",
    name: "中国食品药品检定研究院（医疗器械检定所）",
    hostUnit: "国家药监局直属法定检验机构",
    categoryLabel: "国家级器检院",
    province: "北京",
    specialtyScope: "人工智能医疗器械标准测试数据集、三类高风险植入物、伴随诊断国家标准品标定",
    qualificationNote: "CMA / CNAS 全领域授权基准院所",
  },
  {
    id: "test-02",
    seq: "21",
    name: "北京市医疗器械检验研究院（BIMT）",
    hostUnit: "北京市药监局所属检验院",
    categoryLabel: "省级权威器检院",
    province: "北京",
    specialtyScope: "医用电气设备 GB 9706.1 全项、手术机器人、放疗质子重离子与体外诊断检验",
    qualificationNote: "10米法电磁兼容暗室 CMA 授权",
  },
  {
    id: "test-03",
    seq: "21",
    name: "上海市医疗器械检验研究院",
    hostUnit: "上海市药监局所属检验院",
    categoryLabel: "省级权威器检院",
    province: "上海",
    specialtyScope: "有源医学影像设备、呼吸麻醉设备、心脏电生理及有源植入物注册检验",
    qualificationNote: "归口多个医用电器分技委秘书处",
  },
  {
    id: "test-04",
    seq: "21",
    name: "广东省医疗器械质量监督检验所",
    hostUnit: "广东省药监局所属检验所",
    categoryLabel: "省级权威器检院",
    province: "广东",
    specialtyScope: "医用超声、监护生命支持、血液净化体外循环及生物相容性评价（GB/T 16886）",
    qualificationNote: "深圳/广州双院区 CMA 资质覆盖",
  },
  {
    id: "test-05",
    seq: "21",
    name: "山东省医疗器械和药品包装检验研究院",
    hostUnit: "山东省药监局所属检验院",
    categoryLabel: "省级权威器检院",
    province: "山东",
    specialtyScope: "无源高分子输注器具、生物医用材料毒理与洁净生物学评价、医用增材制造产品",
    qualificationNote: "无源耗材与生物学评价特色院所",
  },
  {
    id: "test-06",
    seq: "22",
    name: "北京协和医院医疗器械临床试验机构",
    hostUnit: "中国医学科学院北京协和医院",
    categoryLabel: "药监临床试验备案医院",
    province: "北京",
    specialtyScope: "备案医学影像、检验医学（IVD）、重症医学、妇产及罕见病器械等 38 个临床专业",
    qualificationNote: "械临机构备字 · 有效备案在册",
  },
  {
    id: "test-07",
    seq: "22",
    name: "上海交通大学医学院附属瑞金医院临床试验机构",
    hostUnit: "上海交通大学医学院附属瑞金医院",
    categoryLabel: "药监临床试验备案医院",
    province: "上海",
    specialtyScope: "备案质子放疗装备、内分泌代谢传感、微创外科机器人与血液学诊断等 34 个专业",
    qualificationNote: "械临机构备字 · 有效备案在册",
  },
  {
    id: "test-08",
    seq: "22",
    name: "四川大学华西医院医疗器械临床试验机构",
    hostUnit: "四川大学华西医院",
    categoryLabel: "药监临床试验备案医院",
    province: "四川",
    specialtyScope: "备案心脏大血管外科、呼吸危重症、麻醉监护及人工智能辅助诊断等 41 个专业",
    qualificationNote: "械临机构备字 · 有效备案在册",
  },
];
