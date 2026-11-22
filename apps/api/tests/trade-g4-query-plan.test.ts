import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./helpers/harness";

const DICT_VERSION = "202601";
const HS_A = "90181100";

function uploadCsv(manifest: Record<string, unknown>, csvText: string): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("file", new File([csvText], "fixture.csv", { type: "text/csv" }));
  return { method: "POST", body: form };
}

async function seedYearSingleCode(h: Harness, year: number, baseUsd: number) {
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const usd = baseUsd + m * 10;
    for (const flow of ["import", "export"] as const) {
      for (const grouping of ["product", "partner", "regime", "region"] as const) {
        const csv =
          grouping === "product"
            ? `商品编码,商品名称,美元\n${HS_A},心电图记录仪,${usd}\n`
            : grouping === "partner"
              ? `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${HS_A},心电图记录仪,502,美国,${usd}\n`
              : grouping === "regime"
                ? `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${HS_A},心电图记录仪,10,一般贸易,${usd}\n`
                : `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${HS_A},心电图记录仪,4403,广东深圳,${usd}\n`;
        const res = await h.request(
          "/api/trade/import",
          uploadCsv({ dictVersion: DICT_VERSION, month, flow, currency: "USD", grouping, hs8: [HS_A], emptyHs8: [] }, csv),
        );
        expect(res.status).toBe(200);
      }
    }
  }
}

describe("G4 / AC-016：热点快照索引执行计划与历史扩充前后恒定读取行数", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(() => h?.dispose());

  beforeEach(async () => {
    await h.reset();
    await h.sql([
      `delete from trade_hs_dict where dict_version = '${DICT_VERSION}' and hs8 != '${HS_A}'`,
      `update trade_dict_meta set hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated' where dict_version = '${DICT_VERSION}'`,
    ]);
  });

  it("专题快照查询走唯一主键索引且不扫描 trade_fact；扩充历史年份事实后 rows_read 保持为 1", async () => {
    await seedYearSingleCode(h, 2024, 1000);

    const plan = await h.query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = '202601' AND period = '2024'",
    );
    const planText = plan.map((p) => p.detail).join(" | ");
    expect(planText).toContain("SEARCH trade_current_snapshot USING INDEX");
    expect(planText).not.toContain("trade_fact");
    expect(planText).not.toContain("SCAN");

    const beforeExpansion = await h.queryWithMeta<{ payload_json: string }>(
      "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
      [DICT_VERSION, "2024"],
    );
    expect(beforeExpansion.results).toHaveLength(1);
    expect(beforeExpansion.meta.rows_read).toBe(1);

    // 扩充另一完整年度（2022 年，与 2024 同比无关，不触发 2024 快照重算，新增 96 批月度明细与 29 条快照）
    await seedYearSingleCode(h, 2022, 800);

    const factCount = (await h.query<{ n: number }>("SELECT COUNT(*) AS n FROM trade_fact"))[0].n;
    expect(factCount).toBe(192);

    const afterExpansion = await h.queryWithMeta<{ payload_json: string }>(
      "SELECT payload_json, available_periods_json FROM trade_current_snapshot WHERE dict_version = ?1 AND period = ?2",
      [DICT_VERSION, "2024"],
    );
    expect(afterExpansion.results).toHaveLength(1);
    expect(afterExpansion.meta.rows_read).toBe(beforeExpansion.meta.rows_read);
    expect(afterExpansion.meta.rows_read).toBe(1);
  }, 30_000);
});
