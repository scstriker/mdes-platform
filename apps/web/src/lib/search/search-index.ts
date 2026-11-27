import {
  buildCatalogRecordHref,
  formatDims,
  geoLabel,
  matchesQuery,
  tokenizeQuery,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogRecord,
  type ImportBatch,
  type IndicatorListItem,
  type ObservationSearchHit,
  type Statistic,
  type TradeOverviewPublished,
  type TradeOverviewResponse,
  type UnifiedSearchHit,
} from "@mdes/shared";
import { DATA_FORM_LABEL, SYSTEM_INDICATORS } from "@/content/system-v3";
import { formatDateTime } from "@/lib/datetime";
import { MAPPERS } from "@/lib/import-mappers";
import { IMPORT_STATUS } from "@/lib/labels";
import { formatBalanceYi, formatSharePct, formatUsdToYi, formatYoyPct } from "@/lib/trade-format";
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
import {
  ADMIN_SCOPES,
  buildPublicSearchUrl,
  paramToPublicScope,
  PUBLIC_SCOPES,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
  scopeToParam,
  type AdminSearchScope,
  type PublicScopeParam,
  type PublicSearchScope,
  type ScopeMeta,
  type SearchDetailField,
  type SearchSuggestionItem,
} from "./search-scopes";

export {
  ADMIN_SCOPES,
  buildPublicSearchUrl,
  matchesQuery,
  paramToPublicScope,
  PUBLIC_SCOPES,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
  scopeToParam,
  tokenizeQuery,
  type AdminSearchScope,
  type PublicScopeParam,
  type PublicSearchScope,
  type ScopeMeta,
  type SearchDetailField,
  type SearchSuggestionItem,
};

function cleanLabel(label: string) {
  return label.replace(/\s*\(\d+(?:[–-]\d+)?\)\s*/g, "").trim();
}

const V12_TO_SYSTEM_SEQ = new Map<string, string>(
  SYSTEM_INDICATORS.flatMap((ind) => ind.v12Codes.map((code) => [code, ind.seq] as const)),
);

export function resolveV12SystemSeq(indicatorId: string): string | null {
  return V12_TO_SYSTEM_SEQ.get(indicatorId) ?? null;
}

export function resolveCatalogSearchScope(kind: CatalogRecord["kind"]): {
  scope: PublicSearchScope;
  scopeLabel: string;
  badgeFallback: string;
} {
  switch (kind) {
    case "model":
      return { scope: "/products", scopeLabel: "产品型号", badgeFallback: "产品型号" };
    case "registration":
      return { scope: "/products", scopeLabel: "注册与准入", badgeFallback: "注册与准入" };
    case "enterprise":
      return { scope: "/enterprises", scopeLabel: "企业研究档案", badgeFallback: "重点企业" };
    case "institution":
      return { scope: "/enterprises", scopeLabel: "机构名录", badgeFallback: "技术服务机构" };
    case "market_deal":
      return { scope: "/markets", scopeLabel: "市场与招采", badgeFallback: "公开招采" };
    case "technology":
      return { scope: "/markets", scopeLabel: "核心技术路线", badgeFallback: "技术路线" };
    case "policy":
      return { scope: "/reports", scopeLabel: "产业政策", badgeFallback: "产业政策" };
    case "standard":
      return { scope: "/reports", scopeLabel: "技术标准", badgeFallback: "技术标准" };
    case "source":
      return { scope: "/reports", scopeLabel: "官方来源", badgeFallback: "官方来源" };
    case "report":
      return { scope: "/reports", scopeLabel: "研究报告", badgeFallback: "研究报告" };
  }
}

export function resolveCatalogDirectHref(record: CatalogRecord): string {
  if (record.kind === "source") {
    return `/sources?id=${encodeURIComponent(record.id)}`;
  }
  if (record.kind === "technology") {
    return `/technologies/${encodeURIComponent(record.slug)}`;
  }
  if (record.kind === "registration" && record.subkind === "guideline") {
    return `/regulation/registrations?subkind=guideline&q=${encodeURIComponent(record.code ?? record.title.slice(0, 8))}`;
  }
  return buildCatalogRecordHref(record);
}

export function mapSeedStatisticToSuggestion(stat: Statistic): SearchSuggestionItem {
  const kpiText = stat.summary_kpi.headline_value.endsWith("%")
    ? stat.summary_kpi.headline_value
    : `${stat.summary_kpi.headline_value} ${stat.summary_kpi.unit}`;
  const directHref = `/statistics/${encodeURIComponent(stat.statistic_id)}`;
  const sourceOrg = stat.sources.map((s) => `${s.organization} ${s.document_title}`).join(" ");

  return {
    id: stat.statistic_id,
    scope: "/statistics",
    scopeLabel: "统计成果库",
    badge: `统计 v${stat.version}`,
    title: stat.title,
    subtitle: `${stat.summary_kpi.period}：${kpiText} · ${stat.subtitle}`,
    href: buildPublicSearchUrl({ q: stat.title.slice(0, 12), scope: "/statistics", item: stat.statistic_id }),
    subpageHref: directHref,
    fields: [
      { label: "统计编号与版本", value: `${stat.statistic_id}（v${stat.version}）` },
      { label: "核心读数", value: `${stat.summary_kpi.period} · ${kpiText}` },
      { label: "研判洞察", value: stat.insight },
      { label: "覆盖范围", value: `${stat.coverage.time_span} · ${stat.coverage.geographic_scope}` },
      { label: "权威来源", value: stat.sources.map((s) => `${s.organization}《${s.document_title}》`).join("；") },
    ],
    keywords: `${stat.statistic_id} ${stat.slug} ${stat.title} ${stat.subtitle} ${stat.insight} ${stat.topic_tags.join(" ")} ${stat.indicator_refs.v3_seqs.join(" ")} ${(stat.entity_refs.hs_codes ?? []).join(" ")} ${(stat.entity_refs.product_models ?? []).join(" ")} ${(stat.entity_refs.enterprises ?? []).join(" ")} ${sourceOrg}`.toLowerCase(),
  };
}

