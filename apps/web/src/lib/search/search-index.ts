import { SYSTEM_INDICATORS } from "@/content/system-v3";
import { MAPPERS } from "@/lib/import-mappers";
import { PRODUCT_EXPLORER_ROWS } from "@/pages/products/data";
import {
  ENTERPRISE_POOL_ROWS,
  RD_CLINICAL_PLATFORMS,
  TESTING_GCP_INSTITUTIONS,
} from "@/pages/enterprises/data";
import {
  HIGH_CONCENTRATION_HS,
  TRADE_CATEGORIES,
  TRADE_PARTNER_ROWS,
} from "@/pages/trade/data";
import {
  ANNUAL_REPORTS_ROWS,
  BRIEFING_LEDGER,
  GUIDELINE_ROWS,
  POLICY_CLAUSE_ROWS,
  STANDARD_CATALOG_ROWS,
} from "@/pages/reports/data";

export type PublicSearchScope =
  | "/search"
  | "/products"
  | "/enterprises"
  | "/trade"
  | "/reports"
  | "/system";

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

export type SearchSuggestionItem = {
  id: string;
  scope: PublicSearchScope | AdminSearchScope;
  scopeLabel: string;
  badge: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
};

export const PUBLIC_SCOPES: readonly ScopeMeta<PublicSearchScope>[] = [
  {
    scope: "/search",
    label: "全站跨库检索",
    shortLabel: "全站跨库",
    placeholder: "检索器械名称、注册证号、企业与临床机构、HS税号、政策报告或指标…",
    hotQueries: [
      { label: "手术机器人", query: "手术机器人" },
      { label: "磁共振", query: "磁共振" },
      { label: "迈瑞医疗", query: "迈瑞医疗" },
      { label: "CT 球管", query: "CT 球管" },
      { label: "设备更新", query: "设备更新" },
      { label: "首次注册", query: "首次注册" },
    ],
  },
  {
    scope: "/products",
    label: "注册与产品",
    shortLabel: "注册与产品",
    placeholder: "在本栏检索器械名称、注册证号、UDI条码、规格型号或注册人…",
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
    placeholder: "在本栏检索重点企业、证券代码、创新中心、检验院或临床试验医院…",
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
    placeholder: "在本栏检索医疗器械五大品类、海关 HS 税号（如 9022.3000）或贸易伙伴国…",
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
    placeholder: "在本栏检索智库监测报告、政策发文字号、审查指导原则或 GB/YY 标准号…",
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
    placeholder: "在本栏检索三级指标序号、指标名称、数据来源或典型研判问题…",
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
      { label: "已完成批次", query: "完成" },
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
    placeholder: "在本栏按工程指标编码（如 TRD-001）或关键词检索观测值…",
    hotQueries: [
      { label: "TRD-001 进口金额", query: "TRD-001" },
      { label: "TRD-002 出口金额", query: "TRD-002" },
      { label: "TRD-005 贸易伙伴", query: "TRD-005" },
    ],
  },
];

export function resolveDefaultPublicScope(pathname: string): PublicSearchScope {
  if (pathname.startsWith("/products")) return "/products";
  if (pathname.startsWith("/enterprises")) return "/enterprises";
  if (pathname.startsWith("/trade")) return "/trade";
  if (pathname.startsWith("/reports")) return "/reports";
  if (pathname.startsWith("/system")) return "/system";
  return "/search";
}

export function resolveDefaultAdminScope(pathname: string): AdminSearchScope {
  if (pathname.startsWith("/admin/import")) return "/admin/import";
  if (pathname.startsWith("/admin/batches")) return "/admin/batches";
  if (pathname.startsWith("/admin/indicators")) return "/admin/indicators";
  if (pathname.startsWith("/admin/observations")) return "/admin/observations";
  return "/admin";
}

function cleanLabel(label: string) {
  return label.replace(/\s*\(\d+(?:[–-]\d+)?\)\s*/g, "").trim();
}

