import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { IconArrowsLeftRight, IconExternalLink } from "@tabler/icons-react";
import {
  V2_SEED_CATALOG_RECORDS,
  type CatalogRecord,
  type ClinicalActivationItem,
  type ModelParameterItem,
  type UdiPackageSpec,
} from "@mdes/shared";
import {
  Breadcrumbs,
  Descriptions,
  EmptyState,
  SectionTitle,
  Tag,
  TextLink,
  type Crumb,
} from "@/components/itei";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCatalogDetail, useCatalogList } from "@/lib/api/queries";

const HS_LABELS: Record<string, string> = {
  "90181310": "成套的核磁共振成像装置",
  "90181390": "核磁共振成像装置的零件",
  "90189080": "内窥镜辅助手术设备（手术机器人）",
};

/**
 * 产品型号详情档案页（/products/:slug）：
 * 严格对齐《MDES全站页面改造设计记录.md》§4 线框与证据链闭环：
 * 面包屑（产品 / 医学影像 / 磁共振 / uMR Jupiter）→ 制造商与同品类对比按钮 →
 * 01 规格参数与组成（含可展开 UDI-DI 标识与包装层级）→ 02 技术路线 → 03 注册与准入（独立显示器审受理号）→
 * 04 采购记录 → 05 实际应用 → 06 进出口贸易关联。
 */