export function mapCatalogRecordToSuggestion(record: CatalogRecord): SearchSuggestionItem {
  const { scope, scopeLabel, badgeFallback } = resolveCatalogSearchScope(record.kind);
  const directHref = resolveCatalogDirectHref(record);
  const badge = record.subkind
    ? record.subkind === "innov"
      ? "创新注册证"
      : record.subkind === "reg"
        ? "常规注册证"
        : record.subkind === "priority"
          ? "优先审批"
          : record.subkind === "guideline"
            ? "审查指导原则"
            : record.subkind === "ashare"
              ? "A股上市"
              : record.subkind === "hk"
                ? "港股上市"
                : record.subkind
    : badgeFallback;

  const aliasKeywords = (record.legacy_aliases ?? []).join(" ");
  const summaryKeywords = record.summary_fields.map((f) => `${f.label} ${f.value}`).join(" ");
  const extraDetailKeywords = JSON.stringify(record.detail ?? {});

  return {
    id: record.id,
    scope,
    scopeLabel,
    badge,
    title: record.code && record.kind === "standard" && !record.title.startsWith(record.code)
      ? `${record.code} ${record.title}`
      : record.title,
    subtitle: record.subtitle,
    href: buildPublicSearchUrl({ q: record.code ?? record.title.slice(0, 12), scope, item: record.id }),
    subpageHref: directHref,
    fields: [
      ...(record.code ? [{ label: "规范编码 / 文号", value: record.code }] : []),
      ...record.summary_fields.map((f) => ({ label: f.label, value: f.value })),
      {
        label: "权威出处",
        value: `${record.source_title}${record.source_page ? `（${record.source_page}）` : ""}`,
      },
    ],
    keywords: `${record.id} ${record.slug} ${record.title} ${record.subtitle} ${record.code ?? ""} ${record.region ?? ""} ${record.period ?? ""} ${record.category ?? ""} ${record.subkind ?? ""} ${record.tags.join(" ")} ${aliasKeywords} ${summaryKeywords} ${extraDetailKeywords}`.toLowerCase(),
  };
}

export function mapUnifiedV2HitToSuggestion(hit: UnifiedSearchHit, rawQuery: string): SearchSuggestionItem {
  const mappedScope =
    hit.group === "statistics"
      ? { scope: "/statistics" as PublicSearchScope, scopeLabel: "统计成果库" }
      : resolveCatalogSearchScope(hit.group);
  const isStat = hit.group === "statistics";

  const resolvedHref =
    hit.group === "source" && hit.id
      ? `/sources?id=${encodeURIComponent(hit.id)}`
      : hit.href;

  return {
    id: hit.id,
    scope: mappedScope.scope,
    scopeLabel: mappedScope.scopeLabel,
    badge: hit.source_label || (isStat ? "统计成果" : mappedScope.scopeLabel),
    title: hit.title,
    subtitle: hit.subtitle,
    href: buildPublicSearchUrl({ q: rawQuery || hit.title, scope: mappedScope.scope, item: hit.id }),
    subpageHref: resolvedHref,
    aliasNote: hit.alias_note,
    fields: [
      ...(hit.code ? [{ label: "编号 / 标识", value: hit.code }] : []),
      ...(hit.region ? [{ label: "地域范围", value: hit.region }] : []),
      ...(hit.period ? [{ label: "统计期间", value: hit.period }] : []),
      { label: "来源归属", value: hit.source_label },
    ],
    keywords: `${hit.id} ${hit.title} ${hit.subtitle} ${hit.code ?? ""} ${hit.region ?? ""} ${hit.period ?? ""}`.toLowerCase(),
  };
}

export function mapObservationHitToSuggestion(
  hit: ObservationSearchHit,
  rawQuery: string,
): SearchSuggestionItem {
  const sysSeq = resolveV12SystemSeq(hit.indicator_id);
  const valStr =
    hit.value_num !== null
      ? `${hit.value_num.toLocaleString("zh-CN")}${hit.unit ? ` ${hit.unit}` : ""}`
      : (hit.value_text ?? "—");
  const dimsText = formatDims(hit.dims);
  const dimsPart = dimsText !== "—" ? ` · ${dimsText}` : "";
  const id = `live-obs-${hit.id}`;
  return {
    id,
    scope: "/system",
    scopeLabel: "实时入库观测",
    badge: `实时库 · ${hit.indicator_id}`,
    title: `${hit.indicator_name}（${hit.period} · ${geoLabel(hit.geo)}：${valStr}）`,
    subtitle: `指标编码 ${hit.indicator_id}${dimsPart}`,
    href: buildPublicSearchUrl({ q: rawQuery, scope: "observations", item: id }),
    subpageHref: sysSeq
      ? `/system/${sysSeq}`
      : `/admin/observations?indicator_id=${encodeURIComponent(hit.indicator_id)}&q=${encodeURIComponent(rawQuery.trim())}`,
    fields: [
      { label: "工程指标编码", value: `${hit.indicator_id} ${hit.indicator_name}` },
      { label: "统计期间", value: hit.period },
      { label: "地域范围", value: `${geoLabel(hit.geo)}（${hit.geo}）` },
      { label: "观测数值/文本", value: valStr },
      { label: "切片维度", value: dimsText },
      { label: "事务批次", value: hit.batch_id ? hit.batch_id.slice(0, 8) : "—" },
    ],
    keywords: `${hit.indicator_id} ${hit.indicator_name} ${hit.period} ${geoLabel(hit.geo)} ${dimsText} ${hit.value_text ?? ""}`.toLowerCase(),
  };
}