export const PUBLIC_SEARCH_ITEMS: readonly SearchSuggestionItem[] = [
  // 1. 注册与产品
  ...PRODUCT_EXPLORER_ROWS.map(
    (r): SearchSuggestionItem => ({
      id: `prd-${r.id}`,
      scope: "/products",
      scopeLabel: "注册与产品",
      badge: cleanLabel(r.channelLabel),
      title: r.productName,
      subtitle: `${r.registrant} · ${r.originRegion} · ${r.certOrCode}`,
      href: `/products?q=${encodeURIComponent(r.productName)}`,
      keywords: `${r.productName} ${r.certOrCode} ${r.specAndScope} ${r.registrant} ${r.category} ${r.origin} ${r.originRegion}`.toLowerCase(),
    }),
  ),
  // 2. 企业与机构（重点企业 + 国家级创新临床平台 + 检验与临床备案医院）
  ...ENTERPRISE_POOL_ROWS.map(
    (e): SearchSuggestionItem => ({
      id: `ent-${e.id}`,
      scope: "/enterprises",
      scopeLabel: "企业与机构",
      badge: e.boardLabel,
      title: `${e.shortName}（${e.entityCode}）`,
      subtitle: `${e.province} · ${e.revenueAndRd} · ${e.coreBusiness}`,
      href: `/enterprises?q=${encodeURIComponent(e.shortName)}`,
      keywords: `${e.shortName} ${e.entityCode} ${e.coreBusiness} ${e.boardLabel} ${e.province}`.toLowerCase(),
    }),
  ),
  ...RD_CLINICAL_PLATFORMS.map(
    (inst): SearchSuggestionItem => ({
      id: `inst-${inst.id}`,
      scope: "/enterprises",
      scopeLabel: "企业与机构",
      badge: inst.categoryLabel,
      title: inst.name,
      subtitle: `${inst.province} · 依托：${inst.hostUnit}`,
      href: `/enterprises?q=${encodeURIComponent(inst.name)}`,
      keywords: `${inst.name} ${inst.hostUnit} ${inst.categoryLabel} ${inst.province} ${inst.specialtyScope}`.toLowerCase(),
    }),
  ),
  ...TESTING_GCP_INSTITUTIONS.map(
    (inst): SearchSuggestionItem => ({
      id: `test-${inst.id}`,
      scope: "/enterprises",
      scopeLabel: "企业与机构",
      badge: inst.categoryLabel,
      title: inst.name,
      subtitle: `${inst.province} · ${inst.specialtyScope}`,
      href: `/enterprises?q=${encodeURIComponent(inst.name)}`,
      keywords: `${inst.name} ${inst.hostUnit} ${inst.categoryLabel} ${inst.province} ${inst.specialtyScope}`.toLowerCase(),
    }),
  ),
  // 3. 进出口贸易（五大品类 + 高集中度核心税号 + 主要贸易伙伴）
  ...TRADE_CATEGORIES.map(
    (c): SearchSuggestionItem => ({
      id: `trd-cat-${c.id}`,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: "海关大类",
      title: c.category,
      subtitle: `HS ${c.hsRange} · 出口 ${c.exportUsd} 亿美元 / 进口 ${c.importUsd} 亿美元（CR3 ${c.importCr3}）`,
      href: `/trade?q=${encodeURIComponent(c.category)}`,
      keywords: `${c.category} ${c.hsRange} ${c.topOrigins}`.toLowerCase(),
    }),
  ),
  ...HIGH_CONCENTRATION_HS.map(
    (h): SearchSuggestionItem => ({
      id: `trd-hs-${h.hsCode}`,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: `进口 CR3 ${h.cr3}`,
      title: `${h.hsCode} ${h.itemName}`,
      subtitle: `前三大来源国：${h.topOrigins}`,
      href: `/trade?q=${encodeURIComponent(h.hsCode)}`,
      keywords: `${h.hsCode} ${h.itemName} ${h.topOrigins}`.toLowerCase(),
    }),
  ),
  ...TRADE_PARTNER_ROWS.map(
    (p): SearchSuggestionItem => ({
      id: `trd-partner-${p.iso}`,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: "贸易伙伴",
      title: `${p.country}（进口占 ${p.importShare}% · 出口占 ${p.exportShare}%）`,
      subtitle: p.focusCategory,
      href: `/trade?q=${encodeURIComponent(p.country)}`,
      keywords: `${p.country} ${p.iso} ${p.focusCategory}`.toLowerCase(),
    }),
  ),
  // 4. 政策与报告（季度专报 + 政策条款 + 审查指导原则 + 现行标准 + 监管年报）
  ...BRIEFING_LEDGER.map(
    (b): SearchSuggestionItem => ({
      id: `rep-brf-${b.id}`,
      scope: "/reports",
      scopeLabel: "政策与报告",
      badge: b.series,
      title: b.title,
      subtitle: `${b.date} · ${b.summary}`,
      href: `/reports?tab=briefings&q=${encodeURIComponent(b.title.slice(0, 10))}`,
      keywords: `${b.title} ${b.series} ${b.summary} ${b.keyFindings.join(" ")}`.toLowerCase(),
    }),
  ),
  ...POLICY_CLAUSE_ROWS.map(
    (p): SearchSuggestionItem => ({
      id: `rep-pol-${p.id}`,
      scope: "/reports",
      scopeLabel: "政策与报告",
      badge: p.level,
      title: p.title,
      subtitle: `${p.docNo} · ${p.agency} · ${p.topic}`,
      href: `/reports?tab=policies&q=${encodeURIComponent(p.topic)}`,
      keywords: `${p.title} ${p.docNo} ${p.agency} ${p.topic} ${p.clauseSummary}`.toLowerCase(),
    }),
  ),
  ...GUIDELINE_ROWS.map(
    (g): SearchSuggestionItem => ({
      id: `rep-gd-${g.id}`,
      scope: "/reports",
      scopeLabel: "政策与报告",
      badge: "审查指导原则",
      title: g.title,
      subtitle: `${g.noticeNo} · ${g.category}（分类码 ${g.classCode}）`,
      href: `/reports?tab=guidelines&q=${encodeURIComponent(g.title.slice(0, 8))}`,
      keywords: `${g.title} ${g.noticeNo} ${g.category} ${g.classCode} ${g.reviewPoints}`.toLowerCase(),
    }),
  ),
  ...STANDARD_CATALOG_ROWS.map(
    (s): SearchSuggestionItem => ({
      id: `rep-std-${s.stdNo}`,
      scope: "/reports",
      scopeLabel: "政策与报告",
      badge: s.nature,
      title: `${s.stdNo} ${s.stdName}`,
      subtitle: `${s.scope} · ${s.status}`,
      href: `/reports?tab=standards&q=${encodeURIComponent(s.stdNo)}`,
      keywords: `${s.stdNo} ${s.stdName} ${s.scope} ${s.keyClause}`.toLowerCase(),
    }),
  ),
  ...ANNUAL_REPORTS_ROWS.map(
    (a): SearchSuggestionItem => ({
      id: `rep-ann-${a.seq}`,
      scope: "/reports",
      scopeLabel: "政策与报告",
      badge: "官方统计年报",
      title: a.reportTitle,
      subtitle: `${a.publisher} · ${a.latestIssue}`,
      href: `/reports?tab=standards&q=${encodeURIComponent(a.publisher)}`,
      keywords: `${a.reportTitle} ${a.publisher} ${a.reconciliationScope}`.toLowerCase(),
    }),
  ),
  // 5. 指标目录（V3.0 33 项）
  ...SYSTEM_INDICATORS.map(
    (ind): SearchSuggestionItem => ({
      id: `sys-${ind.seq}`,
      scope: "/system",
      scopeLabel: "指标目录",
      badge: `指标 ${ind.seq}`,
      title: `${ind.seq} ${ind.name}`,
      subtitle: `${ind.level1.replace(/^[一二三四五六]、/, "")} · 来源：${ind.source} · 频度：${ind.frequency}`,
      href: `/system/${ind.seq}`,
      keywords: `${ind.seq} ${ind.name} ${ind.level1} ${ind.level2} ${ind.source} ${ind.recordWhat} ${ind.canAnswer.join(" ")}`.toLowerCase(),
    }),
  ),
];

