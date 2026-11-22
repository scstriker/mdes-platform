import { useMemo, useState } from "react";
import { Link } from "react-router";
import { IconArrowLeft, IconFileImport, IconTable } from "@tabler/icons-react";
import {
  DEFAULT_MAX_ROWS,
  isPngBytes,
  parseCustomsCsvBytes,
  type TradeFlow,
  type TradeGrouping,
  type TradeImportManifest,
  type TradeImportResponse,
} from "@mdes/shared";
import { Dropzone, Field, formatNumber, Notice, SectionTitle, Tag } from "@/components/itei";
import { QueryError } from "@/components/layout/query-error";
import { Button } from "@/components/ui/button";
import { describeError, errorMessage, useImportTrade, useTradeCoverage } from "@/lib/api";
import type { IndicatorMapper } from "@/lib/import-mappers";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseHs8List(raw: string): string[] {
  return [...new Set(raw.split(/[,;\s\n]+/).map((s) => s.trim()).filter(Boolean))];
}

export function CustomsTradeImportFlow({
  mapper,
  step,
  setStep,
  onReset,
  initialFile,
  initialBytes,
}: {
  mapper: IndicatorMapper;
  step: number;
  setStep: (n: number) => void;
  onReset: () => void;
  initialFile?: File | null;
  initialBytes?: Uint8Array | null;
}) {
  const [dictVersion, setDictVersion] = useState("202601");
  const [month, setMonth] = useState("2024-01");
  const [flow, setFlow] = useState<TradeFlow>("import");
  const [grouping, setGrouping] = useState<TradeGrouping>("product");
  const [hs8Input, setHs8Input] = useState("90181100");
  const [emptyHs8Input, setEmptyHs8Input] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(initialFile ?? null);
  const [csvBytes, setCsvBytes] = useState<Uint8Array | null>(initialBytes ?? null);
  const [evidences, setEvidences] = useState<File[]>([]);
  const [evidenceValid, setEvidenceValid] = useState(true);
  const [manifestError, setManifestError] = useState<string>();

  const importTrade = useImportTrade();
  const activeYear = /^\d{4}/.exec(month.trim())?.[0] ?? "2024";
  const yearCoverage = useTradeCoverage({ dictVersion: dictVersion.trim() || "202601", year: activeYear });

  const manifest: TradeImportManifest = useMemo(
    () => ({
      dictVersion: dictVersion.trim() || "202601",
      month: month.trim(),
      flow,
      currency: "USD",
      grouping,
      hs8: parseHs8List(hs8Input),
      emptyHs8: parseHs8List(emptyHs8Input),
    }),
    [dictVersion, emptyHs8Input, flow, grouping, hs8Input, month],
  );

  const preview = useMemo(() => {
    if (!csvBytes) return null;
    const allowHeaderOnlyEmpty =
      evidences.length > 0 &&
      manifest.hs8.length > 0 &&
      manifest.emptyHs8.length === manifest.hs8.length;
    return parseCustomsCsvBytes(csvBytes, manifest, {
      maxRows: DEFAULT_MAX_ROWS,
      allowHeaderOnlyEmpty,
    });
  }, [csvBytes, evidences.length, manifest]);

  async function onLoadManifestFile(file: File | null) {
    setManifestError(undefined);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<TradeImportManifest>;
      if (typeof parsed.dictVersion === "string") setDictVersion(parsed.dictVersion);
      if (typeof parsed.month === "string") setMonth(parsed.month);
      if (parsed.flow === "import" || parsed.flow === "export") setFlow(parsed.flow);
      if (
        parsed.grouping === "product" ||
        parsed.grouping === "partner" ||
        parsed.grouping === "regime" ||
        parsed.grouping === "region"
      ) {
        setGrouping(parsed.grouping);
      }
      if (Array.isArray(parsed.hs8)) setHs8Input(parsed.hs8.join(", "));
      if (Array.isArray(parsed.emptyHs8)) setEmptyHs8Input(parsed.emptyHs8.join(", "));
    } catch (err) {
      setManifestError(describeError(err));
    }
  }

  async function onChooseCsv(file: File | null) {
    importTrade.reset();
    setCsvFile(file);
    setCsvBytes(null);
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setCsvBytes(bytes);
    if (step < 2) setStep(2);
  }

  async function onAddEvidence(file: File | null) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPngBytes(bytes)) {
      setEvidenceValid(false);
    } else {
      setEvidenceValid(true);
    }
    setEvidences((prev) => [...prev, file]);
    if (step < 2) setStep(2);
  }

  function submitTradeBatch() {
    setStep(3);
    importTrade.mutate(
      {
        manifest,
        file: csvFile,
        emptyEvidences: evidences,
      },
      {
        onSuccess: () => setStep(4),
      },
    );
  }

  const canSubmit =
    manifest.hs8.length > 0 &&
    evidenceValid &&
    ((csvFile !== null && preview?.ok === true) ||
      (csvFile === null && evidences.length > 0 && manifest.emptyHs8.length === manifest.hs8.length));

  return (
    <div className="grid gap-6" data-testid="customs-trade-import-flow">
      <Notice tone="info" title={`指标 ${mapper.seq} · 中国海关月度美元原件与查询清单契约`}>
        保留原始文件字节（自动识别 UTF-8 与 GBK，计算原字节 SHA-256），按月份、流向、分组和请求 HS8 集合暂存候选批次；双流向四分组核齐并对账通过后原子切换已发布快照。
      </Notice>

      {yearCoverage.data && (
        <div
          data-testid="trade-year-coverage-bar"
          className="flex flex-wrap items-center justify-between gap-2 border border-border bg-surface-sunken px-4 py-2.5 caption text-ink"
        >
          <span>
            正式字典 <strong className="code">{yearCoverage.data.dictVersion}</strong>：{yearCoverage.data.hs8Count} 个 HS8 ·{" "}
            {yearCoverage.data.hs6Count} 个 HS6 · {yearCoverage.data.categoryCount} 个一级类别
          </span>
          <span>
            {activeYear} 年核对格（{formatNumber(yearCoverage.data.summary.totalCells)} 格）：已取得{" "}
            <strong>{formatNumber(yearCoverage.data.summary.received)}</strong> · 官网明确无记录{" "}
            <strong>{formatNumber(yearCoverage.data.summary.confirmedEmpty)}</strong> · 待补采{" "}
            <strong>{formatNumber(yearCoverage.data.summary.missing)}</strong> · 当年不适用{" "}
            <strong>{formatNumber(yearCoverage.data.summary.notApplicable)}</strong>（已发布{" "}
            {yearCoverage.data.summary.publishedMonths}/12 月）
          </span>
        </div>
      )}

      {importTrade.isSuccess && importTrade.data ? (
        <TradeImportReceiptView
          manifest={manifest}
          result={importTrade.data}
          onContinue={() => {
            importTrade.reset();
            setCsvFile(null);
            setCsvBytes(null);
            setEvidences([]);
            setStep(1);
          }}
          onReset={onReset}
        />
      ) : (
        <div className="grid gap-6">
          {/* 1. 批次清单配置 / JSON 载入 */}
          <section className="grid gap-4 border border-border bg-surface p-4" aria-label="海关查询清单">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="title-nav text-brand-navy">1. 查询范围清单（manifest.json）</h2>
                <p className="caption text-ink-muted">可直接载入采集端生成的 manifest.json，或在下方填写单月单流向单分组参数。</p>
              </div>
              <label className="cursor-pointer rounded-sm border border-border-strong bg-surface-sunken px-3 py-1.5 body-sm font-semibold text-brand-navy hover:border-brand-navy focus-within:outline-2">
                载入 manifest.json
                <input
                  type="file"
                  aria-label="载入清单文件"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={(e) => void onLoadManifestFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {manifestError && <Notice tone="danger" title={`清单解析失败：${manifestError}`} />}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="字典版本（dictVersion）">
                <input
                  aria-label="字典版本"
                  type="text"
                  value={dictVersion}
                  onChange={(e) => setDictVersion(e.target.value)}
                  className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink focus-ring"
                />
              </Field>
              <Field label="统计月份（month）">
                <input
                  aria-label="统计月份"
                  type="text"
                  placeholder="2024-01"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink focus-ring"
                />
              </Field>
              <Field label="贸易流向（flow）">
                <select
                  aria-label="贸易流向"
                  value={flow}
                  onChange={(e) => setFlow(e.target.value as TradeFlow)}
                  className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink focus-ring"
                >
                  <option value="import">进口 (import)</option>
                  <option value="export">出口 (export)</option>
                </select>
              </Field>
              <Field label="查询分组（grouping）">
                <select
                  aria-label="查询分组"
                  value={grouping}
                  onChange={(e) => setGrouping(e.target.value as TradeGrouping)}
                  className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 body-sm text-ink focus-ring"
                >
                  <option value="product">商品全国合计 (product)</option>
                  <option value="partner">贸易伙伴 (partner)</option>
                  <option value="regime">贸易方式 (regime)</option>
                  <option value="region">收发货人注册地 (region)</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="本次请求 HS8 编码集合（逗号或空格分隔）">
                <textarea
                  aria-label="请求HS8集合"
                  rows={2}
                  value={hs8Input}
                  onChange={(e) => setHs8Input(e.target.value)}
                  className="w-full rounded-sm border border-border-strong bg-surface p-2 code text-ink focus-ring"
                />
              </Field>
              <Field label="官网明确无记录编码（emptyHs8，选填，须配 PNG 截图）">
                <textarea
                  aria-label="无记录HS8集合"
                  rows={2}
                  value={emptyHs8Input}
                  onChange={(e) => setEmptyHs8Input(e.target.value)}
                  placeholder="仅填写官网明确显示无记录的编码…"
                  className="w-full rounded-sm border border-border-strong bg-surface p-2 code text-ink focus-ring"
                />
              </Field>
            </div>
          </section>

          {/* 2. 海关原件 CSV 与空结果截图上传 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Field label="2. 海关原始 CSV 文件（file，保留原字节不改码）">
              <Dropzone
                file={csvFile}
                onFileChange={(f) => void onChooseCsv(f)}
                accept=".csv,text/csv"
                maxSize={MAX_FILE_BYTES}
                label="选择海关原始 CSV"
                hint="兼容 GBK / UTF-8 海关导出原件、美元千位分隔符及双数量单位；整批无记录时可仅交右侧 PNG"
              />
            </Field>
            <Field label="3. 官网无记录举证截图（emptyEvidence，PNG，选填）">
              <Dropzone
                file={null}
                onFileChange={(f) => void onAddEvidence(f)}
                accept=".png,image/png"
                maxSize={MAX_FILE_BYTES}
                label="添加空结果 PNG 截图"
                hint="当部分或全部编码在官网无记录时上传含查询条件的 PNG 截图"
              />
              {evidences.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {evidences.map((ev, i) => (
                    <Tag key={`${ev.name}-${i}`} size="sm" tone={evidenceValid ? "info" : "danger"}>
                      {ev.name}
                    </Tag>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEvidences([]);
                      setEvidenceValid(true);
                    }}
                    className="cursor-pointer caption text-link hover:underline focus-ring"
                  >
                    清空截图
                  </button>
                </div>
              )}
            </Field>
          </div>

          {/* 3. 本地预校验反馈 */}
          {preview && !preview.ok && (
            <Notice tone="danger" title={errorMessage(preview.error.code, preview.error.params)} />
          )}
          {!evidenceValid && (
            <Notice tone="danger" title="空结果证据文件必须是合法的 PNG 图像文件，请检查后重选" />
          )}
          {preview && preview.ok && (
            <div className="grid gap-2 border border-border bg-info-bg px-4 py-3 body-sm text-ink" data-testid="customs-precheck-summary">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  识别编码：<strong className="code">{preview.encoding.toUpperCase()}</strong>
                </span>
                <span>
                  有效明细：<strong>{formatNumber(preview.rows.length)}</strong> 行
                </span>
                <span>
                  自动剔除合计/世界行：<strong>{formatNumber(preview.summaryRowsSkipped)}</strong> 行
                </span>
                <span>
                  请求 HS8：<strong>{manifest.hs8.length}</strong> 项（币制锁定 <strong>USD</strong>）
                </span>
              </div>
            </div>
          )}

          {importTrade.isError && <QueryError error={importTrade.error} onRetry={submitTradeBatch} />}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={onReset} disabled={importTrade.isPending}>
              <IconArrowLeft aria-hidden="true" />
              重选指标
            </Button>
            <Button onClick={submitTradeBatch} disabled={!canSubmit || importTrade.isPending}>
              <IconFileImport aria-hidden="true" />
              {importTrade.isPending ? "正在提交海关批次…" : "提交海关批次入库"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeImportReceiptView({
  manifest,
  result,
  onContinue,
  onReset,
}: {
  manifest: TradeImportManifest;
  result: TradeImportResponse;
  onContinue: () => void;
  onReset: () => void;
}) {
  return (
    <section className="grid gap-4" aria-label="海关批次导入回执" data-testid="trade-import-receipt">
      <SectionTitle level={2}>导入回执</SectionTitle>
      {result.status === "published" ? (
        <Notice
          tone="success"
          title={`已发布切换快照（status: published · 写入 ${formatNumber(result.rowCount)} 行）`}
        >
          当月双流向四分组已全部核齐并对账一致，门户专题、38 号详情、全站搜索与后台派生观测值已同步切换至新版本{" "}
          <span className="code font-semibold">{result.releaseId}</span>。
        </Notice>
      ) : (
        <Notice
          tone="info"
          title={`候选批次已暂存（status: staged · 写入 ${formatNumber(result.rowCount)} 行）`}
        >
          本批次原件与覆盖记录已写入候选区；待当月（{manifest.month}）进口/出口 × 四种分组全部齐备且对账无差额后自动发布。
          {result.reconciliationNote ? ` 对账提示：${result.reconciliationNote}` : ""}
        </Notice>
      )}

      <dl className="grid gap-2 border border-border bg-surface p-4 body-sm sm:grid-cols-2">
        <div>
          <dt className="caption text-ink-muted">批次号（batchId）</dt>
          <dd className="code text-ink">{result.batchId}</dd>
        </div>
        <div>
          <dt className="caption text-ink-muted">原件字节摘要（sourceSha256）</dt>
          <dd className="code break-all text-ink">{result.sourceSha256}</dd>
        </div>
        <div>
          <dt className="caption text-ink-muted">发布状态 / 版本</dt>
          <dd className="code text-brand-navy">
            {result.status}
            {result.releaseId ? ` · releaseId=${result.releaseId}` : ""}
            {result.replayed ? "（幂等重放）" : ""}
          </dd>
        </div>
        <div>
          <dt className="caption text-ink-muted">税号覆盖明细（coverage）</dt>
          <dd className="text-ink">
            已取得 {result.coverage.received.length} 项（{result.coverage.received.join(", ") || "无"}） · 明确无记录{" "}
            {result.coverage.confirmedEmpty.length} 项 · 待补采 {result.coverage.missing.length} 项
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3">
        {result.status === "published" && (
          <Button asChild>
            <Link to={`/trade?period=${encodeURIComponent(manifest.month)}`}>
              查看贸易专题（{manifest.month}）
            </Link>
          </Button>
        )}
        <Button variant="secondary" onClick={onContinue}>
          继续导入下一分组/月份
        </Button>
        <Button variant="secondary" asChild>
          <Link to={`/admin/observations?indicator_id=TRD-001&period=${encodeURIComponent(manifest.month)}`}>
            <IconTable aria-hidden="true" />
            核查派生观测值
          </Link>
        </Button>
        <Button variant="ghost" onClick={onReset}>
          重选指标
        </Button>
      </div>
    </section>
  );
}
