import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseMultiMonthCustomsCsvBytes } from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

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

function buildMultiMonthMultipart(opts: {
  manifest: Record<string, unknown>;
  csvText?: string;
  filename?: string;
  deferPublish?: boolean;
}): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(opts.manifest));
  if (opts.deferPublish !== undefined) {
    form.append("deferPublish", opts.deferPublish ? "1" : "0");
  }
  if (opts.csvText !== undefined) {
    form.append("file", new File([opts.csvText], opts.filename ?? "annual_m1.csv", { type: "text/csv" }));
  }
  return { method: "POST", body: form };
}

describe("G7 / AC-019：2022–2026 历年税号适用性、monthFlag=1 多月原件拆解与延迟批量单次发布", () => {
  it("0007 迁移与字典种子自动标记 2022 年 90189080（手术机器人）为当年不适用（163 适用码），2023–2026 为全量 164 码", async () => {
    const cov2022Res = await h.request("/api/trade/coverage?year=2022&hs8=90189080");
    expect(cov2022Res.status).toBe(200);
    const cov2022 = (await cov2022Res.json()) as {
      summary: { totalCells: number; missing: number; notApplicable: number };
      months: Array<{ month: string; applicableHs8Count: number; notApplicableHs8Count: number }>;
      cells: Array<{ month: string; hs8: string; status: string; basis: string | null }>;
    };

    expect(cov2022.summary.totalCells).toBe(164 * 12 * 2 * 4);
    expect(cov2022.summary.notApplicable).toBe(1 * 12 * 2 * 4);
    expect(cov2022.summary.missing).toBe(163 * 12 * 2 * 4);
    expect(cov2022.months.every((m) => m.applicableHs8Count === 163 && m.notApplicableHs8Count === 1)).toBe(true);
    expect(cov2022.cells).toHaveLength(96);
    expect(
      cov2022.cells.every(
        (c) => c.status === "notApplicable" && Boolean(c.basis && c.basis.includes("手术机器人") && c.basis.includes("90189099")),
      ),
    ).toBe(true);

    for (const yr of [2023, 2024, 2025, 2026]) {
      const res = await h.request(`/api/trade/coverage?year=${yr}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { summary: { notApplicable: number } };
      expect(body.summary.notApplicable).toBe(0);
    }
  });

  it("parseMultiMonthCustomsCsvBytes 按数据年月无损拆解全年 CSV，并在 probeVerifiedZero=true 下识别无记录月份税号", () => {
    const csv = [
      "数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元",
      "202401,90181100,心电图记录仪,10,台,5,千克,1000",
      "202401,90221200,X射线断层检查仪,1,台,500,千克,50000",
      "202402,90181100,心电图记录仪,12,台,6,千克,1200",
    ].join("\r\n");

    const parsed = parseMultiMonthCustomsCsvBytes(new TextEncoder().encode(csv), {
      dictVersion: "202601",
      months: ["2024-01", "2024-02", "2024-03"],
      flow: "import",
      currency: "USD",
      grouping: "product",
      hs8: ["90181100", "90221200"],
      probeVerifiedZero: true,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.byMonth.get("2024-01")?.map((r) => r.hs8)).toEqual(["90181100", "90221200"]);
    expect(parsed.byMonth.get("2024-02")?.map((r) => r.hs8)).toEqual(["90181100"]);
    expect(parsed.byMonth.get("2024-03")).toEqual([]);
  });

  it(
    "POST /api/trade/import-bulk (deferPublish=true) 暂存 5 年 58 个月后由 POST /api/trade/publish 单次原子发布，且查询恒定 rows_read=1",
    async () => {
      // 构造 2 税号隔离字典验证 2022(1适用码) + 2023..2026-10(2适用码) 共 58 个完整自然月
      const dictVer = "202601-5Y-BULK";
      await h.sql([
        `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
         VALUES ('${dictVer}', 'subset_2.csv', '0000000000000000000000000000000000000000000000000000000000000002', 2, 2, 2, 'pilot')`,
        `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES
         ('${dictVer}', '90181100', '901811', '心电图记录仪', 'cat-01', '医用诊断装备', 1, 1),
         ('${dictVer}', '90189080', '901890', '手术机器人', 'cat-02', '治疗装备', 2, 28)`,
        `INSERT INTO trade_hs_year_applicability (dict_version, year, hs8, applicable, basis_note)
         VALUES ('${dictVer}', 2022, '90189080', 0, '2022年版税则尚未单列手术机器人子目')`,
      ]);

      const years = [
        { year: 2022, endMonth: 12, codes: ["90181100"] },
        { year: 2023, endMonth: 12, codes: ["90181100", "90189080"] },
        { year: 2024, endMonth: 12, codes: ["90181100", "90189080"] },
        { year: 2025, endMonth: 12, codes: ["90181100", "90189080"] },
        { year: 2026, endMonth: 10, codes: ["90181100", "90189080"] },
      ];

      for (const ySpec of years) {
        const months = Array.from({ length: ySpec.endMonth }, (_, i) => `${ySpec.year}-${String(i + 1).padStart(2, "0")}`);
        for (const flow of ["import", "export"] as const) {
          for (const grouping of ["product", "partner", "regime", "region"] as const) {
            const lines: string[] = [];
            if (grouping === "product") {
              lines.push("数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
            } else if (grouping === "partner") {
              lines.push("数据年月,商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
            } else if (grouping === "regime") {
              lines.push("数据年月,商品编码,商品名称,贸易方式编码,贸易方式名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
            } else {
              lines.push("数据年月,商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,第一数量,第一计量单位,第二数量,第二计量单位,美元");
            }

            for (let m = 1; m <= ySpec.endMonth; m++) {
              const ym = `${ySpec.year}${String(m).padStart(2, "0")}`;
              // 让 90189080 在双数月无记录，验证 probeVerifiedZero 自动落为 confirmedEmpty
              for (const code of ySpec.codes) {
                if (code === "90189080" && m % 2 === 0) continue;
                const usd = (ySpec.year - 2020) * 1000 + m * 10 + (flow === "export" ? 500 : 0);
                const qty = 10 + m;
                const itemName = code === "90181100" ? "心电图记录仪" : "手术机器人";
                if (grouping === "product") {
                  lines.push(`${ym},${code},${itemName},${qty},台,${qty * 2},千克,${usd}`);
                } else if (grouping === "partner") {
                  lines.push(`${ym},${code},${itemName},502,美国,${qty},台,${qty * 2},千克,${usd}`);
                } else if (grouping === "regime") {
                  lines.push(`${ym},${code},${itemName},0110,一般贸易,${qty},台,${qty * 2},千克,${usd}`);
                } else {
                  lines.push(`${ym},${code},${itemName},3100,上海市,${qty},台,${qty * 2},千克,${usd}`);
                }
              }
            }

            const res = await h.request(
              "/api/trade/import-bulk",
              buildMultiMonthMultipart({
                manifest: {
                  dictVersion: dictVer,
                  months,
                  flow,
                  currency: "USD",
                  grouping,
                  hs8: ySpec.codes,
                  probeVerifiedZero: true,
                },
                csvText: lines.join("\r\n"),
                filename: `customs_${ySpec.year}_${flow}_${grouping}.raw.csv`,
                deferPublish: true,
              }),
            );
            expect(res.status).toBe(200);
            const body = (await res.json()) as {
              monthCount: number;
              status: string;
              releaseId: string | null;
              sourceSha256: string;
            };
            expect(body.monthCount).toBe(ySpec.endMonth);
            expect(body.status).toBe("staged");
            expect(body.releaseId).toBeNull();
            expect(body.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
          }
        }
      }

      // 发布前门户仍为空态，不产生任何中间碎片快照版本
      const beforeOverview = await (await h.request(`/api/trade/overview?dictVersion=${dictVer}`)).json();
      expect((beforeOverview as { status: string }).status).toBe("empty");

      // 执行单次向量化批量发布
      const pubRes = await h.post("/api/trade/publish", { dictVersion: dictVer });
      expect(pubRes.status).toBe(200);
      const pubBody = (await pubRes.json()) as {
        published: boolean;
        releaseId: string;
        publishedMonths: string[];
        availablePeriods: string[];
      };
      expect(pubBody.published).toBe(true);
      expect(pubBody.publishedMonths).toHaveLength(58);
      expect(pubBody.availablePeriods).toContain("2022");
      expect(pubBody.availablePeriods).toContain("2023");
      expect(pubBody.availablePeriods).toContain("2024");
      expect(pubBody.availablePeriods).toContain("2025");
      expect(pubBody.availablePeriods).toContain("2026-YTD-10");

      // 验证仅生成唯一 1 条 trade_release 记录（消除 O(M^2) 重复重算）
      const relCount = await h.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM trade_release WHERE dict_version = '${dictVer}'`,
      );
      expect(relCount[0].cnt).toBe(1);

      // 验证 5 年 58 个月规模下主键读取恒定 rows_read = 1
      const metaCheck = await h.queryWithMeta(
        "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
        [dictVer, "2024"],
      );
      expect(metaCheck.results).toHaveLength(1);
      expect(metaCheck.meta.rows_read).toBe(1);
    },
    60_000,
  );

  it(
    "当单次发布跨越超 15 万条 trade_fact 明细行时，不触发 V8 调用栈溢出或 D1 单次查询体积上限并精准完成对账发布",
    async () => {
      // 10 个月份 × 100 个税号 × 150 个真实伙伴国 = 150,000 条伙伴明细（超过 V8 push(...results) 12.5 万参数栈上限，同时伙伴基数保持真实 <=240 国）
      const dictVer = "TEST-5Y-LARGE";
      const HS_COUNT = 100;
      const PARTNER_COUNT = 150;
      const MONTHS = Array.from({ length: 10 }, (_, idx) => `2024-${String(idx + 1).padStart(2, "0")}`);
      const hsCodes = Array.from({ length: HS_COUNT }, (_, idx) => `9018${String(1000 + idx)}`);
      const hsJson = JSON.stringify(hsCodes);
      const perHsMonthlyUsd = PARTNER_COUNT * 10;
      const now = "2026-11-25T00:00:00.000Z";

      const dictValues = hsCodes
        .map((code, idx) => `('${dictVer}', '${code}', '${code.slice(0, 6)}', '器械${idx + 1}', 'cat-01', '医用诊断装备', 1, ${idx + 1})`)
        .join(",\n");

      await h.sql([
        `INSERT INTO trade_dict_meta (dict_version, source_filename, source_sha256, hs8_count, hs6_count, category_count, scope_mode)
         VALUES ('${dictVer}', 'large.csv', '${"f".repeat(64)}', ${HS_COUNT}, ${HS_COUNT}, 1, 'pilot')`,
        `INSERT INTO trade_hs_dict (dict_version, hs8, hs6, item_name, category_id, category_name, category_order, seq_no) VALUES ${dictValues}`,
      ]);

      const metaStmts: string[] = [];
      for (const month of MONTHS) {
        const specs = [
          { flow: "import", grouping: "product", rows: HS_COUNT },
          { flow: "import", grouping: "partner", rows: HS_COUNT * PARTNER_COUNT },
          { flow: "import", grouping: "regime", rows: HS_COUNT },
          { flow: "import", grouping: "region", rows: HS_COUNT },
          { flow: "export", grouping: "product", rows: HS_COUNT },
          { flow: "export", grouping: "partner", rows: HS_COUNT },
          { flow: "export", grouping: "regime", rows: HS_COUNT },
          { flow: "export", grouping: "region", rows: HS_COUNT },
        ] as const;

        for (const sp of specs) {
          const bid = `large-${month}-${sp.flow}-${sp.grouping}`;
          const scopeKey = `${dictVer}|${month}|${sp.flow}|${sp.grouping}|ALL`;
          metaStmts.push(
            `INSERT INTO import_batch (id, filename, status, row_ok, row_err, errors_json, created_at) VALUES ('${bid}', '${bid}.csv', 'completed', ${sp.rows}, 0, '[]', '${now}')`,
            `INSERT INTO trade_import_batch (batch_id, dict_version, month, flow, currency, grouping, scope_key, hs8_json, empty_hs8_json, received_hs8_json, confirmed_empty_hs8_json, missing_hs8_json, filename, source_sha256, evidence_sha256s_json, row_count, publish_state, superseded_by, created_at)
             VALUES ('${bid}', '${dictVer}', '${month}', '${sp.flow}', 'USD', '${sp.grouping}', '${scopeKey}', '${hsJson}', '[]', '${hsJson}', '[]', '[]', '${bid}.csv', '${"a".repeat(64)}', '[]', ${sp.rows}, 'staged', NULL, '${now}')`,
            `INSERT INTO trade_hs_coverage (batch_id, dict_version, month, flow, grouping, hs8, status, evidence_sha256)
             SELECT '${bid}', '${dictVer}', '${month}', '${sp.flow}', '${sp.grouping}', hs8, 'received', '${"a".repeat(64)}'
             FROM trade_hs_dict WHERE dict_version = '${dictVer}'`,
          );
          if (sp.flow === "import" && sp.grouping === "partner") {
            metaStmts.push(
              `WITH RECURSIVE p(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM p WHERE n < ${PARTNER_COUNT})
               INSERT INTO trade_fact (batch_id, dict_version, month, flow, grouping, hs8, item_name, group_code, group_name, usd_scaled, usd_raw, qty1, unit1, qty2, unit2)
               SELECT '${bid}', '${dictVer}', '${month}', 'import', 'partner', d.hs8, d.item_name, 'P' || p.n, '伙伴' || p.n, 100000, '10', 1, '台', null, null
               FROM trade_hs_dict d CROSS JOIN p WHERE d.dict_version = '${dictVer}'`,
            );
          } else {
            metaStmts.push(
              `INSERT INTO trade_fact (batch_id, dict_version, month, flow, grouping, hs8, item_name, group_code, group_name, usd_scaled, usd_raw, qty1, unit1, qty2, unit2)
               SELECT '${bid}', '${dictVer}', '${month}', '${sp.flow}', '${sp.grouping}', hs8, item_name, '502', '美国', ${perHsMonthlyUsd * 10000}, '${perHsMonthlyUsd}', ${PARTNER_COUNT}, '台', null, null
               FROM trade_hs_dict WHERE dict_version = '${dictVer}'`,
            );
          }
        }
      }
      await h.sql(metaStmts);

      const pubRes = await h.post("/api/trade/publish", { dictVersion: dictVer });
      expect(pubRes.status).toBe(200);
      const pubBody = (await pubRes.json()) as { published: boolean; publishedMonths: string[] };
      expect(pubBody.published).toBe(true);
      expect(pubBody.publishedMonths).toHaveLength(10);

      const ov = await (await h.request(`/api/trade/overview?dictVersion=${dictVer}&period=2024-YTD-10`)).json();
      expect((ov as { totals: { importUsd: number } }).totals.importUsd).toBe(HS_COUNT * perHsMonthlyUsd * 10);
    },
    60_000,
  );
});
