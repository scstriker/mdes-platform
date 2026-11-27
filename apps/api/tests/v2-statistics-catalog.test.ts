import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  CatalogDetailResponse,
  CatalogPage,
  GlobalSearchResult,
  Statistic,
  StatisticDetailResponse,
  StatisticListPage,
  StatisticVersionsResponse,
  TradeImportResponse,
  TradeOverviewPublished,
} from "@mdes/shared";
import { startHarness, type Harness } from "./helpers/harness";

const DICT_VERSION = "202601";
const HS_A = "90181100";

function uploadTradeCsv(manifest: Record<string, unknown>, csvText: string): RequestInit {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("file", new File([csvText], "fixture.csv", { type: "text/csv" }));
  return { method: "POST", body: form };
}

async function seedYearSingleCode(h: Harness, year: number, baseUsd: number): Promise<string> {
  let lastReleaseId = "";
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
          uploadTradeCsv(
            { dictVersion: DICT_VERSION, month, flow, currency: "USD", grouping, hs8: [HS_A], emptyHs8: [] },
            csv,
          ),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as TradeImportResponse;
        if (body.releaseId) lastReleaseId = body.releaseId;
      }
    }
  }
  return lastReleaseId;
}

describe("V2 单项统计双平面快照、一等公民目录、历史贸易版本锁定与 FTS5 全站检索", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(() => h?.dispose());

  beforeEach(async () => {
    await h.reset();
  });

  it("0010 迁移向后兼容扩展 observation 列且默认 value_type='actual'", async () => {
    const cols = await h.query<{ name: string; dflt_value: string | null }>(
      "SELECT name, dflt_value FROM pragma_table_info('observation')",
    );
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("value_type");
    expect(colNames).toContain("forecast_as_of");
    expect(colNames).toContain("revision_id");
  });

  it("GET /api/statistics/STAT-ENT-UIH-RD-RATIO 返回 2025 年 18.99%、ETag/304、?raw=1 零解析直出，且主键查询 rows_read === 1", async () => {
    const res = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO");
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag");
    expect(etag).toBe('"sha256-uih-rd-2026061"');
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");

    const body = (await res.json()) as StatisticDetailResponse;
    expect(body.latest_version).toBe("2026.06.1");
    expect(body.is_historical_version).toBe(false);
    expect(body.statistic.summary_kpi.headline_value).toBe("18.99");
    expect(body.statistic.summary_kpi.period).toBe("2025");
    const idx2025 = body.statistic.dataset.periods.indexOf("2025");
    expect(body.statistic.dataset.series[0]?.values[idx2025]).toBe(18.99);
    expect(body.related.length).toBeGreaterThan(0);

    // slug 路由等价访问
    const bySlug = await h.request("/api/statistics/united-imaging-rd-to-revenue-ratio");
    expect(bySlug.status).toBe(200);
    expect(((await bySlug.json()) as StatisticDetailResponse).statistic.statistic_id).toBe("STAT-ENT-UIH-RD-RATIO");

    // If-None-Match 命中 304
    const notMod = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO", {
      headers: { "If-None-Match": etag! },
    });
    expect(notMod.status).toBe(304);

    // ?raw=1 零解析直出原始 Statistic 对象
    const rawRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO?raw=1");
    expect(rawRes.status).toBe(200);
    expect(rawRes.headers.get("etag")).toBe(etag);
    const rawStat = (await rawRes.json()) as Statistic;
    expect(rawStat.statistic_id).toBe("STAT-ENT-UIH-RD-RATIO");
    expect(rawStat.summary_kpi.headline_value).toBe("18.99");

    // 验证 statistic_version 精确走复合主键索引且 rows_read === 1
    const plan = await h.query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT version, content_hash, published_at, payload_json FROM statistic_version WHERE statistic_id = 'STAT-ENT-UIH-RD-RATIO' AND version = '2026.06.1'",
    );
    const planText = plan.map((p) => p.detail).join(" | ");
    expect(planText).toContain("SEARCH statistic_version USING INDEX");
    expect(planText).not.toContain("SCAN");

    const metaCheck = await h.queryWithMeta<{ payload_json: string }>(
      "SELECT version, content_hash, published_at, payload_json FROM statistic_version WHERE statistic_id = ?1 AND version = ?2",
      ["STAT-ENT-UIH-RD-RATIO", "2026.06.1"],
    );
    expect(metaCheck.results).toHaveLength(1);
    expect(metaCheck.meta.rows_read).toBe(1);
  });

  it("发布新版本 2026.09.1 更新最新版本，而 ?v=2026.06.1 仍返回 18.99% 不可变历史快照，缺失 ?v=9999 返回 404", async () => {
    const initialRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO");
    const initialBody = (await initialRes.json()) as StatisticDetailResponse;
    const baseStat = initialBody.statistic;

    const revisedStat: Statistic = {
      ...baseStat,
      version: "2026.09.1",
      content_hash: "sha256-uih-rd-2026091",
      published_at: "2026-09-30T08:00:00Z",
      summary_kpi: {
        ...baseStat.summary_kpi,
        headline_value: "19.45",
        period: "2026Q1-Q3",
      },
      dataset: {
        ...baseStat.dataset,
        periods: [...baseStat.dataset.periods, "2026Q1-Q3"],
        series: [
          {
            ...baseStat.dataset.series[0]!,
            values: [...baseStat.dataset.series[0]!.values, 19.45],
            status: ["A", "A", "A", "A", "A", "P"],
          },
        ],
      },
    };

    const pubRes = await h.post("/api/statistics/publish", revisedStat);
    expect(pubRes.status).toBe(200);
    expect(await pubRes.json()).toMatchObject({
      ok: true,
      statistic_id: "STAT-ENT-UIH-RD-RATIO",
      version: "2026.09.1",
      latest_version: "2026.09.1",
    });

    // 不带 ?v= 访问最新已发布版本 2026.09.1
    const latestRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO");
    const latestDetail = (await latestRes.json()) as StatisticDetailResponse;
    expect(latestDetail.statistic.version).toBe("2026.09.1");
    expect(latestDetail.statistic.summary_kpi.headline_value).toBe("19.45");
    expect(latestDetail.is_historical_version).toBe(false);

    // 报告锁定 ?v=2026.06.1 仍严格返回 18.99% 不可变快照与 immutable 缓存头
    const pinnedRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO?v=2026.06.1");
    expect(pinnedRes.status).toBe(200);
    expect(pinnedRes.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(pinnedRes.headers.get("etag")).toBe('"sha256-uih-rd-2026061"');
    const pinnedDetail = (await pinnedRes.json()) as StatisticDetailResponse;
    expect(pinnedDetail.statistic.version).toBe("2026.06.1");
    expect(pinnedDetail.latest_version).toBe("2026.09.1");
    expect(pinnedDetail.is_historical_version).toBe(true);
    expect(pinnedDetail.statistic.summary_kpi.headline_value).toBe("18.99");

    // 版本列表按发布时间倒序包含 2026.09.1、2026.06.1、2025.06.1
    const verListRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO/versions");
    expect(verListRes.status).toBe(200);
    const verList = (await verListRes.json()) as StatisticVersionsResponse;
    expect(verList.items.map((v) => v.version)).toEqual(["2026.09.1", "2026.06.1", "2025.06.1"]);

    // 请求不存在的历史版本返回结构化 404
    const missRes = await h.request("/api/statistics/STAT-ENT-UIH-RD-RATIO?v=9999");
    expect(missRes.status).toBe(404);
    const missBody = (await missRes.json()) as ApiErrorBody;
    expect(missBody.error.code).toBe("NOT_FOUND");
    expect(missBody.error.params).toMatchObject({
      id: "STAT-ENT-UIH-RD-RATIO",
      version: "9999",
    });
  });

  it("GET /api/catalog?kind=standard&q=GB 9706.233-2020 返回现行行标 YY 9706.233-2021 与旧别名纠偏说明", async () => {
    const res = await h.request(`/api/catalog?kind=standard&q=${encodeURIComponent("GB 9706.233-2020")}`);
    expect(res.status).toBe(200);
    const page = (await res.json()) as CatalogPage;
    expect(page.total).toBe(1);
    expect(page.items[0]?.code).toBe("YY 9706.233-2021");
    expect(page.alias_correction).not.toBeNull();
    expect(page.alias_correction?.queried).toBe("GB 9706.233-2020");
    expect(page.alias_correction?.canonical_code).toBe("YY 9706.233-2021");
    expect(page.alias_correction?.explanation).toContain("YY 9706.233-2021");

    // 大小写与无空格写法同样触发纠偏并召回标准条目
    const resCompact = await h.request("/api/catalog?kind=standard&q=gb9706.233-2020");
    const pageCompact = (await resCompact.json()) as CatalogPage;
    expect(pageCompact.items[0]?.code).toBe("YY 9706.233-2021");
    expect(pageCompact.alias_correction?.canonical_code).toBe("YY 9706.233-2021");
  });

  it("GET /api/catalog?kind=registration&q=国械注准20223061141 返回 1 张注册证覆盖 2 个型号（uMR Jupiter 含 2 级 UDI + uMR 880）", async () => {
    const res = await h.request(
      `/api/catalog?kind=registration&q=${encodeURIComponent("国械注准20223061141")}`,
    );
    expect(res.status).toBe(200);
    const page = (await res.json()) as CatalogPage;
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);

    const cert = page.items[0]!;
    expect(cert.code).toBe("国械注准20223061141");
    const coveredModels = cert.detail.covered_models as Array<{ slug: string; label: string }>;
    expect(coveredModels).toHaveLength(2);
    expect(coveredModels.map((m) => m.slug)).toEqual(["umr-jupiter", "umr-880"]);

    // 单次 db.batch 详情接口按证书号直接取回双向关联的 2 个产品型号记录
    const detailRes = await h.request(
      `/api/catalog/registration/${encodeURIComponent("国械注准20223061141")}`,
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as CatalogDetailResponse;
    expect(detail.record.id).toBe("reg-cert-20223061141");

    const jupiter = detail.related_records.find((r) => r.slug === "umr-jupiter")!;
    const umr880 = detail.related_records.find((r) => r.slug === "umr-880")!;
    expect(jupiter).toBeDefined();
    expect(umr880).toBeDefined();
    expect((jupiter.detail.udi_packages as unknown[]).length).toBe(2);
    expect((umr880.detail.udi_packages as unknown[]).length).toBe(1);
  });

  it("GET /api/trade/overview?period=2024&releaseId=... 精确锁定历史快照（rows_read === 1），缺失 releaseId 返回 404，且自动适配合并至 /api/statistics", async () => {
    await h.sql([
      `DELETE FROM trade_hs_dict WHERE dict_version = '${DICT_VERSION}' AND hs8 != '${HS_A}'`,
      `UPDATE trade_dict_meta SET hs8_count = 1, hs6_count = 1, category_count = 1, scope_mode = 'isolated' WHERE dict_version = '${DICT_VERSION}'`,
    ]);

    const release1 = await seedYearSingleCode(h, 2024, 1000);
    expect(release1).toBeTruthy();

    const cur1Res = await h.request("/api/trade/overview?period=2024");
    expect(cur1Res.status).toBe(200);
    const snap1 = (await cur1Res.json()) as TradeOverviewPublished;
    expect(snap1.releaseId).toBe(release1);
    const initialTotalUsd = snap1.totals.totalUsd;

    // 修订 2024-12 数据产生新 release2
    for (const flow of ["import", "export"] as const) {
      for (const grouping of ["product", "partner", "regime", "region"] as const) {
        const csv =
          grouping === "product"
            ? `商品编码,商品名称,美元\n${HS_A},心电图记录仪,9999\n`
            : grouping === "partner"
              ? `商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元\n${HS_A},心电图记录仪,502,美国,9999\n`
              : grouping === "regime"
                ? `商品编码,商品名称,贸易方式编码,贸易方式名称,美元\n${HS_A},心电图记录仪,10,一般贸易,9999\n`
                : `商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元\n${HS_A},心电图记录仪,4403,广东深圳,9999\n`;
        const upRes = await h.request(
          "/api/trade/import",
          uploadTradeCsv(
            { dictVersion: DICT_VERSION, month: "2024-12", flow, currency: "USD", grouping, hs8: [HS_A], emptyHs8: [] },
            csv,
          ),
        );
        expect(upRes.status).toBe(200);
      }
    }

    // 最新概览已切换到修订后金额
    const cur2Res = await h.request("/api/trade/overview?period=2024");
    const snap2 = (await cur2Res.json()) as TradeOverviewPublished;
    expect(snap2.releaseId).not.toBe(release1);
    expect(snap2.totals.totalUsd).toBeGreaterThan(initialTotalUsd);

    // 指定历史 ?releaseId=release1 精确返回历史快照原值
    const pinnedRes = await h.request(`/api/trade/overview?period=2024&releaseId=${encodeURIComponent(release1)}`);
    expect(pinnedRes.status).toBe(200);
    const pinnedSnap = (await pinnedRes.json()) as TradeOverviewPublished;
    expect(pinnedSnap.releaseId).toBe(release1);
    expect(pinnedSnap.totals.totalUsd).toBe(initialTotalUsd);

    // 验证 trade_period_snapshot 查询计划走唯一索引且 rows_read === 1
    const plan = await h.query<{ detail: string }>(
      `EXPLAIN QUERY PLAN SELECT payload_json FROM trade_period_snapshot WHERE dict_version = '${DICT_VERSION}' AND period = '2024' AND release_id = '${release1}'`,
    );
    expect(plan.map((p) => p.detail).join(" | ")).toContain("SEARCH trade_period_snapshot USING INDEX");
    const metaCheck = await h.queryWithMeta<{ payload_json: string }>(
      "SELECT payload_json FROM trade_period_snapshot WHERE dict_version = ?1 AND period = ?2 AND release_id = ?3",
      [DICT_VERSION, "2024", release1],
    );
    expect(metaCheck.meta.rows_read).toBe(1);

    // 不存在的 releaseId 返回明确 404 错误体并携带 period 与 releaseId
    const missRes = await h.request("/api/trade/overview?period=2024&releaseId=rel-does-not-exist");
    expect(missRes.status).toBe(404);
    const missErr = (await missRes.json()) as ApiErrorBody;
    expect(missErr.error.code).toBe("NOT_FOUND");
    expect(missErr.error.params).toMatchObject({
      period: "2024",
      releaseId: "rel-does-not-exist",
    });

    // 已发布海关快照自动合并进 GET /api/statistics
    const statsRes = await h.request("/api/statistics?topic=trade");
    const statsPage = (await statsRes.json()) as StatisticListPage;
    expect(statsPage.items.some((i) => i.statistic_id === "STAT-TRD-OVERALL-ANNUAL")).toBe(true);
  }, 45_000);

  it("GET /api/search 经 search_fts 精确召回 uMR Jupiter、湖北省医疗器械质量监督检验研究院与旧标准别名 v2_hits", async () => {
    const resModel = await h.request(`/api/search?q=${encodeURIComponent("uMR Jupiter")}`);
    expect(resModel.status).toBe(200);
    const bodyModel = (await resModel.json()) as GlobalSearchResult;
    expect(bodyModel.observations).toBeDefined();
    expect(bodyModel.indicators).toBeDefined();
    expect(bodyModel.v2_hits?.length).toBeGreaterThan(0);
    expect(bodyModel.v2_hits?.[0]).toMatchObject({
      id: "mdl-umr-jupiter",
      group: "model",
      href: "/products/umr-jupiter",
    });

    const resInst = await h.request(
      `/api/search?q=${encodeURIComponent("湖北省医疗器械质量监督检验研究院")}`,
    );
    expect(resInst.status).toBe(200);
    const bodyInst = (await resInst.json()) as GlobalSearchResult;
    expect(bodyInst.v2_hits?.some((hit) => hit.id === "inst-hubei-mdqi" && hit.group === "institution")).toBe(true);

    const resAlias = await h.request(`/api/search?q=${encodeURIComponent("GB 9706.233-2020")}`);
    const bodyAlias = (await resAlias.json()) as GlobalSearchResult;
    expect(bodyAlias.v2_hits?.[0]?.code).toBe("YY 9706.233-2021");
    expect(bodyAlias.v2_hits?.[0]?.alias_note).toContain("YY 9706.233-2021");
  });
});
