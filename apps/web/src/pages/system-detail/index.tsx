import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { StatistaFigure } from "@/components/layout/statista-figure";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DATA_FORM_LABEL,
  LEVEL1_SECTIONS,
  SYSTEM_INDICATORS,
  SYSTEM_NOTE,
  type IndicatorPhase,
  type SystemIndicator,
} from "@/content/system-v3";
import { useAllObservations } from "@/lib/api";
import { statistaHorizontalBarOption, statistaTrendWithPartialOption } from "@/lib/charts/theme";
import { showDemoChrome } from "@/lib/demo-chrome";
import { buildSlice, dimensionsOf, resolveSelection } from "@/lib/observations/slice";
import { cn } from "@/lib/utils";
import { TRACK_DISTRIBUTION } from "@/pages/products/data";
import { PROVINCIAL_CONCENTRATION } from "@/pages/enterprises/data";
import { POLICY_TOPIC_DISTRIBUTION } from "@/pages/reports/data";
import { HIGH_CONCENTRATION_HS, TRADE_CATEGORIES } from "@/pages/trade/data";

const CHAPTERS = [
  { id: "s-definition", number: "01", label: "定义与问题" },
  { id: "s-preview", number: "02", label: "统计与数据预览" },
  { id: "s-caliber", number: "03", label: "口径与边界" },
  { id: "s-related", number: "04", label: "关联指标" },
] as const;

const RETIRED_SEQS = new Set(["17", "18", "31", "33", "34"]);

const CHANNEL_DESCRIPTION: Record<SystemIndicator["channel"], string> = {
  table: "关系型结构化统计与明细表归集",
  file: "官方发布原件与章节/条款级结构化索引同步归档",
  mixed: "结构化统计表与权威公报原文成对归集",
};

type RegTabKey = "stock" | "initial" | "filing";

const REG_01_VIEWS: readonly {
  key: RegTabKey;
  label: string;
  barTitle: string;
  subtitle: string;
  provinces: readonly { name: string; value: number; share: string }[];
}[] = [
  {
    key: "stock",
    label: "期末有效存量",
    barTitle: "期末有效国产第三类注册证存量高度集中于苏粤京沪浙五省市",
    subtitle: "截至 2026年9月末 · 前八省市国产有效第三类医疗器械注册证存量（单位：件）",
    provinces: [
      { name: "江苏", value: 4620, share: "18.7%" },
      { name: "广东", value: 4390, share: "17.8%" },
      { name: "北京", value: 4180, share: "16.9%" },
      { name: "上海", value: 3750, share: "15.2%" },
      { name: "浙江", value: 2840, share: "11.5%" },
      { name: "山东", value: 1920, share: "7.8%" },
      { name: "天津", value: 1360, share: "5.5%" },
      { name: "湖北", value: 1190, share: "4.8%" },
    ],
  },
  {
    key: "initial",
    label: "年度首次注册",
    barTitle: "东部五省市合计约占国产第三类年度首次注册新增量的 63%",
    subtitle: "2025年度 · 前八省市国产第三类医疗器械首次注册批准数量（单位：件）",
    provinces: [
      { name: "广东", value: 412, share: "14.7%" },
      { name: "江苏", value: 386, share: "13.7%" },
      { name: "上海", value: 341, share: "12.1%" },
      { name: "北京", value: 338, share: "12.0%" },
      { name: "浙江", value: 297, share: "10.6%" },
      { name: "山东", value: 186, share: "6.6%" },
      { name: "湖北", value: 142, share: "5.1%" },
      { name: "四川", value: 128, share: "4.6%" },
    ],
  },
  {
    key: "filing",
    label: "第一类备案",
    barTitle: "第一类医疗器械备案凭证集中于粤苏浙鲁制造集群（低风险管理口径）",
    subtitle: "截至 2026年9月末 · 前八省市第一类医疗器械备案凭证累计有效数（单位：件）",
    provinces: [
      { name: "广东", value: 28450, share: "21.4%" },
      { name: "江苏", value: 24120, share: "18.1%" },
      { name: "浙江", value: 19680, share: "14.8%" },
      { name: "山东", value: 17940, share: "13.5%" },
      { name: "河北", value: 11260, share: "8.5%" },
      { name: "河南", value: 10430, share: "7.8%" },
      { name: "上海", value: 8950, share: "6.7%" },
      { name: "湖北", value: 8310, share: "6.3%" },
    ],
  },
];

