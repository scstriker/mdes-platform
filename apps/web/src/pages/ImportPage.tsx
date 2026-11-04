import { useState } from "react";
import { api } from "../api";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult("");
    try {
      const r = await api.importCsv(file);
      setResult(JSON.stringify(r, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand-navy)] m-0">数据导入</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 mb-0">
          上传观测值 CSV（demo 上限 5000 行）。样例见{" "}
          <code>data/samples/trd_sample.csv</code>
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="justify-self-start px-4 py-2 bg-[var(--brand-navy)] text-white rounded-[2px] disabled:opacity-50"
        >
          {busy ? "导入中…" : "开始导入"}
        </button>
      </form>

      <div className="text-xs text-[var(--ink-muted)] border border-[var(--border)] p-3 bg-[var(--surface-sunken)]">
        必填列：<code>indicator_id,period</code>；数值列二选一：
        <code>value_num</code> / <code>value_text</code>；可选{" "}
        <code>geo,unit,dims(JSON)</code>
      </div>

      {result && (
        <pre className="text-xs whitespace-pre-wrap border border-[var(--border)] p-3 overflow-auto">
          {result}
        </pre>
      )}
    </div>
  );
}
