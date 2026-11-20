import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconSearch } from "@tabler/icons-react";
import { DataTable, formatNumber, Tag, TextLink, type DataTableColumn } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DATA_FORM_LABEL,
  LEVEL1_SECTIONS,
  SYSTEM_INDICATORS,
  SYSTEM_NOTE,
  type DataForm,
  type IndicatorPhase,
  type SystemIndicator,
} from "@/content/system-v3";
import { showDemoChrome } from "@/lib/demo-chrome";
import { cn } from "@/lib/utils";

const CHAPTERS = [
  { id: "s-definition", number: "01", label: "定义与问题" },
  { id: "s-preview", number: "02", label: "统计与数据预览" },
  { id: "s-caliber", number: "03", label: "口径与边界" },
  { id: "s-related", number: "04", label: "关联指标" },
] as const;

const RETIRED_SEQS = new Set(["17", "18", "31", "33", "34"]);

const CHANNEL_DESCRIPTION: Record<SystemIndicator["channel"], string> = {
  table: "关系型结构化统计与明细表入库",
  file: "官方发布原件与条款/章节级结构化 JSON 成对归档",
  mixed: "结构化数据表与原件解析混合入库",
};

type RegTabKey = "stock" | "initial" | "filing";

const REG_01_VIEWS: readonly {
  key: RegTabKey;
  label: string;
  barTitle: string;
  provinces: readonly { name: string; value: number }[];
}[] = [
  {
    key: "stock",
    label: "期末有效存量",
    barTitle: "期末有效国产第三类注册证存量集中于苏粤京沪浙五省市",
    provinces: [
      { name: "江苏", value: 4620 },
      { name: "广东", value: 4390 },
      { name: "北京", value: 4180 },
      { name: "上海", value: 3750 },
      { name: "浙江", value: 2840 },
      { name: "山东", value: 1920 },
      { name: "天津", value: 1360 },
      { name: "湖北", value: 1190 },
    ],
  },
  {
    key: "initial",
    label: "年度首次注册",
    barTitle: "东部五省市合计约占国产第三类年度首次注册的 63%",
    provinces: [
      { name: "广东", value: 412 },
      { name: "江苏", value: 386 },
      { name: "上海", value: 341 },
      { name: "北京", value: 338 },
      { name: "浙江", value: 297 },
      { name: "山东", value: 186 },
      { name: "湖北", value: 142 },
      { name: "四川", value: 128 },
    ],
  },
  {
    key: "filing",
    label: "第一类备案",
    barTitle: "第一类医疗器械备案凭证按设区的市级部门归集（低风险管理口径）",
    provinces: [
      { name: "广东", value: 28450 },
      { name: "江苏", value: 24120 },
      { name: "浙江", value: 19680 },
      { name: "山东", value: 17940 },
      { name: "河北", value: 11260 },
      { name: "河南", value: 10430 },
      { name: "上海", value: 8950 },
      { name: "湖北", value: 8310 },
    ],
  },
];

const REG_01_RECONCILE = [
  { year: "2023", system: 2680, official: "2,654", delta: "+1.0%" },
  { year: "2024", system: 2751, official: "2,730", delta: "+0.8%" },
  { year: "2025", system: 2810, official: "2,792", delta: "+0.6%" },
  { year: "2026（前三季度）", system: 2104, official: "待年报发布", delta: "—" },
] as const;

const REG_01_SAMPLES = [
  {
    no: "国械注准2026301****",
    name: "腹腔内窥镜手术系统",
    category: "第三类 · 01有源手术器械",
    org: "（示意）深圳精微医疗科技有限公司",
    region: "广东",
    date: "2026-09-26",
    status: "有效",
  },
  {
    no: "国械注准2026306****",
    name: "医用血管造影 X 射线机",
    category: "第三类 · 06医用成像器械",
    org: "（示意）北京华影医疗设备有限公司",
    region: "北京",
    date: "2026-09-20",
    status: "有效",
  },
  {
    no: "国械注准2026313****",
    name: "植入式心脏起搏器",
    category: "第三类 · 12有源植入器械",
    org: "（示意）苏州心脉医疗器械股份有限公司",
    region: "江苏",
    date: "2026-09-12",
    status: "有效",
  },
  {
    no: "国械注准2026321****",
    name: "冠脉CT血流储备分数计算软件",
    category: "第三类 · 21医用软件",
    org: "（示意）上海数智医学影像有限公司",
    region: "上海",
    date: "2026-09-04",
    status: "有效",
  },
] as const;