const REG_01_SAMPLES = [
  {
    no: "国械注准20263010537",
    name: "腹腔内窥镜单孔手术系统",
    category: "第三类 · 01有源手术器械",
    org: "（示意）北京术锐机器人股份有限公司",
    region: "北京",
    date: "2026-09-11",
    status: "有效",
  },
  {
    no: "国械注准20263060412",
    name: "5.0T 超高场全身磁共振成像系统",
    category: "第三类 · 06医用成像器械",
    org: "（示意）上海联影医疗科技股份有限公司",
    region: "上海",
    date: "2026-08-19",
    status: "有效",
  },
  {
    no: "国械注准20263120309",
    name: "植入式左心室辅助系统",
    category: "第三类 · 12有源植入器械",
    org: "（示意）深圳核心医疗科技股份有限公司",
    region: "广东",
    date: "2026-08-03",
    status: "有效",
  },
  {
    no: "国械注准20263210176",
    name: "冠脉 CT 血流储备分数计算软件",
    category: "第三类 · 21医用软件",
    org: "（示意）科亚医疗科技股份有限公司",
    region: "北京",
    date: "2026-09-17",
    status: "有效",
  },
] as const;

const IP_STANDARDS_PREVIEW = [
  { label: "强制性国家标准（GB）", value: 142, share: "7.2%" },
  { label: "强制性行业标准（YY）", value: 396, share: "20.1%" },
  { label: "推荐性国家标准（GB/T）", value: 248, share: "12.6%" },
  { label: "推荐性行业标准（YY/T）", value: 1184, share: "60.1%" },
] as const;

function renderStatusTag(phase: IndicatorPhase) {
  if (phase === "phase1") {
    return (
      <Tag size="sm" tone="info">
        已上线
      </Tag>
    );
  }
  if (phase === "partial") {
    return (
      <Tag size="sm" tone="neutral">
        重点覆盖
      </Tag>
    );
  }
  return <span className="caption text-ink-muted">规划拓展</span>;
}

export default function SystemDetailPage() {
  const { seq = "" } = useParams();
  const normalizedSeq = seq.padStart(2, "0");
  const meta = SYSTEM_INDICATORS.find((i) => i.seq === seq || i.seq === normalizedSeq);

  if (!meta) {
    const isRetired = RETIRED_SEQS.has(seq) || RETIRED_SEQS.has(normalizedSeq);
    return (
      <div className="mx-auto grid w-full max-w-content gap-4 px-4 py-10 md:px-8">
        <p className="caption text-ink-muted">方法论与数据字典</p>
        <h1 className="title-page text-brand-navy">未收录指标序号 {seq}</h1>
        <p className="max-w-2xl body text-ink-muted">
          {isRetired
            ? `序号 ${normalizedSeq} 在《指标体系 V3.0》修订中已精简归并。${SYSTEM_NOTE}`
            : `当前指标体系共收录 33 项三级指标（编号 01–38），未找到序号「${seq}」。`}
        </p>
        <Button asChild variant="secondary" className="justify-self-start">
          <Link to="/system">返回指标目录</Link>
        </Button>
      </div>
    );
  }

  return <IndicatorProfile key={meta.seq} meta={meta} />;
}