const V2_SEED_ID_SET = new Set<string>([
  ...V2_SEED_STATISTICS.map((s) => s.statistic_id),
  ...V2_SEED_CATALOG_RECORDS.map((r) => r.id),
]);

const V2_SEED_CODES = new Set<string>(
  V2_SEED_CATALOG_RECORDS.flatMap((r) => [
    ...(r.code ? [r.code.toLowerCase()] : []),
    ...(r.legacy_aliases ?? []).map((a) => a.toLowerCase()),
  ]),
);

export const PUBLIC_SEARCH_ITEMS: readonly SearchSuggestionItem[] = [
  // 0. V2 一等公民标准统计成果与权威目录实体（优先命中并直达各拆分详情/核验页）
  ...V2_SEED_STATISTICS.map(mapSeedStatisticToSuggestion),
  ...V2_SEED_CATALOG_RECORDS.map(mapCatalogRecordToSuggestion),

  // 1. 注册与产品补充代表名录
  ...PRODUCT_EXPLORER_ROWS.filter((r) => !V2_SEED_CODES.has(r.certOrCode.toLowerCase())).map(
    (r): SearchSuggestionItem => {
      const id = `prd-${r.id}`;
      const isRegCert = r.channel === "reg" || r.channel === "innov" || r.channel === "priority";
      return {
        id,
        scope: "/products",
        scopeLabel: isRegCert ? "注册与准入" : "注册与产品",
        badge: cleanLabel(r.channelLabel),
        title: r.productName,
        subtitle: `${r.registrant} · ${r.originRegion} · ${r.certOrCode}`,
        href: buildPublicSearchUrl({ q: r.productName, scope: "/products", item: id }),
        subpageHref: isRegCert
          ? `/regulation/registrations?q=${encodeURIComponent(r.certOrCode)}`
          : `/products?q=${encodeURIComponent(r.productName)}`,
        fields: [
          { label: "编号 / 注册证号", value: r.certOrCode },
          { label: "准入通道", value: r.channelLabel },
          { label: "器械品类赛道", value: r.category },
          { label: "注册人 / 备案人", value: r.registrant },
          { label: "来源与产地", value: r.originRegion },
          { label: "批准 / 公示日期", value: r.approvalDate },
          { label: "规格型号与适用范围", value: r.specAndScope },
        ],
        keywords: `${r.certOrCode} ${r.productName} ${r.specAndScope} ${r.registrant} ${r.category} ${r.origin} ${r.originRegion} ${r.channelLabel}`.toLowerCase(),
      };
    },
  ),

  // 2. 企业与机构补充名录
  ...ENTERPRISE_POOL_ROWS.filter((e) => !V2_SEED_CODES.has(e.entityCode.toLowerCase())).map(
    (e): SearchSuggestionItem => {
      const id = `ent-${e.id}`;
      return {
        id,
        scope: "/enterprises",
        scopeLabel: "企业与机构",
        badge: e.boardLabel,
        title: `${e.shortName}（${e.entityCode}）`,
        subtitle: `${e.province} · ${e.revenueAndRd} · ${e.coreBusiness}`,
        href: buildPublicSearchUrl({ q: e.shortName, scope: "/enterprises", item: id }),
        subpageHref: `/enterprises?q=${encodeURIComponent(e.shortName)}`,
        fields: [
          { label: "证券 / 主体代码", value: e.entityCode },
          { label: "资质与板块", value: e.boardLabel },
          { label: "注册省市", value: e.province },
          { label: "批次与上市形态", value: e.statusBatch },
          { label: "器械营收与研发强度", value: e.revenueAndRd },
          { label: "国际化与市场注记", value: e.overseasNote },
          { label: "核心装备产线", value: e.coreBusiness },
        ],
        keywords: `${e.shortName} ${e.entityCode} ${e.coreBusiness} ${e.boardLabel} ${e.province} ${e.statusBatch} ${e.revenueAndRd} ${e.overseasNote}`.toLowerCase(),
      };
    },
  ),
  ...RD_CLINICAL_PLATFORMS.filter(
    (inst) => !V2_SEED_CATALOG_RECORDS.some((r) => r.kind === "institution" && r.title === inst.name),
  ).map((inst): SearchSuggestionItem => {
    const id = `inst-${inst.id}`;
    return {
      id,
      scope: "/enterprises",
      scopeLabel: "机构名录",
      badge: inst.categoryLabel,
      title: inst.name,
      subtitle: `${inst.province} · 依托：${inst.hostUnit}`,
      href: buildPublicSearchUrl({ q: inst.name, scope: "/enterprises", item: id }),
      subpageHref: `/institutions?q=${encodeURIComponent(inst.name)}`,
      fields: [
        { label: "平台类别", value: inst.categoryLabel },
        { label: "所在省市", value: inst.province },
        { label: "依托建设单位", value: inst.hostUnit },
        { label: "批复与资质说明", value: inst.qualificationNote },
        { label: "专业攻关领域", value: inst.specialtyScope },
      ],
      keywords: `${inst.name} ${inst.hostUnit} ${inst.categoryLabel} ${inst.province} ${inst.specialtyScope} ${inst.qualificationNote}`.toLowerCase(),
    };
  }),
  ...TESTING_GCP_INSTITUTIONS.filter(
    (inst) => !V2_SEED_CATALOG_RECORDS.some((r) => r.kind === "institution" && r.title === inst.name),
  ).map((inst): SearchSuggestionItem => {
    const id = `test-${inst.id}`;
    return {
      id,
      scope: "/enterprises",
      scopeLabel: "机构名录",
      badge: inst.categoryLabel,
      title: inst.name,
      subtitle: `${inst.province} · ${inst.specialtyScope}`,
      href: buildPublicSearchUrl({ q: inst.name, scope: "/enterprises", item: id }),
      subpageHref: `/institutions?q=${encodeURIComponent(inst.name)}`,
      fields: [
        { label: "机构类别", value: inst.categoryLabel },
        { label: "所在省市", value: inst.province },
        { label: "主管 / 依托单位", value: inst.hostUnit },
        { label: "资质备案号与能力", value: inst.qualificationNote },
        { label: "承检与临床专业范围", value: inst.specialtyScope },
      ],
      keywords: `${inst.name} ${inst.hostUnit} ${inst.categoryLabel} ${inst.province} ${inst.specialtyScope} ${inst.qualificationNote}`.toLowerCase(),
    };
  }),

  // 3. 进出口贸易（五大品类 + 高集中度核心税号 + 主要贸易伙伴）
  ...TRADE_CATEGORIES.map((c): SearchSuggestionItem => {
    const id = `trd-cat-${c.id}`;
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: "海关大类",
      title: c.category,
      subtitle: `HS ${c.hsRange} · 出口 ${c.exportUsd} 亿美元 / 进口 ${c.importUsd} 亿美元（CR3 ${c.importCr3}）`,
      href: buildPublicSearchUrl({ q: c.category, scope: "/trade", item: id }),
      subpageHref: `/trade?q=${encodeURIComponent(c.category)}#trade-directory-heading`,
      fields: [
        { label: "海关 HS 编码范围", value: c.hsRange },
        { label: "出口额（2026Q1-Q3）", value: `${c.exportUsd.toFixed(1)} 亿美元（同比 ${c.yoy}）` },
        { label: "进口额（2026Q1-Q3）", value: `${c.importUsd.toFixed(1)} 亿美元` },
        { label: "贸易顺逆差", value: `${c.surplusUsd >= 0 ? "+" : ""}${c.surplusUsd.toFixed(1)} 亿美元` },
        { label: "进口来源国集中度 CR3", value: c.importCr3 },
        { label: "前三位原产国", value: c.topOrigins },
      ],
      keywords: `${c.category} ${c.hsRange} ${c.topOrigins} ${c.importCr3}`.toLowerCase(),
    };
  }),
  ...HIGH_CONCENTRATION_HS.map((h): SearchSuggestionItem => {
    const id = `trd-hs-${h.hsCode}`;
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: `进口 CR3 ${h.cr3}`,
      title: `${h.hsCode} ${h.itemName}`,
      subtitle: `前三大来源国：${h.topOrigins}`,
      href: buildPublicSearchUrl({ q: h.hsCode, scope: "/trade", item: id }),
      subpageHref: `/trade?tab=hs&q=${encodeURIComponent(h.hsCode)}#trade-directory-heading`,
      fields: [
        { label: "8 位海关 HS 税号", value: h.hsCode },
        { label: "归属海关品类", value: h.category },
        { label: "进口规模（2026Q1-Q3）", value: `${h.importUsd.toFixed(1)} 亿美元` },
        { label: "进口来源集中度 CR3", value: h.cr3 },
        { label: "前三大进口来源国", value: h.topOrigins },
        { label: "供应链结构说明", value: h.supplyNote },
      ],
      keywords: `${h.hsCode} ${h.hsCode.replace(/\./g, "")} ${h.itemName} ${h.category} ${h.topOrigins} ${h.supplyNote} ${h.cr3}`.toLowerCase(),
    };
  }),
  ...TRADE_PARTNER_ROWS.map((p): SearchSuggestionItem => {
    const id = `trd-partner-${p.iso}`;
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: "贸易伙伴",
      title: `${p.country}（进口占 ${p.importShare}% · 出口占 ${p.exportShare}%）`,
      subtitle: p.focusCategory,
      href: buildPublicSearchUrl({ q: p.country, scope: "/trade", item: id }),
      subpageHref: `/trade?tab=partners&q=${encodeURIComponent(p.country)}#trade-directory-heading`,
      fields: [
        { label: "国家 / 地区代码", value: `${p.country}（${p.iso}）` },
        { label: "我国自该国进口额", value: `${p.importUsd.toFixed(1)} 亿美元（占进口 ${p.importShare.toFixed(1)}%）` },
        { label: "我国对该国出口额", value: `${p.exportUsd.toFixed(1)} 亿美元（占出口 ${p.exportShare.toFixed(1)}%）` },
        { label: "双边核心贸易品类", value: p.focusCategory },
      ],
      keywords: `${p.country} ${p.iso} ${p.focusCategory}`.toLowerCase(),
    };
  }),

  // 4. 政策、指导原则、标准与报告补充条目（剔除已被 V2_SEED_CATALOG_RECORDS 规范纠偏的旧静态行）
  ...BRIEFING_LEDGER.filter((b) => !V2_SEED_ID_SET.has(`rep-brf-${b.id}`) && !V2_SEED_CODES.has(`rep-brf-${b.id}`)).map(
    (b): SearchSuggestionItem => {
      const id = `rep-brf-${b.id}`;
      return {
        id,
        scope: "/reports",
        scopeLabel: "研究报告",
        badge: b.series,
        title: b.title,
        subtitle: `${b.date} · ${b.summary}`,
        href: buildPublicSearchUrl({ q: b.title.slice(0, 10), scope: "/reports", item: id }),
        subpageHref: `/reports`,
        fields: [
          { label: "报告序列", value: b.series },
          { label: "发布日期", value: b.date },
          { label: "核心摘要", value: b.summary },
          { label: "关键研判结论", value: b.keyFindings.join("；") },
          { label: "标准文献引用", value: b.citation },
        ],
        keywords: `${b.title} ${b.series} ${b.summary} ${b.keyFindings.join(" ")}`.toLowerCase(),
      };
    },
  ),
  ...POLICY_CLAUSE_ROWS.filter((p) => !V2_SEED_CODES.has(p.docNo.toLowerCase())).map((p): SearchSuggestionItem => {
    const id = `rep-pol-${p.id}`;
    return {
      id,
      scope: "/reports",
      scopeLabel: "产业政策",
      badge: p.level,
      title: p.title,
      subtitle: `${p.docNo} · ${p.agency} · ${p.topic}`,
      href: buildPublicSearchUrl({ q: p.topic, scope: "/reports", item: id }),
      subpageHref: `/policies?q=${encodeURIComponent(p.docNo)}`,
      fields: [
        { label: "发文字号", value: p.docNo },
        { label: "发文机关与层级", value: `${p.agency}（${p.level}）` },
        { label: "发布日期", value: p.publishDate },
        { label: "政策主题", value: p.topic },
        { label: "核心医疗装备条款摘要", value: p.clauseSummary },
      ],
      keywords: `${p.docNo} ${p.title} ${p.agency} ${p.topic} ${p.level} ${p.clauseSummary}`.toLowerCase(),
    };
  }),
  ...GUIDELINE_ROWS.filter((g) => !V2_SEED_CODES.has(g.noticeNo.toLowerCase())).map((g): SearchSuggestionItem => {
    const id = `rep-gd-${g.id}`;
    return {
      id,
      scope: "/reports",
      scopeLabel: "注册与准入",
      badge: "审查指导原则",
      title: g.title,
      subtitle: `${g.noticeNo} · ${g.category}（分类码 ${g.classCode}）`,
      href: buildPublicSearchUrl({ q: g.title.slice(0, 8), scope: "/reports", item: id }),
      subpageHref: `/regulation/registrations?subkind=guideline&q=${encodeURIComponent(g.title.slice(0, 8))}`,
      fields: [
        { label: "通告文号", value: g.noticeNo },
        { label: "技术审评赛道", value: `${g.category}（分类目录 ${g.classCode}）` },
        { label: "发布年份与状态", value: `${g.year} · ${g.versionStatus}` },
        { label: "核心审评关注要点", value: g.reviewPoints },
      ],
      keywords: `${g.noticeNo} ${g.title} ${g.category} ${g.classCode} ${g.reviewPoints}`.toLowerCase(),
    };
  }),
  ...STANDARD_CATALOG_ROWS.filter((s) => !V2_SEED_CODES.has(s.stdNo.toLowerCase())).map((s): SearchSuggestionItem => {
    const id = `rep-std-${s.stdNo}`;
    return {
      id,
      scope: "/reports",
      scopeLabel: "技术标准",
      badge: s.nature,
      title: `${s.stdNo} ${s.stdName}`,
      subtitle: `${s.scope} · ${s.status}`,
      href: buildPublicSearchUrl({ q: s.stdNo, scope: "/reports", item: id }),
      subpageHref: `/standards?q=${encodeURIComponent(s.stdNo)}`,
      fields: [
        { label: "标准编号", value: s.stdNo },
        { label: "标准性质与状态", value: `${s.nature} · ${s.status}` },
        { label: "适用器械领域", value: s.scope },
        { label: "关键技术指标与条款", value: s.keyClause },
      ],
      keywords: `${s.stdNo} ${s.stdName} ${s.scope} ${s.nature} ${s.status} ${s.keyClause}`.toLowerCase(),
    };
  }),
  ...ANNUAL_REPORTS_ROWS.filter((a) => !V2_SEED_ID_SET.has(`rep-ann-${a.seq}`)).map((a): SearchSuggestionItem => {
    const id = `rep-ann-${a.seq}`;
    return {
      id,
      scope: "/reports",
      scopeLabel: "官方来源",
      badge: "官方统计年报",
      title: a.reportTitle,
      subtitle: `${a.publisher} · ${a.latestIssue}`,
      href: buildPublicSearchUrl({ q: a.publisher, scope: "/reports", item: id }),
      subpageHref: `/sources?q=${encodeURIComponent(a.publisher)}`,
      fields: [
        { label: "发布机构", value: a.publisher },
        { label: "最新收录期次", value: a.latestIssue },
        { label: "归档形态", value: a.coverageLabel },
        { label: "交叉核验范围", value: a.reconciliationScope },
      ],
      keywords: `${a.reportTitle} ${a.publisher} ${a.latestIssue} ${a.reconciliationScope}`.toLowerCase(),
    };
  }),

  // 5. 指标目录（V3.0 33 项）
  ...SYSTEM_INDICATORS.map(
    (ind): SearchSuggestionItem => ({
      id: `sys-${ind.seq}`,
      scope: "/system",
      scopeLabel: "指标与口径",
      badge: `指标 ${ind.seq}`,
      title: `${ind.seq} ${ind.name}`,
      subtitle: `${ind.level1.replace(/^[一二三四五六]、/, "")} · 来源：${ind.source} · 频度：${ind.frequency}`,
      href: `/system/${ind.seq}`,
      subpageHref: `/system/${ind.seq}`,
      fields: [
        { label: "所属领域与二级分类", value: `${ind.level1} / ${ind.level2}` },
        { label: "权威数据来源", value: ind.source },
        { label: "计量单位与更新频度", value: `${ind.unit} · ${ind.frequency}` },
        { label: "数据形态", value: ind.dataForms.map((f) => DATA_FORM_LABEL[f]).join("、") },
        { label: "记录内容定义", value: ind.recordWhat },
        { label: "可回答典型问题", value: ind.canAnswer.join(" ") },
      ],
      keywords: `${ind.seq} ${ind.name} ${ind.level1} ${ind.level2} ${ind.source} ${ind.frequency} ${ind.recordWhat} ${ind.canAnswer.join(" ")} ${ind.v12Codes.join(" ")}`.toLowerCase(),
    }),
  ),
];

