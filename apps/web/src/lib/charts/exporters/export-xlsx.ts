import {
  formatStatisticCitation,
  projectStatisticView,
  type Statistic,
  type StatisticViewState,
} from "@mdes/shared";
import writeXlsxFile, { type CellObject, type Row, type SheetData } from "write-excel-file/universal";
import { PUBLICATION_LIGHT_TOKENS } from "../publication-theme";
import { downloadBlob } from "./export-svg-png";

function headerCell(label: string, align: "left" | "right" | "center" = "left"): CellObject {
  return {
    type: String,
    value: label,
    fontWeight: "bold",
    align,
    alignVertical: "center",
    backgroundColor: PUBLICATION_LIGHT_TOKENS["brand-navy"],
    textColor: PUBLICATION_LIGHT_TOKENS["on-brand"],
    bottomBorderStyle: "medium",
    bottomBorderColor: PUBLICATION_LIGHT_TOKENS["brand-sky"],
  };
}

function textCell(value: string, extra: Partial<CellObject> = {}): CellObject {
  return {
    type: String,
    value,
    alignVertical: "top",
    wrap: true,
    bottomBorderStyle: "thin",
    bottomBorderColor: PUBLICATION_LIGHT_TOKENS.border,
    ...extra,
  };
}

/**
 * 生成 4-Sheet 标准统计底稿工作簿（Data / Metadata / Sources / Methodology）：
 * 本模块仅通过动态 import() 按需加载，避免将 write-excel-file 打入首屏入口包。
 */
