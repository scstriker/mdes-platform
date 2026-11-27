import { useMemo } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import { IconArrowsLeftRight, IconExternalLink, IconRotate, IconX } from "@tabler/icons-react";
import {
  matchesQuery,
  V2_SEED_CATALOG_RECORDS,
  type CatalogRecord,
  type ModelParameterItem,
  type UdiPackageSpec,
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { controlClass } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCatalogList } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "全部品类" },
  { value: "mri", label: "磁共振成像 (mri)" },
  { value: "surgical-robot", label: "手术机器人 (surgical-robot)" },
] as const;

const ENTERPRISE_FILTER_OPTIONS = [
  { value: "", label: "全部生产企业" },
  { value: "united-imaging", label: "上海联影医疗科技股份有限公司" },
  { value: "microport", label: "上海微创医疗机器人（集团）股份有限公司" },
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  mri: "医学影像 · 磁共振",
  "surgical-robot": "有源手术 · 手术机器人",
};

function getModelParameters(rec: CatalogRecord): ModelParameterItem[] {
  const raw = rec.detail?.parameters;
  return Array.isArray(raw) ? (raw as ModelParameterItem[]) : [];
}

function getModelUdiPackages(rec: CatalogRecord): UdiPackageSpec[] {
  const raw = rec.detail?.udi_packages;
  return Array.isArray(raw) ? (raw as UdiPackageSpec[]) : [];
}

