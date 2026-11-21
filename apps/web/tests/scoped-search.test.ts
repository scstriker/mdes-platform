import { describe, expect, it } from "vitest";
import {
  queryAllPublicGrouped,
  queryPublicSuggestions,
  resolveDefaultAdminScope,
  resolveDefaultPublicScope,
} from "../src/lib/search/search-index";

describe("全站与子页面默认范围搜索索引", () => {
  it("根据当前路由自动锁定默认检索范围（首页全站，子页本栏）", () => {
    expect(resolveDefaultPublicScope("/")).toBe("/search");
    expect(resolveDefaultPublicScope("/search")).toBe("/search");
    expect(resolveDefaultPublicScope("/products")).toBe("/products");
    expect(resolveDefaultPublicScope("/enterprises")).toBe("/enterprises");
    expect(resolveDefaultPublicScope("/trade")).toBe("/trade");
    expect(resolveDefaultPublicScope("/reports")).toBe("/reports");
    expect(resolveDefaultPublicScope("/system")).toBe("/system");
    expect(resolveDefaultPublicScope("/system/01")).toBe("/system");

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
    // 在「进出口贸易」子页输入企业词「联影」，本栏命中为 0，但全站跨库应有命中
    const cross = queryPublicSuggestions("联影", "/trade");
    expect(cross.scopedMatches.length).toBe(0);
    expect(cross.globalTotal).toBeGreaterThan(0);
  });

  it("全站跨库分组检索按五大业务域聚合结果", () => {
    const grouped = queryAllPublicGrouped("手术");
    expect(grouped.total).toBeGreaterThan(2);
    const scopes = grouped.groups.map((g) => g.scope);
    expect(scopes).toContain("/products");
    expect(scopes).toContain("/reports");
  });
});