const TRADE_38_PREVIEW = [
  {
    category: "医学影像与放疗设备",
    hsScope: "9018.12–9018.19 / 9022",
    exportUsd: "54.8",
    importUsd: "76.2",
    cr3: "美国 · 德国 · 日本（71.4%）",
  },
  {
    category: "医用耗材与敷料",
    hsScope: "3005 / 9018.31–9018.39",
    exportUsd: "118.4",
    importUsd: "52.6",
    cr3: "美国 · 爱尔兰 · 德国（58.2%）",
  },
  {
    category: "保健康复与植介入器械",
    hsScope: "9019 / 9021",
    exportUsd: "79.3",
    importUsd: "64.5",
    cr3: "美国 · 瑞士 · 德国（64.9%）",
  },
  {
    category: "体外诊断仪器与试剂",
    hsScope: "9027.80 / 3822.19",
    exportUsd: "36.2",
    importUsd: "53.8",
    cr3: "美国 · 德国 · 日本（69.1%）",
  },
  {
    category: "口腔设备与材料",
    hsScope: "9018.41–9018.49 / 9021.29",
    exportUsd: "23.9",
    importUsd: "21.3",
    cr3: "德国 · 瑞士 · 韩国（61.7%）",
  },
] as const;

function renderHeaderPhaseTag(phase: IndicatorPhase) {
  if (phase === "phase1") {
    return (
      <Tag size="sm" tone="info">
        一期纳入
      </Tag>
    );
  }
  if (phase === "partial") {
    return (
      <Tag size="sm" tone="neutral">
        一期部分纳入
      </Tag>
    );
  }
  return (
    <Tag size="sm" tone="neutral">
      二期规划
    </Tag>
  );
}

function renderTablePhaseCell(phase: IndicatorPhase) {
  if (phase === "phase1") {
    return (
      <Tag size="sm" tone="info">
        一期
      </Tag>
    );
  }
  if (phase === "partial") {
    return (
      <Tag size="sm" tone="neutral">
        部分
      </Tag>
    );
  }
  return <span className="caption text-ink-muted">二期</span>;
}

