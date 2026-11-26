import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildTradeReportHtml,
  buildTradeSummaryDualTableCsv,
  type TradeBulkImportResponse,
  type TradeImportResponse,
  type TradeOverviewPublished,
  type TradePublishResponse,
} from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

const HS_ECG = "90181100";
const HS_ROBOT = "90189080";

function buildBulkMultipart(opts: {
  manifest: Record<string, unknown>;
  csvText: string;
  filename?: string;
  deferPublish?: boolean;
  headers?: Record<string, string>;
}): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(opts.manifest));
  form.append("deferPublish", opts.deferPublish === false ? "0" : "1");
  form.append("file", new File([opts.csvText], opts.filename ?? "bulk.csv", { type: "text/csv" }));
  return { method: "POST", body: form, headers: opts.headers };
}

function buildSingleCsv(grouping: "product" | "partner" | "regime" | "region", hs8: string, usd: number): string {
  if (grouping === "product") {
    return `商品编码,商品名称,第一数量,第一计量单位,美元\n${hs8},心电图记录仪,10,台,${usd}\n`;
  }
  if (grouping === "partner") {
    return `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${hs8},心电图记录仪,502,美国,${usd}\n`;
  }
  if (grouping === "regime") {
    return `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${hs8},心电图记录仪,10,一般贸易,${usd}\n`;
  }
  return `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${hs8},心电图记录仪,3100,上海市,${usd}\n`;
}

async function importSingleMonthAllCombos(
  h: Harness,
  dictVersion: string,
  month: string,
  impUsd: number,
  expUsd: number,
  hs8 = HS_ECG,
): Promise<TradeImportResponse> {
  let last!: TradeImportResponse;
  for (const flow of ["import", "export"] as const) {
    const usd = flow === "import" ? impUsd : expUsd;
    for (const grouping of ["product", "partner", "regime", "region"] as const) {
      const form = new FormData();
      form.append(
        "manifest",
        JSON.stringify({
          dictVersion,
          month,
          flow,
          currency: "USD",
          grouping,
          hs8: [hs8],
          emptyHs8: [],
        }),
      );
      form.append(
        "file",
        new File([buildSingleCsv(grouping, hs8, usd)], `f_${month}_${flow}_${grouping}.csv`, { type: "text/csv" }),
      );
      const res = await h.request("/api/trade/import", { method: "POST", body: form });
      expect(res.status).toBe(200);
      last = (await res.json()) as TradeImportResponse;
    }
  }
  return last;
}

function buildMultiMonthCsv(
  grouping: "product" | "partner" | "regime" | "region",
  rows: Array<{ ym: string; hs8: string; name: string; usd: number; groupCode?: string; groupName?: string }>,
): string {
  const header =
    grouping === "product"
      ? "数据年月,商品编码,商品名称,第一数量,第一计量单位,美元"
      : grouping === "partner"
        ? "数据年月,商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元"
        : grouping === "regime"
          ? "数据年月,商品编码,商品名称,贸易方式编码,贸易方式名称,美元"
          : "数据年月,商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元";
  const lines = [header];
  for (const r of rows) {
    if (grouping === "product") {
      lines.push(`${r.ym},${r.hs8},${r.name},10,台,${r.usd}`);
    } else if (grouping === "partner") {
      lines.push(`${r.ym},${r.hs8},${r.name},${r.groupCode ?? "502"},${r.groupName ?? "美国"},${r.usd}`);
    } else if (grouping === "regime") {
      lines.push(`${r.ym},${r.hs8},${r.name},${r.groupCode ?? "10"},${r.groupName ?? "一般贸易"},${r.usd}`);
    } else {
      lines.push(`${r.ym},${r.hs8},${r.name},${r.groupCode ?? "3100"},${r.groupName ?? "上海市"},${r.usd}`);
    }
  }
  return lines.join("\r\n");
}

