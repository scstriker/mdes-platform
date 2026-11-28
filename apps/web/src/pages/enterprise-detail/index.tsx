import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { IconExternalLink } from "@tabler/icons-react";
import {
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogRecord,
} from "@mdes/shared";
import {
  Breadcrumbs,
  Descriptions,
  EmptyState,
  Notice,
  SectionTitle,
  Tag,
  TextLink,
} from "@/components/itei";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { useCatalogDetail, useCatalogList, useStatisticDetail } from "@/lib/api/queries";

type ProductLineSpec = {
  name: string;
  models: { slug: string; label: string }[];
};

type EvidenceDocSpec = {
  title: string;
  page: string;
  url: string;
};

const MODULE_ANCHORS = [
  { no: "01", id: "mod-profile", label: "企业概况" },
  { no: "02", id: "mod-operations", label: "经营情况" },
  { no: "03", id: "mod-segments", label: "业务结构" },
  { no: "04", id: "mod-rd", label: "研发投入" },
  { no: "05", id: "mod-products", label: "产品线与代表型号" },
  { no: "06", id: "mod-innovation", label: "创新能力" },
  { no: "07", id: "mod-global", label: "国际化布局" },
  { no: "08", id: "mod-evidence", label: "原始财报与公告证据" },
] as const;

function findSeedStat(id: string) {
  return V2_SEED_STATISTICS.find((s) => s.statistic_id === id)!;
}

/**
 * 企业深度研究专题页（/enterprises/:slug）：
 * 完整承载 8 大标准研究模块：
 * 01 企业概况 · 02 经营情况 · 03 业务结构 · 04 研发投入 · 05 产品线与代表型号 · 06 创新能力 · 07 国际化布局 · 08 原始财报与公告证据。
 */