function buildDataFormLedger(meta: SystemIndicator): {
  key: DataForm;
  title: string;
  included: boolean;
  deliverable: string;
}[] {
  const hasStat = meta.dataForms.includes("stat");
  const hasDetail = meta.dataForms.includes("detail");
  const hasText = meta.dataForms.includes("text");
  const dimPreview = meta.dimensions.slice(0, 4).join("、");

  return [
    {
      key: "stat",
      title: "数值统计",
      included: hasStat,
      deliverable: hasStat
        ? `按「${dimPreview}」等维度聚合多期时间序列与结构占比（单位：${meta.unit}，${meta.frequency}度更新），支撑趋势研判与区域/赛道集中度对比。`
        : `本项以非量纲名录、档案或政策法规条款为主（计量单位：${meta.unit}），不单独输出宏观加总量纲，可与关联统计指标联合研判。`,
    },
    {
      key: "detail",
      title: "对象明细",
      included: hasDetail,
      deliverable: hasDetail
        ? `按「${meta.grain}」逐条建档，依托主键链「${meta.entityKeys}」实现跨库实体对齐、条件筛选与单条记录溯源。`
        : `本项采自官方年度统计公报或汇总报告（${meta.source}），按报告统计表项留存权威基准值，不拆解微观个体台账。`,
    },
    {
      key: "text",
      title: "结构化文本",
      included: hasText,
      deliverable: hasText
        ? `成对保存「${meta.source}」原始发布文件与章节/条款级解析 JSON，保留文号、页码与段落溯源锚点以供原文核验。`
        : `通过标准化关系型字段直接采集入库，无需非结构化长文档切分，全部属性均可通过结构化列检索。`,
    },
  ];
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
            ? `序号 ${normalizedSeq} 在《指标体系 V3.0》修订中已精简合并。${SYSTEM_NOTE}`
            : `当前《指标体系 V3.0》共收录 33 项三级指标（编号 01–38），未找到序号「${seq}」。`}
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
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        const first = CHAPTERS.find((c) => visible.has(c.id));
        if (first) {
          setActiveChapter(first.id);
        }
      },
      { rootMargin: "-88px 0px -60% 0px", threshold: 0 },
    );

    for (const el of elements) {
      observer.observe(el);
    }
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
        title: "关联指标名称",
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
        title: "阶段",
        colClassName: "w-20",
        cell: (r) => renderTablePhaseCell(r.phase),
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

      <div className="min-w-0 flex-1 grid gap-10">
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
                {renderHeaderPhaseTag(meta.phase)}
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
              <span>数据来源：{meta.source}</span>
            </p>
          </header>
        </div>

        {/* 01 定义与典型研判问题 */}
        <section id="s-definition" className="grid scroll-mt-24 gap-5">
          <SectionHead number="01" title="定义与典型研判问题" />
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-0 lg:divide-x lg:divide-border">
            <div className="grid content-start gap-4 lg:col-span-7 lg:pr-8">
              <div className="grid gap-1.5">
                <h3 className="label text-ink-muted">记录什么</h3>
                <p className="body text-ink">{meta.recordWhat}</p>
              </div>
              <div className="grid gap-2">
                <h3 className="label text-ink-muted">统计维度</h3>
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
              <h3 className="label text-ink-muted">典型研判问题</h3>
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

        {/* 02 统计与数据预览 */}
        <section id="s-preview" className="grid scroll-mt-24 gap-6">
          <SectionHead number="02" title="统计与数据预览" />
          {meta.seq === "01" ? <Preview01 meta={meta} /> : <StructuredDataPreview meta={meta} />}
        </section>

        {/* 03 口径说明与禁止推断 */}
        <section id="s-caliber" className="grid scroll-mt-24 gap-5">
          <SectionHead number="03" title="口径说明与禁止推断" />
          <dl className="divide-y divide-border border-t border-b border-border">
            <LedgerRow term="记录粒度" value={meta.grain} />
            <LedgerRow term="实体关联主键" value={<span className="code text-ink">{meta.entityKeys}</span>} />
            <LedgerRow term="权威数据来源" value={meta.source} />
            <LedgerRow
              term="更新机制"
              value={`${meta.frequency}度更新 · ${CHANNEL_DESCRIPTION[meta.channel]}`}
            />
          </dl>

          <div role="note" className="border-l-2 border-brand-red py-1 pl-4">
            <p className="body text-ink">
              <strong className="font-semibold text-brand-red">口径边界与禁止推断：</strong>
              {meta.boundary}
            </p>
          </div>
        </section>

        {/* 04 关联指标 */}
        <section id="s-related" className="grid scroll-mt-24 gap-4">
          <SectionHead number="04" title="关联指标" />
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

