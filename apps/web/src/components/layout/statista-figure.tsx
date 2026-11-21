import { useRef, useState, type ReactNode } from "react";
import { IconChartBar, IconDownload, IconFileSpreadsheet, IconTable } from "@tabler/icons-react";
import { Tag, type TagTone } from "@/components/itei";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LazyChart } from "@/lib/charts/lazy-chart";
import type { ChartOption } from "@/lib/charts/echarts";
import type { ChartTheme } from "@/lib/charts/theme";
import { downloadText, toCsv } from "@/lib/download";
import { cn } from "@/lib/utils";

export type StatistaTableColumn = {
  key: string;
  title: string;
  align?: "left" | "right";
};

export type StatistaFigureProps = {
  /** 供首页研判或目录深链锚定 */
  id?: string;
  /** 图序眉标，如 "图 1 · 审评准入趋势" */
  eyebrow?: string;
  /** 结论式主标题（观点先行） */
  title: string;
  /** 明确标注时间跨度、地域口径与计量单位 */
  subtitle: string;
  /** 右上角核心趋势/极值徽标 */
  badge?: {
    label: string;
    tone?: TagTone;
  };
  /** 附加维度切换或筛选器插槽 */
  controls?: ReactNode;
  /** ECharts 配置生成函数 */
  option: (theme: ChartTheme) => ChartOption;
  /** 无障碍图表摘要 */
  ariaLabel: string;
  height?: number;
  /** 提供结构化底层行数据时，自动启用右上角「图表 / 数据表」原地切换与 CSV 导出 */
  tableColumns?: readonly StatistaTableColumn[];
  tableRows?: readonly Record<string, string | number>[];
  /** 导出文件名前缀 */
  exportName?: string;
  /** 权威数据来源说明 */
  source: string;
  /** 一句话统计口径或对账核验说明 */
  note?: string;
  className?: string;
};

/**
 * Statista 级四段式出版物信息图容器（严守 ITEI 去卡片化规则，不挂载 data-slot="card"）：
 * 1. Header：图序眉标 + 结论式主标题 + 范围/量纲副标题 + 高亮指标徽标 + 「图表 / 数据表」原地切换
 * 2. Controls（可选）：切片或子维度切换条
 * 3. Canvas：ECharts 6 SVG 矢量画布 / 无障碍三线数据表原地切换（消除“图下叠重复大表”）
 * 4. Footer：1px 顶线 + 数据来源与口径简注 + 一键导出矢量 SVG / CSV
 */
export function StatistaFigure({
  id,
  eyebrow,
  title,
  subtitle,
  badge,
  controls,
  option,
  ariaLabel,
  height = 276,
  tableColumns,
  tableRows,
  exportName = "mdes-figure",
  source,
  note,
  className,
}: StatistaFigureProps) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const figureRef = useRef<HTMLElement>(null);
  const hasTable = Boolean(tableColumns && tableColumns.length > 0 && tableRows && tableRows.length > 0);

  function handleExportSvg() {
    const svg = figureRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    const serialized = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`;
    downloadText(`${exportName}.svg`, serialized, "image/svg+xml;charset=utf-8");
  }

  function handleExportCsv() {
    if (!tableColumns || !tableRows) return;
    const headers = tableColumns.map((c) => c.title);
    const rows = tableRows.map((r) => tableColumns.map((c) => r[c.key] ?? ""));
    downloadText(`${exportName}.csv`, toCsv(headers, rows));
  }

  return (
    <figure
      ref={figureRef}
      id={id}
      className={cn(
        "flex flex-col justify-between border border-border border-t-2 border-t-brand-navy bg-surface",
        className,
      )}
    >
      <div>
        {/* 1. Header Zone */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
          <div className="grid min-w-0 flex-1 gap-1">
            {eyebrow && <p className="label text-brand-navy">{eyebrow}</p>}
            <h3 className="title-sub text-ink">{title}</h3>
            <p className="body-sm text-ink-muted">{subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {badge && (
              <Tag size="sm" tone={badge.tone ?? "info"}>
                {badge.label}
              </Tag>
            )}
            {hasTable && (
              <div
                role="group"
                aria-label="图表与数据表视图切换"
                className="inline-flex border border-border bg-surface-sunken p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={mode === "chart"}
                  onClick={() => setMode("chart")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                    mode === "chart" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <IconChartBar size={14} aria-hidden="true" />
                  图表
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "table"}
                  onClick={() => setMode("table")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 px-2.5 py-1 caption font-semibold transition-colors focus-ring",
                    mode === "table" ? "bg-brand-navy text-on-brand" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <IconTable size={14} aria-hidden="true" />
                  数据表
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Optional Slice / Sub-dimension Controls */}
        {controls && <div className="border-b border-border bg-surface-sunken px-4 py-2 md:px-5">{controls}</div>}

        {/* 3. Plot Canvas / Accessible Inline Table */}
        <div className="px-4 py-3.5 md:px-5">
          {mode === "chart" || !hasTable ? (
            <LazyChart option={option} ariaLabel={ariaLabel} height={height} />
          ) : (
            <Table dense>
              <TableCaption className="sr-only">{title}底层统计数据表</TableCaption>
              <TableHeader>
                <TableRow>
                  {tableColumns!.map((col) => (
                    <TableHead key={col.key} className={col.align === "right" ? "text-right" : "text-left"}>
                      {col.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows!.map((row, idx) => (
                  <TableRow key={idx}>
                    {tableColumns!.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          col.align === "right" ? "text-right tabular-nums" : "text-left",
                        )}
                      >
                        {row[col.key] ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 4. Source & Export Footer Strip */}
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border bg-surface-sunken px-4 py-2.5 caption text-ink-muted md:px-5">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-ink">数据来源：</span>
          <span>{source}</span>
          {note && <span> · 注：{note}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {mode === "chart" && (
            <button
              type="button"
              onClick={handleExportSvg}
              className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
            >
              <IconDownload size={14} aria-hidden="true" />
              导出图卡(SVG)
            </button>
          )}
          {hasTable && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex cursor-pointer items-center gap-1 caption font-semibold text-link hover:underline focus-ring"
            >
              <IconFileSpreadsheet size={14} aria-hidden="true" />
              导出数据(CSV)
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
