import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconSearch } from "@tabler/icons-react";
import { NumberedNav, Tag, TextLink } from "@/components/itei";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SYSTEM_INDICATORS } from "@/content/system-v3";
import { showDemoChrome } from "@/lib/demo-chrome";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "s-desc", number: "01", label: "说明" },
  { id: "s-stats", number: "02", label: "数值统计" },
  { id: "s-detail", number: "03", label: "对象明细" },
  { id: "s-caliber", number: "04", label: "口径与来源" },
  { id: "s-related", number: "05", label: "关联指标" },
] as const;

const DETAIL_01 = {
  seq: "01",
  title: "医疗器械注册与备案明细",
  unit: "件",
  source: "国家药监局",
  freq: "日",
  updated: "2026-09-30",
  records: "约 34.2 万",
  recordWhat:
    "逐条记录第二、三类医疗器械注册证和第一类备案凭证，保留产品名称、注册人、管理类别、批准日期、有效状态等信息；由这些明细汇总注册证数量。",
  canAnswer:
    "例如：近五年国产第三类注册证数量增长了多少？主要集中在哪些省份和产品类别？能否查看具体注册证？",
  tabs: ["期末有效存量", "年度首次注册", "一类备案"] as const,
  barTitle: "东部五省合计约占三类首次注册的 63%",
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
  reconcile: [
    { year: "2023", system: 2680, official: 2654, delta: "+1.0%" },
    { year: "2024", system: 2751, official: 2730, delta: "+0.8%" },
    { year: "2025", system: 2810, official: 2792, delta: "+0.6%" },
    { year: "2026", system: 2104, official: "—", delta: "—" },
  ],
  note: "注：示意条形图代替地图；正式区域展示须使用带审图号的标准底图。一类备案与二、三类注册统计口径不同，不宜直接加总。",
  caliber: [
    { term: "监测对象", value: "一、二、三类医疗器械及注册人 / 备案人" },
    { term: "粒度", value: "一张注册证或备案凭证一行" },
    { term: "统计说明", value: "存量有效与年度首次注册分开统计；一类备案按低风险管理口径" },
    { term: "主键", value: "注册证号 → 企业统一社会信用代码 → 产品类别 → UDI-DI" },
    { term: "数据来源", value: "国家药监局" },
    { term: "更新机制", value: "日更公开数据整理入库" },
  ],
  related: [
    { seq: "02", name: "创新医疗器械审查、获批产品" },
    { seq: "05", name: "医疗器械UDI规格型号明细" },
    { seq: "10", name: "企业持证产品" },
    { seq: "28", name: "药监注册监管年度报告" },
  ],
  filterTags: ["管理类别", "国产/进口", "产品类别", "省份", "年份"],
  questions: [
    "近五年国产第三类注册证数量增长了多少？",
    "主要集中在哪些省份和产品类别？",
    "能否查看具体注册证原文？",
  ],
  sampleRows: [
    { no: "国械注准2026301****", name: "腹腔内窥镜手术系统", org: "（示意）企业 A", region: "广东", date: "2026-09-26", status: "有效" },
    { no: "国械注准2026302****", name: "CT 图像处理软件", org: "（示意）企业 B", region: "北京", date: "2026-09-20", status: "有效" },
    { no: "国械注准2026303****", name: "高场磁共振成像系统", org: "（示意）企业 C", region: "江苏", date: "2026-09-12", status: "有效" },
  ],
};

