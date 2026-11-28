import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  V2_SEED_CATALOG_RECORDS,
  V2_SEED_STATISTICS,
  type CatalogDetailResponse,
  type GlobalSearchResult,
  type StatisticDetailResponse,
  type StatisticListPage,
  type StatisticVersionsResponse,
} from "@mdes/shared";
import { demoFetch } from "../src/demo/demo-api";
import { queryKeys } from "../src/lib/api/queries";
import ReportDetailPage from "../src/pages/report-detail";

function renderReportPageWithClient(qc: QueryClient, slug = "mdes-2026q3-high-end-imaging-report"): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        MemoryRouter,
        { initialEntries: [`/reports/${slug}`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/reports/:slug", element: createElement(ReportDetailPage) }),
        ),
      ),
    ),
  );
}

describe("PR #5 审查修复核验：离线 demo-api 贸易统计适配与研究报告锁版防回退", () => {
  it("离线 demo-api 在 /api/statistics 列表、详情、历史 ?v=、版本列表与全站搜索中完整合并海关快照适配统计", async () => {
    const listRes = await demoFetch("/api/statistics?topic=trade");
    expect(listRes.status).toBe(200);
    const listPage = (await listRes.json()) as StatisticListPage;
    const trdItem = listPage.items.find((i) => i.statistic_id === "STAT-TRD-OVERALL-ANNUAL");
    expect(trdItem).toBeDefined();
    expect(trdItem?.version).toBe("2026-10.20bd2985");

    const latestRes = await demoFetch("/api/statistics/STAT-TRD-OVERALL-ANNUAL");
    expect(latestRes.status).toBe(200);
    const latestDetail = (await latestRes.json()) as StatisticDetailResponse;
    expect(latestDetail.statistic.version).toBe("2026-10.20bd2985");
    expect(latestDetail.latest_version).toBe("2026-10.20bd2985");
    expect(latestDetail.is_historical_version).toBe(false);

    // 历史 ?v= 锁版访问返回旧发布批次快照并标记 is_historical_version = true
    const histRes = await demoFetch("/api/statistics/STAT-TRD-OVERALL-ANNUAL?v=2025-12.11111111");
    expect(histRes.status).toBe(200);
    expect(histRes.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const histDetail = (await histRes.json()) as StatisticDetailResponse;
    expect(histDetail.statistic.version).toBe("2025-12.11111111");
    expect(histDetail.latest_version).toBe("2026-10.20bd2985");
    expect(histDetail.is_historical_version).toBe(true);
    expect(histDetail.statistic.dataset.periods).toEqual(["2022", "2023", "2024", "2025"]);

    const verRes = await demoFetch("/api/statistics/STAT-TRD-OVERALL-ANNUAL/versions");
    expect(verRes.status).toBe(200);
    const verBody = (await verRes.json()) as StatisticVersionsResponse;
    expect(verBody.items.map((v) => v.version)).toEqual(["2026-10.20bd2985", "2025-12.11111111"]);

    const missRes = await demoFetch("/api/statistics/STAT-TRD-OVERALL-ANNUAL?v=2025-12.deadbeef");
    expect(missRes.status).toBe(404);

    const searchRes = await demoFetch(`/api/search?q=${encodeURIComponent("进出口年度总额")}`);
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as GlobalSearchResult;
    expect(searchBody.v2_hits?.some((h) => h.id === "STAT-TRD-OVERALL-ANNUAL")).toBe(true);
  });

  it("研究报告详情页在锁版统计 loading / API 报错 / 版本不匹配时严禁回退至本地未锁版 seed", async () => {
    const reportRecord = V2_SEED_CATALOG_RECORDS.find(
      (r) => r.kind === "report" && r.slug === "mdes-2026q3-high-end-imaging-report",
    )!;
    const reportCatalogDetail: CatalogDetailResponse = {
      record: reportRecord,
      related_records: [],
      related_statistics: [],
    };

    // 1. Loading 态：展示骨架屏占位，不展示未校验的本地 seed 图表或「版本永久锁定」
    const loadingQc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    loadingQc.setQueryData(
      queryKeys.catalogDetail("report", "mdes-2026q3-high-end-imaging-report"),
      reportCatalogDetail,
    );
    const loadingHtml = renderReportPageWithClient(loadingQc);
    expect(loadingHtml).toContain("正在加载锁定统计快照 STAT-ENT-UIH-RD-RATIO@v2026.06.1");
    expect(loadingHtml).not.toContain("版本永久锁定：v2026.06.1");

    // 2. Error 态（如 API 404/500）：即使 V2_SEED_STATISTICS 含同名统计，也必须告警而绝不回退渲染图表
    const errorQc = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    errorQc.setQueryData(
      queryKeys.catalogDetail("report", "mdes-2026q3-high-end-imaging-report"),
      reportCatalogDetail,
    );
    await errorQc
      .fetchQuery({
        queryKey: queryKeys.statisticDetail("STAT-ENT-UIH-RD-RATIO", "2026.06.1"),
        queryFn: async () => {
          throw new Error("locked snapshot unavailable");
        },
        retry: false,
      })
      .catch(() => undefined);

    const errorHtml = renderReportPageWithClient(errorQc);
    expect(errorHtml).toContain("缺少或无法核验锁定的统计版本快照 STAT-ENT-UIH-RD-RATIO@v2026.06.1");
    expect(errorHtml).toContain("禁用本地未锁版种子回退");
    expect(errorHtml).not.toContain("版本永久锁定：v2026.06.1");
    expect(errorHtml).not.toContain("fig-report-stat-ent-uih-rd-ratio");

    // 3. 版本漂移防御：若返回对象 version 与锁定版本不一致（如误返回 2026.09.1），同样拒绝渲染
    const mismatchQc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mismatchQc.setQueryData(
      queryKeys.catalogDetail("report", "mdes-2026q3-high-end-imaging-report"),
      reportCatalogDetail,
    );
    const seedUih = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-ENT-UIH-RD-RATIO")!;
    mismatchQc.setQueryData(queryKeys.statisticDetail("STAT-ENT-UIH-RD-RATIO", "2026.06.1"), {
      statistic: { ...seedUih, version: "2026.09.1" },
      latest_version: "2026.09.1",
      is_historical_version: false,
      related: [],
    } satisfies StatisticDetailResponse);

    const mismatchHtml = renderReportPageWithClient(mismatchQc);
    expect(mismatchHtml).toContain("与出版锁定版本 v2026.06.1 不一致，已拒绝渲染以防数据漂移");
    expect(mismatchHtml).not.toContain("版本永久锁定：");
  });
});