export const ADMIN_SEARCH_ITEMS: readonly SearchSuggestionItem[] = [
  ...MAPPERS.map(
    (m): SearchSuggestionItem => ({
      id: `adm-ovw-${m.seq}`,
      scope: "/admin",
      scopeLabel: "入库概况",
      badge: m.channel === "table" ? "表格 CSV" : "原件+JSON",
      title: `${m.seq} ${m.name}`,
      subtitle: `入库台账核查${m.indicatorId ? ` · 映射 ${m.indicatorId}` : ""}`,
      href: `/admin?q=${encodeURIComponent(m.seq)}`,
      keywords: `${m.seq} ${m.name} ${m.indicatorId ?? ""} ${m.channel === "table" ? "表格 csv" : "原件 文件 解析 json"}`.toLowerCase(),
    }),
  ),
  ...MAPPERS.map(
    (m): SearchSuggestionItem => ({
      id: `adm-imp-${m.seq}`,
      scope: "/admin/import",
      scopeLabel: "新建导入",
      badge: m.channel === "table" ? "表格通道" : "原件+JSON",
      title: `${m.seq} ${m.name}`,
      subtitle: `进入该指标导入向导${m.indicatorId ? `（${m.indicatorId}）` : ""}`,
      href: `/admin/import?seq=${m.seq}`,
      keywords: `${m.seq} ${m.name} ${m.indicatorId ?? ""} ${m.channel === "table" ? "表格 csv excel" : "原件 文件 解析 json pdf"}`.toLowerCase(),
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

export function buildLiveTradeSearchItems(snap: TradeOverviewPublished): SearchSuggestionItem[] {
  const periodParam = encodeURIComponent(snap.period);
  const catItems: SearchSuggestionItem[] = snap.categories.map((c) => {
    const id = `trd-live-cat-${c.categoryId}`;
    const cr3Text = formatSharePct(c.importConcentration.cr3);
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: `海关大类 · ${snap.period}`,
      title: c.category,
      subtitle: `出口 ${formatUsdToYi(c.exportUsd, 4)} 亿美元 / 进口 ${formatUsdToYi(c.importUsd, 4)} 亿美元（进口 CR3 ${cr3Text}）`,
      href: buildPublicSearchUrl({ q: c.category, scope: "/trade", item: id }),
      subpageHref: `/trade?period=${periodParam}&tab=categories&q=${encodeURIComponent(c.category)}#trade-directory-heading`,
      fields: [
        { label: "统计期间与字典", value: `${snap.period} · 字典 ${snap.dictVersion}` },
        { label: "发布版本 releaseId", value: snap.releaseId },
        { label: "包含 HS8 税号数", value: `${c.hs8Count} 项（${c.hsRange}）` },
        { label: "出口额", value: `${formatUsdToYi(c.exportUsd, 4)} 亿美元（${c.exportUsd.toLocaleString("zh-CN")} 美元，同比 ${formatYoyPct(c.exportYoyPct)}）` },
        { label: "进口额", value: `${formatUsdToYi(c.importUsd, 4)} 亿美元（${c.importUsd.toLocaleString("zh-CN")} 美元，同比 ${formatYoyPct(c.importYoyPct)}）` },
        { label: "贸易顺逆差", value: `${formatBalanceYi(c.balanceUsd, 4)} 亿美元（${c.balanceUsd.toLocaleString("zh-CN")} 美元）` },
        { label: "进口来源集中度 CR3", value: cr3Text },
        { label: "前三位进口来源", value: c.topImportPartners.join(" / ") || "暂无数据" },
      ],
      keywords: `${c.category} ${c.hsRange} ${c.topImportPartners.join(" ")} ${snap.period} ${snap.releaseId}`.toLowerCase(),
    };
  });

  const hsItems: SearchSuggestionItem[] = snap.hsItems.map((h) => {
    const id = `trd-live-hs-${h.hs8}`;
    const cr3Text = formatSharePct(h.importConcentration.cr3);
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: `HS8 · ${snap.period}`,
      title: `${h.hs8} ${h.itemName}`,
      subtitle: `${h.category} · 进口 ${formatUsdToYi(h.importUsd, 4)} 亿美元 / 出口 ${formatUsdToYi(h.exportUsd, 4)} 亿美元`,
      href: buildPublicSearchUrl({ q: h.hs8, scope: "/trade", item: id }),
      subpageHref: `/trade?period=${periodParam}&tab=hs&q=${encodeURIComponent(h.hs8)}#trade-directory-heading`,
      fields: [
        { label: "8 位海关 HS 税号", value: `${h.hs8}（HS6 ${h.hs6}）` },
        { label: "归属一级类别", value: h.category },
        { label: "统计期间与字典", value: `${snap.period} · 字典 ${snap.dictVersion}` },
        { label: "发布版本 releaseId", value: snap.releaseId },
        { label: "进口规模", value: `${formatUsdToYi(h.importUsd, 4)} 亿美元（${h.importUsd.toLocaleString("zh-CN")} 美元）` },
        { label: "出口规模", value: `${formatUsdToYi(h.exportUsd, 4)} 亿美元（${h.exportUsd.toLocaleString("zh-CN")} 美元）` },
        { label: "进口来源集中度 CR3", value: cr3Text },
        { label: "前三位进口来源", value: h.topImportPartners.join(" / ") || "暂无数据" },
      ],
      keywords: `${h.hs8} ${h.hs6} ${h.itemName} ${h.category} ${h.topImportPartners.join(" ")} ${snap.period} ${snap.releaseId}`.toLowerCase(),
    };
  });

  const partnerItems: SearchSuggestionItem[] = snap.partners.map((p) => {
    const id = `trd-live-partner-${p.partnerCode}`;
    return {
      id,
      scope: "/trade",
      scopeLabel: "进出口贸易",
      badge: `贸易伙伴 · ${snap.period}`,
      title: `${p.partnerName}（进口占 ${formatSharePct(p.importSharePct)} · 出口占 ${formatSharePct(p.exportSharePct)}）`,
      subtitle: `海关原码 ${p.partnerCode} · 核心类别：${p.topCategory || "—"}`,
      href: buildPublicSearchUrl({ q: p.partnerName, scope: "/trade", item: id }),
      subpageHref: `/trade?period=${periodParam}&tab=partners&q=${encodeURIComponent(p.partnerName)}#trade-directory-heading`,
      fields: [
        { label: "海关伙伴编码与名称", value: `${p.partnerName}（${p.partnerCode}）` },
        { label: "统计期间与版本", value: `${snap.period} · ${snap.releaseId}` },
        { label: "我国自该伙伴进口", value: `${formatUsdToYi(p.importUsd, 4)} 亿美元（${p.importUsd.toLocaleString("zh-CN")} 美元，占 ${formatSharePct(p.importSharePct)}）` },
        { label: "我国对该伙伴出口", value: `${formatUsdToYi(p.exportUsd, 4)} 亿美元（${p.exportUsd.toLocaleString("zh-CN")} 美元，占 ${formatSharePct(p.exportSharePct)}）` },
        { label: "双边核心类别", value: p.topCategory || "—" },
      ],
      keywords: `${p.partnerName} ${p.partnerCode} ${p.topCategory} ${snap.period} ${snap.releaseId}`.toLowerCase(),
    };
  });

  return [...catItems, ...hsItems, ...partnerItems];
}

function resolvePublicPool(liveTradeOverview?: TradeOverviewResponse | null): readonly SearchSuggestionItem[] {
  if (liveTradeOverview && liveTradeOverview.status === "published") {
    const nonTrade = PUBLIC_SEARCH_ITEMS.filter((i) => i.scope !== "/trade");
    return [...nonTrade, ...buildLiveTradeSearchItems(liveTradeOverview)];
  }
  return PUBLIC_SEARCH_ITEMS;
}

export function queryPublicSuggestions(
  rawQuery: string,
  activeScope: PublicSearchScope,
  liveTradeOverview?: TradeOverviewResponse | null,
) {
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) {
    return {
      scopedMatches: [] as SearchSuggestionItem[],
      indicatorMatches: [] as SearchSuggestionItem[],
      globalTotal: 0,
    };
  }
  const pool = resolvePublicPool(liveTradeOverview);
  const allMatches = pool.filter((item) => matchesQuery(item.keywords, tokens));
  const scopedPool =
    activeScope === "/search"
      ? allMatches.filter((i) => i.scope !== "/system")
      : allMatches.filter((i) => i.scope === activeScope);
  const indicatorPool =
    activeScope === "/system" ? [] : allMatches.filter((i) => i.scope === "/system");

  return {
    scopedMatches: scopedPool.slice(0, 6),
    indicatorMatches: indicatorPool.slice(0, 3),
    globalTotal: allMatches.length,
  };
}

export function queryAdminSuggestions(
  rawQuery: string,
  activeScope: AdminSearchScope,
  liveData: {
    indicators?: readonly IndicatorListItem[];
    batches?: readonly ImportBatch[];
  } = {},
) {
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) {
    return {
      scopedMatches: [] as SearchSuggestionItem[],
      crossMatches: [] as SearchSuggestionItem[],
      globalTotal: 0,
    };
  }

  const indicators = liveData.indicators ?? [];
  const batches = liveData.batches ?? [];

  const liveIndicatorCatalogItems: SearchSuggestionItem[] = [];
  const liveObservationIndicatorItems: SearchSuggestionItem[] = [];
  const liveIndCodeSet = new Set<string>();

  for (const ind of indicators) {
    if (!matchesQuery(`${ind.id} ${ind.name} ${ind.cluster_code}`, tokens)) continue;
    liveIndCodeSet.add(ind.id);
    liveIndicatorCatalogItems.push({
      id: `adm-api-ind-${ind.id}`,
      scope: "/admin/indicators",
      scopeLabel: "工程指标库",
      badge: ind.id,
      title: `${ind.id} ${ind.name}`,
      subtitle: `观测值 ${ind.obs_count} 条 · 更新频率：${ind.update_freq || "—"}`,
      href: `/admin/indicators/${encodeURIComponent(ind.id)}`,
      keywords: `${ind.id} ${ind.name} ${ind.cluster_code}`.toLowerCase(),
    });
    liveObservationIndicatorItems.push({
      id: `adm-obs-ind-${ind.id}`,
      scope: "/admin/observations",
      scopeLabel: "观测值核查",
      badge: "按指标核查",
      title: `${ind.id} ${ind.name}`,
      subtitle: `已入库观测值 ${ind.obs_count} 条 · 最近期间：${ind.latest_period ?? "—"}`,
      href: `/admin/observations?indicator_id=${encodeURIComponent(ind.id)}`,
      keywords: `${ind.id} ${ind.name} ${ind.cluster_code}`.toLowerCase(),
    });
  }

  const liveBatchItems: SearchSuggestionItem[] = [];
  const liveObservationBatchItems: SearchSuggestionItem[] = [];
  for (const b of batches) {
    const statusLabel = IMPORT_STATUS[b.status]?.label ?? b.status;
    if (!matchesQuery(`${b.filename} ${b.id} ${statusLabel} ${b.status}`, tokens)) continue;
    const shortId = b.id.slice(0, 8);
    liveBatchItems.push({
      id: `adm-batch-${b.id}`,
      scope: "/admin/batches",
      scopeLabel: "导入记录",
      badge: statusLabel,
      title: `${b.filename}（批次 ${shortId}）`,
      subtitle: `${formatDateTime(b.created_at)} · 成功写入 ${b.row_ok} 行 / 跳过 ${b.row_err} 行`,
      href: `/admin/batches?q=${encodeURIComponent(shortId)}`,
      keywords: `${b.filename} ${b.id} ${statusLabel}`.toLowerCase(),
    });
    if (b.row_ok > 0) {
      liveObservationBatchItems.push({
        id: `adm-obs-batch-${b.id}`,
        scope: "/admin/observations",
        scopeLabel: "观测值核查",
        badge: "按批次核查",
        title: `${b.filename}（批次 ${shortId}）`,
        subtitle: `核查该批次写入的 ${b.row_ok} 条观测值`,
        href: `/admin/observations?batch_id=${encodeURIComponent(b.id)}`,
        keywords: `${b.filename} ${b.id} ${statusLabel}`.toLowerCase(),
      });
    }
  }

  const staticMatches = ADMIN_SEARCH_ITEMS.filter((item) => {
    if (!matchesQuery(item.keywords, tokens)) return false;
    if (item.scope === "/admin/indicators") {
      const code = item.href.split("/").pop() ?? "";
      if (liveIndCodeSet.has(code)) return false;
    }
    return true;
  });

  const allPool: SearchSuggestionItem[] = [
    ...liveBatchItems,
    ...liveObservationIndicatorItems,
    ...liveObservationBatchItems,
    ...liveIndicatorCatalogItems,
    ...staticMatches,
  ];

  const scopedRaw = allPool.filter((item) => item.scope === activeScope);
  const crossRaw = allPool.filter((item) => item.scope !== activeScope);

  const dedupByHref = (arr: SearchSuggestionItem[]) =>
    arr.filter((v, idx, list) => list.findIndex((x) => x.href === v.href) === idx);

  const scopedDedup = dedupByHref(scopedRaw);
  const crossDedup = dedupByHref(crossRaw);

  return {
    scopedMatches: scopedDedup.slice(0, 6),
    crossMatches: crossDedup.slice(0, 4),
    globalTotal: scopedDedup.length + crossDedup.length,
  };
}

