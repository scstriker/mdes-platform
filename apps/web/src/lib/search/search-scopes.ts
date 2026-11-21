export type PublicSearchScope =
  | "/search"
  | "/products"
  | "/enterprises"
  | "/trade"
  | "/reports"
  | "/system";

export type PublicScopeParam =
  | "all"
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
  /** 可选：指向所属专题栏目名录区的二级跳转链接 */
  subpageHref?: string;
};

export const PUBLIC_SCOPES: readonly ScopeMeta<PublicSearchScope>[] = [
  {
    scope: "/search",
    label: "全站跨库检索",
    shortLabel: "全站跨库",
    placeholder: "检索器械名称、注册证号、企业与临床机构、HS税号、政策标准或指标…",
    hotQueries: [
      { label: "磁共振", query: "磁共振" },
      { label: "手术机器人", query: "手术机器人" },
      { label: "迈瑞医疗", query: "迈瑞医疗" },
      { label: "CT 球管", query: "CT 球管" },
      { label: "设备更新", query: "设备更新" },
      { label: "GB 9706.1", query: "GB 9706.1" },
    ],
  },
  {
    scope: "/products",
    label: "注册与产品",
    shortLabel: "注册与产品",
    placeholder: "检索器械名称、注册证号、UDI条码、规格型号或注册人…",
    hotQueries: [
      { label: "5.0T 磁共振", query: "磁共振" },
      { label: "手术系统", query: "手术" },
      { label: "人工心脏", query: "人工心脏" },
      { label: "联影医疗", query: "联影" },
      { label: "基因突变伴随诊断", query: "伴随诊断" },
    ],
  },
  {
    scope: "/enterprises",
    label: "企业与机构",
    shortLabel: "企业与机构",
    placeholder: "检索重点企业、证券代码、创新中心、检验院或临床试验医院…",
    hotQueries: [
      { label: "迈瑞医疗", query: "迈瑞" },
      { label: "联影医疗", query: "联影" },
      { label: "单项冠军", query: "单项冠军" },
      { label: "国家临床医学研究中心", query: "临床医学研究中心" },
      { label: "医疗器械检验院", query: "检验" },
    ],
  },
  {
    scope: "/trade",
    label: "进出口贸易",
    shortLabel: "进出口贸易",
    placeholder: "检索医疗器械五大品类、海关 HS 税号（如 9022.3000）或贸易伙伴国…",
    hotQueries: [
      { label: "CT 球管 9022.3000", query: "9022.3000" },
      { label: "3.0T 磁共振", query: "9018.1310" },
      { label: "诊断与治疗设备", query: "诊断与治疗" },
      { label: "内窥镜核心组件", query: "内窥镜" },
      { label: "德国", query: "德国" },
    ],
  },
  {
    scope: "/reports",
    label: "政策与报告",
    shortLabel: "政策与报告",
    placeholder: "检索智库监测报告、政策发文字号、审查指导原则或 GB/YY 标准号…",
    hotQueries: [
      { label: "季度运行监测报告", query: "运行监测报告" },
      { label: "设备更新改造", query: "设备更新" },
      { label: "人工智能指导原则", query: "人工智能" },
      { label: "GB 9706.1", query: "GB 9706.1" },
      { label: "手术机器人标准", query: "手术机器人" },
    ],
  },
  {
    scope: "/system",
    label: "指标目录",
    shortLabel: "指标目录",
    placeholder: "检索三级指标序号、指标名称、数据来源或典型研判问题…",
    hotQueries: [
      { label: "01 注册与备案明细", query: "注册与备案" },
      { label: "02 创新医疗器械", query: "创新医疗器械" },
      { label: "13 上市企业", query: "上市企业" },
      { label: "24 审查指导原则", query: "指导原则" },
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
  "/products": "products",
  "/enterprises": "enterprises",
  "/trade": "trade",
  "/reports": "reports",
  "/system": "system",
};

const PARAM_TO_SCOPE: Record<string, PublicSearchScope> = {
  all: "/search",
  products: "/products",
  enterprises: "/enterprises",
  trade: "/trade",
  reports: "/reports",
  system: "/system",
  "/search": "/search",
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