export const ADMIN_SEARCH_ITEMS: readonly SearchSuggestionItem[] = [
  ...MAPPERS.map(
    (m): SearchSuggestionItem => ({
      id: `adm-map-${m.seq}`,
      scope: "/admin",
      scopeLabel: "入库概况",
      badge: m.channel === "table" ? "表格通道" : "原件+JSON",
      title: `${m.seq} ${m.name}`,
      subtitle: `前往新建导入通道或核查入库状态`,
      href: `/admin/import?seq=${m.seq}`,
      keywords: `${m.seq} ${m.name} ${m.indicatorId ?? ""} ${m.channel === "table" ? "表格 csv" : "文件 解析 json"}`.toLowerCase(),
    }),
  ),
  ...SYSTEM_INDICATORS.flatMap((ind) =>
    ind.v12Codes.map(
      (code): SearchSuggestionItem => ({
        id: `adm-v12-${ind.seq}-${code}`,
        scope: "/admin/indicators",
        scopeLabel: "工程指标库",
        badge: "V12 工程映射",
        title: `${code}（映射自 ${ind.seq} ${ind.name}）`,
        subtitle: `数据来源：${ind.source}`,
        href: `/admin/indicators/${code}`,
        keywords: `${code} ${ind.seq} ${ind.name} ${ind.source}`.toLowerCase(),
      }),
    ),
  ),
];

