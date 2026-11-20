import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconArrowRight, IconRotate } from "@tabler/icons-react";
import bannerEnterprises from "@/assets/visuals/banner-enterprises.webp";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { PageVisualBanner } from "@/components/layout/page-visual-banner";
import { Button } from "@/components/ui/button";
import { controlClass, Input } from "@/components/ui/input";
import { SYSTEM_INDICATORS, type SystemIndicator } from "@/content/system-v3";
import type { ChartOption } from "@/lib/charts/echarts";
import { baseOption, categoryAxis, LazyChart, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import { cn } from "@/lib/utils";
import {
  ENTERPRISE_KPIS,
  ENTERPRISE_POOL_ROWS,
  ENTERPRISE_PROVINCE_OPTIONS,
  GROUP_TABS,
  PROVINCIAL_CONCENTRATION,
  RD_CLINICAL_PLATFORMS,
  TESTING_GCP_INSTITUTIONS,
  type EnterpriseGroup,
  type EnterprisePoolRow,
  type ServiceInstitutionRow,
} from "./data";

const VALID_GROUPS = new Set<EnterpriseGroup>(["all", "champion", "ashare", "hk"]);

type InstitutionTab = "rd-clinical" | "testing-gcp";

function parseGroup(raw: string | null): EnterpriseGroup {
  if (raw && VALID_GROUPS.has(raw as EnterpriseGroup)) {
    return raw as EnterpriseGroup;
  }
  return "all";
}

function provincialBarOption(t: ChartTheme): ChartOption {
  const ordered = [...PROVINCIAL_CONCENTRATION].reverse();
  const provinces = ordered.map((d) => d.province);
  const class3Certs = ordered.map((d) => d.class3ValidCerts);
  const manufacturers = ordered.map((d) => d.manufacturers);

  return {
    ...baseOption(t, 2),
    xAxis: valueAxis(t, { name: "数量（件/家）", scale: false }),
    yAxis: categoryAxis(t, provinces),
    series: [
      {
        type: "bar",
        name: "三类有效注册证（件）",
        data: class3Certs,
        barMaxWidth: 11,
        itemStyle: { color: t.series[0] },
      },
      {
        type: "bar",
        name: "二三类生产企业（家）",
        data: manufacturers,
        barMaxWidth: 11,
        itemStyle: { color: t.series[1] },
      },
    ],
  };
}

const ENTERPRISE_INDICATORS: readonly SystemIndicator[] = SYSTEM_INDICATORS.filter(
  (item) => item.level1 === "三、企业与机构",
);

export default function EnterprisesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const group = parseGroup(searchParams.get("group"));

  const [province, setProvince] = useState<string>("");
  const [instTab, setInstTab] = useState<InstitutionTab>("rd-clinical");

  const updateSearchParam = (key: "q" | "group", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || (key === "group" && value === "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setProvince("");
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("group");
    setSearchParams(next, { replace: true });
  };

  const normalizedQuery = q.trim().toLowerCase();

  const groupCounts = useMemo(() => {
    const counts: Record<EnterpriseGroup, number> = {
      all: 0,
      champion: 0,
      ashare: 0,
      hk: 0,
    };
    for (const row of ENTERPRISE_POOL_ROWS) {
      if (province && row.province !== province) continue;
      if (normalizedQuery) {
        const hay = `${row.entityCode} ${row.shortName} ${row.coreBusiness} ${row.boardLabel} ${row.province} ${row.overseasNote}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) continue;
      }
      counts.all += 1;
      for (const g of row.groups) {
        counts[g] += 1;
      }
    }
    return counts;
  }, [province, normalizedQuery]);

  const filteredEnterprises = useMemo(() => {
    return ENTERPRISE_POOL_ROWS.filter((row) => {
      if (group !== "all" && !row.groups.includes(group)) return false;
      if (province && row.province !== province) return false;
      if (!normalizedQuery) return true;
      const hay = `${row.entityCode} ${row.shortName} ${row.coreBusiness} ${row.boardLabel} ${row.province} ${row.overseasNote}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [group, province, normalizedQuery]);

  const hasActiveFilter = group !== "all" || Boolean(province) || Boolean(normalizedQuery);

  const enterpriseColumns = useMemo<DataTableColumn<EnterprisePoolRow>[]>(
    () => [
      {
        key: "entityCode",
        title: "证券/主体代码",
        type: "code",
        colClassName: "w-28",
      },
      {
        key: "shortName",
        title: "企业简称与核心业务",
        primary: true,
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{row.shortName}</span>
            <span className="caption text-ink-muted">{row.coreBusiness}</span>
          </div>
        ),
      },
      {
        key: "boardLabel",
        title: "资质/上市板块",
        type: "status",
        colClassName: "w-36",
        cell: (row) => (
          <Tag size="sm" tone={row.tagTone}>
            {row.boardLabel}
          </Tag>
        ),
      },
      {
        key: "province",
        title: "省份",
        colClassName: "w-16",
      },
      {
        key: "revenueAndRd",
        title: "器械分部营收/研发强度口径",
        colClassName: "w-40",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="tabular-nums font-semibold text-ink">{row.revenueAndRd}</span>
            <span className="caption text-ink-muted">{row.overseasNote}</span>
          </div>
        ),
      },
      {
        key: "statusBatch",
        title: "状态/批次",
        colClassName: "w-24",
        cell: (row) => <span className="caption font-semibold text-brand-navy">{row.statusBatch}</span>,
      },
    ],
    [],
  );

  const institutionColumns = useMemo<DataTableColumn<ServiceInstitutionRow>[]>(
    () => [
      {
        key: "seq",
        title: "指标项",
        type: "code",
        colClassName: "w-20",
        cell: (row) => <TextLink to={`/system/${row.seq}`}>{row.seq}号</TextLink>,
      },
      {
        key: "name",
        title: "机构/平台名称与依托主体",
        primary: true,
        colClassName: "w-72",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="font-semibold text-ink">{row.name}</span>
            <span className="caption text-ink-muted">依托单位：{row.hostUnit}</span>
          </div>
        ),
      },
      {
        key: "categoryLabel",
        title: "机构层级类别",
        type: "status",
        colClassName: "w-40",
        cell: (row) => (
          <Tag size="sm" tone={row.seq === "19" || row.seq === "21" ? "info" : "neutral"}>
            {row.categoryLabel}
          </Tag>
        ),
      },
      {
        key: "province",
        title: "省份",
        colClassName: "w-16",
      },
      {
        key: "specialtyScope",
        title: "专业攻关方向 / CMA 承检与临床备案范围",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="text-ink">{row.specialtyScope}</span>
            <span className="caption text-ink-muted">{row.qualificationNote}</span>
          </div>
        ),
      },
    ],
    [],
  );

  const ledgerColumns = useMemo<DataTableColumn<SystemIndicator>[]>(
    () => [
      {
        key: "seq",
        title: "序号",
        type: "code",
        colClassName: "w-16",
      },
      {
        key: "name",
        title: "三级指标",
        primary: true,
        colClassName: "w-56",
        cell: (row) => (
          <div className="grid gap-0.5">
            <TextLink to={`/system/${row.seq}`} className="font-semibold">
              {row.name}
            </TextLink>
            <span className="caption text-ink-muted">{row.level2}</span>
          </div>
        ),
      },
      {
        key: "grain",
        title: "记录粒度与消歧主键",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="text-ink">{row.grain}</span>
            <span className="caption text-ink-muted">主键：{row.entityKeys}</span>
          </div>
        ),
      },
      {
        key: "source",
        title: "数据来源",
        colClassName: "w-40",
        cell: (row) => (
          <span className="text-ink">
            {row.source}
            <span className="ml-1 caption text-ink-muted">（{row.frequency}）</span>
          </span>
        ),
      },
      {
        key: "phase",
        title: "建设阶段",
        type: "status",
        colClassName: "w-28",
        cell: (row) =>
          row.phase1 ? (
            <Tag size="sm" tone="info">
              一期已纳入
            </Tag>
          ) : (
            <Tag size="sm" tone="neutral">
              二期规划
            </Tag>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      {/* Band 1: Page Header & Open 5-Column Rule-Line KPI Strip */}
      <section className="bg-surface" aria-labelledby="enterprises-page-title">
        <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 md:px-8 md:py-10">
          <PageVisualBanner
            titleId="enterprises-page-title"
            title="企业主体、省市分布与服务机构库"
            summary="以统一社会信用代码为枢纽，汇聚生产企业（09）、制造业单项冠军（12）、上市样本池（13–16）及研发检测临床支撑机构。"
            image={bannerEnterprises}
            actions={
              <TextLink to="/system#l1-ent" className="inline-flex items-center gap-1 body">
                指标体系释义（09–22）
                <IconArrowRight size={15} aria-hidden="true" />
              </TextLink>
            }
          />

          <div
            role="region"
            aria-label="企业与服务机构核心指标通栏"
            className="grid grid-cols-2 gap-y-5 border-t-2 border-brand-navy border-b border-border py-4 md:grid-cols-5 md:gap-y-0 md:divide-x md:divide-border md:py-0"
          >
            {ENTERPRISE_KPIS.map((kpi) => (
              <div key={kpi.label} className="grid content-start gap-1 pr-3 md:px-4 md:py-4 md:first:pl-0 md:last:pr-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="label text-ink-muted">{kpi.label}</span>
                  <TextLink to={kpi.seqHref} className="code text-link">
                    {kpi.seqDisplay}
                  </TextLink>
                </div>
                <p className="numeral tabular-nums text-brand-navy">
                  {kpi.value}
                  <span className="ml-1 body-sm font-normal text-ink-muted">{kpi.unit}</span>
                </p>
                <p className="caption text-ink-muted">{kpi.subnote}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Band 2: Provincial Industry Concentration Workbench */}
      <section className="border-y border-border bg-surface-sunken" aria-labelledby="provincial-workbench-heading">
        <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
            {/* Left: Horizontal Comparative Bar Chart */}
            <div className="grid content-start gap-4 lg:col-span-6 lg:pr-8">
              <div className="grid gap-1">
                <h2 id="provincial-workbench-heading" className="title-sub text-brand-navy">
                  前十省市三类有效注册证与生产企业分布
                </h2>
                <p className="caption text-ink-muted">
                  广东、江苏、北京、上海、浙江、山东、湖南、湖北、四川、天津（前十省市合计占境内三类有效注册证 92.7%）
                </p>
              </div>

              <LazyChart
                option={provincialBarOption}
                ariaLabel="前十省市三类有效注册证数量与二三类医疗器械生产企业数量水平对比条形图"
                height={336}
              />

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                结构特征：广东、江苏兼具规模制造与三类持证总量优势；北京、上海出现「三类有效注册证数量反超生产企业法人数」的高研发密度特征，集中分布高端影像、手术机器人与心血管神经植介入企业。
              </p>
            </div>

            {/* Right: Academic Three-Line Provincial Table */}
            <div className="grid content-start gap-4 lg:col-span-6 lg:pl-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="title-sub text-brand-navy">重点省市产业规模与支撑机构统计表</h2>
                <span className="caption text-ink-muted">按境内三类注册证占比降序</span>
              </div>

              <div className="overflow-x-auto focus-ring" tabIndex={0}>
                <table className="w-full border-collapse border-t-2 border-brand-navy border-b border-border body-sm">
                  <caption className="sr-only">前十省市医疗器械生产企业、三类注册证占比、单项冠军、上市企业与临床试验机构统计表</caption>
                  <thead>
                    <tr className="border-b-2 border-brand-sky">
                      <th scope="col" className="py-2 pr-2 text-left label font-bold text-brand-navy">
                        省份
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        生产企业(家)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        三类注册证占比
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        单项冠军(项)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right label font-bold text-brand-navy">
                        上市企业(家)
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right label font-bold text-brand-navy">
                        临床试验机构(家)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {PROVINCIAL_CONCENTRATION.map((row) => (
                      <tr key={row.province}>
                        <td className="py-1.5 pr-2 font-semibold text-ink">{row.province}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">{formatNumber(row.manufacturers)}</td>
                        <td className="px-2 py-1.5 text-right code text-brand-navy">{row.class3SharePct}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">{row.champions}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-ink">{row.listedFirms}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums text-ink-muted">{row.gcpInstitutions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
                注：遵循审图规范采用分省统计表与条形对比；企业工商注册地与异地生产基地按统一社会信用代码去重统计。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Band 3: Single-Champion (12) & Listed Enterprise Pool (13 + 14–16 Annual Report Linkage) Explorer */}
      <section className="bg-surface" aria-labelledby="enterprise-explorer-heading">
        <div className="mx-auto grid w-full max-w-content gap-5 px-4 py-8 md:px-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 id="enterprise-explorer-heading" className="title-sub text-brand-navy">
                制造业单项冠军（12）与上市企业标准样本池（13–16）检索
              </h2>
              <p className="caption text-ink-muted">
                衔接工信部制造业单项冠军名录、Wind 医疗器械上市样本池及年报医疗器械分部营收、研发投入强度与境外收入口径
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="body-sm tabular-nums text-ink-muted">
                当前显示 <strong className="font-semibold text-brand-navy">{filteredEnterprises.length}</strong> /{" "}
                {ENTERPRISE_POOL_ROWS.length} 家代表主体
              </span>
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <IconRotate size={14} aria-hidden="true" />
                  重置筛选
                </Button>
              )}
            </div>
          </div>

          {/* Group Underline Tabs */}
          <div role="tablist" aria-label="重点企业样本分组" className="flex flex-wrap gap-5 border-b border-border">
            {GROUP_TABS.map((tab) => {
              const active = group === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => updateSearchParam("group", tab.id)}
                  className={cn(
                    "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                    active
                      ? "border-brand-navy font-semibold text-brand-navy"
                      : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="caption tabular-nums text-ink-muted">({groupCounts[tab.id]})</span>
                </button>
              );
            })}
          </div>

          {/* Filter Controls */}
          <div className="grid gap-3 md:grid-cols-12">
            <div className="grid gap-1 md:col-span-4">
              <label htmlFor="enterprise-province-select" className="caption font-semibold text-ink-muted">
                注册省份
              </label>
              <select
                id="enterprise-province-select"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className={cn(controlClass, "h-11 md:h-10")}
              >
                <option value="">全部省份</option>
                {ENTERPRISE_PROVINCE_OPTIONS.map((prov) => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 md:col-span-8">
              <label htmlFor="enterprise-keyword-input" className="caption font-semibold text-ink-muted">
                关键词检索（同步 URL 参数 q）
              </label>
              <Input
                id="enterprise-keyword-input"
                type="search"
                value={q}
                onChange={(e) => updateSearchParam("q", e.target.value)}
                placeholder="输入企业简称、证券代码（如 688271 / 01066.HK）、冠军产品或业务赛道…"
              />
            </div>
          </div>

          <DataTable
            caption="国家级制造业单项冠军与医疗器械上市企业样本池明细表"
            columns={enterpriseColumns}
            data={filteredEnterprises}
            getRowId={(r) => r.id}
            fixedLayout
            dense
            empty="未找到符合当前板块分组、省份或关键词条件的企业记录。"
          />

          <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
            K01/K02 实体消歧与年报口径规则：A+H 两地上市主体按统一社会信用代码仅计 1 家，母子公司同时上市时须标注并表归属防止行业重复加总；年报境外营业收入（含海外并购工厂本地产销，16号）在统计口径上不等于中国海关医疗器械出口贸易额（38号）。
          </p>
        </div>
      </section>

      {/* Band 4: R&D, Testing & Clinical Service Institutions (19–22) + Indicator Ledger (09–22) */}
      <section className="border-t border-border bg-surface-sunken" aria-labelledby="service-institutions-heading">
        <div className="mx-auto grid w-full max-w-content gap-10 px-4 py-8 md:px-8 md:py-10">
          {/* Sub-block A: Institutions Underline-Tabbed Open Table */}
          <div className="grid gap-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1">
                <h2 id="service-institutions-heading" className="title-sub text-brand-navy">
                  研发创新、检验检测与临床研究服务机构（19–22）
                </h2>
                <p className="caption text-ink-muted">
                  分类呈现国家级制造业创新中心、国家临床医学研究中心，以及具备 CMA 资质的法定器检院所与临床试验备案医院
                </p>
              </div>
            </div>

            <div role="tablist" aria-label="研发检测与临床机构切换" className="flex flex-wrap gap-6 border-b border-border">
              <button
                type="button"
                role="tab"
                aria-selected={instTab === "rd-clinical"}
                onClick={() => setInstTab("rd-clinical")}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                  instTab === "rd-clinical"
                    ? "border-brand-navy font-semibold text-brand-navy"
                    : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                创新研发与临床研究平台 (19-20)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={instTab === "testing-gcp"}
                onClick={() => setInstTab("testing-gcp")}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 body-sm transition-colors duration-150 focus-ring",
                  instTab === "testing-gcp"
                    ? "border-brand-navy font-semibold text-brand-navy"
                    : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                检验检测与临床试验备案机构 (21-22)
              </button>
            </div>

            <DataTable
              caption={
                instTab === "rd-clinical"
                  ? "医疗器械国家级创新研发平台与国家临床医学研究中心名录"
                  : "医疗器械国家级及省级检验检测院所与临床试验备案医疗机构名录"
              }
              columns={institutionColumns}
              data={instTab === "rd-clinical" ? RD_CLINICAL_PLATFORMS : TESTING_GCP_INSTITUTIONS}
              getRowId={(r) => r.id}
              fixedLayout
              dense
            />

            <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
              资质核验提示（20/21/22）：国家临床医学研究中心认定不等同于药监局临床试验机构备案；检验机构在册须结合 CMA 授权附表核对具体 GB 9706 / YY 专用标准版次承检范围。
            </p>
          </div>

          {/* Sub-block B: Domain Indicator Coverage Ledger (09–22) + Compact Link Row */}
          <div className="grid gap-5 border-t border-border pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="title-sub text-brand-navy">本域三级指标覆盖台账（09–22）</h2>
                <p className="caption text-ink-muted">
                  《指标体系 V3.0》「三、企业与机构」共 12 项三级指标（注：原 V2.0 第 17、18 号指标已精简归并，保持编码连续稳定）
                </p>
              </div>
              <TextLink to="/system#l1-ent" className="inline-flex items-center gap-1 body-sm font-semibold">
                定位至指标目录「三、企业与机构」
                <IconArrowRight size={14} aria-hidden="true" />
              </TextLink>
            </div>

            <DataTable
              caption="企业与机构领域三级指标覆盖台账"
              columns={ledgerColumns}
              data={ENTERPRISE_INDICATORS}
              getRowId={(r) => r.seq}
              fixedLayout
              dense
            />
          </div>
        </div>
      </section>
    </div>
  );
}