export async function buildXlsxBlob(
  stat: Statistic,
  viewState: StatisticViewState = {},
): Promise<Blob> {
  const proj = projectStatisticView(stat, viewState);
  const denoms = stat.dataset.denominators;

  // 1. Sheet 1: Data（首行冻结、数值格式化、显式标注预测/估算冻结时点）
  const dataHeader: Row = [
    headerCell(proj.periodLabel),
    headerCell("序列/对象"),
    headerCell("数值", "right"),
    headerCell("单位"),
    headerCell("数据性质(实际/估算/预测)"),
    ...(denoms ? [headerCell(denoms.label, "right")] : []),
    headerCell("备注"),
  ];

  const dataRows: Row[] = proj.tableRows.map((row) => {
    const isNonActual = row.status !== "A";
    const rowBg = isNonActual ? PUBLICATION_LIGHT_TOKENS["info-bg"] : undefined;

    const valueCell: CellObject =
      row.value !== null && Number.isFinite(row.value)
        ? {
            type: Number,
            value: row.value,
            format: Number.isInteger(row.value) && !row.unit.includes("%") ? "#,##0" : "#,##0.00",
            align: "right",
            alignVertical: "top",
            backgroundColor: rowBg,
            bottomBorderStyle: "thin",
            bottomBorderColor: PUBLICATION_LIGHT_TOKENS.border,
          }
        : textCell("—", { align: "center", backgroundColor: rowBg });

    const noteParts: string[] = [];
    if (row.note) noteParts.push(row.note);
    if (row.status === "F" || row.status === "E") {
      noteParts.push(row.status_label);
    }

    return [
      textCell(row.period, { backgroundColor: rowBg }),
      textCell(row.series_label, { backgroundColor: rowBg }),
      valueCell,
      textCell(row.unit, { backgroundColor: rowBg }),
      textCell(row.status_label, {
        backgroundColor: rowBg,
        fontWeight: isNonActual ? "bold" : undefined,
        textColor: isNonActual ? PUBLICATION_LIGHT_TOKENS["brand-navy"] : PUBLICATION_LIGHT_TOKENS.ink,
      }),
      ...(denoms ? [textCell(row.denominator_text ?? "—", { align: "right", backgroundColor: rowBg })] : []),
      textCell(noteParts.join("；"), { backgroundColor: rowBg }),
    ];
  });

  const dataSheet: SheetData = [dataHeader, ...dataRows];
  const dataColumns = [
    { width: 16 },
    { width: 30 },
    { width: 16 },
    { width: 12 },
    { width: 30 },
    ...(denoms ? [{ width: 26 }] : []),
    { width: 34 },
  ];

  // 2. Sheet 2: Metadata
  const metadataPairs: [string, string][] = [
    ["Statistic ID (统计编号)", stat.statistic_id],
    ["Slug (语义标识)", stat.slug],
    ["Title (统计标题)", proj.title],
    ["Subtitle (量纲与副标题)", proj.subtitle],
    ["Version (发布版本)", stat.version],
    ["Published At (发布时间)", stat.published_at],
    ["V3 Indicator Seqs (V3 指标序号)", stat.indicator_refs.v3_seqs.join(", ")],
    ["V12 Codes (V12 指标编码)", (stat.indicator_refs.v12_codes ?? []).join(", ") || "—"],
    ["Time Span (时间跨度)", `${proj.periods[0] ?? ""} – ${proj.periods[proj.periods.length - 1] ?? ""}（全量：${stat.coverage.time_span}）`],
    ["Geographic Scope (地域范围)", stat.coverage.geographic_scope],
    ["Sample Scope (样本范围)", stat.coverage.sample_scope],
    ["Coverage Limitations (样本局限)", stat.coverage.limitations ?? "—"],
    ["Citation GB/T 7714", formatStatisticCitation(stat, "gbt7714")],
    ["Citation APA 7", formatStatisticCitation(stat, "apa7")],
  ];

  const metadataSheet: SheetData = [
    [headerCell("元数据字段"), headerCell("取值")],
    ...metadataPairs.map(([k, v]) => [
      textCell(k, { fontWeight: "bold", backgroundColor: PUBLICATION_LIGHT_TOKENS["surface-sunken"] }),
      textCell(v),
    ]),
  ];

  // 3. Sheet 3: Sources
  const sourcesSheet: SheetData = [
    [
      headerCell("Organization (发布机构)"),
      headerCell("Document Title (来源文献/报表)"),
      headerCell("Page/Section (页码/章节)"),
      headerCell("Published Date (原始发布日期)"),
      headerCell("Source URL (原文链接)"),
    ],
    ...stat.sources.map((src) => [
      textCell(src.organization, { fontWeight: "bold" }),
      textCell(src.document_title),
      textCell(src.page_or_section ?? "—"),
      textCell(src.source_published_at ?? "—"),
      textCell(src.source_url ?? "—"),
    ]),
  ];

  // 4. Sheet 4: Methodology（突出高亮每一条「禁止推断」红线）
  const methodologyRows: Row[] = [
    [
      textCell("统计定义 (Definition)", { fontWeight: "bold", backgroundColor: PUBLICATION_LIGHT_TOKENS["surface-sunken"] }),
      textCell(stat.methodology.definition),
      textCell("核心定义"),
    ],
    [
      textCell("计算公式 (Formula)", { fontWeight: "bold", backgroundColor: PUBLICATION_LIGHT_TOKENS["surface-sunken"] }),
      textCell(stat.methodology.formula ?? "—"),
      textCell("计算规则"),
    ],
    [
      textCell("分母说明 (Denominator Note)", { fontWeight: "bold", backgroundColor: PUBLICATION_LIGHT_TOKENS["surface-sunken"] }),
      textCell(stat.methodology.denominator_note ?? "—"),
      textCell("分母口径"),
    ],
    [
      textCell("基期说明 (Base Period Note)", { fontWeight: "bold", backgroundColor: PUBLICATION_LIGHT_TOKENS["surface-sunken"] }),
      textCell(stat.methodology.base_period_note ?? "—"),
      textCell("基期口径"),
    ],
  ];

  for (const brk of stat.methodology.methodology_breaks) {
    methodologyRows.push([
      textCell(`口径变更 · ${brk.effective_period}`, {
        fontWeight: "bold",
        backgroundColor: PUBLICATION_LIGHT_TOKENS["warning-bg"],
        textColor: PUBLICATION_LIGHT_TOKENS.warning,
      }),
      textCell(`${brk.short_label}：${brk.explanation}`, {
        backgroundColor: PUBLICATION_LIGHT_TOKENS["warning-bg"],
      }),
      textCell(brk.comparability, {
        fontWeight: "bold",
        backgroundColor: PUBLICATION_LIGHT_TOKENS["warning-bg"],
        textColor: PUBLICATION_LIGHT_TOKENS.warning,
      }),
    ]);
  }

  for (const rule of stat.methodology.prohibited_inferences) {
    methodologyRows.push([
      textCell("禁止推断", {
        fontWeight: "bold",
        backgroundColor: PUBLICATION_LIGHT_TOKENS["danger-bg"],
        textColor: PUBLICATION_LIGHT_TOKENS.danger,
      }),
      textCell(`禁止推断：${rule}`, {
        fontWeight: "bold",
        backgroundColor: PUBLICATION_LIGHT_TOKENS["danger-bg"],
        textColor: PUBLICATION_LIGHT_TOKENS.danger,
      }),
      textCell("红线约束 (PROHIBITED)", {
        fontWeight: "bold",
        backgroundColor: PUBLICATION_LIGHT_TOKENS["danger-bg"],
        textColor: PUBLICATION_LIGHT_TOKENS.danger,
      }),
    ]);
  }

  const methodologySheet: SheetData = [
    [headerCell("口径与约束类别"), headerCell("详细说明"), headerCell("等级/属性")],
    ...methodologyRows,
  ];

  return writeXlsxFile(
    [
      { sheet: "Data", data: dataSheet, stickyRowsCount: 1, columns: dataColumns },
      { sheet: "Metadata", data: metadataSheet, stickyRowsCount: 1, columns: [{ width: 28 }, { width: 76 }] },
      {
        sheet: "Sources",
        data: sourcesSheet,
        stickyRowsCount: 1,
        columns: [{ width: 30 }, { width: 44 }, { width: 26 }, { width: 18 }, { width: 44 }],
      },
      {
        sheet: "Methodology",
        data: methodologySheet,
        stickyRowsCount: 1,
        columns: [{ width: 26 }, { width: 76 }, { width: 22 }],
      },
    ],
    {
      fontFamily: "Microsoft YaHei",
      fontSize: 10,
    },
  ).toBlob();
}

export async function exportStatisticXlsx(
  stat: Statistic,
  viewState: StatisticViewState = {},
  filename?: string,
): Promise<Blob> {
  const blob = await buildXlsxBlob(stat, viewState);
  const targetName = filename ?? `${stat.slug || stat.statistic_id}-v${stat.version}.xlsx`;
  downloadBlob(targetName, blob);
  return blob;
}
