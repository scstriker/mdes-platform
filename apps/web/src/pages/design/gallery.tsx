import { useState, type ReactNode } from "react";
import {
  IconDownload,
  IconFilter,
  IconLayoutDashboard,
  IconListDetails,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  AppFooter,
  AppHeader,
  Breadcrumbs,
  Card,
  DataTable,
  Descriptions,
  Dropzone,
  EmptyState,
  Field,
  KpiTile,
  Notice,
  NumberedNav,
  ProgressMeter,
  SectionTitle,
  Stepper,
  TabBar,
  Tag,
  TextLink,
  Tree,
  type DataTableColumn,
  type NavItem,
} from "@/components/itei";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { floatingPanelClass, menuItemClass } from "@/components/ui/overlay";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_ERROR_CODES, errorMessage, rowErrorMessage, SERVER_ERROR_CODES, useHealth } from "@/lib/api";
import { baseOption, categoryAxis, LazyChart, valueAxis, type ChartTheme } from "@/lib/charts/lazy-chart";
import { cn } from "@/lib/utils";
import { CLUSTER_TREE, EXPORT_SERIES, HS_ROWS, IMPORT_SERIES, MONTHS, type HsRow } from "./demo-data";

/* ------------------------------------------------------------------ */

function Demo({ title, note, children, sunken }: { title: string; note?: string; children: ReactNode; sunken?: boolean }) {
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <SectionTitle level={2}>{title}</SectionTitle>
        {note && <span className="body-sm text-ink-muted">{note}</span>}
      </div>
      <div className={cn("overflow-x-auto border border-border p-4 md:p-6", sunken ? "bg-surface-sunken" : "bg-surface")}>
        {children}
      </div>
    </section>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 caption text-ink-muted">{children}</p>;
}

/* ------------------------------------------------------------------ */

const SWATCHES: [string, string][] = [
  ["--brand-navy", "bg-brand-navy"],
  ["--brand-navy-deep", "bg-brand-navy-deep"],
  ["--brand-red", "bg-brand-red"],
  ["--brand-sky", "bg-brand-sky"],
  ["--link", "bg-link"],
  ["--surface", "bg-surface"],
  ["--surface-sunken", "bg-surface-sunken"],
  ["--surface-raised", "bg-surface-raised"],
  ["--ink", "bg-ink"],
  ["--ink-muted", "bg-ink-muted"],
  ["--border", "bg-border"],
  ["--border-strong", "bg-border-strong"],
  ["--success", "bg-success"],
  ["--warning", "bg-warning"],
  ["--info-bg", "bg-info-bg"],
  ["--chart-4", "bg-chart-4"],
  ["--chart-5", "bg-chart-5"],
];

const TEXT_STYLES: [string, string, string][] = [
  ["title-page", "title-page", "验收汇报"],
  ["title-section", "title-section", "一、项目运行情况"],
  ["title-sub", "title-sub", "1.1 服务成效——政府支撑及行业服务"],
  ["title-nav", "title-nav", "项目建设背景"],
  ["body-lg", "body-lg", "累计收到相关产品信息 200 余份，并通过导出功能形成标准化的数据表单。"],
  ["body", "body", "机械工业仪器仪表综合技术经济研究所"],
  ["body-sm", "body-sm", "项目负责人：梅恪"],
  ["caption", "caption", "2025/7/8 · 第 3 页"],
  ["label", "label", "报告时间"],
  ["numeral", "numeral", "01  02  03"],
  ["code", "code", "HS 9018.90"],
];

const DEMO_NAV = (current: string): NavItem[] =>
  [
    { href: "/", label: "概览", icon: IconLayoutDashboard },
    { href: "/indicators", label: "指标目录", icon: IconListDetails },
    { href: "/observations", label: "观测值", icon: IconTable },
    { href: "/import", label: "数据导入", icon: IconUpload },
  ].map((n) => ({ ...n, current: n.href === current }));

