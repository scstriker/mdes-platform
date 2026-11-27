import { useMemo } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { IconChartBar, IconRotate, IconX } from "@tabler/icons-react";
import {
  matchesQuery,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogRecord,
} from "@mdes/shared";
import {
  Breadcrumbs,
  DataTable,
  Notice,
  SectionTitle,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { controlClass } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCatalogList, useStatisticDetail } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GROUP_TABS, type EnterpriseGroup } from "./data";

const VALID_GROUPS = new Set<EnterpriseGroup>(["all", "champion", "ashare", "hk"]);

const PROVINCE_FILTER_OPTIONS = ["", "上海", "广东", "北京", "江苏", "山东", "浙江", "湖南", "湖北", "四川"] as const;

function parseGroup(raw: string | null): EnterpriseGroup {
  if (raw && VALID_GROUPS.has(raw as EnterpriseGroup)) return raw as EnterpriseGroup;
  return "all";
}

function findSeedStat(id: string) {
  return V2_SEED_STATISTICS.find((s) => s.statistic_id === id)!;
}

/**
 * 医疗器械企业主体库与多企业横向对标页（/enterprises）：
 * - 仅列示生产与上市企业法人主体；研发创新、检验检测与 GCP 机构迁至独立 /institutions 并保留醒目引导；
 * - 旧省域集聚与研发密度图锚点（#fig-enterprises-provinces / #fig-enterprises-density）平滑导向产业总览对应统计；
 * - 完整保留 ?group=ashare|champion|hk、?province=上海、?q= 书签语义，并支持勾选 2–5 家企业启动多企对标。
 */
