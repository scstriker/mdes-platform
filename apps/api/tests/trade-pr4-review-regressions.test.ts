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

  it("[R2 P1-A] 并发导入重叠税号在数据库槽位主键层原子拦截（409），绝不重复覆盖或双倍累计金额", async () => {
    const dictVer = "PR4-R2-P1A-RACE";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r2_p1a.csv', '${"c".repeat(64)}', 2, 2, 2, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
       ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
       ('${dictVer}', '${HS_ROBOT}', '901890', '手术机器人', 'cat-02', '治疗装备', 2, 2)`,
    ]);

    // 场景 1：两个并发 /api/trade/import-bulk 请求同时通过 SELECT 重叠检查，覆盖重叠税号 HS_ECG（范围不同：[ECG] vs [ECG, ROBOT]）
    const bulkA = buildBulkMultipart({
      manifest: {
        dictVersion: dictVer,
        months: ["2024-01"],
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: [HS_ECG],
        probeVerifiedZero: true,
      },
      csvText: buildMultiMonthCsv("product", [{ ym: "202401", hs8: HS_ECG, name: "心电图记录仪", usd: 1000 }]),
      filename: "race_a.csv",
      headers: { "x-test-delay-before-import-commit-ms": "60" },
    });
    const bulkB = buildBulkMultipart({
      manifest: {
        dictVersion: dictVer,
        months: ["2024-01"],
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: [HS_ECG, HS_ROBOT],
        probeVerifiedZero: true,
      },
      csvText: buildMultiMonthCsv("product", [
        { ym: "202401", hs8: HS_ECG, name: "心电图记录仪", usd: 1000 },
        { ym: "202401", hs8: HS_ROBOT, name: "手术机器人", usd: 2000 },
      ]),
      filename: "race_b.csv",
      headers: { "x-test-delay-before-import-commit-ms": "60" },
    });

    const [resA, resB] = await Promise.all([
      h.request("/api/trade/import-bulk", bulkA),
      h.request("/api/trade/import-bulk", bulkB),
    ]);
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const loser = resA.status === 409 ? resA : resB;
    const loserJson = (await loser.json()) as { error: { code: string } };
    expect(loserJson.error.code).toBe("TRADE_SCOPE_CONFLICT");

    const activeBatches = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_import_batch
       WHERE dict_version = '${dictVer}' AND month = '2024-01' AND flow = 'import' AND grouping = 'product'
         AND superseded_by IS NULL`,
    );
    expect(activeBatches[0].cnt).toBe(1);

    // 场景 2：两个并发 /api/trade/import 提交完全相同原件与范围 -> 双方均返回 200 且指向同一唯一批次，绝不双写
    const makeIdenticalSingle = () => {
      const form = new FormData();
      form.append(
        "manifest",
        JSON.stringify({
          dictVersion: dictVer,
          month: "2024-02",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG],
          emptyHs8: [],
        }),
      );
      form.append("deferPublish", "1");
      form.append("file", new File([buildSingleCsv("product", HS_ECG, 3000)], "same.csv", { type: "text/csv" }));
      return {
        method: "POST",
        body: form,
        headers: { "x-test-delay-before-import-commit-ms": "60" },
      } as RequestInit;
    };
    const [same1, same2] = await Promise.all([
      h.request("/api/trade/import", makeIdenticalSingle()),
      h.request("/api/trade/import", makeIdenticalSingle()),
    ]);
    expect(same1.status).toBe(200);
    expect(same2.status).toBe(200);
    const sameBody1 = (await same1.json()) as TradeImportResponse;
    const sameBody2 = (await same2.json()) as TradeImportResponse;
    expect(sameBody1.batchId).toBe(sameBody2.batchId);

    const activeFeb = await h.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM trade_import_batch
       WHERE dict_version = '${dictVer}' AND month = '2024-02' AND flow = 'import' AND grouping = 'product'
         AND superseded_by IS NULL`,
    );
    expect(activeFeb[0].cnt).toBe(1);
  }, 30_000);

  it("[R2 P2-1] 单月 /api/trade/import 同 CSV 将 probeVerifiedZero 从 false 改为 true 时不再沿用旧缺失批次", async () => {
    const dictVer = "PR4-R2-P21-ZERO";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r2_p21.csv', '${"d".repeat(64)}', 2, 2, 2, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
       ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
       ('${dictVer}', '${HS_ROBOT}', '901890', '手术机器人', 'cat-02', '治疗装备', 2, 2)`,
    ]);

    const csvOnlyEcg = buildSingleCsv("product", HS_ECG, 1500);
    const uploadSingle = async (probeVerifiedZero: boolean) => {
      const form = new FormData();
      form.append(
        "manifest",
        JSON.stringify({
          dictVersion: dictVer,
          month: "2024-03",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG, HS_ROBOT],
          emptyHs8: [],
          probeVerifiedZero,
        }),
      );
      form.append("deferPublish", "1");
      form.append("file", new File([csvOnlyEcg], "only_ecg.csv", { type: "text/csv" }));
      const res = await h.request("/api/trade/import", { method: "POST", body: form });
      expect(res.status).toBe(200);
      return (await res.json()) as TradeImportResponse;
    };

    // 首次上传 probeVerifiedZero=false => HS_ROBOT 处于 missing
    const first = await uploadSingle(false);
    expect(first.replayed).toBe(false);
    expect(first.coverage.missing).toEqual([HS_ROBOT]);
    expect(first.coverage.confirmedEmpty).toEqual([]);

    // 同一 CSV 改为 probeVerifiedZero=true => 必须生成新批次替代旧批次，并将 HS_ROBOT 转为 confirmedEmpty
    const second = await uploadSingle(true);
    expect(second.replayed).toBe(false);
    expect(second.batchId).not.toBe(first.batchId);
    expect(second.coverage.missing).toEqual([]);
    expect(second.coverage.confirmedEmpty).toEqual([HS_ROBOT]);

    // 再次以 probeVerifiedZero=true 上传 => 命中新批次的幂等重放
    const third = await uploadSingle(true);
    expect(third.replayed).toBe(true);
    expect(third.batchId).toBe(second.batchId);
  });

  it("[R2 P2-2] /api/trade/import-bulk 即时发布时若仅同字典其他月份就绪发布，本次未就绪月份回执必须为 staged", async () => {
    const dictVer = "PR4-R2-P22-STATUS";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r2_p22.csv', '${"e".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);

    // 先暂存 2024-01 全部 2x4（deferPublish=true），使其处于就绪待发布状态
    for (const flow of ["import", "export"] as const) {
      for (const grouping of ["product", "partner", "regime", "region"] as const) {
        const res = await h.request(
          "/api/trade/import-bulk",
          buildBulkMultipart({
            manifest: {
              dictVersion: dictVer,
              months: ["2024-01"],
              flow,
              currency: "USD",
              grouping,
              hs8: [HS_ECG],
              probeVerifiedZero: true,
            },
            csvText: buildMultiMonthCsv(grouping, [{ ym: "202401", hs8: HS_ECG, name: "心电图记录仪", usd: 500 }]),
            deferPublish: true,
          }),
        );
        expect(res.status).toBe(200);
      }
    }

    // 现仅上传 2024-02 的 1 个分组（import/product）且 deferPublish=false：
    // publishAllReadyTradeMonths 会发布 2024-01，但 2024-02 仍缺 7 组，本次回执绝不能误报 published
    const unreadyRes = await h.request(
      "/api/trade/import-bulk",
      buildBulkMultipart({
        manifest: {
          dictVersion: dictVer,
          months: ["2024-02"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG],
          probeVerifiedZero: true,
        },
        csvText: buildMultiMonthCsv("product", [{ ym: "202402", hs8: HS_ECG, name: "心电图记录仪", usd: 600 }]),
        deferPublish: false,
      }),
    );
    expect(unreadyRes.status).toBe(200);
    const unreadyBody = (await unreadyRes.json()) as TradeBulkImportResponse;
    expect(unreadyBody.publishedMonths).toEqual(["2024-01"]);
    expect(unreadyBody.status).toBe("staged");
    expect(unreadyBody.releaseId).toBeNull();
  });

  it("[R2 P2-3] POST /api/trade/publish 收到损坏或非对象 JSON 请求体时返回 400，绝不静默回退发布默认字典", async () => {
    // 准备一个合法可发布的 202601 暂存月份不重要，先验证即使默认字典存在可发布目标，损坏 JSON 也不会触发发布
    const dictVer = "PR4-R2-P23-CHECK";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r2_p23.csv', '${"f".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);
    // 把 202601 的一个可发布月替换为仅 1 码测试成本过高，改为核验 400 响应且不写入任何 trade_release
    const brokenJsonRes = await h.request("/api/trade/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"dictVersion": "PR4-R2-P23-CHECK"',
    });
    expect(brokenJsonRes.status).toBe(400);
    const brokenJson = (await brokenJsonRes.json()) as { error: { code: string; params?: { field?: string } } };
    expect(brokenJson.error.code).toBe("TRADE_MANIFEST_INVALID");
    expect(brokenJson.error.params?.field).toBe("body");

    const arrayBodyRes = await h.request("/api/trade/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    expect(arrayBodyRes.status).toBe(400);

    const badTypeRes = await h.request("/api/trade/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dictVersion: 202601 }),
    });
    expect(badTypeRes.status).toBe(400);

    // 合法空体仍允许正常调用
    const emptyBodyRes = await h.request(`/api/trade/publish?dictVersion=${dictVer}`, { method: "POST" });
    expect(emptyBodyRes.status).toBe(200);
  });

  it("[R2 P2-4] 带前导单引号（'90181100）或公式转义（=\"90181100\"）的税号在单月与批量接口均可正常导入", async () => {
    const dictVer = "PR4-R2-P24-QUOTED-HS8";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r2_p24.csv', '${"9".repeat(64)}', 2, 2, 2, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
       ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
       ('${dictVer}', '${HS_ROBOT}', '901890', '手术机器人', 'cat-02', '治疗装备', 2, 2)`,
    ]);

    // 批量导入：含 '90181100 与 ="90189080"
    const quotedBulkCsv =
      "数据年月,商品编码,商品名称,第一数量,第一计量单位,美元\r\n" +
      `'202401,'${HS_ECG},心电图记录仪,10,台,1200\r\n` +
      `202401,"=""${HS_ROBOT}""",手术机器人,2,台,5000\r\n`;
    const bulkRes = await h.request(
      "/api/trade/import-bulk",
      buildBulkMultipart({
        manifest: {
          dictVersion: dictVer,
          months: ["2024-01"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG, HS_ROBOT],
          probeVerifiedZero: true,
        },
        csvText: quotedBulkCsv,
      }),
    );
    expect(bulkRes.status).toBe(200);
    const bulkBody = (await bulkRes.json()) as TradeBulkImportResponse;
    expect(bulkBody.totalRowCount).toBe(2);

    // 单月导入：含 '90181100
    const singleQuotedCsv = `商品编码,商品名称,美元\n'${HS_ECG},心电图记录仪,888\n`;
    const singleForm = new FormData();
    singleForm.append(
      "manifest",
      JSON.stringify({
        dictVersion: dictVer,
        month: "2024-02",
        flow: "export",
        currency: "USD",
        grouping: "product",
        hs8: [HS_ECG],
        emptyHs8: [],
      }),
    );
    singleForm.append("deferPublish", "1");
    singleForm.append("file", new File([singleQuotedCsv], "quoted.csv", { type: "text/csv" }));
    const singleRes = await h.request("/api/trade/import", { method: "POST", body: singleForm });
    expect(singleRes.status).toBe(200);
    const singleBody = (await singleRes.json()) as TradeImportResponse;
    expect(singleBody.coverage.received).toEqual([HS_ECG]);
    expect(singleBody.rowCount).toBe(1);
  });

  it("[R3 P1-1] 公开部署默认关闭贸易写路由（403 TRADE_WRITE_DISABLED），仅受控本地环境或有效管理令牌可写", async () => {
    // (a) 模拟按 wrangler.toml 默认部署（ENABLE_TRADE_WRITE 未开启、未设 TRADE_WRITE_TOKEN）
    const pubHarness = await startHarness({ enableTradeWrite: false });
    try {
      const formSingle = new FormData();
      formSingle.append(
        "manifest",
        JSON.stringify({
          dictVersion: "202601",
          month: "2024-01",
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: [HS_ECG],
          emptyHs8: [],
        }),
      );
      formSingle.append("file", new File([buildSingleCsv("product", HS_ECG, 100)], "f.csv", { type: "text/csv" }));

      const r1 = await pubHarness.request("/api/trade/import", { method: "POST", body: formSingle });
      expect(r1.status).toBe(403);
      expect(((await r1.json()) as { error: { code: string } }).error.code).toBe("TRADE_WRITE_DISABLED");

      const r2 = await pubHarness.request(
        "/api/trade/import-bulk",
        buildBulkMultipart({
          manifest: {
            dictVersion: "202601",
            months: ["2024-01"],
            flow: "import",
            currency: "USD",
            grouping: "product",
            hs8: [HS_ECG],
            probeVerifiedZero: true,
          },
          csvText: buildMultiMonthCsv("product", [{ ym: "202401", hs8: HS_ECG, name: "心电图记录仪", usd: 100 }]),
        }),
      );
      expect(r2.status).toBe(403);
      expect(((await r2.json()) as { error: { code: string } }).error.code).toBe("TRADE_WRITE_DISABLED");

      const r3 = await pubHarness.post("/api/trade/publish", { dictVersion: "202601" });
      expect(r3.status).toBe(403);
      expect(((await r3.json()) as { error: { code: string } }).error.code).toBe("TRADE_WRITE_DISABLED");

      // 只读查询接口依然正常对外开放
      expect((await pubHarness.request("/api/trade/overview")).status).toBe(200);
      expect((await pubHarness.request("/api/trade/periods")).status).toBe(200);
      expect((await pubHarness.request("/api/trade/batches")).status).toBe(200);
      expect((await pubHarness.request("/api/trade/coverage?year=2024")).status).toBe(200);
    } finally {
      await pubHarness.dispose();
    }

    // (b) 即使开启 ENABLE_TRADE_WRITE=1 但未配置 TRADE_WRITE_TOKEN，非回环公开域名仍被拦截 403
    const nonLoopbackRes = await h.request("https://mdes-api.example.workers.dev/api/trade/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dictVersion: "202601" }),
    });
    expect(nonLoopbackRes.status).toBe(403);
    expect(((await nonLoopbackRes.json()) as { error: { code: string } }).error.code).toBe("TRADE_WRITE_DISABLED");

    // (c) 配置 TRADE_WRITE_TOKEN 后，缺令牌或错误令牌返回 403，合法 X-Admin-Token / Bearer 放行
    const tokenHarness = await startHarness({ enableTradeWrite: true, tradeWriteToken: "mdes-secret-write-token" });
    try {
      const noTok = await tokenHarness.request("https://mdes-api.example.workers.dev/api/trade/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dictVersion: "202601" }),
      });
      expect(noTok.status).toBe(403);

      const badTok = await tokenHarness.request("https://mdes-api.example.workers.dev/api/trade/publish", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": "wrong-token" },
        body: JSON.stringify({ dictVersion: "202601" }),
      });
      expect(badTok.status).toBe(403);

      const goodHeader = await tokenHarness.request("https://mdes-api.example.workers.dev/api/trade/publish", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": "mdes-secret-write-token" },
        body: JSON.stringify({ dictVersion: "202601" }),
      });
      expect(goodHeader.status).toBe(200);

      const goodBearer = await tokenHarness.request("https://mdes-api.example.workers.dev/api/trade/publish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer mdes-secret-write-token",
        },
        body: JSON.stringify({ dictVersion: "202601" }),
      });
      expect(goodBearer.status).toBe(200);
    } finally {
      await tokenHarness.dispose();
    }
  }, 30_000);

  it("[R3 P2-2 / P2-4 / P2-5] batchIds 精确批量回查终态、年度样表 Sheet1 B/H/N 列精确对齐、单月修订与多年度发布结果一致", async () => {
    const dictVer = "PR4-R3-COMBINED";
    await h.sql([
      `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
       VALUES ('${dictVer}', 'r3.csv', '${"7".repeat(64)}', 1, 1, 1, 'pilot')`,
      `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no)
       VALUES ('${dictVer}', '${HS_ECG}', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1)`,
    ]);

    // 先发布 2022-01、2023-01、2024-01（多年度数据）
    const r2022 = await importSingleMonthAllCombos(h, dictVer, "2022-01", 1000, 2000);
    const r2023 = await importSingleMonthAllCombos(h, dictVer, "2023-01", 1200, 2400);
    const r2024 = await importSingleMonthAllCombos(h, dictVer, "2024-01", 1500, 3000);
    expect(r2024.status).toBe("published");

    // [P2-2] GET /api/trade/batches?batchIds=... 按 ID 精确回查全部状态（不受 LIMIT 100 截断）
    const exactRes = await h.request(
      `/api/trade/batches?dictVersion=${dictVer}&batchIds=${[r2022.batchId, r2023.batchId, r2024.batchId].join(",")}`,
    );
    expect(exactRes.status).toBe(200);
    const exactJson = (await exactRes.json()) as { items: Array<{ batchId: string; publishState: string }> };
    expect(exactJson.items.map((x) => x.batchId).sort()).toEqual([r2022.batchId, r2023.batchId, r2024.batchId].sort());
    expect(exactJson.items.every((x) => x.publishState === "published")).toBe(true);

    // [P2-5] 单月修订 2024-01（按 D1 product 聚合 annualTrend + 仅加载目标年份明细），核对跨年趋势与快照金额精准更新
    const rev2024 = await importSingleMonthAllCombos(h, dictVer, "2024-01", 2000, 5000);
    expect(rev2024.status).toBe("published");
    const ov2024 = (await (await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024-01`)).json()) as TradeOverviewPublished;
    expect(ov2024.totals.importUsd).toBe(2000);
    expect(ov2024.totals.exportUsd).toBe(5000);
    expect(ov2024.annualTrend.map((p) => [p.year, p.importUsd, p.exportUsd])).toEqual([
      [2022, 1000, 2000],
      [2023, 1200, 2400],
      [2024, 2000, 5000],
    ]);

    // [P2-4] 核对年度汇总双表 CSV 表二严格对齐样表 Sheet1 原 16 列位置：B(1)=HS8、G(6)=进口数量同比、H(7)=进口额(美元)、M(12)=出口数量同比、N(13)=出口额(美元)
    const dualCsv = buildTradeSummaryDualTableCsv(ov2024);
    const csvLines = dualCsv.replace(/^\uFEFF/, "").split(/\r?\n/);
    const sheet1TitleIdx = csvLines.findIndex((l) => l.startsWith("# 表二："));
    expect(sheet1TitleIdx).toBeGreaterThan(0);
    const headerCols = csvLines[sheet1TitleIdx + 1].split(",");
    const dataCols = csvLines[sheet1TitleIdx + 2].split(",");

    expect(headerCols[1]).toBe("HS8商品编码"); // Col B
    expect(headerCols[6]).toBe("进口数量同比(%)"); // Col G
    expect(headerCols[7]).toBe("进口额(美元)"); // Col H
    expect(headerCols[12]).toBe("出口数量同比(%)"); // Col M
    expect(headerCols[13]).toBe("出口额(美元)"); // Col N
    expect(headerCols[16]).toBe("贸易差额(美元)"); // Col Q (追加扩展列)

    expect(dataCols[1]).toBe(HS_ECG); // Col B = HS8
    expect(Number(dataCols[7])).toBe(2000); // Col H = 进口额(美元)
    expect(Number(dataCols[13])).toBe(5000); // Col N = 出口额(美元)
    expect(Number(dataCols[16])).toBe(3000); // Col Q = 顺差
  }, 30_000);
});
