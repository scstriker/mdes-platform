export type PublicSearchScope =
  | "/search"
  | "/statistics"
  | "/markets"
  | "/products"
  | "/enterprises"
  | "/trade"
  | "/reports"
  | "/system";

export type PublicScopeParam =
  | "all"
  | "statistics"
  | "markets"
  | "products"
  | "enterprises"
  | "trade"
  | "reports"
  | "system"
  | "observations";

export type AdminSearchScope =
  | "/admin"
  | "/admin/import"
  | "/admin/batches"
  | "/admin/indicators"
  | "/admin/observations";

export type ScopeMeta<S extends string = string> = {
  scope: S;
  label: string;
  shortLabel: string;
  placeholder: string;
  hotQueries: readonly { label: string; query: string; href?: string }[];
};

export type SearchDetailField = {
  label: string;
  value: string;
};

export type SearchSuggestionItem = {
  id: string;
  scope: PublicSearchScope | AdminSearchScope;
  scopeLabel: string;
  badge: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
  /** 供搜索结果页内联展开展示完整结构化档案字段 */
  fields?: readonly SearchDetailField[];
  /** 指向一等公民实体页、统计工作台或资料查询页的直达链接 */
  subpageHref?: string;
  /** 可选：命中废止或误写别名时的提示 */
  aliasNote?: string;
};

export const PUBLIC_SCOPES: readonly ScopeMeta<PublicSearchScope>[] = [
  {
    scope: "/search",
    label: "全站跨库检索",
    shortLabel: "全站跨库",
    placeholder: "检索统计图表、产品型号(uMR Jupiter)、注册证号、企业与检验院、HS税号或YY/GB标准…",
    hotQueries: [
      { label: "uMR Jupiter", query: "uMR Jupiter" },
      { label: "国械注准20223061141", query: "国械注准20223061141" },
      { label: "YY 9706.233-2021", query: "YY 9706.233-2021" },
      { label: "湖北省医疗器械质量监督检验研究院", query: "湖北省医疗器械质量监督检验研究院" },
      { label: "联影医疗", query: "联影医疗" },
      { label: "手术机器人", query: "手术机器人" },
    ],
  },
  {
    scope: "/statistics",
    label: "统计成果库",
    shortLabel: "统计成果库",
    placeholder: "检索已发布统计标题、核心读数、研发占比、进口规模或三类首次注册趋势…",
    hotQueries: [
      { label: "联影研发投入占比", query: "联影医疗研发投入" },
      { label: "磁共振整机与零件进口", query: "90181310" },
      { label: "三类首次注册趋势", query: "第三类医疗器械首次注册" },
      { label: "医用磁共振市场规模", query: "医用磁共振成像设备市场规模" },
    ],
  },
  {
    scope: "/markets",
    label: "市场与技术",
    shortLabel: "市场与技术",
    placeholder: "检索公立医院公开招采项目（如 WXZB(2024)-016）或核心技术路线…",
    hotQueries: [
      { label: "西安交大二附院 5T 采购", query: "WXZB(2024)-016" },
      { label: "5T 超高场磁共振技术", query: "超高场磁共振" },
    ],
  },
  {
    scope: "/products",
    label: "注册与产品",
    shortLabel: "注册与产品",
    placeholder: "检索产品型号（uMR Jupiter）、注册证号（国械注准20223061141）、受理号或 UDI…",
    hotQueries: [
      { label: "uMR Jupiter", query: "uMR Jupiter" },
      { label: "国械注准20223061141", query: "国械注准20223061141" },
      { label: "图迈 MT-1000", query: "MT-1000" },
      { label: "5.0T 磁共振", query: "磁共振" },
      { label: "手术系统", query: "手术" },
    ],
  },
  {
    scope: "/enterprises",
    label: "企业与机构",
    shortLabel: "企业与机构",
    placeholder: "检索重点企业、证券代码、检验检测研究院或临床试验医院…",
    hotQueries: [
      { label: "联影医疗", query: "联影" },
      { label: "迈瑞医疗", query: "迈瑞" },
      { label: "湖北省器检院", query: "湖北省医疗器械质量监督检验研究院" },
      { label: "北京协和医院", query: "协和医院" },
      { label: "国家高性能医疗器械创新中心", query: "国家高性能医疗器械创新中心" },
    ],
  },
  {
    scope: "/trade",
    label: "进出口贸易",
    shortLabel: "进出口贸易",
    placeholder: "检索医疗器械海关品类、HS 税号（如 90181310、9022.3000）或贸易伙伴国…",
    hotQueries: [
      { label: "CT 球管 9022.3000", query: "9022.3000" },
      { label: "磁共振 9018.1310", query: "9018.1310" },
      { label: "诊断与治疗设备", query: "诊断与治疗" },
      { label: "内窥镜核心组件", query: "内窥镜" },
      { label: "德国", query: "德国" },
    ],
  },
  {
    scope: "/reports",
    label: "政策与报告",
    shortLabel: "政策与报告",
    placeholder: "检索研究报告、产业政策文号、YY/GB 标准号或官方统计年报…",
    hotQueries: [
      { label: "YY 9706.233-2021", query: "YY 9706.233-2021" },
      { label: "国发〔2024〕7号", query: "国发〔2024〕7号" },
      { label: "2025 注册工作报告", query: "2025 年度医疗器械注册工作报告" },
      { label: "高端医学影像专题报告", query: "高端医学影像装备运行监测" },
      { label: "GB 9706.1-2020", query: "GB 9706.1-2020" },
    ],
  },
  {
    scope: "/system",
    label: "指标与口径",
    shortLabel: "指标与口径",
    placeholder: "检索三级指标序号、指标名称、数据来源或典型研判问题…",
    hotQueries: [
      { label: "01 注册与备案明细", query: "注册与备案" },
      { label: "02 创新医疗器械", query: "创新医疗器械" },
      { label: "15 上市企业研发投入", query: "研发投入" },
      { label: "37 国家与行业标准", query: "国家与行业标准" },
      { label: "38 进出口贸易", query: "进出口贸易" },
    ],
  },
];