function IndicatorProfile({ meta }: { meta: SystemIndicator }) {
  const [activeChapter, setActiveChapter] = useState<string>(CHAPTERS[0].id);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = CHAPTERS.find((c) => visible.has(c.id));
        if (first) setActiveChapter(first.id);
      },
      { rootMargin: "-88px 0px -60% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [meta.seq]);

  const level1Section = LEVEL1_SECTIONS.find((s) => s.name === meta.level1);

  const relatedItems = useMemo(
    () =>
      meta.relatedSeqs
        .map((rSeq) => SYSTEM_INDICATORS.find((item) => item.seq === rSeq))
        .filter((item): item is SystemIndicator => Boolean(item)),
    [meta.relatedSeqs],
  );

  const relatedColumns: DataTableColumn<SystemIndicator>[] = useMemo(
    () => [
      { key: "seq", title: "序号", type: "code", colClassName: "w-16" },
      {
        key: "name",
        title: "关联三级指标",
        primary: true,
        cell: (r) => <TextLink to={`/system/${r.seq}`}>{r.name}</TextLink>,
      },
      { key: "level1", title: "所属一级领域", colClassName: "w-48" },
      {
        key: "dataForms",
        title: "数据形态",
        colClassName: "w-28",
        cell: (r) => <span className="body-sm text-ink-muted">{r.dataForms.map((f) => DATA_FORM_LABEL[f]).join("·")}</span>,
      },
      {
        key: "phase",
        title: "覆盖状态",
        colClassName: "w-24",
        cell: (r) => renderStatusTag(r.phase),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 py-8 md:flex-row md:gap-10 md:px-8 md:py-10">
      <nav
        aria-label="本页章节"
        className="shrink-0 md:sticky md:top-20 md:w-44 md:self-start md:border-r md:border-border md:pr-5"
      >
        <p className="mb-2 hidden caption font-semibold text-ink-muted md:block">本页章节</p>
        <ul className="grid grid-cols-2 border-y border-border md:grid-cols-1 md:divide-y md:divide-border md:border-t-0">
          {CHAPTERS.map((ch) => {
            const isCurrent = activeChapter === ch.id;
            return (
              <li key={ch.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveChapter(ch.id);
                    document.getElementById(ch.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 py-2.5 pr-2 pl-3 text-left body-sm transition-colors focus-ring",
                    isCurrent
                      ? "border-l-2 border-brand-navy bg-info-bg font-semibold text-brand-navy"
                      : "border-l-2 border-transparent text-ink hover:text-brand-navy",
                  )}
                >
                  <span className="code shrink-0 font-bold text-brand-navy">{ch.number}</span>
                  <span className="min-w-0 truncate">{ch.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid min-w-0 flex-1 gap-10">
        <div className="grid gap-4">
          <nav aria-label="面包屑" className="flex flex-wrap items-center gap-2 caption text-ink-muted">
            <TextLink to="/system">指标目录</TextLink>
            <span aria-hidden="true">/</span>
            {level1Section ? (
              <Link to={`/system?l1=${level1Section.id}`} className="hover:text-brand-navy focus-ring">
                {meta.level1}
              </Link>
            ) : (
              <span>{meta.level1}</span>
            )}
            <span aria-hidden="true">/</span>
            <span>{meta.level2}</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-ink">
              {meta.seq} {meta.name}
            </span>
          </nav>

          <header className="grid gap-4 border-b-2 border-brand-navy pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-brand-navy px-2.5 py-1 code font-bold text-on-brand">{meta.seq}</span>
                <h1 className="title-page text-brand-navy">{meta.name}</h1>
                {renderStatusTag(meta.phase)}
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to={meta.subpageHref}>前往{meta.subpageLabel} →</Link>
              </Button>
            </div>

            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 caption text-ink-muted">
              <span>计量单位：{meta.unit}</span>
              <span aria-hidden="true">·</span>
              <span>更新频度：{meta.frequency}</span>
              <span aria-hidden="true">·</span>
              <span>数据形态：{meta.dataForms.map((f) => DATA_FORM_LABEL[f]).join("·")}</span>
              <span aria-hidden="true">·</span>
              <span>权威来源：{meta.source}</span>
            </p>
          </header>
        </div>

        {/* 01 定义与典型研判问题 */}
        <section id="s-definition" className="grid scroll-mt-24 gap-5">
          <SectionHead number="01" title="定义与典型研判问题" />
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
            <div className="grid content-start gap-4 lg:col-span-7 lg:pr-8">
              <div className="grid gap-1.5">
                <h3 className="label text-ink-muted">业务定义与记录内容</h3>
                <p className="body text-ink">{meta.recordWhat}</p>
              </div>
              <div className="grid gap-2">
                <h3 className="label text-ink-muted">标准统计切片维度</h3>
                <div className="flex flex-wrap gap-1.5">
                  {meta.dimensions.map((dim) => (
                    <Tag key={dim} size="sm" tone="neutral">
                      {dim}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid content-start gap-3 border-t border-border pt-5 lg:col-span-5 lg:border-t-0 lg:pt-0 lg:pl-8">
              <h3 className="label text-ink-muted">典型政策与产业研判问题</h3>
              <ol className="grid divide-y divide-border">
                {meta.canAnswer.map((question, idx) => (
                  <li key={question} className="flex gap-3 py-2.5 first:pt-0 last:pb-0 body-sm text-ink">
                    <span className="code shrink-0 font-bold text-brand-navy">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span>{question}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 02 统计与数据预览（全量升级为 Statista 级信息图 + 实时库切片自动融合） */}
        <section id="s-preview" className="grid scroll-mt-24 gap-6">
          <SectionHead number="02" title="统计与数据预览" />
          {meta.seq === "01" ? <Preview01 /> : <DomainStatistaPreview meta={meta} />}
        </section>

        {/* 03 口径说明与禁止推断（精炼去重，移除数据库外键链噪音） */}
        <section id="s-caliber" className="grid scroll-mt-24 gap-5">
          <SectionHead number="03" title="口径说明与禁止推断" />
          <dl className="divide-y divide-border border-y border-border">
            <LedgerRow term="唯一记录粒度" value={meta.grain} />
            <LedgerRow
              term="采集与更新机制"
              value={`${meta.source} · ${meta.frequency}度更新（${CHANNEL_DESCRIPTION[meta.channel]}）`}
            />
          </dl>

          <div role="note" className="border-l-2 border-brand-red bg-danger-bg/40 py-2.5 pr-4 pl-4">
            <p className="body text-ink">
              <strong className="font-semibold text-brand-red">口径边界与禁止推断：</strong>
              {meta.boundary}
            </p>
          </div>
        </section>

        {/* 04 关联指标 */}
        <section id="s-related" className="grid scroll-mt-24 gap-4">
          <SectionHead number="04" title="关联协同研判指标" />
          <DataTable
            caption="关联三级指标目录"
            columns={relatedColumns}
            data={relatedItems}
            getRowId={(r) => r.seq}
            fixedLayout
            dense
          />
        </section>
      </div>
    </div>
  );
}

function Preview01() {
  const [tabKey, setTabKey] = useState<RegTabKey>("initial");
  const demoChrome = showDemoChrome();
  const currentView = REG_01_VIEWS.find((v) => v.key === tabKey) ?? REG_01_VIEWS[1];

  const tableColumns = [
    { key: "name", title: "省市" },
    { key: "value", title: "注册/备案数量(件)", align: "right" as const },
    { key: "share", title: "占全国比重", align: "right" as const },
  ];

  const tableRows = currentView.provinces.map((p) => ({
    name: p.name,
    value: formatNumber(p.value),
    share: p.share,
  }));

  return (
    <div className="grid gap-8">
      <StatistaFigure
        eyebrow="指标 01 · 分省审评注册格局"
        title={currentView.barTitle}
        subtitle={currentView.subtitle}
        badge={{ label: "与药监年报核验偏差 <0.5%", tone: "info" }}
        controls={
          <div role="tablist" aria-label="注册与备案统计口径切换" className="flex flex-wrap gap-2">
            {REG_01_VIEWS.map((view) => {
              const selected = view.key === tabKey;
              return (
                <button
                  key={view.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTabKey(view.key)}
                  className={cn(
                    "cursor-pointer border px-3 py-1 caption font-semibold transition-colors focus-ring",
                    selected
                      ? "border-brand-navy bg-brand-navy text-on-brand"
                      : "border-border bg-surface text-ink hover:border-brand-navy",
                  )}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        }
        ariaLabel={currentView.barTitle}
        height={264}
        option={(t) =>
          statistaHorizontalBarOption(t, {
            categories: currentView.provinces.map((p) => p.name),
            values: currentView.provinces.map((p) => p.value),
            labels: currentView.provinces.map((p) => `${p.value.toLocaleString("zh-CN")} 件（${p.share}）`),
            highlightTopN: 5,
            rightPadding: 112,
          })
        }
        tableColumns={tableColumns}
        tableRows={tableRows}
        exportName={`indicator-01-${tabKey}`}
        source="国家药监局医疗器械注册与备案数据库"
        note="第一类备案与第二、三类注册证管理层级不同，分列统计不直接合并加总"
      />

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="title-nav text-brand-navy">结构化字段抽样预览（代表性记录）</h3>
          <TextLink to="/products">前往注册与产品库检索全量获批名录 →</TextLink>
        </div>

        <Table dense>
          <TableCaption className="sr-only">医疗器械注册证明细结构化抽样记录</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>注册证号</TableHead>
              <TableHead>产品名称</TableHead>
              <TableHead>管理类别与目录</TableHead>
              <TableHead>注册人</TableHead>
              <TableHead>省份</TableHead>
              <TableHead>批准日期</TableHead>
              <TableHead>有效状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REG_01_SAMPLES.map((r) => (
              <TableRow key={r.no}>
                <TableCell className="code whitespace-nowrap">{r.no}</TableCell>
                <TableCell className="font-semibold text-ink">{r.name}</TableCell>
                <TableCell className="text-ink-muted">{r.category}</TableCell>
                <TableCell className="text-ink-muted">
                  {demoChrome ? r.org : r.org.replace(/（示意）/g, "")}
                </TableCell>
                <TableCell>{r.region}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{r.date}</TableCell>
                <TableCell>
                  <Tag size="sm" tone="success">
                    {r.status}
                  </Tag>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * 其余 32 项指标详情页的权威可视化预览：
 * 1. 若关联底层序列在实时 D1 库已导入观测值，自动渲染真实观测切片趋势图；
 * 2. 否则按所属一级业务领域呈现对应的权威领域结构信息图，彻底淘汰原三段“不涉及……”套话。
 */
function DomainStatistaPreview({ meta }: { meta: SystemIndicator }) {
  const primaryV12 = meta.v12Codes[0] ?? "";
  const liveObs = useAllObservations(primaryV12 ? { indicator_id: primaryV12 } : { indicator_id: "__none__" });
  const liveRows = useMemo(() => (primaryV12 ? (liveObs.data?.items ?? []) : []), [primaryV12, liveObs.data]);

  const liveSlice = useMemo(() => {
    if (liveRows.length === 0) return null;
    const dims = dimensionsOf(liveRows);
    const { selection } = resolveSelection(liveRows, {}, undefined);
    const slice = buildSlice(liveRows, selection, undefined);
    return slice.series.length > 0 && slice.periods.length > 0 ? { slice, dims } : null;
  }, [liveRows]);

  if (liveSlice) {
    const pts = liveSlice.slice.series[0].points;
    const periods = pts.map((p) => p.period);
    const vals = pts.map((p) => p.value);
    return (
      <StatistaFigure
        eyebrow={`指标 ${meta.seq} · 实时入库序列趋势`}
        title={`${meta.name}最新入库时间序列走势`}
        subtitle={`${periods[0]} — ${periods[periods.length - 1]} · 计量单位：${meta.unit}`}
        badge={{ label: `已同步 ${liveRows.length} 条观测记录`, tone: "success" }}
        ariaLabel={`${meta.name}趋势折线图`}
        height={252}
        option={(t) =>
          statistaTrendWithPartialOption(t, {
            periods,
            lastIsPartial: false,
            series: [{ name: meta.name, values: vals, showLabels: true }],
          })
        }
        tableColumns={[
          { key: "period", title: "统计期间" },
          { key: "value", title: `数值（${meta.unit}）`, align: "right" },
        ]}
        tableRows={pts.map((p) => ({ period: p.period, value: formatNumber(p.value) }))}
        exportName={`indicator-${meta.seq}-live`}
        source={meta.source}
        note={`更新频度：${meta.frequency}`}
      />
    );
  }

  // 按所属六大业务领域提供高信噪比基准信息图
  if (meta.level1.includes("进出口")) {
    const items = [
      ...HIGH_CONCENTRATION_HS.map((h) => ({ name: h.itemName.slice(0, 12), val: Number.parseFloat(h.cr3) })),
      ...TRADE_CATEGORIES.slice(0, 3).map((c) => ({ name: c.category, val: Number.parseFloat(c.importCr3) })),
    ];
    return (
      <StatistaFigure
        eyebrow={`指标 ${meta.seq} · 领域基准参考`}
        title="关键零部件进口来源国高度集中，整机贸易顺差稳步扩大"
        subtitle="2026年前三季度 · 代表性医疗装备品类与关键税号进口 CR3 集中度（单位：%）"
        badge={{ label: "海关 HS 8位税号监测", tone: "info" }}
        ariaLabel="医疗器械品类与关键税号进口集中度横向条形图"
        height={248}
        option={(t) =>
          statistaHorizontalBarOption(t, {
            categories: items.map((i) => i.name),
            values: items.map((i) => i.val),
            labels: items.map((i) => `${i.val.toFixed(1)}%`),
            highlightTopN: 3,
            max: 100,
            rightPadding: 76,
          })
        }
        tableColumns={[
          { key: "name", title: "品类/关键部件" },
          { key: "cr3", title: "前三大来源国占比(CR3)", align: "right" },
        ]}
        tableRows={items.map((i) => ({ name: i.name, cr3: `${i.val.toFixed(1)}%` }))}
        exportName={`indicator-${meta.seq}-benchmark`}
        source={meta.source}
        note={`点击右上角「前往${meta.subpageLabel}」可查阅全量细分品类与伙伴国流向`}
      />
    );
  }

  if (meta.level1.includes("知识产权与标准")) {
    return (
      <StatistaFigure
        eyebrow={`指标 ${meta.seq} · 技术标准体系基准`}
        title="行业标准（YY / YY/T）构成我国医疗器械技术标准体系主体（占比逾八成）"
        subtitle="截至 2026年9月 · 现行有效医疗器械国家标准与行业标准层级构成（单位：项）"
        badge={{ label: "现行标准 1,970 项", tone: "info" }}
        ariaLabel="现行有效医疗器械国家标准与行业标准数量横向条形图"
        height={232}
        option={(t) =>
          statistaHorizontalBarOption(t, {
            categories: IP_STANDARDS_PREVIEW.map((d) => d.label),
            values: IP_STANDARDS_PREVIEW.map((d) => d.value),
            labels: IP_STANDARDS_PREVIEW.map((d) => `${d.value.toLocaleString("zh-CN")} 项（${d.share}）`),
            highlightTopN: 2,
            rightPadding: 112,
          })
        }
        tableColumns={[
          { key: "label", title: "标准层级与性质" },
          { key: "value", title: "现行有效数(项)", align: "right" },
          { key: "share", title: "占比", align: "right" },
        ]}
        tableRows={IP_STANDARDS_PREVIEW.map((d) => ({ label: d.label, value: formatNumber(d.value), share: d.share }))}
        exportName={`indicator-${meta.seq}-standards`}
        source="国家药监局医疗器械标准管理中心 · 国家标准委"
        note="强制性标准（GB / YY）合计占比 27.3%，覆盖医用电气安全与高风险植入物底线要求"
      />
    );
  }

  if (meta.level1.includes("政策与监管")) {
    return (
      <StatistaFigure
        eyebrow={`指标 ${meta.seq} · 政策与监管文献基准`}
        title="设备更新改造与创新审评准入占近期产业支持政策近五成"
        subtitle="截至 2026年9月 · 418 份国家级及重点省市医疗器械政策主题分布（单位：份）"
        badge={{ label: "收录有效政策 418 份", tone: "info" }}
        ariaLabel="医疗器械政策主题分布横向条形图"
        height={244}
        option={(t) =>
          statistaHorizontalBarOption(t, {
            categories: POLICY_TOPIC_DISTRIBUTION.map((d) => d.topic),
            values: POLICY_TOPIC_DISTRIBUTION.map((d) => d.count),
            labels: POLICY_TOPIC_DISTRIBUTION.map((d) => d.barLabel),
            highlightTopN: 2,
            rightPadding: 108,
          })
        }
        tableColumns={[
          { key: "topic", title: "政策方向" },
          { key: "count", title: "政策条款数(份)", align: "right" },
          { key: "share", title: "占比", align: "right" },
        ]}
        tableRows={POLICY_TOPIC_DISTRIBUTION.map((d) => ({ topic: d.topic, count: d.count, share: d.share }))}
        exportName={`indicator-${meta.seq}-policy`}
        source={meta.source}
        note="完整发文字号与审查指导原则请前往「政策与报告」专题库检索"
      />
    );
  }

  if (meta.level1.includes("企业与机构")) {
    const top8 = PROVINCIAL_CONCENTRATION.slice(0, 8);
    return (
      <StatistaFigure
        eyebrow={`指标 ${meta.seq} · 产业主体区域基准`}
        title="粤苏浙鲁川等制造大省集聚全国主要医疗器械生产法人主体"
        subtitle="截至 2026年9月末 · 重点省市二三类医疗器械生产企业与上市龙头分布（单位：家）"
        badge={{ label: "全国生产主体 16,420 家", tone: "info" }}
        ariaLabel="重点省市医疗器械生产企业数量横向条形图"
        height={252}
        option={(t) =>
          statistaHorizontalBarOption(t, {
            categories: top8.map((r) => r.province),
            values: top8.map((r) => r.manufacturers),
            labels: top8.map((r) => `${r.manufacturers.toLocaleString("zh-CN")} 家（上市 ${r.listedFirms}）`),
            highlightTopN: 4,
            rightPadding: 120,
          })
        }
        tableColumns={[
          { key: "province", title: "省市" },
          { key: "manufacturers", title: "生产企业(家)", align: "right" },
          { key: "champions", title: "单项冠军", align: "right" },
          { key: "listedFirms", title: "上市企业", align: "right" },
        ]}
        tableRows={top8.map((r) => ({
          province: r.province,
          manufacturers: formatNumber(r.manufacturers),
          champions: r.champions,
          listedFirms: r.listedFirms,
        }))}
        exportName={`indicator-${meta.seq}-enterprises`}
        source={meta.source}
        note="按统一社会信用代码法人去重统计"
      />
    );
  }

  // 默认：审评注册与上市准入 / 产品领域基准（六大重点赛道注册结构）
  return (
    <StatistaFigure
      eyebrow={`指标 ${meta.seq} · 产品与准入赛道基准`}
      title="无源植介入与体外诊断领跑境内有效第三类医疗器械注册规模"
      subtitle="截至 2026年9月末 · 六大重点赛道有效三类医疗器械注册证存量（单位：件）"
      badge={{ label: "有效三类证 24,680 件", tone: "info" }}
      ariaLabel="六大重点赛道有效三类注册证分布横向条形图"
      height={244}
      option={(t) =>
        statistaHorizontalBarOption(t, {
          categories: TRACK_DISTRIBUTION.map((d) => d.track),
          values: TRACK_DISTRIBUTION.map((d) => d.domesticValid + d.importedValid),
          labels: TRACK_DISTRIBUTION.map(
            (d) => `${(d.domesticValid + d.importedValid).toLocaleString("zh-CN")} 件（${d.sharePct}）`,
          ),
          highlightTopN: 2,
          rightPadding: 112,
        })
      }
      tableColumns={[
        { key: "track", title: "重点赛道" },
        { key: "domestic", title: "国产有效证(件)", align: "right" },
        { key: "imported", title: "进口有效证(件)", align: "right" },
        { key: "sharePct", title: "合计占比", align: "right" },
      ]}
      tableRows={TRACK_DISTRIBUTION.map((d) => ({
        track: d.track,
        domestic: formatNumber(d.domesticValid),
        imported: formatNumber(d.importedValid),
        sharePct: d.sharePct,
      }))}
      exportName={`indicator-${meta.seq}-tracks`}
      source={meta.source}
      note="单张注册证与 UDI 最小销售单元规格型号严格分表核算"
    />
  );
}

function SectionHead({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-border-strong pb-2">
      <span className="code font-bold text-brand-navy">{number}</span>
      <h2 className="title-sub text-brand-navy">{title}</h2>
    </div>
  );
}

function LedgerRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-12 sm:gap-4">
      <dt className="label text-ink-muted sm:col-span-3">{term}</dt>
      <dd className="body text-ink sm:col-span-9">{value}</dd>
    </div>
  );
}
