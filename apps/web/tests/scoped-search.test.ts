import { describe, expect, it } from "vitest";
import type { ImportBatch, IndicatorListItem } from "@mdes/shared";
import {
  buildPublicSearchUrl,
  mapObservationHitToSuggestion,
  queryAdminSuggestions,
  queryAllPublicGrouped,
  queryPublicSuggestions,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
} from "../src/lib/search/search-index";

describe("全站搜索结果页路由契约与后台范围索引", () => {
  it("前台顶部全局搜索栏始终默认进入独立搜索结果页 /search，后台默认锁定当前模块", () => {
    expect(resolveDefaultPublicScope("/")).toBe("/search");
    expect(resolveDefaultPublicScope("/search")).toBe("/search");
    expect(resolveDefaultPublicScope("/products")).toBe("/search");
    expect(resolveDefaultPublicScope("/enterprises")).toBe("/search");
    expect(resolveDefaultPublicScope("/trade")).toBe("/search");
    expect(resolveDefaultPublicScope("/reports")).toBe("/search");
    expect(resolveDefaultPublicScope("/system")).toBe("/search");
    expect(resolveDefaultPublicScope("/search", "products")).toBe("/products");
    expect(resolveDefaultPublicScope("/search", "trade")).toBe("/trade");

    expect(buildPublicSearchUrl({ q: "磁共振" })).toBe("/search?q=%E7%A3%81%E5%85%B1%E6%8C%AF");
    expect(buildPublicSearchUrl({ q: "磁共振", scope: "/products" })).toBe(
      "/search?q=%E7%A3%81%E5%85%B1%E6%8C%AF&scope=products",
    );

    expect(resolveDefaultAdminScope("/admin")).toBe("/admin");
    expect(resolveDefaultAdminScope("/admin/import")).toBe("/admin/import");
    expect(resolveDefaultAdminScope("/admin/batches")).toBe("/admin/batches");
    expect(resolveDefaultAdminScope("/admin/indicators")).toBe("/admin/indicators");
    expect(resolveDefaultAdminScope("/admin/indicators/TRD-001")).toBe("/admin/indicators");
    expect(resolveDefaultAdminScope("/admin/observations")).toBe("/admin/observations");
  });

  it("企业与机构范围同时覆盖上市/冠军企业与研发检验临床机构", () => {
    const firmRes = queryPublicSuggestions("迈瑞", "/enterprises");
    expect(firmRes.scopedMatches.length).toBeGreaterThan(0);
    expect(firmRes.scopedMatches[0]?.scope).toBe("/enterprises");

    const hospitalRes = queryPublicSuggestions("协和医院", "/enterprises");
    expect(hospitalRes.scopedMatches.length).toBeGreaterThan(0);
    expect(hospitalRes.scopedMatches[0]?.title).toContain("北京协和医院");
  });

  it("在子页面检索跨领域词条时仍能统计全站跨库命中数供兜底跳转", () => {
    const cross = queryPublicSuggestions("联影", "/trade");
    expect(cross.scopedMatches.length).toBe(0);
    expect(cross.globalTotal).toBeGreaterThan(0);
  });

  it("全站跨库分组检索按五大业务域聚合结果，支持非连续多词项匹配", () => {
    const grouped = queryAllPublicGrouped("手术");
    expect(grouped.total).toBeGreaterThan(2);
    const scopes = grouped.groups.map((g) => g.scope);
    expect(scopes).toContain("/products");
    expect(scopes).toContain("/reports");

    const multiTokenTrade = queryAllPublicGrouped("CT 9022.3000");
    const tradeGroup = multiTokenTrade.groups.find((g) => g.scope === "/trade");
    expect(tradeGroup?.items.length).toBeGreaterThan(0);
    expect(tradeGroup?.items[0]?.href).toContain("/search?");
    expect(tradeGroup?.items[0]?.subpageHref).toContain("/trade?tab=hs");
    expect(tradeGroup?.items[0]?.fields?.length).toBeGreaterThan(0);
  });

  it("后台建议严格按所选 scope 过滤本栏结果，其他模块命中归入跨后台检索并使用真实批次数据", () => {
    const mockInds: IndicatorListItem[] = [
      {
        id: "TRD-001",
        cluster_code: "TRD",
        name: "医疗装备进口金额",
        phase: "phase1",
        update_freq: "月",
        source_kind: "pub",
        phase_scope: "",
        obs_count: 10,
        latest_period: "2026-09",
        automation: "全自动",
      },
    ];
    const mockBatches: ImportBatch[] = [
      {
        id: "8906a7d3-1111-2222-3333-444455556666",
        filename: "trd_sample_q3.csv",
        status: "completed",
        row_ok: 10,
        row_err: 0,
        errors_json: [],
        created_at: "2026-10-20T08:00:00Z",
      },
    ];

    // 在「导入记录」（/admin/batches）范围搜工程编码 TRD-001：本栏应为 0，跨后台组命中工程指标与观测值核查
    const onBatchesSearchCode = queryAdminSuggestions("TRD-001", "/admin/batches", {
      indicators: mockInds,
      batches: mockBatches,
    });
    expect(onBatchesSearchCode.scopedMatches).toHaveLength(0);
    expect(onBatchesSearchCode.crossMatches.length).toBeGreaterThan(0);
    expect(onBatchesSearchCode.crossMatches.every((m) => m.scope !== "/admin/batches")).toBe(true);

    // 在「导入记录」（/admin/batches）范围搜真实批次文件名：本栏直接命中该批次记录
    const onBatchesSearchFile = queryAdminSuggestions("trd_sample_q3", "/admin/batches", {
      indicators: mockInds,
      batches: mockBatches,
    });
    expect(onBatchesSearchFile.scopedMatches).toHaveLength(1);
    expect(onBatchesSearchFile.scopedMatches[0]?.scope).toBe("/admin/batches");
    expect(onBatchesSearchFile.scopedMatches[0]?.title).toContain("trd_sample_q3.csv");
  });

  it("动态入库观测值可映射为全站搜索建议项", () => {
    const item = mapObservationHitToSuggestion(
      {
        id: "42",
        indicator_id: "TRD-001",
        indicator_name: "医疗装备进口金额",
        cluster_code: "TRD",
        period: "2026-10",
        geo: "440000",
        dims: { partner: "DE" },
        value_num: 19.6,
        value_text: null,
        unit: "亿美元",
        batch_id: "b1",
        created_at: "2026-11-01T00:00:00Z",
      },
      "广东 德国",
    );
    expect(item.title).toContain("医疗装备进口金额");
    expect(item.title).toContain("广东");
    expect(item.badge).toContain("TRD-001");
    expect(item.href).toContain("/search?");
    expect(item.subpageHref).toBe("/system/38");
  });
});
