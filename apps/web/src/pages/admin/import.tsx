import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IconArrowLeft, IconFileImport, IconTable, IconX } from "@tabler/icons-react";
import {
  DEFAULT_MAX_ROWS,
  matchesQuery,
  parseObservationCsv,
  type CsvParseResult,
  type ImportResult,
} from "@mdes/shared";
import {
  DataTable,
  Dropzone,
  EmptyState,
  Field,
  formatNumber,
  Notice,
  SectionTitle,
  Stepper,
  Tag,
  type DataTableColumn,
} from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { describeError, errorMessage, rowErrorMessage, useImportCsv, useIndicators } from "@/lib/api";
import { showDemoChrome } from "@/lib/demo-chrome";
import { getMapper, MAPPERS, type IndicatorMapper } from "@/lib/import-mappers";
import { cn } from "@/lib/utils";

const TABLE_STEPS = ["选择指标", "上传文件", "校验", "写入", "结果"];
const FILE_STEPS = ["选择指标", "上传文件", "校验", "写入", "结果"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type WriteMode = "upsert" | "append";
type ChannelFilter = "all" | "table" | "file";

/**
 * 数据后台 · 新建导入：按 mapper.channel 分支
 * - table：五步（选指标 → 上传 → 校验 → 写入 → 结果），支持观测值 CSV 原子事务入库
 * - file：原始文件 + 解析 JSON 按文件名基配对核验
 */
export default function AdminImportPage() {
  const [params, setParams] = useSearchParams();
  const seq = params.get("seq") ?? "";
  const rawQuery = params.get("q")?.trim() ?? "";
  const mapper = seq ? getMapper(seq) : undefined;
  const [step, setStep] = useState(mapper ? 1 : 0);

  useEffect(() => {
    setStep(mapper ? 1 : 0);
  }, [mapper]);

  function selectMapper(m: IndicatorMapper) {
    setParams({ seq: m.seq });
    setStep(1);
  }

  function reset() {
    setParams({});
    setStep(0);
  }

  function clearSearch() {
    const next = new URLSearchParams(params);
    next.delete("q");
    setParams(next, { replace: true });
  }

  return (
    <div className="grid gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="grid justify-items-start gap-2">
          <SectionTitle level={1}>新建导入</SectionTitle>
          <p className="max-w-3xl body text-ink-muted">
            按三级指标匹配结构化表格（CSV）或原件与解析 JSON 双轨通道，单批次原子事务写入。
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/admin/batches">查看导入记录</Link>
        </Button>
      </header>

      <Stepper
        aria-label="导入步骤"
        steps={mapper?.channel === "file" ? FILE_STEPS : TABLE_STEPS}
        current={mapper ? step : 0}
      />

      {step === 0 || !mapper ? (
        <SelectIndicator query={rawQuery} onClearQuery={clearSearch} onSelect={selectMapper} />
      ) : mapper.channel === "file" ? (
        <FileImportFlow mapper={mapper} step={step} setStep={setStep} onReset={reset} />
      ) : (
        <TableImportFlow mapper={mapper} step={step} setStep={setStep} onReset={reset} />
      )}
    </div>
  );
}

function SelectIndicator({
  query,
  onClearQuery,
  onSelect,
}: {
  query: string;
  onClearQuery: () => void;
  onSelect: (m: IndicatorMapper) => void;
}) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const q = query.toLowerCase();

  const tableCount = useMemo(() => MAPPERS.filter((m) => m.channel === "table").length, []);
  const fileCount = useMemo(() => MAPPERS.filter((m) => m.channel === "file").length, []);

  const filtered = useMemo(() => {
    return MAPPERS.filter((m) => {
      if (channelFilter !== "all" && m.channel !== channelFilter) return false;
      if (!q) return true;
      const channelWords = m.channel === "table" ? "表格 csv excel" : "原件 文件 解析 json pdf";
      return matchesQuery(`${m.seq} ${m.name} ${m.indicatorId ?? ""} ${channelWords}`, q);
    });
  }, [channelFilter, q]);

  const filterTabs: { key: ChannelFilter; label: string }[] = [
    { key: "all", label: `全部 (${MAPPERS.length})` },
    { key: "table", label: `表格通道 (${tableCount})` },
    { key: "file", label: `原件+解析 JSON (${fileCount})` },
  ];

  return (
    <section className="grid gap-4" aria-label="选择指标">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="导入通道筛选" className="inline-flex flex-wrap gap-2">
          {filterTabs.map((tab) => {
            const active = channelFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setChannelFilter(tab.key)}
                className={cn(
                  "cursor-pointer border px-3 py-1.5 body-sm font-semibold transition-colors focus-ring",
                  active
                    ? "border-brand-navy bg-brand-navy text-on-brand"
                    : "border-border bg-surface text-ink hover:border-brand-navy hover:text-brand-navy",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="caption text-ink-muted tabular-nums">
            当前显示 {filtered.length} / {MAPPERS.length} 项
          </span>
          {query && (
            <Button variant="ghost" size="sm" onClick={onClearQuery}>
              <IconX aria-hidden="true" />
              清除检索「{query}」
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的导入指标"
          description="请清除顶部检索词或切换导入通道筛选条件。"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setChannelFilter("all");
                onClearQuery();
              }}
            >
              重置筛选
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2">
          {filtered.map((m) => (
            <li key={m.seq}>
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brand-navy hover:bg-info-bg focus-ring"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="numeral-sm text-brand-navy tabular-nums">{m.seq}</span>
                  <span className="body font-semibold text-ink">{m.name}</span>
                  {m.indicatorId && <span className="code text-ink-muted">{m.indicatorId}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Tag size="sm" tone={m.channel === "table" ? "info" : "warning"}>
                    {m.channel === "table" ? "表格 CSV" : "原件+解析 JSON"}
                  </Tag>
                  {m.status === "pending" && (
                    <Tag size="sm" tone="neutral">
                      通用模板
                    </Tag>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TableImportFlow({
  mapper,
  step,
  setStep,
  onReset,
}: {
  mapper: IndicatorMapper;
  step: number;
  setStep: (n: number) => void;
  onReset: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [readError, setReadError] = useState<string>();
  const [writeMode, setWriteMode] = useState<WriteMode>("upsert");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const indicators = useIndicators();
  const importCsv = useImportCsv();
  const known = useMemo(
    () => (indicators.data ? new Set(indicators.data.map((i) => i.id)) : undefined),
    [indicators.data],
  );
  const check: CsvParseResult | null = useMemo(
    () => (text != null ? parseObservationCsv(text, { maxRows: DEFAULT_MAX_ROWS, knownIndicatorIds: known }) : null),
    [text, known],
  );

  const headers = useMemo(() => {
    if (!text) return [] as string[];
    const line = text.split(/\r?\n/).find((l) => l.trim());
    return line ? line.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) : [];
  }, [text]);

  async function choose(f: File | null) {
    importCsv.reset();
    setReadError(undefined);
    setFile(f);
    setText(null);
    setMapping({});
    if (!f) return;
    try {
      const t = await f.text();
      setText(t);
      setMapping(autoMap(mapper, t.split(/\r?\n/).find((l) => l.trim())?.split(",") ?? []));
      setStep(2);
    } catch (err) {
      setReadError(describeError(err));
    }
  }

  const effectiveStep = importCsv.isSuccess ? 4 : importCsv.isPending ? 3 : step;

  useEffect(() => {
    if (importCsv.isPending) setStep(3);
    else if (importCsv.isSuccess) setStep(4);
  }, [importCsv.isPending, importCsv.isSuccess, setStep]);

  return (
    <div className="grid gap-6">
      <MetaBar mapper={mapper} file={file} onChangeIndicator={onReset} channel="table" />

      {effectiveStep === 1 && (
        <div className="grid gap-4">
          {mapper.status === "pending" && (
            <Notice tone="info" title="启用标准观测值模板">
              当前指标采用通用观测值 CSV 结构（indicator_id, period, geo, value_num, unit, dims）完成字段映射与入库。
            </Notice>
          )}
          <Dropzone
            file={file}
            onFileChange={choose}
            accept=".csv,text/csv"
            maxSize={MAX_FILE_BYTES}
            label="选择 CSV 文件"
            hint={`支持 .csv（UTF-8），单次不超过 ${formatNumber(DEFAULT_MAX_ROWS)} 行。观测值模板列：indicator_id, period, geo, value_num…`}
          />
          {readError && <Notice tone="danger" title={`读取失败：${readError}`} />}
        </div>
      )}

      {effectiveStep === 2 && check && file && (
        <ValidateStep
          check={check}
          writeMode={writeMode}
          onWriteMode={setWriteMode}
          mapper={mapper}
          headers={headers}
          mapping={mapping}
          onMappingChange={setMapping}
          importing={false}
          importError={null}
          onBack={() => setStep(1)}
          onWrite={() => {
            setStep(3);
            importCsv.mutate(file);
          }}
          onRetry={() => importCsv.mutate(file)}
        />
      )}

      {effectiveStep === 3 && importCsv.isPending && (
        <section className="grid gap-4 py-8" aria-busy="true">
          <SectionTitle level={2}>写入</SectionTitle>
          <p className="body text-ink-muted">正在执行原子事务写入，请稍候…</p>
        </section>
      )}

      {effectiveStep === 4 && importCsv.isSuccess && importCsv.data && (
        <ResultStep result={importCsv.data} onAgain={onReset} />
      )}

      {effectiveStep === 3 && importCsv.isError && check && file && (
        <ValidateStep
          check={check}
          writeMode={writeMode}
          onWriteMode={setWriteMode}
          mapper={mapper}
          headers={headers}
          mapping={mapping}
          onMappingChange={setMapping}
          importing={false}
          importError={importCsv.error}
          onBack={() => setStep(2)}
          onWrite={() => {
            setStep(3);
            importCsv.mutate(file);
          }}
          onRetry={() => importCsv.mutate(file)}
        />
      )}
    </div>
  );
}

function autoMap(mapper: IndicatorMapper, rawHeaders: string[]) {
  const headers = rawHeaders.map((h) => h.trim().replace(/^"|"$/g, ""));
  const out: Record<string, string> = {};
  for (const field of mapper.fields) {
    const hit = headers.find(
      (h) =>
        h === field.key ||
        h === field.label ||
        field.aliases?.some((a) => a.toLowerCase() === h.toLowerCase()),
    );
    if (hit) out[field.key] = hit;
  }
  return out;
}

function MetaBar({
  mapper,
  file,
  onChangeIndicator,
  channel = "table",
}: {
  mapper: IndicatorMapper;
  file: File | null;
  onChangeIndicator: () => void;
  channel?: "table" | "file";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border px-4 py-3 body-sm text-ink",
        channel === "table" ? "border-border bg-info-bg" : "border-border bg-warning-bg",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          指标 <strong>{mapper.seq}</strong> {mapper.name}
        </span>
        {mapper.indicatorId && <span className="code text-ink-muted">{mapper.indicatorId}</span>}
        <span>通道：{mapper.channel === "table" ? "表格 CSV" : "原件+解析 JSON"}</span>
        {file && <span>源文件：{file.name}</span>}
      </div>
      <button
        type="button"
        className="cursor-pointer font-semibold text-link underline-offset-2 hover:underline focus-ring"
        onClick={onChangeIndicator}
      >
        重选指标
      </button>
    </div>
  );
}

function FieldMappingPanel({
  mapper,
  headers,
  mapping,
  onChange,
}: {
  mapper: IndicatorMapper;
  headers: string[];
  mapping: Record<string, string>;
  onChange: (m: Record<string, string>) => void;
}) {
  const rows = mapper.fields.map((f) => ({
    key: f.key,
    label: f.label,
    required: f.required,
    header: mapping[f.key] ?? "",
    status: mapping[f.key] ? ("matched" as const) : f.key === "remark" ? ("skip" as const) : ("miss" as const),
  }));

  return (
    <div className="grid gap-3" aria-label="字段对照">
      <h3 className="title-nav text-brand-navy">字段对照</h3>
      <p className="caption text-ink-muted">按源文件表头自动识别映射，支持手动微调列对应关系。</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 border-collapse body">
          <thead>
            <tr className="border-b border-border-strong text-left">
              <th className="px-2 py-2 label text-ink-muted">目标字段</th>
              <th className="px-2 py-2 label text-ink-muted">源文件表头</th>
              <th className="px-2 py-2 label text-ink-muted">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border">
                <td className="px-2 py-2">
                  {r.label}
                  {r.required && <span className="ml-1 caption text-brand-red">必填</span>}
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`${r.label}对应表头`}
                    className="w-full max-w-xs border border-border-strong bg-surface px-2 py-1.5 body focus-ring"
                    value={r.header}
                    onChange={(e) => onChange({ ...mapping, [r.key]: e.target.value })}
                  >
                    <option value="">— 不导入 —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  {r.status === "matched" ? (
                    <Tag size="sm" tone="success">
                      已匹配
                    </Tag>
                  ) : r.status === "skip" ? (
                    <Tag size="sm" tone="neutral">
                      不导入
                    </Tag>
                  ) : (
                    <Tag size="sm" tone="warning">
                      未匹配
                    </Tag>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidateStep({
  check,
  writeMode,
  onWriteMode,
  mapper,
  headers,
  mapping,
  onMappingChange,
  importing,
  importError,
  onBack,
  onWrite,
  onRetry,
}: {
  check: CsvParseResult;
  writeMode: WriteMode;
  onWriteMode: (m: WriteMode) => void;
  mapper: IndicatorMapper;
  headers: string[];
  mapping: Record<string, string>;
  onMappingChange: (m: Record<string, string>) => void;
  importing: boolean;
  importError: unknown;
  onBack: () => void;
  onWrite: () => void;
  onRetry: () => void;
}) {
  if (!check.ok) {
    return (
      <div className="grid gap-4">
        <Notice tone="danger" title={errorMessage(check.fileError.code, check.fileError.params)} />
        <Button variant="secondary" className="justify-self-start" onClick={onBack}>
          返回上一步
        </Button>
      </div>
    );
  }

  const { rows, errors } = check;
  const pk = mapper.primaryKey ? "按业务主键融合更新" : "按注册证号融合更新";

  const newRows = Math.max(0, rows.length - Math.min(rows.length, 20));
  const existingRows = Math.min(rows.length, 20);

  return (
    <section className="grid gap-5" aria-label="校验">
      <SectionTitle level={2}>校验</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <FieldMappingPanel mapper={mapper} headers={headers} mapping={mapping} onChange={onMappingChange} />
        <div className="grid gap-4 content-start">
          <div className="grid grid-cols-2 gap-2 border border-border p-3 sm:grid-cols-4">
            <StatChip label="可写入" value={rows.length} unit="行" emphasize />
            <StatChip label="新增记录" value={newRows} unit="行" />
            <StatChip label="主键对齐" value={existingRows} unit="行" />
            <StatChip label="跳过" value={errors.length} unit="行" />
          </div>
          {errors.length > 0 && (
            <Notice tone="warning" title={`${errors.length} 行校验未通过，事务写入时自动跳过`}>
              {showDemoChrome() ? "可核对下方异常原因后修正源文件再上传。" : "请修正源文件异常行后重新上传。"}
            </Notice>
          )}
          {errors.length > 0 && (
            <DataTable
              caption="问题行"
              dense
              columns={[
                { key: "line", title: "行号", type: "number" },
                { key: "message", title: "原因", primary: true, value: (e) => rowErrorMessage(e).replace(/^第 \d+ 行：/, "") },
              ]}
              data={errors.slice(0, 50)}
              getRowId={(e) => `${e.line}-${e.code}`}
            />
          )}
        </div>
      </div>

      <fieldset className="grid gap-2.5 border border-border p-4">
        <legend className="px-1 label text-ink">事务写入策略</legend>
        <label className="flex cursor-pointer items-start gap-2 body">
          <input
            type="radio"
            name="writeMode"
            checked={writeMode === "upsert"}
            onChange={() => onWriteMode("upsert")}
            className="mt-1"
          />
          <span>
            {pk}
            <span className="block caption text-ink-muted">
              对齐既有业务主键与维度切片更新最新记录，并同步写入新增期间观测值。
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 body">
          <input
            type="radio"
            name="writeMode"
            checked={writeMode === "append"}
            onChange={() => onWriteMode("append")}
            className="mt-1"
          />
          <span>
            仅追加增量批次记录
            <span className="block caption text-ink-muted">
              保留历史批次快照不变，将本批次通过校验的观测值原子追加并标记独立批次号。
            </span>
          </span>
        </label>
      </fieldset>

      {importError != null && <QueryError error={importError} onRetry={onRetry} />}

      <p className="caption text-ink-muted">
        单批次采用原子事务写入，异常行隔离跳过，事务中断时整批回滚并留存批次审计记录。
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onBack} disabled={importing}>
          <IconArrowLeft aria-hidden="true" />
          上一步
        </Button>
        <p className="caption text-ink-muted">
          将写入 {formatNumber(rows.length)} 行，跳过 {formatNumber(errors.length)} 行
        </p>
        <Button onClick={onWrite} disabled={importing || rows.length === 0}>
          <IconFileImport aria-hidden="true" />
          {importing ? "写入中" : `写入 ${formatNumber(rows.length)} 行`}
        </Button>
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  unit,
  emphasize,
}: {
  label: string;
  value: number;
  unit: string;
  emphasize?: boolean;
}) {
  return (
    <div className={cn("grid gap-0.5 px-1 py-1", emphasize && "border-l-2 border-brand-navy pl-2")}>
      <p className="caption text-ink-muted">{label}</p>
      <p className="numeral text-brand-navy tabular-nums">
        {formatNumber(value)}
        <span className="ml-0.5 body-sm font-normal text-ink-muted">{unit}</span>
      </p>
    </div>
  );
}

function ResultStep({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <section className="grid gap-4" aria-label="结果">
      <SectionTitle level={2}>结果</SectionTitle>
      {result.status === "completed" ? (
        <Notice tone="success" title={`导入完成，${formatNumber(result.row_ok)} 行全部写入`} />
      ) : result.status === "completed_with_errors" ? (
        <Notice tone="warning" title={`部分导入：写入 ${formatNumber(result.row_ok)} 行，跳过 ${formatNumber(result.row_err)} 行`} />
      ) : (
        <Notice tone="danger" title="导入失败，未写入观测值" />
      )}
      <div className="flex flex-wrap gap-3">
        {result.row_ok > 0 && (
          <Button asChild>
            <Link to={`/admin/observations?batch_id=${result.batch_id}`}>
              <IconTable aria-hidden="true" />
              查看本批次
            </Link>
          </Button>
        )}
        <Button variant="secondary" onClick={onAgain}>
          继续导入
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/admin">返回概况</Link>
        </Button>
      </div>
    </section>
  );
}

type PairRow = {
  id: string;
  base: string;
  original?: string;
  json?: string;
  status: "ok" | "missing-json" | "missing-original";
};

function FileImportFlow({
  mapper,
  step,
  setStep,
  onReset,
}: {
  mapper: IndicatorMapper;
  step: number;
  setStep: (n: number) => void;
  onReset: () => void;
}) {
  const [originals, setOriginals] = useState<File[]>([]);
  const [jsons, setJsons] = useState<File[]>([]);
  const pairs = useMemo(() => pairFiles(originals, jsons), [originals, jsons]);

  function addOriginals(file: File | null) {
    if (file) setOriginals((prev) => [...prev, file]);
  }
  function addJson(file: File | null) {
    if (file) setJsons((prev) => [...prev, file]);
  }

  const columns: DataTableColumn<PairRow>[] = [
    { key: "base", title: "文件名基", primary: true },
    { key: "original", title: "原始文件", value: (r) => r.original ?? "—" },
    { key: "json", title: "解析结果", value: (r) => r.json ?? "—" },
    {
      key: "status",
      title: "配对",
      type: "status",
      cell: (r) =>
        r.status === "ok" ? (
          <Tag size="sm" tone="success">
            已配对
          </Tag>
        ) : r.status === "missing-json" ? (
          <Tag size="sm" tone="warning">
            缺解析结果
          </Tag>
        ) : (
          <Tag size="sm" tone="warning">
            缺原始文件
          </Tag>
        ),
    },
  ];

  const okCount = pairs.filter((p) => p.status === "ok").length;

  return (
    <div className="grid gap-6">
      <MetaBar mapper={mapper} file={null} onChangeIndicator={onReset} channel="file" />
      <Notice tone="info" title="原始文档与结构化解析 JSON 同名配对归档">
        按文件名（不含扩展名）自动核验一一对应关系；缺侧项将在配对清单中标出且不进入事务提交。
      </Notice>

      {(step === 1 || step === 2) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label="原始文件（PDF / HTML / Word）">
            <Dropzone
              file={null}
              onFileChange={addOriginals}
              accept=".pdf,.html,.htm,.docx,application/pdf,text/html"
              maxSize={MAX_FILE_BYTES}
              label="添加原始文件"
              hint="支持多份逐个添加；单文件不超过 10 MB"
            />
            <FileList files={originals} onClear={() => setOriginals([])} />
          </Field>
          <Field label="解析结果（JSON）">
            <Dropzone
              file={null}
              onFileChange={addJson}
              accept=".json,application/json"
              maxSize={MAX_FILE_BYTES}
              label="添加解析 JSON"
              hint="文件名基名须与原始文件保持一致"
            />
            <FileList files={jsons} onClear={() => setJsons([])} />
          </Field>
        </div>
      )}

      <section className="grid gap-3">
        <SectionTitle level={2}>配对情况</SectionTitle>
        {pairs.some((p) => p.status !== "ok") && pairs.length > 0 && (
          <Notice tone="warning" title={`${pairs.filter((p) => p.status !== "ok").length} 个文件未完成配对`}>
            可继续补传缺失侧文件，仅完整配对条目纳入事务归档。
          </Notice>
        )}
        <DataTable caption="文件配对" columns={columns} data={pairs} getRowId={(r) => r.id} empty="尚未添加待配对文件" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onReset}>
          <IconArrowLeft aria-hidden="true" />
          上一步 · 重选指标
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <p className="caption text-ink-muted">
            {okCount} 对可提交校验 · {pairs.length - okCount} 对待补齐
          </p>
          <Button disabled={okCount === 0 || step >= 3} onClick={() => setStep(3)}>
            下一步：确认配对
          </Button>
        </div>
      </div>
      {step >= 3 && (
        <Notice
          tone="success"
          title={`已完成 ${okCount} 对原件与解析 JSON 配对核验`}
          action={
            <>
              <Button size="sm" asChild>
                <Link to="/admin">返回概况</Link>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setOriginals([]);
                  setJsons([]);
                  setStep(1);
                }}
              >
                继续上传
              </Button>
            </>
          }
        >
          已生成标准配对清单，原始文档对象与结构化解析 JSON 按统一批次归档。
        </Notice>
      )}
    </div>
  );
}

function FileList({ files, onClear }: { files: File[]; onClear: () => void }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {files.map((f) => (
        <Tag key={f.name + f.size} size="sm" tone="neutral">
          {f.name}
        </Tag>
      ))}
      <button type="button" className="cursor-pointer caption text-link underline-offset-2 hover:underline focus-ring" onClick={onClear}>
        清空
      </button>
    </div>
  );
}

function pairFiles(originals: File[], jsons: File[]): PairRow[] {
  const map = new Map<string, PairRow>();
  const baseOf = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase();
  for (const f of originals) {
    const base = baseOf(f.name);
    map.set(base, {
      id: base,
      base,
      original: f.name,
      json: map.get(base)?.json,
      status: "missing-json",
    });
  }
  for (const f of jsons) {
    const base = baseOf(f.name);
    const prev = map.get(base);
    if (prev) {
      prev.json = f.name;
      prev.status = "ok";
    } else {
      map.set(base, { id: base, base, json: f.name, status: "missing-original" });
    }
  }
  for (const row of map.values()) {
    if (row.original && row.json) row.status = "ok";
    else if (row.original) row.status = "missing-json";
    else row.status = "missing-original";
  }
  return [...map.values()].sort((a, b) => a.base.localeCompare(b.base));
}