const HS_COLUMNS: DataTableColumn<HsRow>[] = [
  { key: "hs", title: "HS 编码", type: "code", sortable: true },
  { key: "name", title: "商品名称", primary: true },
  { key: "amount", title: "2024 进口额（万美元）", type: "number", sortable: true },
  {
    key: "yoy",
    title: "同比",
    type: "number",
    cell: (r) => `${r.yoy > 0 ? "+" : r.yoy < 0 ? "−" : ""}${Math.abs(r.yoy).toFixed(1)}%`,
  },
  {
    key: "status",
    title: "状态",
    type: "status",
    cell: (r) => (
      <Tag size="sm" tone={r.status === "已核对" ? "success" : "info"}>
        {r.status}
      </Tag>
    ),
  },
];

function lineOption(t: ChartTheme) {
  const last = IMPORT_SERIES.length - 1;
  return {
    ...baseOption(t, 1),
    xAxis: categoryAxis(t, MONTHS),
    yAxis: valueAxis(t, { scale: true }),
    series: [
      {
        type: "line" as const,
        name: "进口金额",
        data: IMPORT_SERIES.map((v, i) =>
          i === last ? { value: v, itemStyle: { color: t.emphasis }, symbolSize: 8 } : v,
        ),
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2 },
      },
    ],
  };
}

function barOption(t: ChartTheme) {
  return {
    ...baseOption(t, 2),
    xAxis: categoryAxis(t, MONTHS),
    yAxis: valueAxis(t),
    series: [
      { type: "bar" as const, name: "进口", data: IMPORT_SERIES, barMaxWidth: 24 },
      { type: "bar" as const, name: "出口", data: EXPORT_SERIES, barMaxWidth: 24 },
    ],
  };
}

/* ------------------------------------------------------------------ */