describe("PR #4 独立审查后端缺陷回归验证（P1-1 / P1-2 / P1-5 / P2-7 / P2-10 / P2-11）", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ maxRows: 20_000 });
  }, 30_000);

  afterAll(async () => {
    await h?.dispose();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it("[P1-1] 大批量发布（>30 个期间）在暂存快照中途失败时不提前切换可见版本，重试可完整补齐全部快照与观测值", async () => {
    const dictVer = "PR4-P1-1-LARGE";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'p1_1.csv', '${"1".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);

    // 暂存 18 个月（2024-01..12 + 2025-01..06）=> 18 月 + 6 季 + 18 YTD + 1 全年 = 43 个期间 (> 30)
    const monthSpecs = [
      { year: 2024, endMonth: 12 },
      { year: 2025, endMonth: 6 },
    ];
    for (const ms of monthSpecs) {
      const months = Array.from({ length: ms.endMonth }, (_, i) => `${ms.year}-${String(i + 1).padStart(2, "0")}`);
      for (const flow of ["import", "export"] as const) {
        for (const grouping of ["product", "partner", "regime", "region"] as const) {
          const rows = months.map((m, idx) => ({
            ym: m.replace("-", ""),
            hs8: HS_ECG,
            name: "心电图记录仪",
            usd: (ms.year - 2020) * 1000 + (idx + 1) * 10 + (flow === "export" ? 500 : 0),
          }));
          const res = await h.request(
            "/api/trade/import-bulk",
            buildBulkMultipart({
              manifest: {
                dictVersion: dictVer,
                months,
                flow,
                currency: "USD",
                grouping,
                hs8: [HS_ECG],
                probeVerifiedZero: true,
              },
              csvText: buildMultiMonthCsv(grouping, rows),
              filename: `bulk_${ms.year}_${flow}_${grouping}.csv`,
            }),
          );
          expect(res.status).toBe(200);
        }
      }
    }

    // 在大批量发布写完第 2 批（20 个）暂存快照后注入故障
    const failedPub = await h.request("/api/trade/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-fail-publish-stage-after": "2",
      },
      body: JSON.stringify({ dictVersion: dictVer }),
    });
    expect(failedPub.status).toBe(500);

    // 断言：失败期间绝不暴露新版本、不出现 404 或残缺快照、批次仍保持 staged、暂存表已清理
    const periodsDuringFail = (await (await h.request(`/api/trade/periods?dictVersion=${dictVer}`)).json()) as {
      releaseId: string | null;
      publishedMonths: string[];
      availablePeriods: string[];
    };
    expect(periodsDuringFail.releaseId).toBeNull();
    expect(periodsDuringFail.publishedMonths).toEqual([]);
    expect(periodsDuringFail.availablePeriods).toEqual([]);

    const overviewDuringFail = (await (await h.request(`/api/trade/overview?dictVersion=${dictVer}`)).json()) as {
      status: string;
    };
    expect(overviewDuringFail.status).toBe("empty");

    const pubStateRows = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_import_batch WHERE dict_version = '${dictVer}' AND publish_state = 'published'`,
    );
    expect(pubStateRows[0].cnt).toBe(0);

    const stagedLeftover = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_publish_staged_snapshot WHERE dict_version = '${dictVer}'`,
    );
    expect(stagedLeftover[0].cnt).toBe(0);

    // 立即重试发布：必须成功发布全部 43 个期间，且所有期间与派生观测值完整可读
    const retryPubRes = await h.post("/api/trade/publish", { dictVersion: dictVer });
    expect(retryPubRes.status).toBe(200);
    const retryPub = (await retryPubRes.json()) as TradePublishResponse;
    expect(retryPub.published).toBe(true);
    expect(retryPub.publishedMonths).toHaveLength(18);
    expect(retryPub.availablePeriods).toHaveLength(43);

    for (const samplePeriod of ["2024-01", "2024", "2025-Q2", "2025-YTD-06", "2025-06"]) {
      const ovRes = await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=${samplePeriod}`);
      expect(ovRes.status).toBe(200);
      const ov = (await ovRes.json()) as TradeOverviewPublished;
      expect(ov.releaseId).toBe(retryPub.releaseId);
    }

    const obsCount = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM observation WHERE object_ref LIKE 'trade_snapshot:${dictVer}:%'`,
    );
    expect(obsCount[0].cnt).toBeGreaterThanOrEqual(43 * 4);
  }, 60_000);

  it("[P1-2] 大原件批量导入中途失败时按月原子回滚，重传绝不跳过残缺月份且完整写入全部事实明细", async () => {
    const dictVer = "PR4-P1-2-BULK";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'p1_2.csv', '${"2".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);

    // 构造 3 个月、每月 600 条伙伴明细（跨越 CHUNK_SIZE=500，产生 2 条 INSERT_FACT_CHUNK 语句）
    const months = ["2024-01", "2024-02", "2024-03"];
    const rows: Array<{ ym: string; hs8: string; name: string; usd: number; groupCode: string; groupName: string }> = [];
    for (const m of months) {
      const ym = m.replace("-", "");
      for (let p = 1; p <= 600; p++) {
        rows.push({
          ym,
          hs8: HS_ECG,
          name: "心电图记录仪",
          usd: 10,
          groupCode: `P${String(p).padStart(3, "0")}`,
          groupName: `伙伴${p}`,
        });
      }
    }
    const csvText = buildMultiMonthCsv("partner", rows);
    const manifest = {
      dictVersion: dictVer,
      months,
      flow: "import",
      currency: "USD",
      grouping: "partner",
      hs8: [HS_ECG],
      probeVerifiedZero: true,
    };

    // 场景 A：强制触发超大单月两阶段路径（maxBatchStmts=3）并在首块明细后失败
    const failOversized = await h.request(
      "/api/trade/import-bulk",
      buildBulkMultipart({
        manifest,
        csvText,
        headers: {
          "x-test-bulk-max-stmts": "3",
          "x-test-fail-bulk-oversized-month": "1",
        },
      }),
    );
    expect(failOversized.status).toBe(500);

    // 残缺月份不得留下可见批次头或半截事实
    const batchesAfterOversizedFail = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_import_batch WHERE dict_version = '${dictVer}'`,
    );
    const factsAfterOversizedFail = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_fact WHERE dict_version = '${dictVer}'`,
    );
    expect(batchesAfterOversizedFail[0].cnt).toBe(0);
    expect(factsAfterOversizedFail[0].cnt).toBe(0);

    // 场景 B：提交完第 1 个月后中断（模拟网络/RPC 中断）
    const failAfterMonth1 = await h.request(
      "/api/trade/import-bulk",
      buildBulkMultipart({
        manifest,
        csvText,
        headers: { "x-test-fail-bulk-after-month": "1" },
      }),
    );
    expect(failAfterMonth1.status).toBe(500);

    const factsAfterMonth1 = await h.query<{ month: string; cnt: number }>(
      `SELECT month, COUNT(*) AS cnt FROM trade_fact WHERE dict_version = '${dictVer}' GROUP BY month ORDER BY month`,
    );
    expect(factsAfterMonth1).toEqual([{ month: "2024-01", cnt: 600 }]);

    // 重传同一份原件：已完整写入的 2024-01 安全幂等跳过，2024-02 与 2024-03 补齐全部明细
    const retryRes = await h.request("/api/trade/import-bulk", buildBulkMultipart({ manifest, csvText }));
    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as TradeBulkImportResponse;
    expect(retryBody.totalRowCount).toBe(1800);

    const factsAfterRetry = await h.query<{ month: string; cnt: number }>(
      `SELECT month, COUNT(*) AS cnt FROM trade_fact WHERE dict_version = '${dictVer}' GROUP BY month ORDER BY month`,
    );
    expect(factsAfterRetry).toEqual([
      { month: "2024-01", cnt: 600 },
      { month: "2024-02", cnt: 600 },
      { month: "2024-03", cnt: 600 },
    ]);

    // 场景 C：若库中已有历史残缺批次头（row_count=600 但 trade_fact 为空），重传绝不跳过该残缺月
    await h.sql([`DELETE FROM trade_fact WHERE dict_version = '${dictVer}' AND month = '2024-02'`]);
    const repairRes = await h.request("/api/trade/import-bulk", buildBulkMultipart({ manifest, csvText }));
    expect(repairRes.status).toBe(200);
    const repairedFeb = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_fact f
       JOIN trade_import_batch b ON b.batch_id = f.batch_id
       WHERE f.dict_version = '${dictVer}' AND f.month = '2024-02' AND b.superseded_by IS NULL`,
    );
    expect(repairedFeb[0].cnt).toBe(600);
  }, 60_000);

  it("[P1-5] 新增年份月份后，既有旧月份快照的 annualTrend 与跨年研判摘要同步刷新且保持 rows_read=1", async () => {
    const dictVer = "PR4-P1-5-TREND";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'p1_5.csv', '${"5".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);

    // 1) 先发布 2024-01
    const pub2024 = await importSingleMonthAllCombos(h, dictVer, "2024-01", 1000, 2000);
    expect(pub2024.status).toBe("published");
    const ov2024Before = (await (await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024-01`)).json()) as TradeOverviewPublished;
    expect(ov2024Before.annualTrend.map((p) => p.year)).toEqual([2024]);
    expect(ov2024Before.annualTrend.map((p) => p.period)).toEqual(["2024-YTD-01"]);

    // 2) 再发布 2025-01
    const pub2025 = await importSingleMonthAllCombos(h, dictVer, "2025-01", 1200, 2400);
    expect(pub2025.status).toBe("published");

    // 3) 重新打开旧月份 2024-01：必须看到 2024 与 2025 两年趋势以及更新后的跨年摘要，且 releaseId 仍与自身派生观测一致
    const ov2024After = (await (await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024-01`)).json()) as TradeOverviewPublished;
    expect(ov2024After.annualTrend.map((p) => p.year)).toEqual([2024, 2025]);
    expect(ov2024After.annualTrend.map((p) => p.period)).toEqual(["2024-YTD-01", "2025-YTD-01"]);
    expect(ov2024After.narrativeSummary.multiYearParagraph).toContain("2024-YTD-01");
    expect(ov2024After.narrativeSummary.multiYearParagraph).toContain("2025-YTD-01");
    expect(ov2024After.narrativeSummary.multiYearParagraph).not.toContain("单一年度序列");
    expect(ov2024After.releaseId).toBe(pub2024.releaseId);

    const meta = await h.queryWithMeta(
      "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
      [dictVer, "2024-01"],
    );
    expect(meta.meta.rows_read).toBe(1);
  }, 30_000);

  it("[P2-7] 升级前存量旧快照（缺失 narrativeSummary 与 totals.totalUsd）读取与导出 A4 HTML / 双表 CSV 均无异常与 NaN", async () => {
    const dictVer = "PR4-P2-7-LEGACY";
    const relId = "77777777-6666-5555-4444-333333333333";
    const legacyPayload = {
      status: "published",
      period: "2024-01",
      source: "china_customs",
      dictVersion: dictVer,
      releaseId: relId,
      units: { amount: "USD", displayAmount: "100M_USD", share: "PCT", cr: "PCT", hhi: "0_10000" },
      availablePeriods: ["2024-01"],
      coverage: {
        months: ["2024-01"],
        expectedMonths: 1,
        coveredMonths: 1,
        applicableHs8Count: 1,
        coveredHs8Count: 1,
        notApplicableHs8Count: 0,
      },
      sourceBatches: [],
      // 升级前无 totalUsd / totalYoyPct
      totals: {
        importUsd: 20_000_000,
        exportUsd: 80_000_000,
        balanceUsd: 60_000_000,
        importYoyPct: null,
        exportYoyPct: null,
      },
      groupingTotals: {
        product: { importUsd: 20_000_000, exportUsd: 80_000_000 },
        partner: { importUsd: 20_000_000, exportUsd: 80_000_000, count: 1 },
        regime: { importUsd: 20_000_000, exportUsd: 80_000_000, count: 1 },
        region: { importUsd: 20_000_000, exportUsd: 80_000_000, count: 1 },
      },
      concentration: {
        import: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
        export: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
      },
      trend: [],
      categories: [
        {
          categoryId: "cat-01",
          category: "医用诊断装备",
          order: 1,
          hs8Count: 1,
          hsRange: HS_ECG,
          importUsd: 20_000_000,
          exportUsd: 80_000_000,
          balanceUsd: 60_000_000,
          importYoyPct: null,
          exportYoyPct: null,
          importConcentration: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
          exportConcentration: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
          topImportPartners: ["美国"],
          topExportPartners: ["美国"],
        },
      ],
      partners: [
        {
          partnerCode: "502",
          partnerName: "美国",
          importUsd: 20_000_000,
          exportUsd: 80_000_000,
          balanceUsd: 60_000_000,
          importSharePct: 100,
          exportSharePct: 100,
          topCategory: "医用诊断装备",
        },
      ],
      regimes: [],
      regions: [],
      hsItems: [
        {
          hs8: HS_ECG,
          hs6: "901811",
          itemName: "心电图记录仪",
          category: "医用诊断装备",
          importUsd: 20_000_000,
          exportUsd: 80_000_000,
          balanceUsd: 60_000_000,
          importYoyPct: null,
          exportYoyPct: null,
          importQty1: { value: 100, unit: "台" },
          importQty2: { value: null, unit: null },
          exportQty1: { value: 200, unit: "台" },
          exportQty2: { value: null, unit: null },
          importConcentration: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
          exportConcentration: { cr1: 100, cr3: 100, cr5: 100, hhi: 10000, partnerCount: 1 },
          topImportPartners: ["美国"],
          topExportPartners: ["美国"],
        },
      ],
    };

    // 直接将未升级旧快照传入共享导出函数：不抛错、不含 NaN
    const rawHtml = buildTradeReportHtml(legacyPayload as unknown as TradeOverviewPublished);
    expect(rawHtml).toContain("2024-01 医疗器械进出口态势研判摘要");
    expect(rawHtml).toContain("1.0000 亿美元");
    expect(rawHtml).not.toContain("NaN");

    const rawCsv = buildTradeSummaryDualTableCsv(legacyPayload as unknown as TradeOverviewPublished);
    expect(rawCsv).toContain("100000000");
    expect(rawCsv).toContain("1.0000");
    expect(rawCsv).not.toContain("NaN");

    // 写入 D1 并经 GET /api/trade/overview 读取也自动补齐
    await h.sql([
      `INSERT INTO trade_release (release_id, dict_version, prev_release_id, version_seq, published_months_json, available_periods_json, created_at)
       VALUES ('${relId}', '${dictVer}', NULL, 1, '["2024-01"]', '["2024-01"]', '2025-01-01T00:00:00.000Z')`,
      `INSERT INTO trade_current_snapshot (dict_version, period, is_latest_month, release_id, available_periods_json, payload_json, updated_at)
       VALUES ('${dictVer}', '2024-01', 1, '${relId}', '["2024-01"]', '${JSON.stringify(legacyPayload).replace(/'/g, "''")}', '2025-01-01T00:00:00.000Z')`,
    ]);

    const ovRes = await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024-01`);
    expect(ovRes.status).toBe(200);
    const ov = (await ovRes.json()) as TradeOverviewPublished;
    expect(ov.totals.totalUsd).toBe(100_000_000);
    expect(ov.narrativeSummary.headline).toBe("2024-01 医疗器械进出口态势研判摘要");
    expect(ov.annualTrend).toEqual([]);
  });

  it("[P2-10] 年度摘要复用可比税号同比（2023 新增手术机器人税号不虚报增长），且基期为零时显示不可比", async () => {
    const dictVer = "PR4-P2-10-YOY";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'p2_10.csv', '${"a".repeat(64)}', 2, 2, 2, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
       ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
       ('${dictVer}', '${HS_ROBOT}', '901890', '手术机器人', 'cat-02', '治疗装备', 2, 2)`,
      `INSERT INTO trade_hs_year_applicability (dict_version, year, hs8, applicable, basis_note)
       VALUES ('${dictVer}', 2022, '${HS_ROBOT}', 0, '2022年尚未单列手术机器人')`,
    ]);

    // 2022 仅 90181100（每月 1000 USD）；2023 90181100 仍为 1000 USD（0% 变化），新增 90189080 每月 5000 USD
    const plan = [
      { year: 2022, codes: [{ hs8: HS_ECG, name: "心电图记录仪", usd: 1000 }] },
      {
        year: 2023,
        codes: [
          { hs8: HS_ECG, name: "心电图记录仪", usd: 1000 },
          { hs8: HS_ROBOT, name: "手术机器人", usd: 5000 },
        ],
      },
    ];
    for (const yp of plan) {
      const months = Array.from({ length: 12 }, (_, i) => `${yp.year}-${String(i + 1).padStart(2, "0")}`);
      for (const flow of ["import", "export"] as const) {
        for (const grouping of ["product", "partner", "regime", "region"] as const) {
          const rows = months.flatMap((m) =>
            yp.codes.map((c) => ({ ym: m.replace("-", ""), hs8: c.hs8, name: c.name, usd: c.usd })),
          );
          const res = await h.request(
            "/api/trade/import-bulk",
            buildBulkMultipart({
              manifest: {
                dictVersion: dictVer,
                months,
                flow,
                currency: "USD",
                grouping,
                hs8: yp.codes.map((c) => c.hs8),
                probeVerifiedZero: true,
              },
              csvText: buildMultiMonthCsv(grouping, rows),
            }),
          );
          expect(res.status).toBe(200);
        }
      }
    }

    const pub = await h.post("/api/trade/publish", { dictVersion: dictVer });
    expect(pub.status).toBe(200);

    const ov2023 = (await (await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2023`)).json()) as TradeOverviewPublished;
    const pt2023 = ov2023.annualTrend.find((p) => p.year === 2023)!;
    expect(pt2023.totalYoyPct).toBe(0);
    expect(ov2023.narrativeSummary.multiYearParagraph).toContain("同比持平 (0.00%)");
    expect(ov2023.narrativeSummary.multiYearParagraph).not.toContain("同比增长");

    // 场景 B：基期（2022）全为零，2023 为正数 => annualTrend.totalYoyPct === null 且摘要显式标示“不可比”
    const zeroDict = "PR4-P2-10-ZERO";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${zeroDict}', 'p2_10z.csv', '${"b".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${zeroDict}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);
    for (const [yr, usd] of [
      [2022, 0],
      [2023, 1000],
    ] as const) {
      const months = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, "0")}`);
      for (const flow of ["import", "export"] as const) {
        for (const grouping of ["product", "partner", "regime", "region"] as const) {
          const rows = months.map((m) => ({ ym: m.replace("-", ""), hs8: HS_ECG, name: "心电图记录仪", usd }));
          const res = await h.request(
            "/api/trade/import-bulk",
            buildBulkMultipart({
              manifest: {
                dictVersion: zeroDict,
                months,
                flow,
                currency: "USD",
                grouping,
                hs8: [HS_ECG],
                probeVerifiedZero: true,
              },
              csvText: buildMultiMonthCsv(grouping, rows),
            }),
          );
          expect(res.status).toBe(200);
        }
      }
    }
    expect((await h.post("/api/trade/publish", { dictVersion: zeroDict })).status).toBe(200);
    const ovZero = (await (await h.request(`/api/trade/overview?dictVersion=${zeroDict}&period=2023`)).json()) as TradeOverviewPublished;
    expect(ovZero.annualTrend.find((p) => p.year === 2023)?.totalYoyPct).toBeNull();
    expect(ovZero.narrativeSummary.multiYearParagraph).toContain("不可比");
    expect(ovZero.narrativeSummary.multiYearParagraph).not.toContain("（持平）");
  }, 60_000);

  it('[P2-11] 清单中非布尔类型 probeVerifiedZero（如字符串 "false"）返回 400 TRADE_MANIFEST_INVALID，绝不误启用零值确认', async () => {
    const headerOnlyCsv = "数据年月,商品编码,商品名称,美元\r\n";

    // /api/trade/import-bulk 拒绝字符串 "false"
    const bulkBad = await h.request(
      "/api/trade/import-bulk",
      buildBulkMultipart({
        manifest: {
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG],
          probeVerifiedZero: "false",
        },
        csvText: headerOnlyCsv,
      }),
    );
    expect(bulkBad.status).toBe(400);
    const bulkBadJson = (await bulkBad.json()) as { error: { code: string; params?: { field?: string } } };
    expect(bulkBadJson.error.code).toBe("TRADE_MANIFEST_INVALID");
    expect(bulkBadJson.error.params?.field).toBe("probeVerifiedZero");

    // /api/trade/import 同样拒绝字符串 "false"
    const singleForm = new FormData();
    singleForm.append(
      "manifest",
      JSON.stringify({
        dictVersion: "202601",
        month: "2024-01",
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: [HS_ECG],
        emptyHs8: [],
        probeVerifiedZero: "false",
      }),
    );
    singleForm.append("file", new File([headerOnlyCsv], "empty.csv", { type: "text/csv" }));
    const singleBad = await h.request("/api/trade/import", { method: "POST", body: singleForm });
    expect(singleBad.status).toBe(400);
    const singleBadJson = (await singleBad.json()) as { error: { code: string; params?: { field?: string } } };
    expect(singleBadJson.error.code).toBe("TRADE_MANIFEST_INVALID");
    expect(singleBadJson.error.params?.field).toBe("probeVerifiedZero");
  });
});