export function queryPublicSuggestions(rawQuery: string, activeScope: PublicSearchScope) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return {
      scopedMatches: [] as SearchSuggestionItem[],
      indicatorMatches: [] as SearchSuggestionItem[],
      globalTotal: 0,
    };
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const matchItem = (item: SearchSuggestionItem) => tokens.every((tk) => item.keywords.includes(tk));

  const allMatches = PUBLIC_SEARCH_ITEMS.filter(matchItem);
  const scopedPool =
    activeScope === "/search"
      ? allMatches.filter((i) => i.scope !== "/system")
      : allMatches.filter((i) => i.scope === activeScope);
  const indicatorPool =
    activeScope === "/system"
      ? []
      : allMatches.filter((i) => i.scope === "/system");

  return {
    scopedMatches: scopedPool.slice(0, 6),
    indicatorMatches: indicatorPool.slice(0, 3),
    globalTotal: allMatches.length,
  };
}

export function queryAllPublicGrouped(rawQuery: string) {
  const q = rawQuery.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const matchItem = (item: SearchSuggestionItem) =>
    tokens.length === 0 ? true : tokens.every((tk) => item.keywords.includes(tk));

  const matched = PUBLIC_SEARCH_ITEMS.filter(matchItem);
  const groups: {
    scope: Exclude<PublicSearchScope, "/search">;
    label: string;
    items: SearchSuggestionItem[];
  }[] = [
    { scope: "/products", label: "注册与产品", items: matched.filter((m) => m.scope === "/products") },
    { scope: "/enterprises", label: "企业与机构", items: matched.filter((m) => m.scope === "/enterprises") },
    { scope: "/trade", label: "进出口贸易", items: matched.filter((m) => m.scope === "/trade") },
    { scope: "/reports", label: "政策与报告", items: matched.filter((m) => m.scope === "/reports") },
    { scope: "/system", label: "指标目录（方法论与口径）", items: matched.filter((m) => m.scope === "/system") },
  ];

  return {
    total: matched.length,
    groups: groups.filter((g) => g.items.length > 0),
  };
}