export default function SystemDetailPage() {
  const { seq } = useParams();
  const meta = SYSTEM_INDICATORS.find((i) => i.seq === seq);
  if (seq === "01") return <Detail01 />;
  if (!meta) {
    return (
      <div className="mx-auto grid max-w-content gap-4 px-4 py-10 md:px-8">
        <p className="body">未找到序号 {seq} 的示意页。</p>
        <Button asChild variant="secondary">
          <Link to="/system">返回指标体系</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 md:px-8 md:py-10">
      <Breadcrumb seq={meta.seq} name={meta.name} />
      <header className="grid gap-3 border-b-2 border-brand-navy pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-brand-navy px-3 py-1 numeral-sm text-on-brand clip-slash">{meta.seq}</span>
          <h1 className="title-page text-brand-navy">{meta.name}</h1>
        </div>
        <MetaStrip
          items={[
            ["单位", meta.unit],
            ["来源", meta.source],
            ["频度", meta.frequency],
            ["一期", meta.phase1 ? "是" : "否"],
          ]}
        />
      </header>
      <p className="body text-ink-muted">
        完整报告式版式以「01 注册与备案」为模板。本页仅展示目录元数据，便于导航联调。
      </p>
      <Button asChild variant="secondary" className="justify-self-start">
        <Link to="/system">返回指标体系</Link>
      </Button>
    </div>
  );
}

function Detail01() {
  const d = DETAIL_01;
  const [tab, setTab] = useState<(typeof d.tabs)[number]>(d.tabs[1]);
  const [detailQuery, setDetailQuery] = useState("");
  const max = Math.max(...d.provinces.map((p) => p.value));
  const filteredRows = useMemo(() => {
    const q = detailQuery.trim().toLowerCase();
    if (!q) return d.sampleRows;
    return d.sampleRows.filter((r) =>
      [r.no, r.name, r.org, r.region, r.date].some((v) => v.toLowerCase().includes(q)),
    );
  }, [d.sampleRows, detailQuery]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 py-8 md:flex-row md:px-8 md:py-10">
      <nav aria-label="本页章节" className="shrink-0 md:sticky md:top-20 md:w-48 md:self-start">
        <NumberedNav
          aria-label="章节"
          className="max-w-none"
          items={SECTIONS.map((s) => ({
            number: s.number,
            label: s.label,
            href: `/system/01#${s.id}`,
          }))}
        />
      </nav>

      <div className="min-w-0 flex-1 grid gap-12">
        <div className="grid gap-4">
          <Breadcrumb
            seq={d.seq}
            name={d.title}
            level1="审评注册与上市准入"
            level2="（一）注册与备案"
          />
          <header className="grid gap-3 border-b-2 border-brand-navy pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-brand-navy px-3 py-1 numeral-sm text-on-brand clip-slash">{d.seq}</span>
                <h1 className="title-page text-brand-navy">{d.title}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag size="sm" tone="info">
                  一期
                </Tag>
                <Button variant="secondary" size="sm" type="button" disabled>
                  引用
                </Button>
                <Button variant="secondary" size="sm" type="button" disabled>
                  导出数据
                </Button>
              </div>
            </div>
            <MetaStrip
              items={[
                ["单位", d.unit],
                ["来源", d.source],
                ["频度", d.freq],
                ["更新", d.updated],
                ["记录", d.records],
              ]}
            />
          </header>
        </div>

        <section id="s-desc" className="grid scroll-mt-24 gap-4">
          <SectionHead number="01" title="说明" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="grid gap-3 lg:col-span-2">
              <p className="body text-ink">
                <span className="font-semibold">记录什么：</span>
                {d.recordWhat}
              </p>
              <div className="flex flex-wrap gap-2">
                {d.filterTags.map((tag) => (
                  <Tag key={tag} size="sm" tone="neutral">
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
            <aside className="border border-border bg-info-bg p-4">
              <h3 className="mb-2 title-nav text-brand-navy">能回答什么</h3>
              <ol className="grid gap-2">
                {d.questions.map((q, i) => (
                  <li key={q} className="flex gap-2 body-sm text-ink">
                    <span className="shrink-0 font-semibold text-brand-navy">{String(i + 1).padStart(2, "0")}</span>
                    {q}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section id="s-stats" className="grid scroll-mt-24 gap-4">
          <SectionHead number="02" title="数值统计" />
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="统计口径">
            {d.tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "border px-3 py-1.5 body transition-colors focus-ring",
                  tab === t
                    ? "border-brand-navy bg-info-bg font-semibold text-brand-navy"
                    : "border-border text-ink hover:border-brand-navy",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["维度", "管理类别", "产品类别"].map((f) => (
              <Tag key={f} size="sm" tone="neutral">
                {f}
              </Tag>
            ))}
          </div>
          <h3 className="title-sub text-brand-navy">{d.barTitle}</h3>
          <div className="grid gap-6 lg:grid-cols-2">
            <ul className="grid gap-2">
              {d.provinces.map((p) => (
                <li key={p.name} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 body-sm text-ink">{p.name}</span>
                  <div className="h-3 min-w-0 flex-1 bg-surface-sunken">
                    <div className="h-full bg-brand-navy" style={{ width: `${(p.value / max) * 100}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right body-sm tabular-nums text-ink-muted">{p.value}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-2">
              <h4 className="title-nav text-ink">与官方年报对照</h4>
              <table className="w-full border-collapse body-sm">
                <thead>
                  <tr className="border-b border-border-strong text-left">
                    <th className="px-2 py-2 label text-ink-muted">年</th>
                    <th className="px-2 py-2 label text-ink-muted">本系统</th>
                    <th className="px-2 py-2 label text-ink-muted">年报</th>
                    <th className="px-2 py-2 label text-ink-muted">差</th>
                  </tr>
                </thead>
                <tbody>
                  {d.reconcile.map((r) => (
                    <tr key={r.year} className="border-b border-border">
                      <td className="px-2 py-2 tabular-nums">{r.year}</td>
                      <td className="px-2 py-2 tabular-nums">{r.system}</td>
                      <td className="px-2 py-2 tabular-nums">{r.official}</td>
                      <td className="px-2 py-2 tabular-nums text-ink-muted">{r.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="caption text-ink-muted">{d.note}</p>
        </section>

        <section id="s-detail" className="grid scroll-mt-24 gap-4">
          <SectionHead number="03" title="对象明细" />
          <div className="relative max-w-md">
            <IconSearch size={18} className="pointer-events-none absolute top-2.5 left-2 text-ink-muted" aria-hidden />
            <Input
              value={detailQuery}
              onChange={(e) => setDetailQuery(e.target.value)}
              placeholder="搜索注册证号、产品、注册人…"
              className="pl-9"
              aria-label="搜索明细"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse body" style={{ minWidth: 800 }}>
              <caption className="sr-only">注册证明细示意</caption>
              <thead>
                <tr className="border-b border-border-strong bg-surface-sunken text-left">
                  <th className="px-2 py-2 label text-ink-muted">注册证号</th>
                  <th className="px-2 py-2 label text-ink-muted">产品名称</th>
                  <th className="px-2 py-2 label text-ink-muted">注册人</th>
                  <th className="px-2 py-2 label text-ink-muted">地区</th>
                  <th className="px-2 py-2 label text-ink-muted">批准日期</th>
                  <th className="px-2 py-2 label text-ink-muted">状态</th>
                  <th className="px-2 py-2 label text-ink-muted">原文</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.no} className="border-b border-border">
                    <td className="px-2 py-2.5 code">{r.no}</td>
                    <td className="px-2 py-2.5">{r.name}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{showDemoChrome() ? r.org : r.org.replace(/（示意）/g, "")}</td>
                    <td className="px-2 py-2.5">{r.region}</td>
                    <td className="px-2 py-2.5 tabular-nums">{r.date}</td>
                    <td className="px-2 py-2.5">
                      <Tag size="sm" tone="success">
                        {r.status}
                      </Tag>
                    </td>
                    <td className="px-2 py-2.5">
                      <TextLink to="#">原文</TextLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="s-caliber" className="grid scroll-mt-24 gap-4">
          <SectionHead number="04" title="口径与来源" />
          <dl className="grid gap-3 border border-border p-4 md:grid-cols-2">
            {d.caliber.map((item) => (
              <div key={item.term}>
                <dt className="label text-ink-muted">{item.term}</dt>
                <dd className="mt-1 body text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="s-related" className="grid scroll-mt-24 gap-4">
          <SectionHead number="05" title="关联指标" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.related.map((r) => (
              <li key={r.seq} className="border border-border p-4">
                <p className="numeral-sm text-brand-navy">{r.seq}</p>
                <TextLink to={`/system/${r.seq}`} className="mt-2 block">
                  {r.name}
                </TextLink>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SectionHead({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="inline-block w-fit border-b-2 border-brand-sky pb-1 title-sub text-ink">
      <b className="mr-2 text-brand-navy">{number}</b>
      {title}
    </h2>
  );
}

function MetaStrip({ items }: { items: [string, string][] }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 caption text-ink-muted">
      {items.map(([k, v]) => (
        <span key={k}>
          {k} {v}
        </span>
      ))}
    </p>
  );
}

function Breadcrumb({
  seq,
  name,
  level1,
  level2,
}: {
  seq: string;
  name: string;
  level1?: string;
  level2?: string;
}) {
  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-2 caption text-ink-muted">
      <Link to="/system" className="text-link underline-offset-2 hover:underline focus-ring">
        指标体系
      </Link>
      {level1 && (
        <>
          <span aria-hidden="true">/</span>
          <Link to="/system#l1-reg" className="hover:text-brand-navy focus-ring">
            {level1}
          </Link>
        </>
      )}
      {level2 && (
        <>
          <span aria-hidden="true">/</span>
          <span>{level2}</span>
        </>
      )}
      <span aria-hidden="true">/</span>
      <span className="text-ink">
        {seq} {name}
      </span>
    </nav>
  );
}
