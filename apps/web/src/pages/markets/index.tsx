import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { IconExternalLink, IconRotate } from "@tabler/icons-react";
import {
  matchesQuery,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogRecord,
  type ClinicalActivationItem,
} from "@mdes/shared";
import {
  Breadcrumbs,
  DataTable,
  Descriptions,
  Notice,
  SectionTitle,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { StatisticFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import { useCatalogList, useStatisticDetail } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { value: "", label: "全部品类" },
  { value: "mri", label: "磁共振成像 (mri)" },
  { value: "surgical-robot", label: "手术机器人 (surgical-robot)" },
] as const;

const REGION_OPTIONS = [
  { value: "", label: "全部地区" },
  { value: "陕西", label: "陕西" },
  { value: "河南", label: "河南" },
] as const;

const PERIOD_OPTIONS = [
  { value: "", label: "全部年份" },
  { value: "2024", label: "2024" },
  { value: "2023", label: "2023" },
] as const;

const KNOWN_CATEGORY_SLUGS = new Set(["mri", "surgical-robot"]);

type MarketDealRow = {
  id: string;
  slug: string;
  buyer: string;
  projectCode: string;
  region: string;
  announcementDate: string;
  modelName: string;
  modelSlug: string;
  quantityText: string;
  amountText: string;
  sourceTitle: string;
  announcementUrl: string;
  subkind: string;
};

function mapDealRecordToRow(rec: CatalogRecord): MarketDealRow {
  const d = rec.detail ?? {};
  const amountWan = typeof d.total_amount_cny_wan === "number" ? d.total_amount_cny_wan : null;
  const currency = typeof d.currency === "string" ? d.currency : "人民币";
  const qty = typeof d.quantity === "number" ? d.quantity : 1;
  const qtyUnit = typeof d.quantity_unit === "string" ? d.quantity_unit : "套";
  return {
    id: rec.id,
    slug: rec.slug,
    buyer: typeof d.buyer === "string" ? d.buyer : rec.title,
    projectCode: typeof d.project_code === "string" ? d.project_code : (rec.code ?? "—"),
    region: rec.region ?? "—",
    announcementDate: typeof d.announcement_date === "string" ? d.announcement_date : (rec.period ?? "—"),
    modelName: typeof d.model_name === "string" ? d.model_name : "—",
    modelSlug: typeof d.model_slug === "string" ? d.model_slug : "",
    quantityText: `${qty} ${qtyUnit}`,
    amountText: amountWan !== null ? `${currency} ${amountWan.toLocaleString("zh-CN")} 万元` : "见原公告",
    sourceTitle: rec.source_title,
    announcementUrl: typeof d.announcement_url === "string" ? d.announcement_url : (rec.source_url ?? ""),
    subkind: rec.subkind ?? "公开招采",
  };
}

function findSeedStat(id: string) {
  return V2_SEED_STATISTICS.find((s) => s.statistic_id === id)!;
}

/**
 * 品类市场与公开招采监测页（/markets 与 /markets/:slug）：
 * - 首屏呈现品类、地区、年份筛选器并与 URL 查询参数实时同步；
 * - 严格分离「可逐笔核查公告原文的公立医院公开采购样本」与「全国市场规模核算及预测（STAT-MKT-MRI-PROCUREMENT）」；
 * - 关联海关整机（90181310）与零件（90181390）贸易统计及已核实医院临床启用事件。
 */
export default function MarketsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const slugCategory = slug && KNOWN_CATEGORY_SLUGS.has(slug) ? slug : "";
  const slugDealKey = slug && !KNOWN_CATEGORY_SLUGS.has(slug) ? slug : "";

  const category = searchParams.get("category") ?? slugCategory;
  const region = searchParams.get("region") ?? "";
  const period = searchParams.get("period") ?? "";
  const rawQ = searchParams.get("q") ?? slugDealKey;
  const trimmedQ = rawQ.trim();

  const catalogQuery = useCatalogList({
    kind: "market_deal",
    category: category || undefined,
    region: region || undefined,
    period: period || undefined,
    q: trimmedQ || undefined,
  });

  const mriSizingQuery = useStatisticDetail("STAT-MKT-MRI-PROCUREMENT");
  const mriTradeQuery = useStatisticDetail("STAT-TRD-MRI-HS8");

  const mriSizingStat = mriSizingQuery.data?.statistic ?? findSeedStat("STAT-MKT-MRI-PROCUREMENT");
  const mriTradeStat = mriTradeQuery.data?.statistic ?? findSeedStat("STAT-TRD-MRI-HS8");

  const dealRecords = useMemo(() => {
    if (catalogQuery.data) {
      return catalogQuery.data.items;
    }
    return V2_SEED_CATALOG_RECORDS.filter((rec) => {
      if (rec.kind !== "market_deal") return false;
      if (category && rec.category !== category) return false;
      if (region && rec.region !== region) return false;
      if (period && !(rec.period === period || (rec.period ?? "").startsWith(period))) return false;
      if (trimmedQ) {
        const hay = `${rec.id} ${rec.slug} ${rec.title} ${rec.subtitle} ${rec.code ?? ""} ${rec.region ?? ""} ${rec.period ?? ""} ${rec.tags.join(" ")} ${JSON.stringify(rec.summary_fields)}`;
        if (!matchesQuery(hay, trimmedQ)) return false;
      }
      return true;
    });
  }, [catalogQuery.data, category, region, period, trimmedQ]);

  const dealRows = useMemo(() => dealRecords.map(mapDealRecordToRow), [dealRecords]);

  const verifiedActivations = useMemo(() => {
    const models = V2_SEED_CATALOG_RECORDS.filter(
      (r) => r.kind === "model" && (!category || r.category === category),
    );
    const items: Array<ClinicalActivationItem & { modelSlug: string; modelLabel: string }> = [];
    for (const mdl of models) {
      const acts = (mdl.detail?.clinical_activations as ClinicalActivationItem[] | undefined) ?? [];
      for (const act of acts) {
        items.push({
          ...act,
          modelSlug: mdl.slug,
          modelLabel: mdl.code ?? mdl.title,
        });
      }
    }
    return items;
  }, [category]);

  const coveredRegions = useMemo(
    () => Array.from(new Set(dealRows.map((r) => r.region).filter((r) => r && r !== "—"))),
    [dealRows],
  );

  function updateFilter(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const hasFilters = Boolean(category || region || period || trimmedQ);

  const dealColumns = useMemo<DataTableColumn<MarketDealRow>[]>(
    () => [
      {
        key: "buyer",
        title: "采购医院与项目编号",
        primary: true,
        cell: (row) => (
          <div className="grid min-w-0 gap-0.5">
            <span className="font-semibold text-ink">{row.buyer}</span>
            <div className="flex flex-wrap items-center gap-2 caption text-ink-muted">
              <span className="code text-brand-navy">{row.projectCode}</span>
              <span>·</span>
              <span>{row.region}</span>
              <span>·</span>
              <span>{row.subkind}</span>
            </div>
          </div>
        ),
      },
      {
        key: "announcementDate",
        title: "公告日期",
        type: "code",
        colClassName: "w-32",
      },
      {
        key: "modelName",
        title: "中标型号",
        colClassName: "w-36",
        cell: (row) =>
          row.modelSlug ? (
            <TextLink to={`/products/${encodeURIComponent(row.modelSlug)}`} className="font-semibold">
              {row.modelName}
            </TextLink>
          ) : (
            <span>{row.modelName}</span>
          ),
      },
      {
        key: "quantityText",
        title: "数量",
        colClassName: "w-20",
        align: "right",
      },
      {
        key: "amountText",
        title: "成交金额",
        colClassName: "w-40",
        align: "right",
        cell: (row) => <span className="font-semibold tabular-nums text-brand-navy">{row.amountText}</span>,
      },
      {
        key: "announcementUrl",
        title: "官方公告原文",
        colClassName: "w-44",
        cell: (row) =>
          row.announcementUrl ? (
            <a
              href={row.announcementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 body-sm font-semibold text-link hover:underline focus-ring"
            >
              <span>查看成交公告</span>
              <IconExternalLink size={14} aria-hidden="true" />
            </a>
          ) : (
            <span className="text-ink-muted">—</span>
          ),
      },
    ],
    [],
  );

  const categoryHeadingLabel =
    category === "mri"
      ? "医用磁共振成像设备（MRI）品类市场与公开招采监测"
      : category === "surgical-robot"
        ? "腔镜与骨科手术机器人品类市场监测"
        : "医疗器械品类市场与公立医院公开招采监测";

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      {/* 面包屑与首屏标题 + 筛选器 */}
      <header className="grid gap-5 border-b border-border pb-6">
        <Breadcrumbs
          items={
            category === "mri"
              ? [{ label: "产业总览", href: "/" }, { label: "市场", href: "/markets" }, { label: "磁共振成像 (MRI)" }]
              : [{ label: "产业总览", href: "/" }, { label: "市场" }]
          }
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="label text-brand-navy">品类市场监测 · 公开招采样本与全国规模分列核验</p>
            <h1 className="title-page text-ink">{categoryHeadingLabel}</h1>
            <p className="body text-ink-muted">
              先限定产品品类、地区与年份核查可追溯至原始公告的公立医院中标标的；全国年度销售规模与海关整机/零件进口按各自法定统计口径单列。
            </p>
          </div>
          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              <IconRotate size={14} aria-hidden="true" />
              重置筛选条件
            </Button>
          )}
        </div>

        {/* 首屏 URL 同步筛选条 */}
        <div
          role="region"
          aria-label="市场样本筛选条"
          className="grid grid-cols-1 gap-3 border border-border bg-surface-sunken p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="grid gap-1">
            <label htmlFor="markets-category-select" className="label text-ink-muted">
              产品品类
            </label>
            <select
              id="markets-category-select"
              value={category}
              onChange={(e) => updateFilter({ category: e.target.value })}
              className={cn(controlClass, "h-10")}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label htmlFor="markets-region-select" className="label text-ink-muted">
              采购地区
            </label>
            <select
              id="markets-region-select"
              value={region}
              onChange={(e) => updateFilter({ region: e.target.value })}
              className={cn(controlClass, "h-10")}
            >
              {REGION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label htmlFor="markets-period-select" className="label text-ink-muted">
              公告年份
            </label>
            <select
              id="markets-period-select"
              value={period}
              onChange={(e) => updateFilter({ period: e.target.value })}
              className={cn(controlClass, "h-10")}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label htmlFor="markets-keyword-input" className="label text-ink-muted">
              项目编号/医院/型号检索
            </label>
            <input
              id="markets-keyword-input"
              type="search"
              value={rawQ}
              onChange={(e) => updateFilter({ q: e.target.value })}
              placeholder="如 西安交大、WXZB(2024)-016、uMR Jupiter"
              className={cn(controlClass, "h-10")}
            />
          </div>
        </div>
      </header>

      {/* 第 2 层：公开采购记录主表（置前响应筛选，确保单笔核验一屏直达） */}
      <section aria-labelledby="public-procurement-heading" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2">
              <span id="public-procurement-heading">公开采购记录</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              当前筛选命中 <strong className="font-semibold tabular-nums text-brand-navy">{dealRows.length}</strong>{" "}
              笔已核实公立医疗机构公开招采成交记录
              {coveredRegions.length > 0 ? `（覆盖地区：${coveredRegions.join("、")}）` : ""}。点击型号可查看技术参数与注册证，点击公告直达采购人原始网页。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 body-sm">
            <TextLink to="/markets?category=mri&region=陕西&period=2024">
              快捷筛选：陕西 · 2024 · 磁共振
            </TextLink>
          </div>
        </div>

        <DataTable
          caption="公开采购记录"
          columns={dealColumns}
          data={dealRows}
          getRowId={(r) => r.id}
          loading={catalogQuery.isLoading && !catalogQuery.data && dealRows.length === 0}
          empty="当前品类、地区与年份组合下暂无已核实的公开采购公告样本，请调整或重置筛选条件。"
        />
      </section>

      {/* 第 3 层：样本覆盖边界说明（左） + 全国市场规模与海关整机零件进口统计（右） */}
      <section aria-labelledby="markets-sizing-heading" className="grid gap-6 border-t border-border pt-8 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-4">
          <SectionTitle level={2} as="h2">
            <span id="markets-sizing-heading">样本覆盖与全国规模口径说明</span>
          </SectionTitle>

          <Notice tone="info" title="单笔公开采购样本与全国销售规模严格分列">
            上方「公开采购记录」仅统计已关联原始中标公告的公立医院具体标包（当前命中 {dealRows.length}{" "}
            笔）；右侧「国内医用 MRI 市场规模」为全国二级及以上公立医院招采与上市厂商分部综合核算值（2026–2027 年为截至 2025-12 冻结预测），两者严禁混算。
          </Notice>

          <Descriptions
            columns={1}
            items={[
              {
                term: "已核验公开招采样本范围",
                value: `共 ${dealRows.length} 笔成交标的 · 覆盖 ${coveredRegions.length > 0 ? coveredRegions.join("、") : "暂无匹配地区"} · 保留项目编号、数量、币种与原公告链接`,
              },
              {
                term: "全国规模核算统计（STAT-MKT-MRI-PROCUREMENT）",
                value: "2025 年国内医用 MRI 实际规模 124.6 亿元；2026 年预测 136.0 亿元（冻结时点 2025-12）",
              },
              {
                term: "海关整机与零件进口对账（STAT-TRD-MRI-HS8）",
                value: (
                  <div className="grid gap-1.5">
                    <span>2024 年成套装置（90181310）进口 263.11 百万美元，零件（90181390）进口 312.48 百万美元。</span>
                    <div className="flex flex-wrap items-center gap-3 body-sm">
                      <TextLink to="/trade?q=90181310" className="font-semibold">
                        查 90181310 成套装置 →
                      </TextLink>
                      <TextLink to="/trade?q=90181390" className="font-semibold">
                        查 90181390 磁共振零件 →
                      </TextLink>
                    </div>
                  </div>
                ),
              },
              {
                term: "关联型号与技术路线",
                value: (
                  <div className="flex flex-wrap items-center gap-3 body-sm">
                    <TextLink to="/products/umr-jupiter">uMR Jupiter 型号档案</TextLink>
                    <TextLink to="/products/umr-880">uMR 880 型号档案</TextLink>
                    <TextLink to="/technologies/ultra-high-field-5t-mri">5T 超导磁共振技术</TextLink>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="grid gap-6 lg:col-span-8">
          <StatisticFigure
            id="fig-markets-mri-procurement"
            eyebrow="全国规模核算与历史预测对照 · STAT-MKT-MRI-PROCUREMENT"
            statistic={mriSizingStat}
            height={264}
          />

          <StatisticFigure
            id="fig-markets-mri-hs8"
            eyebrow="跨境供应链对照 · 整机 90181310 vs 零件 90181390"
            statistic={mriTradeStat}
            height={264}
          />
        </div>
      </section>

      {/* 第 4 层：经官方公告核实的医院临床启用记录（与采购中标记录独立列示） */}
      {verifiedActivations.length > 0 && (
        <section aria-labelledby="markets-activations-heading" className="grid gap-4 border-t border-border pt-8">
          <div className="grid gap-1">
            <SectionTitle level={2} as="h2">
              <span id="markets-activations-heading">已核实的临床开机启用事件</span>
            </SectionTitle>
            <p className="body-sm text-ink-muted">
              依据卫生健康行政部门或公立医院正式启用通告整理，独立于政府采购中标日期统计。
            </p>
          </div>

          <ul className="divide-y divide-border border-y border-border">
            {verifiedActivations.map((act) => (
              <li key={`${act.hospital}-${act.activated_date}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag size="sm" tone="success">
                      正式开机启用
                    </Tag>
                    <span className="font-semibold text-ink">{act.hospital}</span>
                    <span className="caption text-ink-muted">（{act.city} · 启用日期 {act.activated_date}）</span>
                  </div>
                  <p className="body-sm text-ink-muted">
                    关联型号：
                    <TextLink to={`/products/${encodeURIComponent(act.modelSlug)}`} className="mx-1 font-semibold">
                      {act.modelLabel}
                    </TextLink>
                    · {act.summary}
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
        </section>
      )}
    </div>
  );
}