export default function EnterprisesPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const group = parseGroup(searchParams.get("group"));
  const province = searchParams.get("province") ?? "";
  const rawQuery = searchParams.get("q") ?? "";
  const trimmedQ = rawQuery.trim();
  const compareRaw = searchParams.get("compare") ?? "";

  if (location.hash === "#institutions-directory") {
    const instParams = new URLSearchParams();
    if (trimmedQ) instParams.set("q", trimmedQ);
    if (province) instParams.set("region", province);
    const qs = instParams.toString();
    return <Navigate to={`/institutions${qs ? `?${qs}` : ""}`} replace />;
  }
  if (location.hash === "#fig-enterprises-provinces") {
    return <Navigate to="/#fig-overview-provinces" replace />;
  }
  if (location.hash === "#fig-enterprises-density") {
    return <Navigate to="/#fig-overview-density" replace />;
  }

  const selectedSlugs = useMemo(
    () =>
      compareRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5),
    [compareRaw],
  );

  const listQuery = useCatalogList({
    kind: "enterprise",
    region: province || undefined,
    tag: group !== "all" ? group : undefined,
    q: trimmedQ || undefined,
  });

  const allEnterprisesQuery = useCatalogList({ kind: "enterprise" });
  const benchmarkStatQuery = useStatisticDetail("STAT-ENT-IMAGING-BENCHMARK");

  const benchmarkStat = benchmarkStatQuery.data?.statistic ?? findSeedStat("STAT-ENT-IMAGING-BENCHMARK");

  const allEnterprises = useMemo<CatalogRecord[]>(() => {
    if (allEnterprisesQuery.data && allEnterprisesQuery.data.items.length > 0) {
      return allEnterprisesQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "enterprise");
  }, [allEnterprisesQuery.data]);

  const filteredEnterprises = useMemo<CatalogRecord[]>(() => {
    if (listQuery.data) {
      return listQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => {
      if (r.kind !== "enterprise") return false;
      if (province && r.region !== province) return false;
      if (group !== "all" && !r.tags.some((t) => t.toLowerCase() === group.toLowerCase())) return false;
      if (trimmedQ) {
        const hay = `${r.id} ${r.slug} ${r.title} ${r.subtitle} ${r.code ?? ""} ${r.region ?? ""} ${r.tags.join(" ")} ${JSON.stringify(r.summary_fields)}`;
        if (!matchesQuery(hay, trimmedQ)) return false;
      }
      return true;
    });
  }, [listQuery.data, province, group, trimmedQ]);

  const comparedEnterprises = useMemo<CatalogRecord[]>(() => {
    return selectedSlugs
      .map((slug) => allEnterprises.find((e) => e.slug === slug))
      .filter((e): e is CatalogRecord => Boolean(e));
  }, [selectedSlugs, allEnterprises]);

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  function toggleCompareEnterprise(slug: string) {
    const exists = selectedSlugs.includes(slug);
    let next: string[];
    if (exists) {
      next = selectedSlugs.filter((s) => s !== slug);
    } else {
      if (selectedSlugs.length >= 5) return;
      next = [...selectedSlugs, slug];
    }
    updateParams({ compare: next.length > 0 ? next.join(",") : null });
  }

  function resetAllFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const hasActiveFilter = group !== "all" || Boolean(province) || Boolean(trimmedQ);

  const columns = useMemo<DataTableColumn<CatalogRecord>[]>(
    () => [
      {
        key: "compare",
        title: "对标",
        colClassName: "w-16",
        cell: (row) => {
          const checked = selectedSlugs.includes(row.slug);
          const disabled = !checked && selectedSlugs.length >= 5;
          return (
            <Checkbox
              aria-label={`勾选 ${row.title} 加入多企业对标`}
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => toggleCompareEnterprise(row.slug)}
            />
          );
        },
      },
      {
        key: "code",
        title: "证券代码",
        type: "code",
        colClassName: "w-28",
      },
      {
        key: "title",
        title: "企业全称与主营医疗装备产线",
        primary: true,
        cell: (row) => {
          const business = row.summary_fields.find((f) => f.label.includes("主营"))?.value ?? row.subtitle;
          return (
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <TextLink to={`/enterprises/${encodeURIComponent(row.slug)}`} className="font-semibold text-brand-navy">
                  {row.title}
                </TextLink>
                {row.tags.includes("champion") && (
                  <Tag size="sm" tone="info">
                    单项冠军
                  </Tag>
                )}
              </div>
              <p className="truncate caption text-ink-muted">{business}</p>
            </div>
          );
        },
      },
      {
        key: "board",
        title: "上市板块",
        colClassName: "w-36",
        cell: (row) => {
          const board = typeof row.detail?.board === "string" ? row.detail.board : (row.subkind ?? "—");
          return <Tag size="sm">{board}</Tag>;
        },
      },
      {
        key: "region",
        title: "注册省市",
        colClassName: "w-24",
      },
      {
        key: "metrics",
        title: "2025 营收与研发强度（年报口径）",
        colClassName: "w-64",
        cell: (row) => {
          const rev = typeof row.detail?.revenue_2025_cny_100m === "number" ? row.detail.revenue_2025_cny_100m : null;
          const rd = typeof row.detail?.rd_ratio_2025_pct === "number" ? row.detail.rd_ratio_2025_pct : null;
          const ovs = typeof row.detail?.overseas_ratio_2025_pct === "number" ? row.detail.overseas_ratio_2025_pct : null;
          return (
            <div className="grid gap-0.5 tabular-nums">
              <span className="body-sm font-semibold text-ink">
                {rev !== null ? `${rev.toFixed(1)} 亿元` : "—"}
                {rd !== null ? ` · R&D ${rd.toFixed(2)}%` : ""}
              </span>
              <span className="caption text-ink-muted">
                {ovs !== null ? `境外收入占比 ${ovs.toFixed(2)}%` : row.period ?? "2025 年报"}
              </span>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSlugs],
  );

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 页头、机构名录分流提示与筛选区 */}
      <header className="grid gap-5 border-b border-border pb-6">
        <Breadcrumbs items={[{ label: "产业总览", href: "/" }, { label: "企业主体库" }]} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="label text-brand-navy">法人主体与财报披露口径核验 · 支持 2–5 家企业横向对标</p>
            <h1 className="title-page text-ink">医疗器械重点生产与上市企业库</h1>
            <p className="body text-ink-muted">
              按统一社会信用代码与证券披露主体建档，直连代表产品型号、分产品线营收、研发投入强度及经审计年度报告原文页码。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {comparedEnterprises.length < 2 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateParams({ compare: "united-imaging,mindray,sonoscape,iray,wandong" })}
              >
                <IconChartBar size={15} aria-hidden="true" />
                加载 5 家影像龙头对标样本
              </Button>
            )}
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={resetAllFilters}>
                <IconRotate size={14} aria-hidden="true" />
                重置筛选
              </Button>
            )}
          </div>
        </div>

        {/* 服务机构与省域统计分流导引条 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-2.5 body-sm">
          <span className="text-ink">
            找检验检测、GCP 临床试验或研发平台？{" "}
            <TextLink
              to={`/institutions${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`}
              className="font-semibold"
            >
              前往机构名录 →
            </TextLink>
          </span>
          <TextLink to="/#fig-overview-provinces" className="caption font-semibold">
            查看各省三类有效注册证存量与企业持证密度 →
          </TextLink>
        </div>

        {/* 分组切换与省市/关键词筛选 */}
        <div className="grid gap-4 border border-border bg-surface p-4">
          <div role="tablist" aria-label="企业板块与资质筛选" className="flex flex-wrap gap-2">
            {GROUP_TABS.map((t) => {
              const active = group === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => updateParams({ group: t.id === "all" ? null : t.id })}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1">
              <label htmlFor="ent-province-filter" className="label text-ink-muted">
                注册省市
              </label>
              <select
                id="ent-province-filter"
                value={province}
                onChange={(e) => updateParams({ province: e.target.value || null })}
                className={cn(controlClass, "h-10")}
              >
                {PROVINCE_FILTER_OPTIONS.map((p) => (
                  <option key={p || "all"} value={p}>
                    {p ? p : "全部省市"}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 sm:col-span-1 lg:col-span-2">
              <label htmlFor="ent-local-filter" className="label text-ink-muted">
                企业名称、证券代码或主营品类检索
              </label>
              <input
                id="ent-local-filter"
                type="search"
                value={rawQuery}
                onChange={(e) => updateParams({ q: e.target.value || null })}
                placeholder="检索 联影医疗、688271.SH、奕瑞科技、手术机器人…"
                className={cn(controlClass, "h-10")}
              />
            </div>
          </div>
        </div>
      </header>

      {/* 单选 1 家企业时的引导提示 */}
      {comparedEnterprises.length === 1 && comparedEnterprises[0] && (
        <Notice
          tone="info"
          title={`已选 1 家企业：${comparedEnterprises[0].title}`}
          action={
            <Button variant="secondary" size="sm" onClick={() => updateParams({ compare: null })}>
              取消选择
            </Button>
          }
        >
          请在下方企业名录中继续勾选 1–4 家企业（共支持 2–5 家企业）启动研发强度、境外营收与持证规模横向对标。
        </Notice>
      )}

      {/* 2–5 家企业多维横向对标面板 */}
      {comparedEnterprises.length >= 2 && (
        <section
          id="enterprise-benchmark-panel"
          aria-labelledby="enterprise-benchmark-heading"
          className="grid gap-6 border border-border border-t-2 border-t-brand-navy bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="grid gap-1">
              <p className="label text-brand-navy">多企业横向对标（已选 {comparedEnterprises.length}/5 家）</p>
              <h2 id="enterprise-benchmark-heading" className="title-sub text-ink">
                {comparedEnterprises.map((e) => e.title).join(" · ")}
              </h2>
              <p className="body-sm text-ink-muted">
                统一按 2025 年度经审计合并财务报表与国家药监局境内三类有效注册证口径横向对比。
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => updateParams({ compare: null })}>
              <IconX size={14} aria-hidden="true" />
              清除企业对标
            </Button>
          </div>

          <Table>
            <TableCaption className="sr-only">已选企业核心财务与研发准入指标横向对比表</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>企业主体</TableHead>
                <TableHead className="w-32">证券代码与板块</TableHead>
                <TableHead className="w-20">地区</TableHead>
                <TableHead className="w-32 text-right">2025 营收(亿元)</TableHead>
                <TableHead className="w-36 text-right">2025 研发占比(%)</TableHead>
                <TableHead className="w-36 text-right">境外收入占比(%)</TableHead>
                <TableHead className="w-32 text-right">三类有效证(件)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparedEnterprises.map((ent) => {
                const d = ent.detail ?? {};
                const rev = typeof d.revenue_2025_cny_100m === "number" ? d.revenue_2025_cny_100m.toFixed(1) : "—";
                const rd = typeof d.rd_ratio_2025_pct === "number" ? `${d.rd_ratio_2025_pct.toFixed(2)}%` : "—";
                const ovs = typeof d.overseas_ratio_2025_pct === "number" ? `${d.overseas_ratio_2025_pct.toFixed(2)}%` : "—";
                const certs = typeof d.class3_certs_count === "number" ? d.class3_certs_count.toLocaleString("zh-CN") : "—";
                return (
                  <TableRow key={ent.id}>
                    <TableCell className="font-semibold">
                      <TextLink to={`/enterprises/${encodeURIComponent(ent.slug)}`}>{ent.title}</TextLink>
                    </TableCell>
                    <TableCell className="code">{ent.code ?? "—"}</TableCell>
                    <TableCell>{ent.region ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{rev}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-brand-navy">{rd}</TableCell>
                    <TableCell className="text-right tabular-nums">{ovs}</TableCell>
                    <TableCell className="text-right tabular-nums">{certs}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <StatisticFigure
            id="fig-enterprises-benchmark"
            eyebrow="行业龙头对标基准统计 · STAT-ENT-IMAGING-BENCHMARK"
            statistic={benchmarkStat}
            height={272}
          />
        </section>
      )}

      {/* 企业主体名录表 */}
      <section id="enterprise-directory-heading" aria-labelledby="enterprise-table-title" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2">
              <span id="enterprise-table-title">重点医疗器械企业名录</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              当前筛选条件{province ? `（省市：${province}）` : ""}
              {group !== "all" ? `（分组：${GROUP_TABS.find((g) => g.id === group)?.label ?? group}）` : ""}共匹配{" "}
              <strong className="font-semibold tabular-nums text-brand-navy">{filteredEnterprises.length}</strong>{" "}
              家企业主体。勾选 2–5 家可启动多维图表与指标表对标。
            </p>
          </div>
        </div>

        <DataTable
          caption="医疗器械重点企业名录"
          columns={columns}
          data={filteredEnterprises}
          getRowId={(r) => r.id}
          loading={listQuery.isLoading && !listQuery.data && filteredEnterprises.length === 0}
          empty={
            <span>
              未找到匹配当前筛选条件的生产或上市企业。若您正在查找检验院、临床试验医院或国家级创新中心，请前往{" "}
              <TextLink to={`/institutions${trimmedQ ? `?q=${encodeURIComponent(trimmedQ)}` : ""}`} inline>
                机构名录
              </TextLink>
              。
            </span>
          }
        />
      </section>
    </div>
  );
}
