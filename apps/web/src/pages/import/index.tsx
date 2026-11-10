import { useMemo, useState } from "react";
import { Link } from "react-router";
import { IconArrowLeft, IconDownload, IconFileImport, IconTable } from "@tabler/icons-react";
import {
  DEFAULT_MAX_ROWS,
  parseObservationCsv,
  type CsvObservationRow,
  type CsvParseResult,
  type ImportBatch,
  type ImportResult,
  type RowError,
} from "@mdes/shared";
import {
  Card,
  DataTable,
  Dropzone,
  formatNumber,
  KpiTile,
  Notice,
  SectionTitle,
  Stepper,
  Tag,
  TextLink,
  type DataTableColumn,
} from "@/components/itei";
import { Page } from "@/components/layout/page";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { describeError, errorMessage, rowErrorMessage, useBatches, useImportCsv, useIndicators } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { downloadText, toCsv } from "@/lib/download";
import { formatDims, geoLabel, IMPORT_STATUS } from "@/lib/labels";

const STEPS = ["上传文件", "预校验", "导入", "结果"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ERROR_PREVIEW = 200;

type FileState = { file: File; text: string | null; readError?: string };

/**
 * 数据导入向导：上传 → 前端预校验（与服务端同一套解析规则，含指标编号）→ 导入 → 结果。
 * 服务端在一个事务里写入整批数据；导入成功后概览、目录、观测值等缓存自动失效重拉。
 */
export default function ImportPage() {
  const [state, setState] = useState<FileState | null>(null);
  const indicators = useIndicators();
  const importCsv = useImportCsv();
  const known = useMemo(() => (indicators.data ? new Set(indicators.data.map((i) => i.id)) : undefined), [indicators.data]);
  const check: CsvParseResult | null = useMemo(
    () => (state?.text != null ? parseObservationCsv(state.text, { maxRows: DEFAULT_MAX_ROWS, knownIndicatorIds: known }) : null),
    [state?.text, known],
  );

  const step = importCsv.isSuccess ? 3 : importCsv.isPending ? 2 : state ? 1 : 0;

  async function choose(file: File | null) {
    importCsv.reset();
    if (!file) return setState(null);
    setState({ file, text: null });
    try {
      setState({ file, text: await file.text() });
    } catch (err) {
      setState({ file, text: null, readError: describeError(err) });
    }
  }
  const reset = () => {
    importCsv.reset();
    setState(null);
  };

  return (
    <Page number="五" title="数据导入" lead="上传 CSV 观测值。先在浏览器里按导入规则预校验，确认后再写入数据库。">
      <div className="grid gap-8">
        <Stepper aria-label="导入步骤" steps={STEPS} current={step} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="grid content-start gap-5 lg:col-span-2">
            {step === 3 && importCsv.data ? (
              <ResultView result={importCsv.data} onAgain={reset} />
            ) : (
              <>
                <Dropzone
                  file={state?.file ?? null}
                  onFileChange={choose}
                  accept=".csv,text/csv"
                  maxSize={MAX_FILE_BYTES}
                  disabled={importCsv.isPending}
                  label="选择 CSV 文件"
                  hint={`仅支持 .csv（UTF-8），单次不超过 ${formatNumber(DEFAULT_MAX_ROWS)} 行`}
                />
                {state?.readError && <Notice tone="danger" title={`文件读取失败：${state.readError}`} />}
                {importCsv.isError && (
                  <QueryError error={importCsv.error} onRetry={() => state && importCsv.mutate(state.file)} />
                )}
                {indicators.isError && (
                  <Notice tone="warning" title="指标目录加载失败，预校验暂未核对指标编号">
                    导入时服务端仍会核对；也可以刷新页面后重试。
                  </Notice>
                )}
                {check && state && (
                  <PrecheckView
                    check={check}
                    importing={importCsv.isPending}
                    onImport={() => importCsv.mutate(state.file)}
                    onReset={reset}
                  />
                )}
              </>
            )}
          </div>
          <FormatGuide />
        </div>

        <History />
      </div>
    </Page>
  );
}

function PrecheckView({
  check,
  importing,
  onImport,
  onReset,
}: {
  check: CsvParseResult;
  importing: boolean;
  onImport: () => void;
  onReset: () => void;
}) {
  if (!check.ok) {
    return (
      <div className="grid gap-4">
        <Notice tone="danger" title={errorMessage(check.fileError.code, check.fileError.params)}>
          文件没有写入任何数据。
        </Notice>
        <Button variant="secondary" className="justify-self-start" onClick={onReset}>
          <IconArrowLeft aria-hidden="true" />
          重新选择文件
        </Button>
      </div>
    );
  }
  const { rows, errors, dataRows } = check;
  return (
    <section className="grid gap-5" aria-label="预校验结果">
      <SectionTitle level={2}>预校验</SectionTitle>
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <KpiTile label="数据行" value={dataRows} unit="行" />
        <KpiTile label="可导入" value={rows.length} unit="行" />
        <KpiTile label="有问题" value={errors.length} unit="行" delta={errors.length ? "导入时跳过" : "无"} />
      </div>
      {rows.length === 0 ? (
        <Notice tone="danger" title="没有可导入的行">按下方行错误修改文件后重新选择。</Notice>
      ) : errors.length > 0 ? (
        <Notice tone="warning" title={`${errors.length} 行有问题，导入时会跳过这些行`}>
          其余 {formatNumber(rows.length)} 行照常写入；也可以先修改文件再导入。
        </Notice>
      ) : (
        <Notice tone="success" title={`预校验通过，${formatNumber(rows.length)} 行都可以导入`} />
      )}

      {errors.length > 0 && <RowErrors errors={errors} />}

      {rows.length > 0 && (
        <div className="grid gap-2">
          <h3 className="title-nav text-brand-navy">数据预览（前 5 行）</h3>
          <DataTable caption="可导入数据的前 5 行" columns={PREVIEW_COLUMNS} data={rows.slice(0, 5)} getRowId={(r) => String(r.line)} dense />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onImport} disabled={importing || rows.length === 0}>
          <IconFileImport aria-hidden="true" />
          {importing ? "导入中" : `开始导入（${formatNumber(rows.length)} 行）`}
        </Button>
        <Button variant="secondary" onClick={onReset} disabled={importing}>
          重新选择文件
        </Button>
      </div>
    </section>
  );
}

const PREVIEW_COLUMNS: DataTableColumn<CsvObservationRow>[] = [
  { key: "line", title: "行号", type: "number" },
  { key: "indicator_id", title: "指标", type: "code", primary: true },
  { key: "period", title: "期间", type: "code" },
  { key: "geo", title: "地域", value: (r) => geoLabel(r.geo) },
  { key: "dims", title: "维度", value: (r) => formatDims(r.dims) },
  { key: "value_num", title: "数值", type: "number", cell: (r) => (r.value_num === null ? r.value_text : formatNumber(r.value_num)) },
  { key: "unit", title: "单位" },
];

function RowErrors({ errors, title = "行错误" }: { errors: RowError[]; title?: string }) {
  const shown = errors.slice(0, ERROR_PREVIEW);
  return (
    <div className="grid gap-2">
      <h3 className="title-nav text-brand-navy">{title}</h3>
      <DataTable
        caption={title}
        dense
        columns={[
          { key: "line", title: "行号", type: "number" },
          { key: "message", title: "说明", primary: true, value: (e) => rowErrorMessage(e).replace(/^第 \d+ 行：/, "") },
        ]}
        data={shown}
        getRowId={(e) => `${e.line}-${e.code}`}
      />
      {errors.length > ERROR_PREVIEW && (
        <p className="caption text-ink-muted">
          只显示前 {ERROR_PREVIEW} 条，共 {formatNumber(errors.length)} 条。
        </p>
      )}
    </div>
  );
}

function ResultView({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  const status = IMPORT_STATUS[result.status];
  return (
    <section className="grid gap-5" aria-label="导入结果">
      <SectionTitle level={2}>导入结果</SectionTitle>
      {result.status === "completed" ? (
        <Notice tone="success" title={`导入完成，${formatNumber(result.row_ok)} 行全部写入`} />
      ) : result.status === "completed_with_errors" ? (
        <Notice tone="warning" title={`部分导入：写入 ${formatNumber(result.row_ok)} 行，${formatNumber(result.row_err)} 行未导入`}>
          未导入的行见下方行错误，修改后可单独再导入。
        </Notice>
      ) : (
        <Notice tone="danger" title={`导入失败，${formatNumber(result.row_err)} 行都未通过校验`}>
          批次已记入导入历史，没有写入观测值。
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3">
        <KpiTile label="写入" value={result.row_ok} unit="行" />
        <KpiTile label="未导入" value={result.row_err} unit="行" delta={result.row_err ? "见行错误" : "无"} />
        <Card className="col-span-2 lg:col-span-1">
          <span className="label text-ink-muted">批次</span>
          <p className="mt-1 code break-all text-ink">{result.batch_id}</p>
          <Tag tone={status.tone} className="mt-2">
            {status.label}
          </Tag>
        </Card>
      </div>
      {result.errors.length > 0 && <RowErrors errors={result.errors} title="未导入的行" />}
      <div className="flex flex-wrap gap-3">
        {result.row_ok > 0 && (
          <Button asChild>
            <Link to={`/observations?batch_id=${result.batch_id}`}>
              <IconTable aria-hidden="true" />
              查看本批次数据
            </Link>
          </Button>
        )}
        <Button variant="secondary" onClick={onAgain}>
          继续导入
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">回到概览</Link>
        </Button>
      </div>
    </section>
  );
}

const TEMPLATE = toCsv(
  ["indicator_id", "period", "geo", "value_num", "unit", "value_text", "dims"],
  [
    ["TRD-001", "2024-01", "CN", 128.5, "亿元", "", '{"trade_type":"import"}'],
    ["TRD-006", "2024", "CN", 0.42, "", "", '{"metric":"CR3"}'],
  ],
);

const COLUMNS_GUIDE: [string, string, string][] = [
  ["indicator_id", "必填", "指标编号，须在指标目录中"],
  ["period", "必填", "期间，如 2024-01、2024、2024Q1"],
  ["value_num", "二选一", "数值，不带单位与千分位"],
  ["value_text", "二选一", "文本值，无法量化时填写"],
  ["geo", "选填", "地域，缺省为 CN；省份用 6 位代码"],
  ["unit", "选填", "单位，如 亿元、万美元"],
  ["dims", "选填", '维度，JSON 对象，如 {"trade_type":"import"}'],
];

function FormatGuide() {
  return (
    <Card
      title="CSV 格式"
      className="content-start"
      footer={
        <Button variant="secondary" size="sm" onClick={() => downloadText("mdes_import_template.csv", TEMPLATE)}>
          <IconDownload aria-hidden="true" />
          下载导入模板
        </Button>
      }
    >
      <dl className="grid gap-3">
        {COLUMNS_GUIDE.map(([name, need, desc]) => (
          <div key={name} className="grid gap-0.5">
            <dt className="flex items-center gap-2">
              <span className="code text-ink">{name}</span>
              <span className={need === "必填" ? "caption text-brand-red" : "caption text-ink-muted"}>{need}</span>
            </dt>
            <dd className="body-sm text-ink-muted">{desc}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 body-sm text-ink-muted">
        行号按表格行计算，表头为第 1 行。同一文件的有效行在一个事务里写入，中途出错整批回滚。
      </p>
    </Card>
  );
}

function History() {
  const batches = useBatches();
  const columns: DataTableColumn<ImportBatch>[] = [
    { key: "filename", title: "文件", primary: true },
    {
      key: "status",
      title: "状态",
      type: "status",
      cell: (b) => (
        <Tag size="sm" tone={IMPORT_STATUS[b.status].tone}>
          {IMPORT_STATUS[b.status].label}
        </Tag>
      ),
    },
    { key: "row_ok", title: "写入", type: "number" },
    { key: "row_err", title: "未导入", type: "number" },
    { key: "created_at", title: "导入时间", value: (b) => formatDateTime(b.created_at) },
    {
      key: "actions",
      title: "数据",
      cell: (b) => (b.row_ok > 0 ? <TextLink to={`/observations?batch_id=${b.id}`}>查看</TextLink> : "—"),
    },
  ];
  return (
    <section className="grid gap-4">
      <SectionTitle level={2}>导入历史</SectionTitle>
      {batches.isError ? (
        <QueryError error={batches.error} onRetry={() => batches.refetch()} />
      ) : (
        <DataTable
          caption="最近 50 次导入"
          columns={columns}
          data={batches.data ?? []}
          getRowId={(b) => b.id}
          loading={batches.isPending}
          empty="还没有导入记录"
        />
      )}
    </section>
  );
}
