import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IconArrowLeft, IconFileImport, IconTable } from "@tabler/icons-react";
import {
  DEFAULT_MAX_ROWS,
  parseObservationCsv,
  type CsvParseResult,
  type ImportResult,
} from "@mdes/shared";
import {
  DataTable,
  Dropzone,
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
import { cn } from "@/lib/utils";
import { showDemoChrome } from "@/lib/demo-chrome";
import { getMapper, MAPPERS, type IndicatorMapper } from "@/lib/import-mappers";

const TABLE_STEPS = ["选择指标", "上传文件", "校验", "写入", "结果"];
const FILE_STEPS = ["选择指标", "上传文件", "校验", "写入", "结果"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type WriteMode = "upsert" | "append";

/**
 * 数据后台 · 新建导入：按 mapper.channel 分支
 * - table：五步（选指标 → 上传 → 对照 → 校验 → 写入），通用观测值 CSV 可落到现有 API
 * - file：原始文件 + JSON 配对（本轮演示配对 UI；落库示意）
 */
export default function AdminImportPage() {
  const [params, setParams] = useSearchParams();
  const seq = params.get("seq") ?? "";
  const mapper = seq ? getMapper(seq) : undefined;
  const [step, setStep] = useState(mapper ? 1 : 0);

  function selectMapper(m: IndicatorMapper) {
    setParams({ seq: m.seq });
    setStep(1);
  }

  function reset() {
    setParams({});
    setStep(0);
  }

  return (
    <div className="grid gap-6 p-4 md:p-8">
      <div>
        <SectionTitle level={1}>新建导入</SectionTitle>
        <p className="mt-2 body text-ink-muted">
          按指标选择通道：表格导入或文件与解析结果配对上传。同一事务写入，中途出错整批回滚。
        </p>
      </div>

      <Stepper
        aria-label="导入步骤"
        steps={mapper?.channel === "file" ? FILE_STEPS : TABLE_STEPS}
        current={step}
      />

      {step === 0 || !mapper ? (
        <SelectIndicator onSelect={selectMapper} />
      ) : mapper.channel === "file" ? (
        <FileImportFlow mapper={mapper} step={step} setStep={setStep} onReset={reset} />
      ) : (
        <TableImportFlow mapper={mapper} step={step} setStep={setStep} onReset={reset} />
      )}
    </div>
  );
}

function SelectIndicator({ onSelect }: { onSelect: (m: IndicatorMapper) => void }) {
  return (
    <section className="grid gap-4" aria-label="选择指标">
      <Notice tone="info" title="先选指标，再进入对应导入通道">
        字段清单未定的指标标为「模板待补」，仍可选中以演示流程。
      </Notice>
      <ul className="grid gap-2">
        {MAPPERS.map((m) => (
          <li key={m.seq}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="flex w-full flex-wrap items-center justify-between gap-3 border border-border px-4 py-3 text-left transition-colors hover:border-brand-navy hover:bg-info-bg focus-ring"
            >
              <span className="flex items-center gap-3">
                <span className="numeral-sm text-brand-navy">{m.seq}</span>
                <span className="body text-ink">{m.name}</span>
              </span>
              <span className="flex items-center gap-2">
                <Tag size="sm" tone={m.channel === "table" ? "info" : "warning"}>
                  {m.channel === "table" ? "表格" : "文件 + 解析"}
                </Tag>
                {m.status === "pending" && (
                  <Tag size="sm" tone="neutral">
                    模板待补
                  </Tag>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
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
            <Notice tone="warning" title="模板待补">
              {mapper.note ?? "正式字段清单尚未确定；仍可上传通用观测值 CSV 走现有写入通道。"}
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
          <p className="body text-ink-muted">正在事务写入，请稍候…</p>
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
        "flex flex-wrap items-center gap-x-4 gap-y-1 border px-4 py-3 body-sm text-ink",
        channel === "table" ? "border-border bg-info-bg" : "border-border bg-warning-bg",
      )}
    >
      <span>
        指标 <strong>{mapper.seq}</strong> {mapper.name}
      </span>
      <span>方式 {mapper.channel === "table" ? "表格" : "文件 + 解析"}</span>
      {file && <span>文件 {file.name}</span>}
      <button type="button" className="text-link underline-offset-2 hover:underline focus-ring" onClick={onChangeIndicator}>
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
      <p className="caption text-ink-muted">按表头自动对应，可手动调整。</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 border-collapse body">
          <thead>
            <tr className="border-b border-border-strong text-left">
              <th className="px-2 py-2 label text-ink-muted">目标字段</th>
              <th className="px-2 py-2 label text-ink-muted">表头</th>
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
  const pk = mapper.primaryKey ? "按主键更新" : "按注册证号更新";

  const newRows = Math.max(0, rows.length - Math.min(rows.length, 20));
  const existingRows = Math.min(rows.length, 20);

  return (
    <section className="grid gap-5" aria-label="校验">
      <SectionTitle level={2}>校验</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <FieldMappingPanel mapper={mapper} headers={headers} mapping={mapping} onChange={onMappingChange} />
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 border border-border p-3 sm:grid-cols-4">
            <StatChip label="可写入" value={rows.length} unit="行" emphasize />
            <StatChip label="新记录" value={newRows} unit="行" />
            <StatChip label="已有记录" value={existingRows} unit="行" />
            <StatChip label="跳过" value={errors.length} unit="行" />
          </div>
          {errors.length > 0 && (
            <Notice tone="warning" title={`${errors.length} 行有问题，写入时将跳过`}>
              {showDemoChrome() ? "可下载问题行后修改再导入。" : "请修正源文件后重新上传。"}
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

      <fieldset className="grid gap-2 border border-border p-4">
        <legend className="px-1 label text-ink">写入方式</legend>
        <label className="flex items-start gap-2 body">
          <input
            type="radio"
            name="writeMode"
            checked={writeMode === "upsert"}
            onChange={() => onWriteMode("upsert")}
            className="mt-1"
          />
          <span>
            {pk}
            <span className="block caption text-ink-muted">覆盖已有主键，并追加新记录。正式 upsert 待 API。</span>
          </span>
        </label>
        <label className="flex items-start gap-2 body">
          <input
            type="radio"
            name="writeMode"
            checked={writeMode === "append"}
            onChange={() => onWriteMode("append")}
            className="mt-1"
          />
          <span>
            只追加新记录
            <span className="block caption text-ink-muted">跳过已有主键；当前观测值 API 仍为追加写入。</span>
          </span>
        </label>
      </fieldset>

      {importError != null && <QueryError error={importError} onRetry={onRetry} />}

      <p className="caption text-ink-muted">一个事务写入；中途出错整批回滚。记录可在 30 日内撤销（API 未备齐时不可用）。</p>

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
            <Link to={`/observations?batch_id=${result.batch_id}`}>
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
      <Notice tone="info" title="须同时保留原始文件与解析结果">
        按文件名（去扩展名）配对；缺一侧在表中标出。
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
              hint="可继续添加；单文件不超过 10 MB"
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
              hint="文件名基名须与原始文件一致"
            />
            <FileList files={jsons} onClear={() => setJsons([])} />
          </Field>
        </div>
      )}

      <section className="grid gap-3">
        <SectionTitle level={2}>配对情况</SectionTitle>
        {pairs.some((p) => p.status !== "ok") && pairs.length > 0 && (
          <Notice tone="warning" title={`${pairs.filter((p) => p.status !== "ok").length} 个文件未配对`}>
            可继续补传缺侧文件，或去掉不成对项。未配对文件不会写入。
          </Notice>
        )}
        <DataTable caption="文件配对" columns={columns} data={pairs} getRowId={(r) => r.id} empty="尚未上传文件" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onReset}>
          <IconArrowLeft aria-hidden="true" />
          上一步 · 重选指标
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <p className="caption text-ink-muted">
            {okCount} 对进入校验 · {pairs.length - okCount} 对不写入
          </p>
          <Button disabled={okCount === 0 || step >= 3} onClick={() => setStep(3)}>
            下一步：校验
          </Button>
        </div>
      </div>
      {step >= 3 && (
        <Notice
          tone="success"
          title={`已确认 ${okCount} 对文件`}
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
          正式落库将同时保存原始对象与解析 JSON。
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
      <button type="button" className="caption text-link underline-offset-2 hover:underline focus-ring" onClick={onClear}>
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