export default function EnterpriseDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const detailQuery = useCatalogDetail("enterprise", slug);
  const modelsQuery = useCatalogList({ kind: "model" });

  const isUnitedImaging = slug === "united-imaging";
  const uihSegmentsQuery = useStatisticDetail("STAT-ENT-UIH-SEGMENTS", undefined, isUnitedImaging);
  const uihRdQuery = useStatisticDetail("STAT-ENT-UIH-RD-RATIO", undefined, isUnitedImaging);
  const benchmarkQuery = useStatisticDetail("STAT-ENT-IMAGING-BENCHMARK");

  const record = useMemo<CatalogRecord | undefined>(() => {
    if (detailQuery.data?.record) return detailQuery.data.record;
    if (!slug) return undefined;
    return V2_SEED_CATALOG_RECORDS.find((r) => r.kind === "enterprise" && (r.slug === slug || r.id === slug));
  }, [detailQuery.data, slug]);

  const enterpriseModels = useMemo<CatalogRecord[]>(() => {
    if (!record) return [];
    const pool = modelsQuery.data?.items ?? V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "model");
    return pool.filter((m) => String(m.detail?.manufacturer_slug ?? "") === record.slug);
  }, [record, modelsQuery.data]);

  const uihSegmentsStat = uihSegmentsQuery.data?.statistic ?? findSeedStat("STAT-ENT-UIH-SEGMENTS");
  const uihRdStat = uihRdQuery.data?.statistic ?? findSeedStat("STAT-ENT-UIH-RD-RATIO");
  const benchmarkStat = benchmarkQuery.data?.statistic ?? findSeedStat("STAT-ENT-IMAGING-BENCHMARK");

  if (!record) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
        <Breadcrumbs items={[{ label: "企业", href: "/enterprises" }, { label: slug ?? "未知企业" }]} />
        <h1 className="title-page text-ink">未找到指定的企业研究档案</h1>
        <EmptyState
          title={`未收录标识为「${slug ?? ""}」的企业主体`}
          description="请返回企业主体库按证券代码、企业简称或省市检索重点医疗器械企业。"
          action={
            <Button asChild variant="primary">
              <Link to="/enterprises">返回企业主体库</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const d = record.detail ?? {};
  const uscc = typeof d.uscc === "string" ? d.uscc : "见工商及证券定期报告披露";
  const board = typeof d.board === "string" ? d.board : (record.subkind ?? "上市医疗器械企业");
  const disclosureScope =
    typeof d.disclosure_scope === "string" ? d.disclosure_scope : `${record.title}合并财务报表（2025 年度经审计）`;
  const rev2025 = typeof d.revenue_2025_cny_100m === "number" ? d.revenue_2025_cny_100m : null;
  const rd2025 = typeof d.rd_ratio_2025_pct === "number" ? d.rd_ratio_2025_pct : null;
  const rd2024 = typeof d.rd_ratio_2024_pct === "number" ? d.rd_ratio_2024_pct : null;
  const ovs2025 = typeof d.overseas_ratio_2025_pct === "number" ? d.overseas_ratio_2025_pct : null;
  const certsCount = typeof d.class3_certs_count === "number" ? d.class3_certs_count : null;
  const productLines = Array.isArray(d.product_lines) ? (d.product_lines as ProductLineSpec[]) : [];
  const evidenceDocs = Array.isArray(d.evidence_docs) ? (d.evidence_docs as EvidenceDocSpec[]) : [];

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 头部：面包屑、企业全称、证券代码与 8 大研究模块锚点导航 */}
      <header className="grid gap-5 border-b border-border pb-6">
        <Breadcrumbs
          items={[
            { label: "企业", href: "/enterprises" },
            { label: board, href: record.subkind ? `/enterprises?group=${encodeURIComponent(record.subkind)}` : "/enterprises" },
            { label: record.title },
          ]}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {record.code && <span className="code font-semibold text-brand-navy">{record.code}</span>}
              <Tag tone="info">{board}</Tag>
              {record.tags.includes("champion") && <Tag tone="info">国家级制造业单项冠军</Tag>}
              {record.region && <Tag>{record.region}</Tag>}
            </div>

            <h1 className="title-page text-ink">{record.title}</h1>
            <p className="body text-ink-muted">{record.subtitle}</p>
          </div>

          <Button asChild variant="secondary" size="sm">
            <Link to={`/enterprises?compare=${encodeURIComponent(record.slug)},mindray,sonoscape`}>
              与同业龙头横向对标 →
            </Link>
          </Button>
        </div>

        <nav aria-label="企业八模块目录导航" className="flex flex-wrap gap-2 border-t border-border pt-4">
          {MODULE_ANCHORS.map((m) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className="border border-border bg-surface-sunken px-3 py-1.5 caption font-semibold text-ink hover:border-brand-navy hover:text-brand-navy focus-ring"
            >
              <span className="mr-1 text-brand-navy">{m.no}</span>
              {m.label}
            </a>
          ))}
        </nav>
      </header>

      {/* 01 企业概况 */}
      <section id="mod-profile" aria-labelledby="mod-profile-heading" className="grid gap-4">
        <SectionTitle level={2} as="h2" number="01">
          <span id="mod-profile-heading">企业概况</span>
        </SectionTitle>

        <Descriptions
          columns={2}
          items={[
            { term: "法定披露主体全称", value: record.title },
            { term: "统一社会信用代码", value: <span className="code">{uscc}</span> },
            { term: "证券代码与上市板块", value: `${record.code ?? "—"} · ${board}` },
            { term: "总部与注册区域", value: record.region ?? "—" },
            { term: "统计基准期", value: record.period ?? "2025 年报" },
            { term: "财务统计合并披露范围", value: disclosureScope },
          ]}
        />
      </section>

      {/* 02 经营情况 */}
      <section id="mod-operations" aria-labelledby="mod-operations-heading" className="grid gap-4 border-t border-border pt-8">
        <SectionTitle level={2} as="h2" number="02">
          <span id="mod-operations-heading">经营情况</span>
        </SectionTitle>

        <div className="grid grid-cols-2 border-t-2 border-t-brand-navy border-b border-border bg-surface md:grid-cols-4 md:divide-x md:divide-border">
          <div className="grid gap-1 px-4 py-4">
            <span className="label text-ink-muted">2025 合并营业收入</span>
            <p className="numeral tabular-nums text-brand-navy">
              {rev2025 !== null ? rev2025.toFixed(1) : "—"}
              <span className="ml-1 body-sm font-normal text-ink-muted">亿元</span>
            </p>
            <span className="caption text-ink-muted">经审计合并利润表口径</span>
          </div>

          <div className="grid gap-1 px-4 py-4">
            <span className="label text-ink-muted">2025 研发投入占比</span>
            <p className="numeral tabular-nums text-brand-navy">
              {rd2025 !== null ? `${rd2025.toFixed(2)}%` : "—"}
            </p>
            <span className="caption text-ink-muted">
              {rd2024 !== null ? `2024 年为 ${rd2024.toFixed(2)}%` : "研发投入总额 ÷ 营业收入"}
            </span>
          </div>

          <div className="grid gap-1 px-4 py-4">
            <span className="label text-ink-muted">2025 境外营业收入占比</span>
            <p className="numeral tabular-nums text-brand-navy">
              {ovs2025 !== null ? `${ovs2025.toFixed(2)}%` : "—"}
            </p>
            <span className="caption text-ink-muted">合并报表分地区收入口径</span>
          </div>

          <div className="grid gap-1 px-4 py-4">
            <span className="label text-ink-muted">境内三类有效注册证</span>
            <p className="numeral tabular-nums text-brand-navy">
              {certsCount !== null ? certsCount.toLocaleString("zh-CN") : "—"}
              <span className="ml-1 body-sm font-normal text-ink-muted">件</span>
            </p>
            <span className="caption text-ink-muted">集团境内持证存量</span>
          </div>
        </div>
      </section>

      {/* 03 业务结构 */}
      <section id="mod-segments" aria-labelledby="mod-segments-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="grid gap-1">
          <SectionTitle level={2} as="h2" number="03">
            <span id="mod-segments-heading">业务结构</span>
          </SectionTitle>
          <p className="body-sm text-ink-muted">
            {record.slug === "united-imaging"
              ? "依据联影医疗 2025 年年度报告正文第 34 页「主营业务分产品情况表」整理，支持切换分线营收额与构成占比。"
              : "聚焦医疗器械制造核心业务分部，并与代表性上市医疗装备龙头进行研发与全球化横向对照。"}
          </p>
        </div>

        {record.slug === "united-imaging" ? (
          <StatisticFigure
            id="fig-ent-uih-segments"
            eyebrow="企业业务分部演变 · STAT-ENT-UIH-SEGMENTS"
            statistic={uihSegmentsStat}
            height={288}
          />
        ) : (
          <StatisticFigure
            id="fig-ent-peer-benchmark"
            eyebrow="上市医疗装备龙头横向对标 · STAT-ENT-IMAGING-BENCHMARK"
            statistic={benchmarkStat}
            height={288}
          />
        )}
      </section>

      {/* 04 研发投入 */}
      <section id="mod-rd" aria-labelledby="mod-rd-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2" number="04">
              <span id="mod-rd-heading">研发投入</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              {record.slug === "united-imaging"
                ? "2025 年研发投入占营业收入比例为 18.99%，2024 年为 21.95%（同比回落 2.96 个百分点），数据定位至 2025 年年度报告正文第 87 页。"
                : `2025 年度研发投入总额占合并营业收入比例为 ${rd2025 !== null ? `${rd2025.toFixed(2)}%` : "—"}。`}
            </p>
          </div>

          {record.slug === "united-imaging" && record.source_url && (
            <a
              href={record.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
            >
              <span>核查 2025 年年度报告正文第 87 页（研发投入情况表）</span>
              <IconExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </div>

        {record.slug === "united-imaging" ? (
          <StatisticFigure
            id="fig-ent-uih-rd-ratio"
            eyebrow="企业研发强度序列 · STAT-ENT-UIH-RD-RATIO"
            statistic={uihRdStat}
            height={276}
          />
        ) : (
          <Descriptions
            columns={2}
            items={[
              { term: "2025 研发投入占营收比例", value: rd2025 !== null ? `${rd2025.toFixed(2)}%` : "—" },
              {
                term: "关联横向对标统计",
                value: <TextLink to="/statistics/STAT-ENT-IMAGING-BENCHMARK">STAT-ENT-IMAGING-BENCHMARK →</TextLink>,
              },
            ]}
          />
        )}
      </section>

      {/* 05 产品线与代表型号 */}
      <section id="mod-products" aria-labelledby="mod-products-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2" number="05">
              <span id="mod-products-heading">产品线与代表型号</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              点击具体产品型号可查阅审评核定参数、UDI-DI 包装层级、公开招采记录与临床开机应用。
            </p>
          </div>
          <TextLink to={`/products?enterprise=${encodeURIComponent(record.slug)}`} className="body-sm font-semibold">
            在产品型号库筛选本企业全部型号 →
          </TextLink>
        </div>

        {productLines.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {productLines.map((line) => (
              <li key={line.name} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <span className="font-semibold text-ink">{line.name}</span>
                <div className="flex flex-wrap items-center gap-3 body-sm">
                  {line.models.length > 0 ? (
                    line.models.map((m) => (
                      <TextLink key={m.slug} to={`/products/${encodeURIComponent(m.slug)}`} className="font-semibold">
                        {m.label} →
                      </TextLink>
                    ))
                  ) : (
                    <span className="caption text-ink-muted">产线在售系列覆盖</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : enterpriseModels.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {enterpriseModels.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <div className="grid gap-0.5">
                  <TextLink to={`/products/${encodeURIComponent(m.slug)}`} className="font-semibold text-brand-navy">
                    {m.title}
                  </TextLink>
                  <span className="caption text-ink-muted">{m.subtitle}</span>
                </div>
                <TextLink to={`/products/${encodeURIComponent(m.slug)}`} className="body-sm font-semibold">
                  查看型号证据链 →
                </TextLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border border-border bg-surface-sunken px-4 py-3 body-sm text-ink-muted">
            主营产品范围：{record.summary_fields.find((f) => f.label.includes("主营"))?.value ?? record.subtitle}
          </p>
        )}
      </section>

      {/* 06 创新能力 */}
      <section id="mod-innovation" aria-labelledby="mod-innovation-heading" className="grid gap-4 border-t border-border pt-8">
        <SectionTitle level={2} as="h2" number="06">
          <span id="mod-innovation-heading">创新能力与注册准入</span>
        </SectionTitle>

        <Descriptions
          columns={2}
          items={[
            {
              term: "境内第三类有效注册证存量",
              value: certsCount !== null ? `${certsCount} 件（国家药监局注册证有效存量）` : "见注册与准入库",
            },
            {
              term: "代表性创新准入批件",
              value:
                record.slug === "united-imaging" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <TextLink
                      to="/regulation/registrations?q=国械注准20223061141"
                      className="code font-semibold"
                    >
                      国械注准20223061141
                    </TextLink>
                    <span className="caption text-ink-muted">（器审受理号 CQZ2200057 · 5.0T 超导磁共振）</span>
                  </div>
                ) : record.slug === "microport" ? (
                  <TextLink
                    to="/regulation/registrations?q=国械注准20223010108"
                    className="code font-semibold"
                  >
                    国械注准20223010108（图迈腹腔内窥镜手术系统）
                  </TextLink>
                ) : (
                  <TextLink to={`/regulation/registrations?q=${encodeURIComponent(record.title)}`}>
                    在注册与准入库查询关联批件 →
                  </TextLink>
                ),
            },
            {
              term: "关联核心技术路线",
              value:
                record.slug === "united-imaging" ? (
                  <TextLink to="/technologies/ultra-high-field-5t-mri" className="font-semibold">
                    5.0 T 全身超导磁共振与 8 通道并行射频发射技术 →
                  </TextLink>
                ) : (
                  <TextLink to="/technologies">浏览医疗装备核心技术路线 →</TextLink>
                ),
            },
            {
              term: "执行专用安全标准",
              value:
                record.slug === "united-imaging" ? (
                  <TextLink to="/standards?q=YY+9706.233-2021" className="code font-semibold">
                    YY 9706.233-2021
                  </TextLink>
                ) : (
                  <TextLink to="/standards?q=GB+9706.1-2020" className="code font-semibold">
                    GB 9706.1-2020
                  </TextLink>
                ),
            },
          ]}
        />
      </section>

      {/* 07 国际化布局（显式区分年报境外收入与海关出口报关口径） */}
      <section id="mod-global" aria-labelledby="mod-global-heading" className="grid gap-4 border-t border-border pt-8">
        <SectionTitle level={2} as="h2" number="07">
          <span id="mod-global-heading">国际化布局</span>
        </SectionTitle>

        <Descriptions
          columns={2}
          items={[
            {
              term: "2025 年境外营业收入占比",
              value: ovs2025 !== null ? `${ovs2025.toFixed(2)}%（${disclosureScope}分地区附注口径）` : "见年度报告分地区披露",
            },
            {
              term: "海关跨境货物贸易对照入口",
              value: (
                <div className="flex flex-wrap items-center gap-3">
                  <TextLink to="/trade" className="font-semibold">
                    进入进出口贸易监测 →
                  </TextLink>
                  {record.category === "mri" && <TextLink to="/trade?q=90181310">HS 90181310 磁共振整机</TextLink>}
                </div>
              ),
            },
          ]}
        />

        <Notice tone="warning" title="统计边界警示：企业年报「境外营业收入」不等同于海关「出口报关金额」">
          上市公司合并财务报表中的「境外营业收入」按客户归属地核算，包含境外子公司本地化生产销售、装机软件许可与长期维保服务收入；而海关进出口贸易库（
          <TextLink to="/trade" inline>
            /trade
          </TextLink>
          ）统计的是跨越中国大陆关境的货物清关报关金额。两项指标口径独立，严禁直接相除或混同。
        </Notice>
      </section>

      {/* 08 原始财报与公告证据 */}
      <section id="mod-evidence" aria-labelledby="mod-evidence-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle level={2} as="h2" number="08">
            <span id="mod-evidence-heading">原始财报与公告证据</span>
          </SectionTitle>
          <TextLink to="/sources" className="body-sm font-semibold">
            打开官方来源与年报索引库 →
          </TextLink>
        </div>

        <ul className="divide-y divide-border border-y border-border">
          {evidenceDocs.length > 0 ? (
            evidenceDocs.map((doc) => (
              <li key={doc.title} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="grid gap-0.5">
                  <span className="font-semibold text-ink">{doc.title}</span>
                  <span className="caption text-ink-muted">原文核验定位：{doc.page}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 body-sm">
                  <TextLink to="/sources?q=688271-AR-2025" className="font-semibold">
                    平台来源档案
                  </TextLink>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                  >
                    <span>打开原始年报 PDF（定位第 87 页）</span>
                    <IconExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              </li>
            ))
          ) : (
            <li className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="grid gap-0.5">
                <span className="font-semibold text-ink">{record.source_title}</span>
                <span className="caption text-ink-muted">证券交易所定期报告法定信息披露文件</span>
              </div>
              <TextLink to="/statistics/STAT-ENT-IMAGING-BENCHMARK" className="body-sm font-semibold">
                查看关联对标统计与来源说明 →
              </TextLink>
            </li>
          )}

          {record.slug === "united-imaging" && (
            <li className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="grid gap-0.5">
                <span className="font-semibold text-ink">
                  引用本企业研发数据的 MDES 出版物：《中国高端医学影像装备运行监测与磁共振产业链专题报告（2026 年第 3 期）》
                </span>
                <span className="caption text-ink-muted">
                  第一章永久锁定 STAT-ENT-UIH-RD-RATIO@2026.06.1 快照（18.99%）
                </span>
              </div>
              <TextLink to="/reports/mdes-2026q3-high-end-imaging-report" className="body-sm font-semibold">
                阅读报告对应章节 →
              </TextLink>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