function renderParamSource(param: ModelParameterItem | undefined) {
  if (!param) return null;
  if (param.key === "safety_standard" && param.value.includes("9706")) {
    return (
      <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
        <TextLink to={`/standards?q=${encodeURIComponent(param.value)}`} className="font-semibold">
          平台标准详情（{param.value}）
        </TextLink>
        {param.source_url && (
          <a
            href={param.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-link hover:underline focus-ring"
          >
            <span>{param.source_label}</span>
            <IconExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }
  if (param.source_url) {
    return (
      <a
        href={param.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
      >
        <span>{param.source_label}</span>
        <IconExternalLink size={12} aria-hidden="true" />
      </a>
    );
  }
  return <span className="caption text-ink-muted">{param.source_label}</span>;
}

/**
 * 产品型号目录与同品类双型号对比页（/products）：
 * - 旧准入通道书签（?channel=reg|innov|priority）平滑导向 /regulation/registrations；?channel=udi 留在本页展开包装标识；
 * - 严格按「一行一个产品型号」建档（如筛选国械注准20223061141 精确返回 uMR Jupiter 与 uMR 880 共 2 个型号，UDI 包装层级内折）；
 * - 支持勾选同品类任意 2 个型号或通过 ?compare=umr-jupiter,umr-880 打开逐参数及出处并排比较（桌面分列、手机按参数纵排成对展示）。
 */
export default function ProductsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const channel = searchParams.get("channel") ?? "";
  const rawQ = searchParams.get("q") ?? "";
  const trimmedQ = rawQ.trim();
  const category = searchParams.get("category") ?? "";
  const enterprise = searchParams.get("enterprise") ?? "";
  const cert = searchParams.get("cert")?.trim() ?? "";
  const compareRaw = searchParams.get("compare") ?? "";

  // 旧书签平滑迁移：注册、创新、优先审批转入注册与准入库；旧趋势图锚点转入对应单项统计
  if (channel === "reg" || channel === "innov" || channel === "priority") {
    const targetParams = new URLSearchParams();
    targetParams.set("channel", channel);
    if (trimmedQ) targetParams.set("q", trimmedQ);
    return <Navigate to={`/regulation/registrations?${targetParams.toString()}`} replace />;
  }
  if (location.hash === "#fig-products-trend" || trimmedQ === "第三类首次注册") {
    return <Navigate to="/statistics/STAT-REG-CLASS3-TREND" replace />;
  }
  if (location.hash === "#fig-products-tracks") {
    return <Navigate to="/statistics/STAT-REG-PROVINCE-STOCK" replace />;
  }

  const udiViewActive = channel === "udi";

  const selectedCompareSlugs = useMemo(
    () =>
      compareRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2),
    [compareRaw],
  );

  const combinedApiQuery = [cert, trimmedQ].filter(Boolean).join(" ").trim();

  const listQuery = useCatalogList({
    kind: "model",
    category: category || undefined,
    q: combinedApiQuery || undefined,
  });

  // 全量型号池用于渲染 ?compare= 双型号对照，不受局部搜索词隐藏影响
  const allModelsQuery = useCatalogList({ kind: "model" });

  const allModels = useMemo<CatalogRecord[]>(() => {
    if (allModelsQuery.data && allModelsQuery.data.items.length > 0) {
      return allModelsQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((r) => r.kind === "model");
  }, [allModelsQuery.data]);

  const filteredModels = useMemo<CatalogRecord[]>(() => {
    const base = listQuery.data
      ? listQuery.data.items
      : V2_SEED_CATALOG_RECORDS.filter((r) => {
          if (r.kind !== "model") return false;
          if (category && r.category !== category) return false;
          if (combinedApiQuery) {
            const hay = `${r.id} ${r.slug} ${r.title} ${r.subtitle} ${r.code ?? ""} ${r.tags.join(" ")} ${JSON.stringify(r.summary_fields)}`;
            if (!matchesQuery(hay, combinedApiQuery)) return false;
          }
          return true;
        });

    return base.filter((r) => {
      if (enterprise && String(r.detail?.manufacturer_slug ?? "") !== enterprise) return false;
      if (cert && String(r.detail?.cert_no ?? "") !== cert) return false;
      return true;
    });
  }, [listQuery.data, category, combinedApiQuery, enterprise, cert]);

  const comparedModels = useMemo<CatalogRecord[]>(() => {
    return selectedCompareSlugs
      .map((slug) => allModels.find((m) => m.slug === slug))
      .filter((m): m is CatalogRecord => Boolean(m));
  }, [selectedCompareSlugs, allModels]);

  const lockedCompareCategory = comparedModels[0]?.category ?? "";

  const comparisonParameterRows = useMemo(() => {
    if (comparedModels.length !== 2) return [];
    const [modelA, modelB] = comparedModels as [CatalogRecord, CatalogRecord];
    const paramsA = getModelParameters(modelA);
    const paramsB = getModelParameters(modelB);
    const keys = Array.from(new Set([...paramsA.map((p) => p.key), ...paramsB.map((p) => p.key)]));

    return keys.map((key) => {
      const a = paramsA.find((p) => p.key === key);
      const b = paramsB.find((p) => p.key === key);
      return {
        key,
        label: a?.label ?? b?.label ?? key,
        a,
        b,
      };
    });
  }, [comparedModels]);

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  function toggleCompareSlug(slug: string, itemCategory: string | undefined) {
    const exists = selectedCompareSlugs.includes(slug);
    let nextSlugs: string[];
    if (exists) {
      nextSlugs = selectedCompareSlugs.filter((s) => s !== slug);
    } else {
      if (selectedCompareSlugs.length >= 2) return;
      if (lockedCompareCategory && itemCategory && lockedCompareCategory !== itemCategory) return;
      nextSlugs = [...selectedCompareSlugs, slug];
    }
    updateParams({ compare: nextSlugs.length > 0 ? nextSlugs.join(",") : null });
  }

  function resetAllFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const hasActiveFilter = Boolean(category || enterprise || cert || trimmedQ || udiViewActive);

  const columns = useMemo<DataTableColumn<CatalogRecord>[]>(
    () => [
      {
        key: "compare",
        title: "对比",
        colClassName: "w-16",
        hideOnCard: false,
        cell: (row) => {
          const checked = selectedCompareSlugs.includes(row.slug);
          const incompatible =
            !checked &&
            (selectedCompareSlugs.length >= 2 ||
              (Boolean(lockedCompareCategory) && Boolean(row.category) && lockedCompareCategory !== row.category));
          return (
            <Checkbox
              aria-label={`选择 ${row.code ?? row.title} 加入对比`}
              checked={checked}
              disabled={incompatible}
              onCheckedChange={() => toggleCompareSlug(row.slug, row.category)}
            />
          );
        },
      },
      {
        key: "title",
        title: "产品名称与规格型号",
        primary: true,
        cell: (row) => {
          const udiList = getModelUdiPackages(row);
          const params = getModelParameters(row);
          const firstParam = params[0];
          return (
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <TextLink to={`/products/${encodeURIComponent(row.slug)}`} className="font-semibold text-brand-navy">
                  {row.title}
                </TextLink>
                {row.subkind && (
                  <Tag size="sm" tone="info">
                    {row.subkind}
                  </Tag>
                )}
              </div>
              <p className="truncate caption text-ink-muted">{row.subtitle}</p>
              {firstParam && (
                <p className="caption text-ink">
                  核心特征：{firstParam.value}（{firstParam.source_label}）
                </p>
              )}
              {udiViewActive && udiList.length > 0 && (
                <div className="mt-1 grid gap-1 border-l-2 border-brand-sky bg-surface-sunken px-3 py-1.5 caption text-ink">
                  <span className="font-semibold text-brand-navy">UDI-DI 包装层级（共 {udiList.length} 条）：</span>
                  {udiList.map((u) => (
                    <span key={u.udi_di} className="code">
                      {u.udi_di} · {u.package_level}（{u.spec_note}）
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "category",
        title: "所属品类",
        colClassName: "w-40",
        cell: (row) => (
          <div className="grid gap-0.5">
            <span className="body-sm text-ink">{CATEGORY_LABEL[row.category ?? ""] ?? (row.category ?? "—")}</span>
            {row.category && (
              <TextLink to={`/markets?category=${encodeURIComponent(row.category)}`} className="caption">
                查看市场样本 →
              </TextLink>
            )}
          </div>
        ),
      },
      {
        key: "manufacturer",
        title: "制造企业",
        colClassName: "w-48",
        cell: (row) => {
          const mSlug = typeof row.detail?.manufacturer_slug === "string" ? row.detail.manufacturer_slug : "";
          const mName = typeof row.detail?.manufacturer_name === "string" ? row.detail.manufacturer_name : "—";
          return mSlug ? (
            <TextLink to={`/enterprises/${encodeURIComponent(mSlug)}`} className="body-sm font-semibold">
              {mName}
            </TextLink>
          ) : (
            <span className="body-sm text-ink">{mName}</span>
          );
        },
      },
      {
        key: "cert_no",
        title: "关联注册证与包装数",
        colClassName: "w-52",
        cell: (row) => {
          const certNo = typeof row.detail?.cert_no === "string" ? row.detail.cert_no : "";
          const udiCount = getModelUdiPackages(row).length;
          return (
            <div className="grid gap-0.5">
              {certNo ? (
                <TextLink
                  to={`/regulation/registrations?q=${encodeURIComponent(certNo)}`}
                  className="code font-semibold"
                >
                  {certNo}
                </TextLink>
              ) : (
                <span>—</span>
              )}
              <span className="caption text-ink-muted">内折 {udiCount} 条 UDI-DI 包装标识</span>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCompareSlugs, lockedCompareCategory, udiViewActive],
  );

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 页头与准入库分流指引 */}
      <header className="grid gap-5 border-b border-border pb-6">
        <Breadcrumbs items={[{ label: "产业总览", href: "/" }, { label: "产品型号库" }]} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="label text-brand-navy">一等公民实体目录 · 按规格型号去重建档</p>
            <h1 id="products-page-title" className="title-page text-ink">
              医疗器械产品型号与技术参数库
            </h1>
            <p className="body text-ink-muted">
              目录严格按「一行一个产品型号」组织，将 UDI-DI 最小销售与储运包装标识内折至型号规格区；支持同品类勾选两个型号并排比较参数及审评依据。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {comparedModels.length < 2 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateParams({ compare: "umr-jupiter,umr-880" })}
              >
                <IconArrowsLeftRight size={15} aria-hidden="true" />
                与 uMR 880 并排比较样板
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

        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface-sunken px-4 py-2.5 body-sm">
          <span className="text-ink-muted">
            需检索注册证原文、创新特别审查、优先审批决定或审查指导原则？
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <TextLink to="/regulation/registrations" className="font-semibold">
              前往注册与准入查询 →
            </TextLink>
            <button
              type="button"
              onClick={() => updateParams({ channel: udiViewActive ? null : "udi" })}
              className="cursor-pointer font-semibold text-link hover:underline focus-ring"
            >
              {udiViewActive ? "收起列表内 UDI 包装预览" : "在列表内展开 UDI-DI 包装标识"}
            </button>
          </div>
        </div>

        {/* 筛选控件条 */}
        <div
          role="region"
          aria-label="产品型号筛选条"
          className="grid grid-cols-1 gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="grid gap-1">
            <label htmlFor="product-category-select" className="label text-ink-muted">
              产品品类
            </label>
            <select
              id="product-category-select"
              value={category}
              onChange={(e) => updateParams({ category: e.target.value || null })}
              className={cn(controlClass, "h-10")}
            >
              {CATEGORY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label htmlFor="product-enterprise-select" className="label text-ink-muted">
              生产企业
            </label>
            <select
              id="product-enterprise-select"
              value={enterprise}
              onChange={(e) => updateParams({ enterprise: e.target.value || null })}
              className={cn(controlClass, "h-10")}
            >
              {ENTERPRISE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label htmlFor="product-cert-input" className="label text-ink-muted">
              按关联注册证号筛选
            </label>
            <input
              id="product-cert-input"
              type="search"
              value={cert}
              onChange={(e) => updateParams({ cert: e.target.value || null })}
              placeholder="如 国械注准20223061141"
              className={cn(controlClass, "h-10")}
            />
          </div>

          <div className="grid gap-1">
            <label htmlFor="product-local-filter" className="label text-ink-muted">
              型号或技术特征检索
            </label>
            <input
              id="product-local-filter"
              type="search"
              value={rawQ}
              onChange={(e) => updateParams({ q: e.target.value || null })}
              placeholder="如 uMR Jupiter、5.0T、MT-1000…"
              className={cn(controlClass, "h-10")}
            />
          </div>
        </div>
      </header>

      {/* 单选 1 个型号时的待对比提示条 */}
      {comparedModels.length === 1 && comparedModels[0] && (
        <Notice
          tone="info"
          title={`已选 1/2 个对比型号：${comparedModels[0].title}`}
          action={
            <Button variant="secondary" size="sm" onClick={() => updateParams({ compare: null })}>
              取消选择
            </Button>
          }
        >
          请在下方目录中再勾选 1 个同属「{CATEGORY_LABEL[comparedModels[0].category ?? ""] ?? comparedModels[0].category}」品类的型号启动逐项参数并排比较。
        </Notice>
      )}

      {/* 双型号参数与出处并排比较面板（桌面分列对照、手机按参数纵排成对展示） */}
      {comparedModels.length === 2 && (
        <section
          id="product-comparison-panel"
          aria-labelledby="product-comparison-heading"
          className="grid gap-4 border border-border border-t-2 border-t-brand-navy bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="grid gap-1">
              <p className="label text-brand-navy">同品类双型号参数与证据对照</p>
              <h2 id="product-comparison-heading" className="title-sub text-ink">
                {comparedModels[0]!.code ?? comparedModels[0]!.title} 与{" "}
                {comparedModels[1]!.code ?? comparedModels[1]!.title} 技术规格对比
              </h2>
              <p className="body-sm text-ink-muted">
                每项技术参数均附独立核验来源（技术审评报告页码、官方产品技术说明或强制性行业标准）。
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => updateParams({ compare: null })}>
              <IconX size={14} aria-hidden="true" />
              关闭型号对比
            </Button>
          </div>

          {/* 桌面端：三列并排比较表 */}
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">双型号技术参数并排对比表</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">参数与核验项</TableHead>
                  {comparedModels.map((m) => (
                    <TableHead key={m.slug}>
                      <div className="grid gap-0.5">
                        <TextLink to={`/products/${encodeURIComponent(m.slug)}`} className="title-nav text-brand-navy">
                          {m.title}
                        </TextLink>
                        <span className="caption font-normal text-ink-muted">{m.subtitle}</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold text-ink">制造企业</TableCell>
                  {comparedModels.map((m) => {
                    const mSlug = String(m.detail?.manufacturer_slug ?? "");
                    const mName = String(m.detail?.manufacturer_name ?? "—");
                    return (
                      <TableCell key={m.slug}>
                        {mSlug ? <TextLink to={`/enterprises/${encodeURIComponent(mSlug)}`}>{mName}</TextLink> : mName}
                      </TableCell>
                    );
                  })}
                </TableRow>

                {comparisonParameterRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-semibold text-ink">{row.label}</TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <span className="font-semibold text-brand-navy">{row.a?.value ?? "—"}</span>
                        {renderParamSource(row.a)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <span className="font-semibold text-brand-navy">{row.b?.value ?? "—"}</span>
                        {renderParamSource(row.b)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                <TableRow>
                  <TableCell className="font-semibold text-ink">关联注册证与受理号</TableCell>
                  {comparedModels.map((m) => {
                    const cNo = String(m.detail?.cert_no ?? "");
                    const accNo = String(m.detail?.review_acceptance_no ?? "");
                    return (
                      <TableCell key={m.slug}>
                        <div className="grid gap-1">
                          {cNo ? (
                            <TextLink
                              to={`/regulation/registrations?q=${encodeURIComponent(cNo)}`}
                              className="code font-semibold"
                            >
                              {cNo}
                            </TextLink>
                          ) : (
                            <span>—</span>
                          )}
                          {accNo && <span className="caption text-ink-muted">器审受理号：{accNo}</span>}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableCell className="font-semibold text-ink">UDI-DI 包装标识层级</TableCell>
                  {comparedModels.map((m) => {
                    const udis = getModelUdiPackages(m);
                    return (
                      <TableCell key={m.slug}>
                        <span className="body-sm text-ink">
                          共 {udis.length} 条包装标识（
                          <TextLink to={`/products/${encodeURIComponent(m.slug)}`}>进入详情规格区查看</TextLink>）
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* 手机端：按参数纵排成对展示（每项参数紧邻展示两个型号的值与来源） */}
          <div className="grid gap-4 md:hidden">
            {comparisonParameterRows.map((row) => (
              <div key={row.key} className="grid gap-2 border-b border-border pb-3 last:border-b-0">
                <p className="label text-brand-navy">{row.label}</p>
                <div className="grid gap-2 pl-2">
                  <div className="grid gap-0.5 border-l-2 border-brand-navy pl-3">
                    <span className="caption font-semibold text-ink-muted">
                      {comparedModels[0]!.code ?? comparedModels[0]!.title}
                    </span>
                    <span className="body font-semibold text-ink">{row.a?.value ?? "—"}</span>
                    {renderParamSource(row.a)}
                  </div>
                  <div className="grid gap-0.5 border-l-2 border-brand-sky pl-3">
                    <span className="caption font-semibold text-ink-muted">
                      {comparedModels[1]!.code ?? comparedModels[1]!.title}
                    </span>
                    <span className="body font-semibold text-ink">{row.b?.value ?? "—"}</span>
                    {renderParamSource(row.b)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 产品型号主目录表 */}
      <section id="product-explorer-heading" aria-labelledby="product-directory-title" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2">
              <span id="product-directory-title">产品型号名录</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              当前匹配 <strong className="font-semibold tabular-nums text-brand-navy">{filteredModels.length}</strong>{" "}
              个产品型号
              {cert ? `（按注册证 ${cert} 聚合去重，UDI-DI 包装条目已归折于各型号规格内）` : ""}。
            </p>
          </div>
          {cert && (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/regulation/registrations?q=${encodeURIComponent(cert)}`}>
                查看注册证 {cert} 详情 →
              </Link>
            </Button>
          )}
        </div>

        <DataTable
          caption="医疗器械产品型号名录"
          columns={columns}
          data={filteredModels}
          getRowId={(r) => r.id}
          loading={listQuery.isLoading && !listQuery.data && filteredModels.length === 0}
          empty="未找到符合当前品类、生产企业、注册证号或关键词的产品型号记录。"
        />
      </section>
    </div>
  );
}
