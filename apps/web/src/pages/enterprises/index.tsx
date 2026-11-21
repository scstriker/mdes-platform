import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconX } from "@tabler/icons-react";
import { matchesQuery } from "@mdes/shared";
import bannerEnterprises from "@/assets/visuals/banner-enterprises.webp";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { StatistaFigure } from "@/components/layout/statista-figure";
import { statistaHorizontalBarOption } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";
import {
  ENTERPRISE_KPIS,
  ENTERPRISE_POOL_ROWS,
  ENTERPRISE_PROVINCE_OPTIONS,
  GROUP_TABS,
  INSTITUTION_TABS,
  PROVINCIAL_CONCENTRATION,
  RD_CLINICAL_PLATFORMS,
  TESTING_GCP_INSTITUTIONS,
  type EnterpriseGroup,
  type EnterprisePoolRow,
  type InstitutionTab,
  type ServiceInstitutionRow,
} from "./data";

const VALID_GROUPS = new Set<EnterpriseGroup>(["all", "champion", "ashare", "hk"]);
const PAGE_SIZE = 8;

function parseGroup(raw: string | null): EnterpriseGroup {
  if (raw && VALID_GROUPS.has(raw as EnterpriseGroup)) return raw as EnterpriseGroup;
  return "all";
}

export default function EnterprisesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const group = parseGroup(searchParams.get("group"));
  const province = searchParams.get("province") ?? "";
  const rawQuery = searchParams.get("q")?.trim() ?? "";
  const q = rawQuery.toLowerCase();

  const [entPage, setEntPage] = useState(0);
  const [instTab, setInstTab] = useState<InstitutionTab>("all");
  const [instPage, setInstPage] = useState(0);

  useEffect(() => {
    setEntPage(0);
    setInstPage(0);
  }, [group, province, q]);

  useEffect(() => {
    setInstPage(0);
  }, [instTab]);

  function updateParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  // 1. 重点企业筛选（响应顶部本栏范围检索词 q，与全站搜索共用多词项匹配规则）
  const filteredFirms = useMemo(() => {
    return ENTERPRISE_POOL_ROWS.filter((r) => {
      if (group !== "all" && !r.groups.includes(group)) return false;
      if (province && r.province !== province) return false;
      if (!q) return true;
      return matchesQuery(
        `${r.shortName} ${r.entityCode} ${r.coreBusiness} ${r.boardLabel} ${r.province} ${r.statusBatch} ${r.revenueAndRd} ${r.overseasNote}`,
        q,
      );
    });
  }, [group, province, q]);

  // 2. 研发创新、检验检测与临床试验备案机构合并全集
  const allInstitutions = useMemo<readonly ServiceInstitutionRow[]>(
    () => [...RD_CLINICAL_PLATFORMS, ...TESTING_GCP_INSTITUTIONS],
    [],
  );

  const filteredInstitutions = useMemo(() => {
    return allInstitutions.filter((inst) => {
      if (instTab !== "all" && inst.instGroup !== instTab) return false;
      if (province && inst.province !== province) return false;
      if (!q) return true;
      return matchesQuery(
        `${inst.name} ${inst.hostUnit} ${inst.categoryLabel} ${inst.province} ${inst.specialtyScope} ${inst.qualificationNote}`,
        q,
      );
    });
  }, [allInstitutions, instTab, province, q]);

  // 计算每百家生产企业平均持有三类有效注册证数（密度排行）
  const densityRanked = useMemo(() => {
    return [...PROVINCIAL_CONCENTRATION]
      .map((r) => ({
        ...r,
        certsPer100Firms: Math.round((r.class3ValidCerts / r.manufacturers) * 100),
      }))
      .sort((a, b) => b.certsPer100Firms - a.certsPer100Firms);
  }, []);

  const provinceTableColumns = [
    { key: "province", title: "省市" },
    { key: "class3ValidCerts", title: "三类有效证(件)", align: "right" as const },
    { key: "class3SharePct", title: "全国占比", align: "right" as const },
    { key: "manufacturers", title: "生产企业(家)", align: "right" as const },
    { key: "champions", title: "单项冠军", align: "right" as const },
    { key: "listedFirms", title: "上市企业", align: "right" as const },
  ];

  const provinceTableRows = useMemo(
    () =>
      PROVINCIAL_CONCENTRATION.map((r) => ({
        province: r.province,
        class3ValidCerts: formatNumber(r.class3ValidCerts),
        class3SharePct: r.class3SharePct,
        manufacturers: formatNumber(r.manufacturers),
        champions: r.champions,
        listedFirms: r.listedFirms,
      })),
    [],
  );

  const densityTableColumns = [
    { key: "province", title: "省市" },
    { key: "certsPer100Firms", title: "每百企三类证(件)", align: "right" as const },
    { key: "champions", title: "单项冠军(家/项)", align: "right" as const },
    { key: "gcpInstitutions", title: "临床备案机构(家)", align: "right" as const },
  ];

  const densityTableRows = useMemo(
    () =>
      densityRanked.map((r) => ({
        province: r.province,
        certsPer100Firms: r.certsPer100Firms,
        champions: r.champions,
        gcpInstitutions: r.gcpInstitutions,
      })),
    [densityRanked],
  );

  const firmColumns: DataTableColumn<EnterprisePoolRow>[] = useMemo(
    () => [
      { key: "entityCode", title: "证券代码", type: "code", colClassName: "w-28" },
      {
        key: "shortName",
        title: "企业简称与核心装备产线",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-brand-navy">{r.shortName}</span>
            <span className="truncate caption text-ink-muted">{r.coreBusiness}</span>
          </div>
        ),
      },
      {
        key: "boardLabel",
        title: "资质与板块",
        type: "status",
        colClassName: "w-40",
        cell: (r) => (
          <Tag size="sm" tone={r.tagTone}>
            {r.boardLabel}
          </Tag>
        ),
      },
      { key: "province", title: "省市", colClassName: "w-16" },
      {
        key: "revenueAndRd",
        title: "器械营收与研发强度",
        colClassName: "w-48",
        cell: (r) => (
          <div className="grid gap-0.5">
            <span className="body-sm font-semibold tabular-nums text-ink">{r.revenueAndRd}</span>
            <span className="truncate caption text-ink-muted">{r.overseasNote}</span>
          </div>
        ),
      },
      {
        key: "statusBatch",
        title: "批次与上市形态",
        colClassName: "w-32",
        cell: (r) => <span className="body-sm text-ink-muted">{r.statusBatch}</span>,
      },
    ],
    [],
  );

  const instColumns: DataTableColumn<ServiceInstitutionRow>[] = useMemo(
    () => [
      {
        key: "name",
        title: "机构名称与依托主体",
        primary: true,
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-brand-navy">{r.name}</span>
            <span className="truncate caption text-ink-muted">依托单位：{r.hostUnit}</span>
          </div>
        ),
      },
      {
        key: "categoryLabel",
        title: "机构类别",
        type: "status",
        colClassName: "w-44",
        cell: (r) => (
          <Tag size="sm" tone={r.tagTone}>
            {r.categoryLabel}
          </Tag>
        ),
      },
      { key: "province", title: "省市", colClassName: "w-16" },
      {
        key: "specialtyScope",
        title: "专业攻关与承检/临床备案范围",
        cell: (r) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate body-sm text-ink">{r.specialtyScope}</span>
            <span className="caption text-ink-muted">{r.qualificationNote}</span>
          </div>
        ),
      },
    ],
    [],
  );

  const pagedFirms = useMemo(
    () => filteredFirms.slice(entPage * PAGE_SIZE, (entPage + 1) * PAGE_SIZE),
    [filteredFirms, entPage],
  );
  const pagedInstitutions = useMemo(
    () => filteredInstitutions.slice(instPage * PAGE_SIZE, (instPage + 1) * PAGE_SIZE),
    [filteredInstitutions, instPage],
  );

  return (
    <div className="mx-auto grid w-full max-w-content gap-10 px-4 py-8 md:px-8 md:py-10">
      {/* Band 1：智库页头 + 5 列核心产业主体指标 */}
      <div className="grid gap-6">
        <PageVisualBanner
          title="企业主体、省市分布与服务机构库"
          summary="按统一社会信用代码法人去重，统筹全国医疗器械生产主体、制造业单项冠军、上市龙头及国家级创新检测临床支撑平台。"
          image={bannerEnterprises}
          actions={<TextLink to="/system#l1-ent">查看企业与服务机构统计口径 →</TextLink>}
        />

        <div className="grid grid-cols-2 border-t-2 border-t-brand-navy border-b border-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-border">
          {ENTERPRISE_KPIS.map((kpi) => (
            <div key={kpi.label} className="grid content-between gap-1.5 px-3 py-3.5 lg:px-4 lg:first:pl-1">
              <p className="body-sm font-semibold text-ink-muted">{kpi.label}</p>
              <div>
                <p className="inline-flex items-baseline gap-1 tabular-nums">
                  <span className="numeral text-brand-navy">{kpi.value}</span>
                  <span className="caption text-ink-muted">{kpi.unit}</span>
                </p>
                <p className="mt-0.5 caption text-ink-muted">{kpi.subnote}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Band 2：双栏 Statista 级区域产业集聚与研发密度分化信息图（关键词筛选态自动收起，优先呈现匹配名录） */}
      {!rawQuery && (
        <section aria-label="区域集聚与研发密度分析" className="grid gap-6 lg:grid-cols-2">
          <StatistaFigure
            id="fig-enterprises-provinces"
            eyebrow="图 1 · 区域产业集聚格局"
            title="粤苏京沪浙五省市集聚全国逾七成三类有效注册证"
            subtitle="截至 2026年9月末 · 前十省市有效第三类医疗器械注册证存量（单位：件）"
            badge={{ label: "前五省市占 74.1%", tone: "info" }}
            ariaLabel="前十省市有效第三类医疗器械注册证存量横向排名条形图"
            height={292}
            option={(t) =>
              statistaHorizontalBarOption(t, {
                categories: PROVINCIAL_CONCENTRATION.map((r) => r.province),
                values: PROVINCIAL_CONCENTRATION.map((r) => r.class3ValidCerts),
                labels: PROVINCIAL_CONCENTRATION.map(
                  (r) => `${r.class3ValidCerts.toLocaleString("zh-CN")}（${r.class3SharePct}）`,
                ),
                highlightTopN: 5,
                rightPadding: 108,
              })
            }
            tableColumns={provinceTableColumns}
            tableRows={provinceTableRows}
            exportName="enterprises-provincial-certs"
            source="国家药监局注册与生产许可数据库"
            note="按注册人法人登记省份统计；前十省市合计占全国有效三类证存量的 92.7%"
          />

          <StatistaFigure
            id="fig-enterprises-density"
            eyebrow="图 2 · 区域研发密度分化"
            title="京沪呈现高研发持证密度特征，粤苏兼顾大规模制造基底"
            subtitle="截至 2026年9月末 · 前十省市每百家生产企业平均持有三类有效证数（单位：件/百家）"
            badge={{ label: "北京 254 件/百家", tone: "info" }}
            ariaLabel="重点省市每百家生产企业平均持有三类注册证密度横向条形图"
            height={292}
            option={(t) =>
              statistaHorizontalBarOption(t, {
                categories: densityRanked.map((r) => r.province),
                values: densityRanked.map((r) => r.certsPer100Firms),
                labels: densityRanked.map((r) => `${r.certsPer100Firms} 件/百企`),
                highlightTopN: 2,
                referenceLine: { value: 118, label: "十省均值 118" },
                rightPadding: 92,
              })
            }
            tableColumns={densityTableColumns}
            tableRows={densityTableRows}
            exportName="enterprises-rd-density"
            source="机械工业仪器仪表综合技术经济研究所（ITEI）测算"
            note="京沪集中大量三甲临床中心与有源高端植介入总部，单位主体高风险三类证产出密度居首"
          />
        </section>
      )}

      {/* 当前过滤条件反馈条（当顶部范围搜索或省份激活时显示） */}
      {(rawQuery || province || group !== "all") && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border border-border bg-info-bg px-4 py-2.5 body-sm text-ink"
        >
          <span>
            当前本栏筛选{rawQuery ? `「${rawQuery}」` : ""}
            {province ? ` · 省市：${province}` : ""}：匹配重点企业{" "}
            <strong className="font-semibold tabular-nums text-brand-navy">{filteredFirms.length}</strong> 家，研发检验临床机构{" "}
            <strong className="font-semibold tabular-nums text-brand-navy">{filteredInstitutions.length}</strong> 家。
          </span>
          <button
            type="button"
            onClick={() => updateParam({ q: null, province: null, group: null })}
            className="inline-flex cursor-pointer items-center gap-1 font-semibold text-link hover:underline focus-ring"
          >
            <IconX size={15} aria-hidden="true" />
            重置全部筛选
          </button>
        </div>
      )}

      {/* Band 3：制造业单项冠军与上市企业名录（紧凑单行 + 分页） */}
      <section id="enterprise-directory-heading" aria-label="重点上市与单项冠军企业名录" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
          <div>
            <h2 className="title-sub text-brand-navy">制造业单项冠军与上市企业名录</h2>
            <p className="mt-0.5 body-sm text-ink-muted">
              剥离医药商业流通分部口径，聚焦医疗器械制造主业营收、研发投入强度与国际化布局。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="ent-local-filter" className="sr-only">
              本表关键词筛选
            </label>
            <input
              id="ent-local-filter"
              type="search"
              value={searchParams.get("q") ?? ""}
              onChange={(e) => updateParam({ q: e.target.value || null })}
              placeholder="筛选本表企业或机构…"
              className="h-9 w-48 rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink outline-none focus:border-brand-navy"
            />
            <label htmlFor="ent-province-filter" className="body-sm text-ink-muted">
              注册省市
            </label>
            <select
              id="ent-province-filter"
              value={province}
              onChange={(e) => updateParam({ province: e.target.value || null })}
              className="h-9 cursor-pointer rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink focus-ring"
            >
              <option value="">全部省市</option>
              {ENTERPRISE_PROVINCE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div role="tablist" aria-label="企业分组切换" className="flex flex-wrap gap-2">
          {GROUP_TABS.map((t) => {
            const active = group === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => updateParam({ group: t.id === "all" ? null : t.id })}
                className={cn(
                  "cursor-pointer border px-3.5 py-1.5 body-sm font-semibold transition-colors focus-ring",
                  active
                    ? "border-brand-navy bg-brand-navy text-on-brand"
                    : "border-border bg-surface text-ink hover:border-brand-navy hover:text-brand-navy",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <DataTable
          caption="制造业单项冠军与上市企业名录"
          columns={firmColumns}
          data={pagedFirms}
          getRowId={(r) => r.id}
          empty={
            filteredInstitutions.length > 0 && rawQuery
              ? `重点企业名录无直接匹配；下方「科研检验与临床试验机构」匹配到 ${filteredInstitutions.length} 家机构。`
              : "未找到符合当前筛选条件的重点企业"
          }
          pagination={
            filteredFirms.length > PAGE_SIZE
              ? { page: entPage, pageSize: PAGE_SIZE, total: filteredFirms.length, onPageChange: setEntPage }
              : undefined
          }
        />
      </section>

      {/* Band 4：国家级创新中心、检验院与临床试验备案机构名录（统一检索联动 + 分页） */}
      <section id="institutions-directory" aria-label="研发创新、检验检测与临床服务机构名录" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
          <div>
            <h2 className="title-sub text-brand-navy">国家级研发创新、法定检验与临床试验服务机构</h2>
            <p className="mt-0.5 body-sm text-ink-muted">
              汇集国家级制造业创新中心、国家临床医学研究中心、CMA/CNAS 法定器检院及临床试验备案三甲医院。
            </p>
          </div>
          <span className="body-sm tabular-nums text-ink-muted">
            代表性名录共 <strong className="font-semibold text-ink">{filteredInstitutions.length}</strong> 家
          </span>
        </div>

        <div role="tablist" aria-label="服务机构类别切换" className="flex flex-wrap gap-2">
          {INSTITUTION_TABS.map((t) => {
            const active = instTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setInstTab(t.id)}
                className={cn(
                  "cursor-pointer border px-3.5 py-1.5 body-sm font-semibold transition-colors focus-ring",
                  active
                    ? "border-brand-navy bg-brand-navy text-on-brand"
                    : "border-border bg-surface text-ink hover:border-brand-navy hover:text-brand-navy",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <DataTable
          caption="研发创新、检验检测与临床服务机构名录"
          columns={instColumns}
          data={pagedInstitutions}
          getRowId={(r) => r.id}
          empty="未找到符合当前筛选条件的服务机构"
          pagination={
            filteredInstitutions.length > PAGE_SIZE
              ? {
                  page: instPage,
                  pageSize: PAGE_SIZE,
                  total: filteredInstitutions.length,
                  onPageChange: setInstPage,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