function Preview01({ meta }: { meta: SystemIndicator }) {
  const [tabKey, setTabKey] = useState<RegTabKey>("initial");
  const [detailQuery, setDetailQuery] = useState("");
  const demoChrome = showDemoChrome();

  const activeIdx = REG_01_VIEWS.findIndex((v) => v.key === tabKey);
  const currentView = REG_01_VIEWS[activeIdx >= 0 ? activeIdx : 1];
  const maxVal = Math.max(...currentView.provinces.map((p) => p.value));

  const filteredRows = useMemo(() => {
    const q = detailQuery.trim().toLowerCase();
    if (!q) return REG_01_SAMPLES;
    return REG_01_SAMPLES.filter((r) =>
      [r.no, r.name, r.category, r.org, r.region, r.date].some((v) => v.toLowerCase().includes(q)),
    );
  }, [detailQuery]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-5">
        <div role="tablist" aria-label="注册与备案统计口径" className="flex flex-wrap gap-6 border-b border-border">
          {REG_01_VIEWS.map((view, idx) => {
            const selected = view.key === tabKey;
            return (
              <button
                key={view.key}
                id={`tab-01-${idx}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="panel-01-stats"
                onClick={() => setTabKey(view.key)}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 pb-2.5 button transition-colors focus-ring",
                  selected
                    ? "border-brand-navy text-brand-navy"
                    : "border-transparent text-ink-muted hover:text-brand-navy",
                )}
              >
                {view.label}
              </button>
            );
          })}
        </div>

        <div
          id="panel-01-stats"
          role="tabpanel"
          aria-labelledby={`tab-01-${activeIdx >= 0 ? activeIdx : 1}`}
          className="grid gap-5"
        >
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="grid content-start gap-3 lg:col-span-6">
              <h3 className="title-nav text-brand-navy">{currentView.barTitle}</h3>
              <ul className="grid gap-2.5">
                {currentView.provinces.map((p) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 body-sm text-ink">{p.name}</span>
                    <div className="h-3 min-w-0 flex-1 bg-surface-sunken">
                      <div className="h-full bg-brand-navy" style={{ width: `${(p.value / maxVal) * 100}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right body-sm tabular-nums text-ink-muted">
                      {formatNumber(p.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid content-start gap-3 lg:col-span-6">
              <h3 className="title-nav text-brand-navy">与国家药监局统计年报交叉对账（三类首次注册）</h3>
              <Table dense>
                <TableCaption className="sr-only">本系统明细汇总与药监统计年报对照表</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>统计年度</TableHead>
                    <TableHead className="text-right">本库汇总（件）</TableHead>
                    <TableHead className="text-right">药监年报（件）</TableHead>
                    <TableHead className="text-right">口径差异</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {REG_01_RECONCILE.map((r) => (
                    <TableRow key={r.year}>
                      <TableCell className="tabular-nums">{r.year}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.system)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.official}</TableCell>
                      <TableCell className="text-right tabular-nums text-ink-muted">{r.delta}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="border-l-2 border-brand-sky pl-3 caption text-ink-muted">
            注：采用水平条形图表达各省市获批规模（正式区域地图展示须使用带审图号标准底图）。第一类备案与第二、三类注册证管理层级不同，严禁直接合并加总。
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="title-nav text-brand-navy">对象明细抽样预览</h3>
          <div className="relative w-full sm:w-72">
            <IconSearch
              size={18}
              className="pointer-events-none absolute top-2.5 left-2.5 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              value={detailQuery}
              onChange={(e) => setDetailQuery(e.target.value)}
              placeholder="搜索注册证号、产品、注册人…"
              className="pl-9"
              aria-label="搜索注册证明细"
            />
          </div>
        </div>

        <Table dense>
          <TableCaption className="sr-only">医疗器械注册证明细抽样记录</TableCaption>
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
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-ink-muted">
                  未匹配到符合「{detailQuery}」的抽样记录。
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EngineeringSeriesLinks meta={meta} />
    </div>
  );
}

function StructuredDataPreview({ meta }: { meta: SystemIndicator }) {
  const formRows = useMemo(() => buildDataFormLedger(meta), [meta]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h3 className="title-nav text-brand-navy">数据构成与接入视图</h3>
        <div className="divide-y divide-border border-y border-border">
          {formRows.map((row) => (
            <div key={row.key} className="grid gap-2 py-3.5 sm:grid-cols-12 sm:items-baseline sm:gap-4">
              <div className="flex items-center gap-2 sm:col-span-3">
                <span className="label text-ink">{row.title}</span>
                {row.included ? (
                  <Tag size="sm" tone="info">
                    本项包含
                  </Tag>
                ) : (
                  <span className="caption text-ink-muted">不涉及</span>
                )}
              </div>
              <p className={cn("body-sm sm:col-span-9", row.included ? "text-ink" : "text-ink-muted")}>
                {row.deliverable}
              </p>
            </div>
          ))}
        </div>
      </div>

      {meta.seq === "38" && (
        <div className="grid gap-3">
          <h3 className="title-nav text-brand-navy">五大器械品类进出口规模与来源国集中度预览（前三季度累计）</h3>
          <Table dense className="min-w-max">
            <TableCaption className="sr-only">医疗器械主要品类进出口规模与伙伴国集中度预览表</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>统计大类</TableHead>
                <TableHead>海关 HS 税则范围</TableHead>
                <TableHead className="text-right">出口额（亿美元）</TableHead>
                <TableHead className="text-right">进口额（亿美元）</TableHead>
                <TableHead>进口前三大伙伴国（CR3）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRADE_38_PREVIEW.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-semibold text-ink">{row.category}</TableCell>
                  <TableCell className="code text-ink-muted">{row.hsScope}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.exportUsd}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.importUsd}</TableCell>
                  <TableCell className="text-ink-muted">{row.cr3}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {meta.phase === "later" ? (
        <div className="grid gap-3">
          <h3 className="title-nav text-brand-navy">二期规划字段与接入契约</h3>
          <Table dense className="min-w-max">
            <TableCaption className="sr-only">{meta.name}二期规划字段与接入契约</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">契约要素</TableHead>
                <TableHead>字段与实体规则定义</TableHead>
                <TableHead className="w-44">数据约束与来源口径</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold text-ink">实体主键链</TableCell>
                <TableCell className="code text-ink">{meta.entityKeys}</TableCell>
                <TableCell className="text-ink-muted">跨库外键对齐</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-ink">唯一记录粒度</TableCell>
                <TableCell>{meta.grain}</TableCell>
                <TableCell className="text-ink-muted">去重与快照基准</TableCell>
              </TableRow>
              {meta.dimensions.map((dim, i) => (
                <TableRow key={dim}>
                  <TableCell className="text-ink-muted">
                    分析维度 {String(i + 1).padStart(2, "0")}
                  </TableCell>
                  <TableCell className="font-semibold text-ink">{dim}</TableCell>
                  <TableCell className="text-ink-muted">分组统计与筛选索引</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold text-ink">采集与更新</TableCell>
                <TableCell>{CHANNEL_DESCRIPTION[meta.channel]}</TableCell>
                <TableCell className="text-ink-muted">
                  {meta.source}（{meta.frequency}更）
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        meta.seq !== "38" && (
          <div className="grid gap-3">
            <h3 className="title-nav text-brand-navy">一期入库维度与实体对齐结构</h3>
            <Table dense className="min-w-max">
              <TableCaption className="sr-only">{meta.name}一期入库维度与主键结构</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">结构层级</TableHead>
                  <TableHead>核验规则与切片维度</TableHead>
                  <TableHead className="w-44">权威来源与频度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold text-ink">跨库实体主键</TableCell>
                  <TableCell className="code text-ink">{meta.entityKeys}</TableCell>
                  <TableCell className="text-ink-muted">一期主数据强校验</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold text-ink">入库记录粒度</TableCell>
                  <TableCell>{meta.grain}</TableCell>
                  <TableCell className="text-ink-muted">
                    {meta.source}（{meta.frequency}更）
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold text-ink">标准统计切片</TableCell>
                  <TableCell>{meta.dimensions.join(" · ")}</TableCell>
                  <TableCell className="text-ink-muted">计量单位：{meta.unit}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )
      )}

      <EngineeringSeriesLinks meta={meta} />
    </div>
  );
}

function EngineeringSeriesLinks({ meta }: { meta: SystemIndicator }) {
  if (meta.v12Codes.length === 0) {
    return (
      <div className="border-l-2 border-brand-sky py-1 pl-4 body-sm text-ink-muted">
        本指标按公报/档案文件通道组织入库，不映射单一数值序列编码；可前往{" "}
        <TextLink inline to={meta.subpageHref} className="body-sm">
          {meta.subpageLabel}专题页
        </TextLink>{" "}
        查阅同领域已发布成果，或浏览{" "}
        <TextLink inline to="/indicators" className="body-sm">
          底层工程指标库
        </TextLink>
        。
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="label text-ink-muted">关联底层工程序列与观测数据直达</h3>
        <TextLink to={meta.subpageHref} className="body-sm">
          前往{meta.subpageLabel}业务视图 →
        </TextLink>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {meta.v12Codes.map((code) => (
          <li key={code} className="flex flex-wrap items-center justify-between gap-3 py-2.5 body-sm">
            <span className="code font-semibold text-brand-navy">{code}</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <TextLink to={`/indicators/${encodeURIComponent(code)}`}>查看工程指标档案</TextLink>
              <TextLink to={`/observations?indicator_id=${encodeURIComponent(code)}`}>检索原始观测值 →</TextLink>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