export function Gallery({ theme }: { theme: "light" | "dark" }) {
  const [treeSelected, setTreeSelected] = useState("TRD-001");
  const [file, setFile] = useState<File | null>(() => new File(["indicator_id,period\n"], "trd_sample.csv", { type: "text/csv" }));
  const [page, setPage] = useState(1);
  const [step, setStep] = useState(1);

  return (
    <div className="grid gap-10">
      <Demo title="色板" note="ITEI token，深色主题由同名变量驱动">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="border border-border p-2">
              <span className={cn("mb-1.5 block h-10 border border-border", cls)} />
              <span className="code text-ink">{name}</span>
            </div>
          ))}
        </div>
      </Demo>

      <Demo title="文字样式" note="注册为工具类，可配合响应式前缀">
        <dl className="grid gap-3">
          {TEXT_STYLES.map(([name, cls, sample]) => (
            <div key={name} className="grid gap-1 border-b border-border pb-3 md:grid-cols-4 md:gap-4">
              <dt className="code text-ink-muted">{name}</dt>
              <dd className={cn("md:col-span-3", cls)}>{sample}</dd>
            </div>
          ))}
        </dl>
      </Demo>

      <Demo title="AppHeader" note="白底变体：下沿 3px 深蓝 + 2px 亮蓝双线；窄屏隐藏导航，改用 TabBar">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <StateLabel>当前项「概览」，右侧为操作区</StateLabel>
            <AppHeader
              sticky={false}
              title="一、项目运行情况"
              nav={DEMO_NAV("/")}
              actions={
                <Button variant="ghost" size="icon" aria-label="示例操作">
                  <IconRefresh />
                </Button>
              }
            />
          </div>
        </div>
      </Demo>

      <Demo title="SectionTitle" note="章 / 节 / 小节三级标题">
        <div className="grid justify-items-start gap-6">
          <SectionTitle level={1} number="一" as="h3">
            项目运行情况
          </SectionTitle>
          <SectionTitle level={2} number="1.1" as="h4">
            服务成效——政府支撑及行业服务
          </SectionTitle>
          <SectionTitle level={3} as="h5">
            有效支撑「仪器仪表创新产品」征集遴选工作
          </SectionTitle>
        </div>
      </Demo>

      <Demo title="NumberedNav" note="目录 / 功能入口：已完成、当前（红）、默认">
        <NumberedNav
          aria-label={`示例目录（${theme}）`}
          current={1}
          done={[0]}
          items={[{ label: "项目建设背景" }, { label: "项目执行情况" }, { label: "项目运行情况" }, { label: "项目管理情况" }]}
        />
      </Demo>

      <Demo title="Stepper" note="基于 NumberedNav 的导入向导步骤条；点按钮切换">
        <div className="grid gap-4">
          <Stepper aria-label={`导入步骤（${theme}）`} steps={["上传文件", "预校验", "导入", "结果"]} current={step} />
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
            <Button size="sm" disabled={step === 3} onClick={() => setStep((s) => s + 1)}>
              下一步
            </Button>
          </div>
        </div>
      </Demo>

      <Demo title="Button" note="主 / 次 / 危险 / 文字 四种，两种尺寸">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button>提交申报</Button>
            <Button variant="secondary">保存草稿</Button>
            <Button variant="danger">删除</Button>
            <Button variant="ghost">查看详情 →</Button>
            <Button disabled>已提交</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">
              <IconDownload />
              导出
            </Button>
            <Button size="sm" variant="secondary">
              <IconFilter />
              筛选
            </Button>
            <Button size="sm" variant="ghost">
              重置
            </Button>
            <Button size="sm" variant="secondary" disabled>
              不可用
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <IconPlus />
              新建批次
            </Button>
            <Button variant="danger">
              <IconTrash />
              删除批次
            </Button>
            <Button variant="ghost" size="icon" aria-label="刷新">
              <IconRefresh />
            </Button>
            <span className="caption text-ink-muted">焦点态 →</span>
            <Button className="focus-ring-static">键盘焦点</Button>
          </div>
        </div>
      </Demo>

      <Demo title="Card" note="边线分层的内容卡片，可带标题栏" sunken>
        <div className="grid gap-6 md:grid-cols-2">
          <Card
            title="仪器仪表创新产品征集"
            meta="2025/7/8"
            footer={
              <Button variant="ghost" size="sm">
                查看明细
              </Button>
            }
          >
            通过「机械工业数字化转型平台」网上填写申报表格，累计收到相关产品信息 200 余份。
          </Card>
          <Card title="标准立项进度" raised>
            6 项行业标准中 4 项已完成报批，2 项处于征求意见阶段。
          </Card>
        </div>
      </Demo>

      <Demo title="Field / Input" note="标签在上方；错误以「✕ 错误：」开头；禁用写明原因">
        <div className="grid max-w-3xl gap-x-6 gap-y-4 md:grid-cols-2">
          <Field label="项目名称" required help="与立项文件一致">
            <Input defaultValue="医疗器械产业数据系统" />
          </Field>
          <Field label="项目负责人">
            <Select defaultValue="mei">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mei">梅恪</SelectItem>
                <SelectItem value="chen">陈实</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="联系电话" required error="请输入完整的 11 位或带区号的固定电话">
            <Input defaultValue="010-6326" />
          </Field>
          <Field label="所属中心" disabled help="由账号决定，不可修改">
            <Input defaultValue="传感与仪器中心" />
          </Field>
          <Field label="期间" help="格式 YYYY-MM 或 YYYY">
            <Input placeholder="例如 2024-03" />
          </Field>
          <Field label="指标簇">
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="全部簇" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRD">TRD 进出口贸易</SelectItem>
                <SelectItem value="REG">REG 审评注册与上市准入</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="备注" className="md:col-span-2">
            <Textarea placeholder="导入说明（选填）" />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id={`only-phase1-${theme}`} defaultChecked />
            <Label htmlFor={`only-phase1-${theme}`}>只看一期指标</Label>
          </div>
          <div className="flex items-center gap-3">
            <span className="caption text-ink-muted">焦点态 →</span>
            <Input aria-label="焦点态示例" defaultValue="键盘焦点" className="focus-ring-static border-brand-navy" />
          </div>
        </div>
      </Demo>

      <Demo title="Tag" note="状态标签：色 + 字，从不只靠颜色">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tag>草稿</Tag>
            <Tag tone="info">审核中</Tag>
            <Tag tone="success">已通过</Tag>
            <Tag tone="warning">待补充</Tag>
            <Tag tone="danger">已驳回</Tag>
            <Tag tone="brand">行业标准</Tag>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="caption text-ink-muted">表格内 sm →</span>
            <Tag size="sm" tone="success">
              已入库
            </Tag>
            <Tag size="sm">未入库</Tag>
            <Tag size="sm" tone="warning">
              部分失败
            </Tag>
          </div>
        </div>
      </Demo>

      <Demo title="Footer / TabBar" note="桌面：深蓝页脚条，右段文字不再被斜切遮住；窄屏：底部 TabBar">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <StateLabel>应用页脚（右段留出装饰宽度）</StateLabel>
            <AppFooter
              className="flex"
              left="医疗器械产业数据系统（MDES）"
              center="机械工业仪器仪表综合技术经济研究所（ITEI）"
              right="一期演示"
            />
          </div>
          <div className="max-w-sm">
            <StateLabel>TabBar（当前项「指标目录」）</StateLabel>
            <TabBar fixed={false} className="md:block" nav={DEMO_NAV("/indicators")} />
          </div>
        </div>
      </Demo>

      <Demo title="DataTable" note="深蓝表头文字、斑马行、无竖线；数字右对齐千分位；窄屏改卡片">
        <div className="grid gap-8">
          <div>
            <StateLabel>正常（可点击表头排序）· 分页</StateLabel>
            <DataTable
              caption="医疗器械进口额示例"
              columns={HS_COLUMNS}
              data={HS_ROWS}
              getRowId={(r) => r.hs}
              pagination={{ page, pageSize: 4, total: 37, onPageChange: setPage }}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <StateLabel>加载中</StateLabel>
              <DataTable caption="加载中示例" columns={HS_COLUMNS.slice(0, 3)} data={[]} loading />
            </div>
            <div>
              <StateLabel>空数据</StateLabel>
              <DataTable caption="空数据示例" columns={HS_COLUMNS.slice(0, 3)} data={[]} empty="该指标还没有导入数据" />
            </div>
            <div>
              <StateLabel>请求失败（不当成空数据）</StateLabel>
              <DataTable
                caption="请求失败示例"
                columns={HS_COLUMNS.slice(0, 3)}
                data={[]}
                error={errorMessage("NETWORK_ERROR")}
              />
            </div>
          </div>
          <div>
            <StateLabel>dense</StateLabel>
            <DataTable caption="紧凑示例" columns={HS_COLUMNS} data={HS_ROWS.slice(0, 2)} dense />
          </div>
        </div>
      </Demo>

      <Demo title="KpiTile" note="统计数字卡：顶部红条一组至多一块" sunken>
        <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
          <KpiTile label="收到申报" value={213} unit="份" delta="较上期 +18" tone="up" highlight />
          <KpiTile label="通过初审" value={156} unit="份" delta="通过率 73.2%" />
          <KpiTile label="待补充材料" value={27} unit="份" delta="需本周处理" tone="down" />
          <KpiTile label="进口金额" value={135.1} unit="亿元" delta="2024-06" trend={IMPORT_SERIES} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:mt-6 md:gap-6 lg:grid-cols-4">
          <KpiTile label="加载中" value={null} loading />
          <KpiTile label="一期已入库" value={2} unit="/ 30 项" delta="其余待导入" />
        </div>
      </Demo>

      <Demo title="Tree" note="簇树：当前项浅底 + 左侧 4px 深蓝；方向键可操作">
        <div className="max-w-sm border border-border bg-surface-sunken py-2">
          <Tree
            aria-label={`指标簇（${theme}）`}
            nodes={CLUSTER_TREE}
            selectedId={treeSelected}
            onSelect={setTreeSelected}
            defaultExpandedIds={["TRD"]}
          />
        </div>
      </Demo>

      <Demo title="Dropzone" note="CSV 上传：默认、已选文件、错误">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <StateLabel>默认</StateLabel>
            <Dropzone file={null} onFileChange={() => {}} accept=".csv,text/csv" hint="仅支持 .csv，单次不超过 5000 行" />
          </div>
          <div>
            <StateLabel>已选文件</StateLabel>
            <Dropzone file={file} onFileChange={setFile} accept=".csv,text/csv" hint="仅支持 .csv，单次不超过 5000 行" />
          </div>
          <div>
            <StateLabel>错误</StateLabel>
            <Dropzone
              file={null}
              onFileChange={() => {}}
              accept=".csv,text/csv"
              error={errorMessage("MISSING_HEADER", { header: "period" })}
            />
          </div>
        </div>
      </Demo>

      <Demo title="Descriptions" note="规格与元数据的键值列表">
        <Descriptions
          items={[
            { term: "指标编号", value: <span className="code">TRD-001</span> },
            { term: "所属簇", value: "进出口贸易（TRD）" },
            { term: "更新频率", value: "月（海关）/ 年（Comtrade）" },
            { term: "来源", value: <Tag size="sm" tone="info">公开数据</Tag> },
            { term: "采集方式", value: null },
            { term: "阶段", value: "一期" },
            {
              term: "业务定义",
              long: true,
              value:
                "本指标属于「进出口贸易（TRD）」簇下的事实型指标，记录粒度为「医疗器械 HS 编码 × 贸易伙伴国 / 关区 × 月度 / 年度」。\n计量单位为美元 / 人民币。",
            },
          ]}
        />
      </Demo>

      <Demo title="Notice / EmptyState" note="状态横幅：浅底 + 图标 + 文字；错误自动带「错误：」。空状态与请求失败分开">
        <div className="grid gap-3">
          <Notice tone="info" title="一期 30 项指标中 5 项已入库">其余指标导入观测值后自动更新。</Notice>
          <Notice tone="success" title="导入完成">10 行全部写入，批次 8906a7d3。</Notice>
          <Notice tone="warning" title="部分行未导入">3 行校验失败，详见下方行错误。</Notice>
          <Notice
            tone="danger"
            title={errorMessage("NETWORK_ERROR")}
            action={
              <Button variant="secondary" size="sm">
                <IconRefresh />
                重试
              </Button>
            }
          />
          <EmptyState
            title="该指标还没有导入数据"
            description="导入 CSV 观测值后，这里显示图表与数据表。"
            action={<Button size="sm">去导入</Button>}
          />
        </div>
      </Demo>

      <Demo title="ProgressMeter / Breadcrumbs / TextLink" note="进度条用 brand-sky；面包屑当前页不加链接；文字链接用 link 色">
        <div className="grid max-w-md gap-5">
          <div className="grid gap-1.5">
            <div className="flex justify-between body-sm">
              <span>进出口贸易（TRD）一期覆盖</span>
              <span className="tabular-nums text-ink-muted">5 / 5</span>
            </div>
            <ProgressMeter value={5} max={5} label="TRD 一期覆盖率" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between body-sm">
              <span>企业主体（ENT）一期覆盖</span>
              <span className="tabular-nums text-ink-muted">0 / 8</span>
            </div>
            <ProgressMeter value={0} max={8} label="ENT 一期覆盖率" />
          </div>
          <Breadcrumbs items={[{ label: "指标目录", href: "/indicators" }, { label: "进出口贸易", href: "/indicators?cluster=TRD" }, { label: "TRD-001" }]} />
          <p className="body">
            导入后可在
            <TextLink inline to="/observations">
              观测值
            </TextLink>
            页按批次查询。
          </p>
        </div>
      </Demo>

      <Demo title="Tabs" note="当前项 2px 深蓝下划线，与页眉导航同一语言">
        <Tabs defaultValue="data">
          <TabsList>
            <TabsTrigger value="data">数据</TabsTrigger>
            <TabsTrigger value="spec">规格</TabsTrigger>
            <TabsTrigger value="related">关联指标</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              地图（暂无）
            </TabsTrigger>
          </TabsList>
          <TabsContent value="data" className="body">
            图表与数据表。
          </TabsContent>
          <TabsContent value="spec" className="body">
            长文规格。
          </TabsContent>
          <TabsContent value="related" className="body">
            由规格正文中出现的指标编号生成。
          </TabsContent>
        </Tabs>
      </Demo>

      <Demo title="浮层" note="直角、1px 边线、shadow-raised / shadow-modal；150–200ms 淡入，无缩放">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <StateLabel>下拉面板外观（静态）</StateLabel>
            <div role="menu" aria-label="下拉面板示例" className={cn(floatingPanelClass, "w-56 py-1")}>
              <div role="menuitem" tabIndex={-1} className={menuItemClass}>
                跟随系统
              </div>
              <div role="menuitem" tabIndex={-1} className={cn(menuItemClass, "bg-accent text-accent-foreground")}>
                浅色（悬停 / 键盘高亮）
              </div>
              <div role="menuitem" tabIndex={-1} aria-disabled="true" data-disabled="" className={menuItemClass}>
                深色（不可用）
              </div>
            </div>
          </div>
          <div className="grid content-start justify-items-start gap-3">
            <StateLabel>对话框</StateLabel>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">打开对话框</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>删除导入批次</DialogTitle>
                  <DialogDescription>批次中的 10 条观测值将一并删除，此操作不可撤销。</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="danger">删除</Button>
                  <Button variant="secondary">取消</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Demo>

      <Demo title="Skeleton" note="静态占位块，不闪烁">
        <div className="grid max-w-md gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </Demo>

      <Demo title="图表（ECharts）" note="懒加载、SVG 渲染；序列色 chart-1…5，最新期用 chart-3 强调；单序列不显示图例">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-2">
            <h4 className="title-sub text-ink">医疗装备进口金额（亿元，单序列）</h4>
            <LazyChart option={lineOption} ariaLabel="2024 年 1–6 月医疗装备进口金额折线图" height={240} />
          </div>
          <div className="grid gap-2">
            <h4 className="title-sub text-ink">进出口对比（亿元，多序列）</h4>
            <LazyChart option={barOption} ariaLabel="2024 年 1–6 月医疗装备进出口金额柱状图" height={240} />
          </div>
        </div>
      </Demo>

      <ApiErrors />
    </div>
  );
}