export function queryAllPublicGrouped(
  rawQuery: string,
  liveTradeOverview?: TradeOverviewResponse | null,
  extraServerV2Hits?: readonly UnifiedSearchHit[] | null,
) {
  const tokens = tokenizeQuery(rawQuery);
  const basePool = resolvePublicPool(liveTradeOverview);

  let pool: SearchSuggestionItem[] = [...basePool];
  if (extraServerV2Hits && extraServerV2Hits.length > 0) {
    const existingIds = new Set(pool.map((p) => p.id));
    for (const hit of extraServerV2Hits) {
      if (!existingIds.has(hit.id)) {
        pool.unshift(mapUnifiedV2HitToSuggestion(hit, rawQuery));
        existingIds.add(hit.id);
      }
    }
  }

  const matched =
    tokens.length === 0
      ? pool
      : pool.filter((item) => matchesQuery(item.keywords, tokens));

  const allGroups: {
    scope: Exclude<PublicSearchScope, "/search">;
    param: Exclude<PublicScopeParam, "all" | "observations">;
    label: string;
    items: SearchSuggestionItem[];
  }[] = [
    { scope: "/statistics", param: "statistics", label: "统计成果库", items: matched.filter((m) => m.scope === "/statistics") },
    { scope: "/products", param: "products", label: "注册与产品", items: matched.filter((m) => m.scope === "/products") },
    { scope: "/enterprises", param: "enterprises", label: "企业与机构", items: matched.filter((m) => m.scope === "/enterprises") },
    { scope: "/markets", param: "markets", label: "市场与技术", items: matched.filter((m) => m.scope === "/markets") },
    { scope: "/trade", param: "trade", label: "进出口贸易", items: matched.filter((m) => m.scope === "/trade") },
    { scope: "/reports", param: "reports", label: "政策、标准与报告", items: matched.filter((m) => m.scope === "/reports") },
    { scope: "/system", param: "system", label: "指标与口径", items: matched.filter((m) => m.scope === "/system") },
  ];

  return {
    total: matched.length,
    allGroups,
    groups: allGroups.filter((g) => g.items.length > 0),
  };
}
