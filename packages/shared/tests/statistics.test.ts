import { describe, expect, it } from "vitest";
import {
  buildCopyForAiMarkdown,
  detectCatalogAliasCorrection,
  formatStatisticCitation,
  projectStatisticView,
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type Statistic,
} from "../src";

describe("projectStatisticView 单一事实源投影", () => {
  it("支持列式年度同比计算（yoy_growth），并在 non_comparable 口径断点处跳过强算同比", () => {
    const regStat = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-REG-CLASS3-TREND")!;
    // 构造含 non_comparable 2024 断点的统计对象
    const withHardBreak: Statistic = {
      ...regStat,
      methodology: {
        ...regStat.methodology,
        methodology_breaks: [
          {
            effective_period: "2024",
            short_label: "2024统计边界重构",
            explanation: "统计口径发生不可比调整",
            comparability: "non_comparable",
          },
        ],
      },
    };

    const proj = projectStatisticView(withHardBreak, { metricMode: "yoy_growth" });
    expect(proj.metricMode).toBe("yoy_growth");
    expect(proj.unit).toBe("%");
    expect(proj.zeroBaseline).toBe(true);

    const domSeries = proj.allSeries.find((s) => s.key === "domestic_class3")!;
    // 2021 首期无同比 -> null
    expect(domSeries.points[0]?.period).toBe("2021");
    expect(domSeries.points[0]?.value).toBeNull();
    // 2022: (1796 - 1185) / 1185 = +51.56%
    expect(domSeries.points[1]?.period).toBe("2022");
    expect(domSeries.points[1]?.value).toBeCloseTo(51.56, 2);
    // 2024 命中 non_comparable 断点 -> 严禁强算同比，返回 null
    const pt2024 = domSeries.points.find((p) => p.period === "2024")!;
    expect(pt2024.value).toBeNull();
    expect(pt2024.raw_value).toBe(2114);
    // 2025 恢复相邻可比计算: (2386 - 2114) / 2114 = +12.87%
    const pt2025 = domSeries.points.find((p) => p.period === "2025")!;
    expect(pt2025.value).toBeCloseTo(12.87, 2);
  });

  it("支持构成占比模式（share_pct），整机与零件同统计期份额之和精确对齐", () => {
    const mriTrade = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-TRD-MRI-HS8")!;
    const proj = projectStatisticView(mriTrade, { metricMode: "share_pct" });
    expect(proj.metricMode).toBe("share_pct");
    expect(proj.unit).toBe("%");

    const sys2024 = proj.allSeries[0]!.points.find((p) => p.period === "2024")!;
    const parts2024 = proj.allSeries[1]!.points.find((p) => p.period === "2024")!;
    // 263.11 / (263.11 + 312.48) = 45.71%, 312.48 / 575.59 = 54.29%
    expect(sys2024.value).toBeCloseTo(45.71, 2);
    expect(parts2024.value).toBeCloseTo(54.29, 2);
  });

  it("超过 5 条序列时强制执行 Top 5 绘制上限，未绘制序列完整保留于 tableRows 并标注「未画出」", () => {
    const base = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-ENT-UIH-SEGMENTS")!;
    const sevenSeriesStat: Statistic = {
      ...base,
      dataset: {
        periods: ["2024", "2025"],
        series: [
          { key: "s1", label: "序列1", unit: "亿元", values: [10, 70] },
          { key: "s2", label: "序列2", unit: "亿元", values: [10, 60] },
          { key: "s3", label: "序列3", unit: "亿元", values: [10, 50] },
          { key: "s4", label: "序列4", unit: "亿元", values: [10, 40] },
          { key: "s5", label: "序列5", unit: "亿元", values: [10, 30] },
          { key: "s6", label: "序列6", unit: "亿元", values: [10, 20] },
          { key: "s7", label: "序列7", unit: "亿元", values: [10, 10] },
        ],
      },
    };

    const proj = projectStatisticView(sevenSeriesStat);
    expect(proj.plottedSeries).toHaveLength(5);
    expect(proj.unplottedSeries).toHaveLength(2);
    expect(proj.plottedSeries.map((s) => s.key)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(proj.unplottedSeries.map((s) => s.key)).toEqual(["s6", "s7"]);

    // 2 个期间 × 7 条序列 = 14 行数据表全量保留
    expect(proj.tableRows).toHaveLength(14);
    const unplottedRows = proj.tableRows.filter((r) => !r.plotted);
    expect(unplottedRows).toHaveLength(4);
    for (const row of unplottedRows) {
      expect(row.note).toContain("未画出");
    }
  });

  it("准确格式化预测值 F 与估算值 E 的冻结预测时点（forecast_as_of）及分母列", () => {
    const mriMkt = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-MKT-MRI-PROCUREMENT")!;
    const proj = projectStatisticView(mriMkt);
    const row2024 = proj.tableRows.find((r) => r.period === "2024")!;
    const row2025 = proj.tableRows.find((r) => r.period === "2025")!;
    const row2026 = proj.tableRows.find((r) => r.period === "2026")!;

    expect(row2024.status).toBe("E");
    expect(row2024.status_label).toBe("估算值（截至 2025-02 估算）");
    expect(row2025.status).toBe("A");
    expect(row2025.status_label).toBe("实际值");
    expect(row2026.status).toBe("F");
    expect(row2026.status_label).toBe("预测值（截至 2025-12 预测）");

    const density = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-REG-DENSITY-PER100")!;
    const densityProj = projectStatisticView(density);
    const bjRow = densityProj.tableRows.find((r) => r.period === "北京")!;
    expect(bjRow.denominator_text).toBe("980 家");
  });
});

describe("formatStatisticCitation & buildCopyForAiMarkdown & 旧别名纠偏", () => {
  const uihStat = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-ENT-UIH-RD-RATIO")!;

  it("生成 gbt7714、apa7、brief 三种带 ?v= 版本锁定的标准引文", () => {
    const gbt = formatStatisticCitation(uihStat, "gbt7714", "https://mdes.example.org", "2026-11-27");
    expect(gbt).toContain("[DB/OL]");
    expect(gbt).toContain("版本 2026.06.1");
    expect(gbt).toContain("[2026-11-27]");
    expect(gbt).toContain("https://mdes.example.org/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1");

    const apa = formatStatisticCitation(uihStat, "apa7", "https://mdes.example.org");
    expect(apa).toContain("ITEI. (2026).");
    expect(apa).toContain("[Statistic, Version 2026.06.1]");
    expect(apa).toContain("https://mdes.example.org/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1");

    const brief = formatStatisticCitation(uihStat, "brief", "https://mdes.example.org");
    expect(brief).toContain("上海联影医疗科技股份有限公司《2025 年年度报告（研发投入情况表）》（正文第 87 页）");
    expect(brief).toContain("版本 2026.06.1");
    expect(brief).toContain("https://mdes.example.org/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1");
  });

  it("生成完整结构化 Copy for AI Markdown（含口径变更章节、来源定位与全部禁止推断红线）", () => {
    const mriMkt = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-MKT-MRI-PROCUREMENT")!;
    const md = buildCopyForAiMarkdown(mriMkt, {}, "https://mdes.example.org");

    expect(md).toContain("# 中国医用磁共振成像设备市场规模与预测（含历史预测对照）");
    expect(md).toContain("## 1. 统计范围与当前筛选");
    expect(md).toContain("https://mdes.example.org/statistics/STAT-MKT-MRI-PROCUREMENT?v=2026.10.1");
    expect(md).toContain("## 2. 规范化统计数据表");
    expect(md).toContain("| 2026 | 国内医用 MRI 市场规模 | 136.00 | 亿元 | 预测值（截至 2025-12 预测） |");
    expect(md).toContain("## 3. 统计口径与计算规则");
    expect(md).toContain("## 4. 口径变更说明");
    expect(md).toContain("2023新版大型医用设备配置目录实施");
    expect(md).toContain("## 5. 权威数据来源与原文定位");
    expect(md).toContain("## 6. 使用限制与禁止推断红线（AI 写作必须严格遵守）");
    for (const rule of mriMkt.methodology.prohibited_inferences) {
      expect(md).toContain(`- **禁止推断**：${rule}`);
    }
  });

  it("大小写与空格无关识别旧版标准别名（GB 9706.233-2020 -> YY 9706.233-2021）", () => {
    const corr1 = detectCatalogAliasCorrection("GB 9706.233-2020", V2_SEED_CATALOG_RECORDS);
    expect(corr1).not.toBeNull();
    expect(corr1?.canonical_code).toBe("YY 9706.233-2021");
    expect(corr1?.canonical_slug).toBe("yy-9706-233-2021");

    const corr2 = detectCatalogAliasCorrection("gb9706.233-2020", V2_SEED_CATALOG_RECORDS);
    expect(corr2?.canonical_code).toBe("YY 9706.233-2021");

    expect(detectCatalogAliasCorrection("YY 9706.233-2021", V2_SEED_CATALOG_RECORDS)).toBeNull();
  });
});