function ApiErrors() {
  const health = useHealth();
  const examples: Record<string, Record<string, string | number>> = {
    MISSING_HEADER: { header: "period" },
    ROW_LIMIT_EXCEEDED: { max: 5000, actual: 6210 },
    REQUIRED_FIELD_MISSING: { field: "period" },
    INVALID_VALUE_NUM: { value: "12,3" },
    UNKNOWN_INDICATOR: { indicator_id: "TRD-099" },
    NOT_FOUND: { id: "TRD-099" },
    HTTP_ERROR: { status: 500 },
  };
  const rows = [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES].map((code) => ({
    code,
    message: errorMessage(code, examples[code]),
  }));
  return (
    <Demo title="API 错误文案" note="按错误码映射中文提示；CSV 行错误加「第 N 行：」">
      <div className="grid gap-4">
        <p className="body">
          <span className="label text-ink-muted">接口连通：</span>
          {health.isPending ? (
            "检查中"
          ) : health.isError ? (
            <span className="text-danger">错误：{health.error.message}</span>
          ) : (
            <Tag tone={health.data.ok ? "success" : "warning"}>
              {health.data.ok ? "数据库（D1）就绪" : "数据库不可用"}
            </Tag>
          )}
        </p>
        <p className="body">
          <span className="label text-ink-muted">行错误示例：</span>
          {rowErrorMessage({ line: 5, code: "UNKNOWN_INDICATOR", params: { indicator_id: "TRD-099" } })}
        </p>
        <DataTable
          caption="错误码与中文文案"
          dense
          columns={[
            { key: "code", title: "错误码", type: "code", primary: true },
            { key: "message", title: "中文文案" },
          ]}
          data={rows}
          getRowId={(r) => r.code}
        />
      </div>
    </Demo>
  );
}
