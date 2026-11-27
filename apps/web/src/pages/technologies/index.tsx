import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { IconExternalLink } from "@tabler/icons-react";
import { matchesQuery, V2_SEED_CATALOG_RECORDS, type CatalogRecord } from "@mdes/shared";
import {
  Breadcrumbs,
  DataTable,
  Descriptions,
  EmptyState,
  SectionTitle,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import { useCatalogDetail, useCatalogList } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type RouteComparisonItem = {
  route: string;
  field_strength: string;
  key_advantage: string;
  representative_model: string;
  model_href: string;
  evidence_label: string;
  evidence_url: string;
};

/**
 * 核心技术路线专题页（/technologies 与 /technologies/:slug）：
 * - 以临床与工程应用问题作一级主标题，首段阐明物理与工程工作原理（213 MHz 射频波长与 8 通道并行发射 pTx）；
 * - 横向对比技术路线（5.0 T 全身超导 vs 3.0 T 大孔径超导），直连采用型号与可展开的原始审评报告及强制性行标。
 */
export default function TechnologiesPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawQ = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const trimmedQ = rawQ.trim();

  const listQuery = useCatalogList({
    kind: "technology",
    category: category || undefined,
    q: trimmedQ || undefined,
  });

  const detailQuery = useCatalogDetail("technology", slug, Boolean(slug));

  const techList = useMemo<CatalogRecord[]>(() => {
    if (listQuery.data) {
      return listQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => {
      if (r.kind !== "technology") return false;
      if (category && r.category !== category) return false;
      if (trimmedQ) {
        const hay = `${r.id} ${r.slug} ${r.title} ${r.subtitle} ${r.code ?? ""} ${r.tags.join(" ")} ${JSON.stringify(r.summary_fields)}`;
        if (!matchesQuery(hay, trimmedQ)) return false;
      }
      return true;
    });
  }, [listQuery.data, category, trimmedQ]);

  const activeRecord = useMemo<CatalogRecord | undefined>(() => {
    if (slug) {
      if (detailQuery.data?.record) return detailQuery.data.record;
      return V2_SEED_CATALOG_RECORDS.find((r) => r.kind === "technology" && (r.slug === slug || r.id === slug));
    }
    return techList[0] ?? V2_SEED_CATALOG_RECORDS.find((r) => r.kind === "technology");
  }, [slug, detailQuery.data, techList]);

  const routeComparisons = useMemo<RouteComparisonItem[]>(() => {
    const raw = activeRecord?.detail?.route_comparisons;
    return Array.isArray(raw) ? (raw as RouteComparisonItem[]) : [];
  }, [activeRecord]);

  const workingPrinciple =
    typeof activeRecord?.detail?.working_principle === "string" ? activeRecord.detail.working_principle : "";

  const routeColumns = useMemo<DataTableColumn<RouteComparisonItem>[]>(
    () => [
      {
        key: "route",
        title: "技术路线与射频体制",
        primary: true,
        cell: (row) => <span className="font-semibold text-brand-navy">{row.route}</span>,
      },
      {
        key: "field_strength",
        title: "主磁场强度",
        type: "code",
        colClassName: "w-28",
      },
      {
        key: "key_advantage",
        title: "核心工程与临床适用优势",
      },
      {
        key: "representative_model",
        title: "采用代表型号",
        colClassName: "w-36",
        cell: (row) => (
          <TextLink to={row.model_href} className="font-semibold">
            {row.representative_model}
          </TextLink>
        ),
      },
      {
        key: "evidence_label",
        title: "审评与技术依据",
        colClassName: "w-52",
        cell: (row) => (
          <a
            href={row.evidence_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
          >
            <span>{row.evidence_label}</span>
            <IconExternalLink size={14} aria-hidden="true" />
          </a>
        ),
      },
    ],
    [],
  );

  function updateSearchParam(key: "q" | "category", value: string) {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  if (slug && !activeRecord && detailQuery.isError) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
        <Breadcrumbs items={[{ label: "产业总览", href: "/" }, { label: "技术路线", href: "/technologies" }, { label: slug }]} />
        <h1 className="title-page text-ink">未找到指定的技术路线档案</h1>
        <EmptyState
          title={`未收录标识为「${slug}」的技术路线记录`}
          description="请返回技术路线目录浏览已核实的医疗装备工程路线与审评依据。"
          action={
            <Button asChild variant="primary">
              <Link to="/technologies">返回技术路线目录</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 顶部面包屑与路线检索切换栏 */}
      <div className="grid gap-4 border-b border-border pb-6">
        <Breadcrumbs
          items={
            slug && activeRecord
              ? [
                  { label: "产业总览", href: "/" },
                  { label: "技术路线", href: "/technologies" },
                  { label: activeRecord.subkind ?? "医学影像核心技术" },
                ]
              : [{ label: "产业总览", href: "/" }, { label: "技术路线" }]
          }
        />

        {!slug && (
          <div className="flex flex-wrap items-end justify-between gap-3 border border-border bg-surface-sunken p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid w-48 gap-1">
                <label htmlFor="tech-category-select" className="label text-ink-muted">
                  临床与装备品类
                </label>
                <select
                  id="tech-category-select"
                  value={category}
                  onChange={(e) => updateSearchParam("category", e.target.value)}
                  className={cn(controlClass, "h-10")}
                >
                  <option value="">全部技术领域</option>
                  <option value="mri">磁共振成像 (MRI)</option>
                </select>
              </div>
              <div className="grid w-64 gap-1">
                <label htmlFor="tech-search-input" className="label text-ink-muted">
                  技术特征或标准检索
                </label>
                <input
                  id="tech-search-input"
                  type="search"
                  value={rawQ}
                  onChange={(e) => updateSearchParam("q", e.target.value)}
                  placeholder="检索 5T、并行射频、YY 9706.233…"
                  className={cn(controlClass, "h-10")}
                />
              </div>
            </div>
            <span className="caption text-ink-muted">
              当前收录已核验技术路线专题 <strong className="font-semibold text-brand-navy">{techList.length}</strong> 项
            </span>
          </div>
        )}

        {activeRecord ? (
          <div className="grid gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info">{activeRecord.subkind ?? "核心技术路线"}</Tag>
              {activeRecord.code && <span className="code text-ink-muted">{activeRecord.code}</span>}
              <span className="caption text-ink-muted">统计观察期：{activeRecord.period ?? "2022–2026"}</span>
            </div>

            <h1 className="title-page text-ink">{activeRecord.title}</h1>
            <p className="body-lg text-ink-muted">{activeRecord.subtitle}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <h1 className="title-page text-ink">医疗器械核心技术路线比较</h1>
            <EmptyState
              title="未找到匹配当前检索词的技术路线"
              description="请清除关键词或切换品类查看 5.0 T 超高场全身超导磁共振等技术专题。"
              action={
                <Button variant="secondary" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
                  重置筛选
                </Button>
              }
            />
          </div>
        )}
      </div>

      {activeRecord && (
        <>
          {/* 第一节：工程瓶颈与物理工作原理 */}
          <section aria-labelledby="tech-principle-heading" className="grid gap-4">
            <SectionTitle level={2} as="h2" number="01">
              <span id="tech-principle-heading">工程瓶颈与工作原理</span>
            </SectionTitle>

            <div className="border-l-4 border-brand-red bg-surface-sunken px-5 py-4">
              <p className="body-lg text-ink">{workingPrinciple}</p>
            </div>

            <Descriptions
              columns={3}
              items={activeRecord.summary_fields.map((sf) => ({
                term: sf.label,
                value: sf.href ? (
                  sf.href.startsWith("http") ? (
                    <a
                      href={sf.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                    >
                      <span>{sf.value}</span>
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <TextLink to={sf.href} className="font-semibold">
                      {sf.value}
                    </TextLink>
                  )
                ) : (
                  sf.value
                ),
              }))}
            />
          </section>

          {/* 第二节：同领域技术路线横向对比 */}
          <section aria-labelledby="tech-comparison-heading" className="grid gap-4 border-t border-border pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1">
                <SectionTitle level={2} as="h2" number="02">
                  <span id="tech-comparison-heading">超导磁共振技术路线对比（5.0 T 全身超导 vs 3.0 T 大孔径超导）</span>
                </SectionTitle>
                <p className="body-sm text-ink-muted">
                  围绕场强、多源并行射频激发体制、全身临床覆盖能力与代表获批型号逐项对照。
                </p>
              </div>
              <TextLink to="/products?compare=umr-jupiter,umr-880" className="body-sm font-semibold">
                打开 uMR Jupiter 与 uMR 880 参数并排对比 →
              </TextLink>
            </div>

            <DataTable
              caption="超导磁共振核心技术路线对比表"
              columns={routeColumns}
              data={routeComparisons}
              getRowId={(r) => r.route}
            />
          </section>

          {/* 第三节：采用型号、临床投用与可展开原始审评标准证据 */}
          <section aria-labelledby="tech-evidence-heading" className="grid gap-5 border-t border-border pt-8">
            <SectionTitle level={2} as="h2" number="03">
              <span id="tech-evidence-heading">采用型号与原始审评标准依据</span>
            </SectionTitle>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid content-between gap-3 border border-border bg-surface p-5">
                <div className="grid gap-1">
                  <Tag size="sm" tone="info" className="w-fit">
                    5.0 T 超高场全身超导路线
                  </Tag>
                  <h3 className="title-sub text-brand-navy">
                    <TextLink to="/products/umr-jupiter">磁共振成像系统 · uMR Jupiter</TextLink>
                  </h3>
                  <p className="body-sm text-ink-muted">
                    上海联影医疗科技股份有限公司 · 8 通道全身体线圈多源并行发射 · 60 cm 孔径全身成像
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 body-sm">
                  <TextLink to="/products/umr-jupiter" className="font-semibold">
                    查看型号规格与证据 →
                  </TextLink>
                  <TextLink to="/regulation/registrations?q=国械注准20223061141">
                    国械注准20223061141
                  </TextLink>
                  <TextLink to="/markets?category=mri&region=陕西&period=2024">
                    公开采购记录
                  </TextLink>
                </div>
              </div>

              <div className="grid content-between gap-3 border border-border bg-surface p-5">
                <div className="grid gap-1">
                  <Tag size="sm" className="w-fit">
                    3.0 T 宽孔径超导对照路线
                  </Tag>
                  <h3 className="title-sub text-brand-navy">
                    <TextLink to="/products/umr-880">磁共振成像系统 · uMR 880</TextLink>
                  </h3>
                  <p className="body-sm text-ink-muted">
                    上海联影医疗科技股份有限公司 · 双源并行射频发射 · 70 cm 宽孔径临床与科研平台
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 body-sm">
                  <TextLink to="/products/umr-880" className="font-semibold">
                    查看型号规格与证据 →
                  </TextLink>
                  <TextLink to="/products?compare=umr-jupiter,umr-880">
                    与 uMR Jupiter 比较
                  </TextLink>
                </div>
              </div>
            </div>

            <details open className="border border-border bg-surface-sunken">
              <summary className="cursor-pointer border-b border-border px-5 py-3.5 title-nav text-brand-navy focus-ring">
                展开审评文件、强制性行业标准与原文定位（共 3 项一手依据）
              </summary>
              <div className="grid gap-3 px-5 py-4 body-sm text-ink">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="grid gap-0.5">
                    <span className="font-semibold text-ink">
                      1. CMDE 技术审评报告 CQZ2200057 第 4 页（5.0T 超导磁体与 8 通道射频结构核定）
                    </span>
                    <span className="caption text-ink-muted">
                      国家药品监督管理局医疗器械技术审评中心（CMDE）公开审评报告 · 关联证号 国械注准20223061141
                    </span>
                  </div>
                  <a
                    href="https://www.cmde.org.cn/directory/web/cmde/images/1663555209371083806.pdf#page=4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                  >
                    <span>打开 CMDE 审评报告第 4 页</span>
                    <IconExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="grid gap-0.5">
                    <span className="font-semibold text-ink">
                      2. YY 9706.233-2021《医用电气设备 第2-33部分：医疗诊断用磁共振设备的基本安全和基本性能专用要求》
                    </span>
                    <span className="caption text-ink-muted">
                      强制性医药行业标准 · 2023-05-01 正式实施 · 全部代替 YY 0319-2008（纠正历史误引 GB 9706.233-2020）
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <TextLink to="/standards?q=YY+9706.233-2021" className="font-semibold">
                      在平台标准库查看 YY 9706.233-2021 →
                    </TextLink>
                    <a
                      href="https://std.samr.gov.cn/hb/search/stdHBDetailed?id=BFEAFC933D0A5285E05397BE0A0A7BFB"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                    >
                      <span>全国标准信息公共服务平台</span>
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-0.5">
                    <span className="font-semibold text-ink">
                      3. 磁共振成像系统注册审查指导原则（2024 年修订版）
                    </span>
                    <span className="caption text-ink-muted">
                      国家药监局通告 2024 年第 18 号 · 明确比吸收率（SAR）控制与信噪比评价要求
                    </span>
                  </div>
                  <TextLink to="/regulation/registrations?subkind=guideline&q=磁共振" className="font-semibold">
                    查看审查指导原则记录 →
                  </TextLink>
                </div>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