export const ADMIN_SCOPES: readonly ScopeMeta<AdminSearchScope>[] = [
  {
    scope: "/admin",
    label: "入库台账概况",
    shortLabel: "入库概况",
    placeholder: "在本栏检索入库指标序号、名称、导入通道或更新状态…",
    hotQueries: [
      { label: "待更新指标", query: "待更新" },
      { label: "01 注册与备案", query: "注册与备案" },
      { label: "38 进出口贸易", query: "进出口" },
      { label: "原件 + 解析 JSON", query: "JSON" },
    ],
  },
  {
    scope: "/admin/import",
    label: "新建导入通道",
    shortLabel: "新建导入",
    placeholder: "在本栏检索待导入指标序号、名称或通道（表格 / 文件+解析）…",
    hotQueries: [
      { label: "38 进出口贸易", query: "38" },
      { label: "01 注册明细", query: "01" },
      { label: "表格导入", query: "表格" },
      { label: "文件 + 解析", query: "解析" },
    ],
  },
  {
    scope: "/admin/batches",
    label: "导入批次记录",
    shortLabel: "导入记录",
    placeholder: "在本栏检索导入源文件名、状态或批次记录…",
    hotQueries: [
      { label: "trd_sample.csv", query: "trd" },
      { label: "已完成批次", query: "已完成" },
    ],
  },
  {
    scope: "/admin/indicators",
    label: "工程指标库(99项)",
    shortLabel: "工程指标库",
    placeholder: "在本栏检索 V12 工程指标编码（如 TRD-001）、名称或所属簇…",
    hotQueries: [
      { label: "TRD-001", query: "TRD-001" },
      { label: "REG-", query: "REG-" },
      { label: "进口", query: "进口" },
      { label: "单项冠军", query: "单项冠军" },
    ],
  },
  {
    scope: "/admin/observations",
    label: "原始观测值核查",
    shortLabel: "观测值核查",
    placeholder: "在本栏按工程指标编码（如 TRD-001）、地域或关键词检索全库观测值…",
    hotQueries: [
      { label: "TRD-001 进口金额", query: "TRD-001" },
      { label: "TRD-002 出口金额", query: "TRD-002" },
      { label: "TRD-005 贸易伙伴", query: "TRD-005" },
    ],
  },
];

const SCOPE_TO_PARAM: Record<PublicSearchScope, Exclude<PublicScopeParam, "observations">> = {
  "/search": "all",
  "/statistics": "statistics",
  "/markets": "markets",
  "/products": "products",
  "/enterprises": "enterprises",
  "/trade": "trade",
  "/reports": "reports",
  "/system": "system",
};

const PARAM_TO_SCOPE: Record<string, PublicSearchScope> = {
  all: "/search",
  statistics: "/statistics",
  markets: "/markets",
  products: "/products",
  enterprises: "/enterprises",
  trade: "/trade",
  reports: "/reports",
  system: "/system",
  "/search": "/search",
  "/statistics": "/statistics",
  "/markets": "/markets",
  "/products": "/products",
  "/enterprises": "/enterprises",
  "/trade": "/trade",
  "/reports": "/reports",
  "/system": "/system",
};

export function scopeToParam(scope: PublicSearchScope): Exclude<PublicScopeParam, "observations"> {
  return SCOPE_TO_PARAM[scope] ?? "all";
}

export function paramToPublicScope(raw: string | null | undefined): PublicSearchScope {
  if (!raw) return "/search";
  return PARAM_TO_SCOPE[raw] ?? "/search";
}

/**
 * 统一构造独立搜索结果页 URL（/search?q=...&scope=...&item=...），
 * 确保前台所有搜索动作均进入无无关宏观图表干扰的专属检索结果页，而非跳入栏目概览子页。
 */
export function buildPublicSearchUrl(opts: {
  q?: string;
  scope?: PublicSearchScope | PublicScopeParam;
  item?: string;
}): string {
  const params = new URLSearchParams();
  const cleanQ = opts.q?.trim() ?? "";
  if (cleanQ) params.set("q", cleanQ);

  if (opts.scope) {
    const paramVal =
      opts.scope === "observations"
        ? "observations"
        : opts.scope.startsWith("/")
          ? scopeToParam(opts.scope as PublicSearchScope)
          : opts.scope;
    if (paramVal && paramVal !== "all") {
      params.set("scope", paramVal);
    }
  }

  if (opts.item) {
    params.set("item", opts.item);
  }

  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * 前台顶部全局搜索栏始终默认面向「全站跨库检索（/search）」；
 * 仅当处于 /search 且 URL 显式带有 ?scope=... 时回显所选子范围。
 */
export function resolveDefaultPublicScope(
  pathname: string,
  searchScopeParam?: string | null,
): PublicSearchScope {
  if (pathname === "/search" && searchScopeParam) {
    return paramToPublicScope(searchScopeParam);
  }
  return "/search";
}

export function resolveDefaultAdminScope(pathname: string): AdminSearchScope {
  if (pathname.startsWith("/admin/import")) return "/admin/import";
  if (pathname.startsWith("/admin/batches")) return "/admin/batches";
  if (pathname.startsWith("/admin/indicators")) return "/admin/indicators";
  if (pathname.startsWith("/admin/observations")) return "/admin/observations";
  return "/admin";
}