export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const detailQuery = useCatalogDetail("model", slug);
  const dealsQuery = useCatalogList({ kind: "market_deal" });

  const record = useMemo<CatalogRecord | undefined>(() => {
    if (detailQuery.data?.record) return detailQuery.data.record;
    if (!slug) return undefined;
    return V2_SEED_CATALOG_RECORDS.find((r) => r.kind === "model" && (r.slug === slug || r.id === slug));
  }, [detailQuery.data, slug]);

  const relatedDeals = useMemo<CatalogRecord[]>(() => {
    if (!record) return [];
    const fromApi = dealsQuery.data?.items ?? V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "market_deal");
    return fromApi.filter((d) => String(d.detail?.model_slug ?? "") === record.slug);
  }, [record, dealsQuery.data]);

  if (!record) {
    return (
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 py-10 md:px-8">
        <Breadcrumbs items={[{ label: "产品", href: "/products" }, { label: slug ?? "未知型号" }]} />
        <h1 className="title-page text-ink">未找到指定的产品型号档案</h1>
        <EmptyState
          title={`未收录标识为「${slug ?? ""}」的产品型号`}
          description="请返回产品型号库检索已核实的规格型号或通过注册证号查找关联型号。"
          action={
            <Button asChild variant="primary">
              <Link to="/products">返回产品型号库</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const d = record.detail ?? {};
  const manufacturerSlug = typeof d.manufacturer_slug === "string" ? d.manufacturer_slug : "";
  const manufacturerName = typeof d.manufacturer_name === "string" ? d.manufacturer_name : "—";
  const comparePeerSlug = typeof d.compare_peer_slug === "string" ? d.compare_peer_slug : "";
  const comparePeerLabel = typeof d.compare_peer_label === "string" ? d.compare_peer_label : "";
  const composition = Array.isArray(d.composition) ? (d.composition as string[]) : [];
  const parameters = Array.isArray(d.parameters) ? (d.parameters as ModelParameterItem[]) : [];
  const udiPackages = Array.isArray(d.udi_packages) ? (d.udi_packages as UdiPackageSpec[]) : [];
  const activations = Array.isArray(d.clinical_activations) ? (d.clinical_activations as ClinicalActivationItem[]) : [];
  const techRouteSlug = typeof d.tech_route_slug === "string" ? d.tech_route_slug : "";
  const techRouteTitle = typeof d.tech_route_title === "string" ? d.tech_route_title : "";
  const certNo = typeof d.cert_no === "string" ? d.cert_no : "";
  const reviewAcceptanceNo = typeof d.review_acceptance_no === "string" ? d.review_acceptance_no : "";
  const reviewReportUrl = typeof d.review_report_url === "string" ? d.review_report_url : (record.source_url ?? "");
  const standardCode = typeof d.standard_code === "string" ? d.standard_code : "";
  const hsCodes = Array.isArray(d.hs_codes) ? (d.hs_codes as string[]) : [];

  const breadcrumbs: Crumb[] =
    record.category === "mri"
      ? [
          { label: "产品", href: "/products" },
          { label: "医学影像", href: "/products?category=mri" },
          { label: "磁共振", href: "/markets?category=mri" },
          { label: record.code ?? record.title },
        ]
      : [
          { label: "产品", href: "/products" },
          { label: "有源手术器械", href: "/products?category=surgical-robot" },
          { label: "手术机器人", href: "/markets?category=surgical-robot" },
          { label: record.code ?? record.title },
        ];

  const primaryParam = parameters[0];

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 头部：面包屑 + 法定品名与型号 + 制造商跳转 + 同品类比较按钮 */}
      <header className="grid gap-4 border-b border-border pb-6">
        <Breadcrumbs items={breadcrumbs} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {record.subkind && <Tag tone="info">{record.subkind}</Tag>}
              {certNo && (
                <TextLink
                  to={`/regulation/registrations?q=${encodeURIComponent(certNo)}`}
                  className="code font-semibold"
                >
                  {certNo}
                </TextLink>
              )}
              {reviewAcceptanceNo && <Tag size="sm">受理号 {reviewAcceptanceNo}</Tag>}
            </div>

            <h1 className="title-page text-ink">{record.title}</h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 body">
              <span className="text-ink-muted">制造企业：</span>
              {manufacturerSlug ? (
                <TextLink to={`/enterprises/${encodeURIComponent(manufacturerSlug)}`} className="font-semibold">
                  {manufacturerName} → 企业档案
                </TextLink>
              ) : (
                <span className="font-semibold text-ink">{manufacturerName}</span>
              )}
            </div>

            {primaryParam && (
              <div className="flex flex-wrap items-center gap-3 body-sm text-ink">
                <span className="font-semibold text-brand-navy">{primaryParam.value}</span>
                {primaryParam.source_url && (
                  <a
                    href={primaryParam.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-ring"
                  >
                    <span>[{primaryParam.source_label}]</span>
                    <IconExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {comparePeerSlug && comparePeerLabel && (
              <Button asChild variant="secondary">
                <Link to={`/products?compare=${encodeURIComponent(record.slug)},${encodeURIComponent(comparePeerSlug)}`}>
                  <IconArrowsLeftRight aria-hidden="true" />
                  与 {comparePeerLabel} 比较
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 模块 1：规格参数与组成（含可展开 UDI-DI 标识与包装层级） */}
      <section aria-labelledby="model-specs-heading" className="grid gap-5">
        <SectionTitle level={2} as="h2" number="01">
          <span id="model-specs-heading">规格参数与组成</span>
        </SectionTitle>

        {composition.length > 0 && (
          <div className="border border-border bg-surface-sunken px-4 py-3 body-sm text-ink">
            <span className="font-semibold text-brand-navy">核心系统组成：</span>
            <span>{composition.join(" → ")}</span>
          </div>
        )}

        <Table>
          <TableCaption className="sr-only">{record.title}技术规格参数与核验出处表</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">规格参数项</TableHead>
              <TableHead>核定参数值（含单位）</TableHead>
              <TableHead className="w-72">权威核验出处与页码</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parameters.map((param) => (
              <TableRow key={param.key}>
                <TableCell className="font-semibold text-ink">{param.label}</TableCell>
                <TableCell className="font-semibold text-brand-navy">
                  {param.key === "safety_standard" ? (
                    <TextLink to={`/standards?q=${encodeURIComponent(param.value)}`} className="code font-semibold">
                      {param.value}
                    </TextLink>
                  ) : (
                    param.value
                  )}
                </TableCell>
                <TableCell>
                  {param.source_url ? (
                    <a
                      href={param.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
                    >
                      <span>{param.source_label}</span>
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="body-sm text-ink-muted">{param.source_label}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {udiPackages.length > 0 && (
          <details open className="border border-border bg-surface">
            <summary className="cursor-pointer border-b border-border bg-surface-sunken px-4 py-3 title-nav text-brand-navy focus-ring">
              UDI-DI 标识与包装层级（共 {udiPackages.length} 条包装赋码记录，规格内展开）
            </summary>
            <div className="p-4">
              <Table dense>
                <TableCaption className="sr-only">UDI-DI 包装标识层级明细表</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">产品标识（UDI-DI）</TableHead>
                    <TableHead className="w-60">包装层级</TableHead>
                    <TableHead className="w-28 text-right">单包内含数量</TableHead>
                    <TableHead>包装规格说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {udiPackages.map((u) => (
                    <TableRow key={u.udi_di}>
                      <TableCell className="code font-semibold text-brand-navy">{u.udi_di}</TableCell>
                      <TableCell>{u.package_level}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.quantity_per_pack}</TableCell>
                      <TableCell className="text-ink-muted">{u.spec_note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
      </section>

      {/* 模块 2 & 3：技术路线 + 注册与准入（桌面双栏对照，手机顺读） */}
      <div className="grid gap-8 border-t border-border pt-8 lg:grid-cols-2">
        {/* 模块 2：技术路线 */}
        <section aria-labelledby="model-tech-heading" className="grid content-start gap-4">
          <SectionTitle level={2} as="h2" number="02">
            <span id="model-tech-heading">技术路线</span>
          </SectionTitle>
          <Descriptions
            columns={1}
            items={[
              {
                term: "采用核心技术路线",
                value: techRouteSlug ? (
                  <TextLink to={`/technologies/${encodeURIComponent(techRouteSlug)}`} className="font-semibold">
                    {techRouteTitle || techRouteSlug} → 技术路线说明
                  </TextLink>
                ) : (
                  "主从遥操作微创外科机械臂与三维内窥镜立体视觉技术"
                ),
              },
              {
                term: "执行专用安全标准",
                value: standardCode ? (
                  <TextLink to={`/standards?q=${encodeURIComponent(standardCode)}`} className="code font-semibold">
                    {standardCode}（强制性医药行业标准） → 标准登记详情
                  </TextLink>
                ) : (
                  <TextLink to="/standards?q=GB+9706.1-2020" className="code font-semibold">
                    GB 9706.1-2020（医用电气通用安规）
                  </TextLink>
                ),
              },
            ]}
          />
        </section>

        {/* 模块 3：注册与准入（独立展示器审受理号） */}
        <section aria-labelledby="model-reg-heading" className="grid content-start gap-4">
          <SectionTitle level={2} as="h2" number="03">
            <span id="model-reg-heading">注册与准入</span>
          </SectionTitle>
          <Descriptions
            columns={1}
            items={[
              {
                term: "关联医疗器械注册证",
                value: certNo ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <TextLink
                      to={`/regulation/registrations?q=${encodeURIComponent(certNo)}`}
                      className="code font-semibold"
                    >
                      {certNo} → 证书记录
                    </TextLink>
                    <TextLink to={`/products?cert=${encodeURIComponent(certNo)}`} className="caption">
                      查看同证覆盖型号 →
                    </TextLink>
                  </div>
                ) : (
                  "—"
                ),
              },
              {
                term: "器审受理号",
                value: reviewAcceptanceNo ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="code font-semibold text-brand-navy">{reviewAcceptanceNo}</span>
                    {reviewReportUrl && (
                      <a
                        href={reviewReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
                      >
                        <span>CMDE 技术审评报告（{record.source_page ?? "原文"}）</span>
                        <IconExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ) : (
                  "按常规或延续注册批件公开范围列示"
                ),
              },
            ]}
          />
        </section>
      </div>

      {/* 模块 4：采购记录 */}
      <section aria-labelledby="model-deals-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2" number="04">
              <span id="model-deals-heading">采购记录</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              经公立医院或政府采购网成交结果公告逐笔核实的招采标的记录。
            </p>
          </div>
          {record.category === "mri" && (
            <TextLink to="/markets?category=mri&region=陕西&period=2024" className="body-sm font-semibold">
              在磁共振市场样本中查看陕西 2024 年记录 →
            </TextLink>
          )}
        </div>

        {relatedDeals.length === 0 ? (
          <p className="border border-border bg-surface-sunken px-4 py-3 body-sm text-ink-muted">
            当前型号暂未绑定单笔公开招采公告样本；可前往{" "}
            <TextLink to={`/markets${record.category ? `?category=${encodeURIComponent(record.category)}` : ""}`}>
              品类市场监测
            </TextLink>{" "}
            浏览全品类招采数据。
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {relatedDeals.map((deal) => {
              const dd = deal.detail ?? {};
              const buyer = typeof dd.buyer === "string" ? dd.buyer : deal.title;
              const pCode = typeof dd.project_code === "string" ? dd.project_code : (deal.code ?? "");
              const annDate = typeof dd.announcement_date === "string" ? dd.announcement_date : (deal.period ?? "");
              const qty = typeof dd.quantity === "number" ? dd.quantity : 1;
              const qtyUnit = typeof dd.quantity_unit === "string" ? dd.quantity_unit : "套";
              const amt = typeof dd.total_amount_cny_wan === "number" ? dd.total_amount_cny_wan : null;
              const currency = typeof dd.currency === "string" ? dd.currency : "人民币";
              const annUrl = typeof dd.announcement_url === "string" ? dd.announcement_url : (deal.source_url ?? "");

              return (
                <li key={deal.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2 body">
                      <span className="font-semibold text-ink">{buyer}</span>
                      <span className="code text-brand-navy">{pCode}</span>
                      <span className="caption text-ink-muted">· {annDate}</span>
                    </div>
                    <p className="body-sm text-ink">
                      成交数量与金额：
                      <strong className="ml-1 font-semibold tabular-nums text-brand-navy">
                        {qty} {qtyUnit} · {amt !== null ? `${currency} ${amt.toLocaleString("zh-CN")} 万元` : "见原公告"}
                      </strong>
                    </p>
                  </div>

                  {annUrl && (
                    <a
                      href={annUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
                    >
                      <span>{deal.source_title}</span>
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 模块 5：实际应用（与采购中标记录严格分离） */}
      <section aria-labelledby="model-activations-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="grid gap-1">
          <SectionTitle level={2} as="h2" number="05">
            <span id="model-activations-heading">实际应用</span>
          </SectionTitle>
          <p className="body-sm text-ink-muted">
            记录医疗机构或地方卫生健康行政部门公开发布的设备装机启用信息（与招采成交日期分列）。
          </p>
        </div>

        {activations.length === 0 ? (
          <p className="border border-border bg-surface-sunken px-4 py-3 body-sm text-ink-muted">
            暂未收录经政府或公立医院官方通告核实的开机启用事件。
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {activations.map((act) => (
              <li key={`${act.hospital}-${act.activated_date}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2 body">
                    <Tag size="sm" tone="success">
                      正式开机启用
                    </Tag>
                    <span className="font-semibold text-ink">{act.hospital}</span>
                    <span className="caption text-ink-muted">（{act.city}）</span>
                  </div>
                  <p className="body-sm text-ink">
                    {act.activated_date} 正式启用（{act.notice_date} 卫健局公告） · {act.summary}
                  </p>
                </div>

                <a
                  href={act.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
                >
                  <span>{act.source_title}</span>
                  <IconExternalLink size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 模块 6：进出口贸易关联 */}
      <section aria-labelledby="model-trade-heading" className="grid gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2" number="06">
              <span id="model-trade-heading">进出口贸易关联</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              关联《中国海关统计商品目录（202601 版）》对应整机及专用零件 8 位 HS 编码（注：海关税号不区分场强与单一品牌）。
            </p>
          </div>
          {record.category === "mri" && (
            <TextLink to="/statistics/STAT-TRD-MRI-HS8" className="body-sm font-semibold">
              查看磁共振整机与零件进口对账统计（STAT-TRD-MRI-HS8） →
            </TextLink>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {hsCodes.map((hs) => (
            <div key={hs} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-3.5">
              <div className="grid gap-0.5">
                <span className="code font-semibold text-brand-navy">HS {hs}</span>
                <span className="body-sm text-ink">{HS_LABELS[hs] ?? "医疗器械相关海关商品编码"}</span>
              </div>
              <TextLink to={`/trade?q=${encodeURIComponent(hs)}`} className="body-sm font-semibold">
                进入进出口贸易查询 →
              </TextLink>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
