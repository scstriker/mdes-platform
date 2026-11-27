import { describe, expect, it } from "vitest";
import { buildFigureCardSvg } from "../src/lib/charts/figure-svg";

describe("StatistaFigure 完整出版物图卡 SVG 导出", () => {
  it("组合导出的 SVG 包含眉标、主副标题、极值徽标、内部绘图区以及数据来源与口径注释，并正确转义特殊字符", () => {
    const svg = buildFigureCardSvg({
      innerSvgContent: '<g id="plot"><path d="M0 0 L120 80" stroke="navy" /></g>',
      chartWidth: 600,
      chartHeight: 280,
      viewBox: "0 0 600 280",
      eyebrow: "图 1 · 审评准入趋势",
      title: "国产首次注册占比升至 72.1% & 审评提速 <显著>",
      subtitle: "2021—2026年前三季度 · 境内第三类首次注册批准件数（单位：件）",
      badgeLabel: "国产占比 72.1%",
      source: "国家药监局医疗器械注册数据库",
      note: "2026Q1-Q3 为前三季累计值，与全年值以虚线区分",
      theme: {
        brandNavy: "#0b2e59",
        infoBg: "#eef4fb",
        surfaceSunken: "#f6f8fa",
        ink: "#141a21",
        muted: "#57606a",
        border: "#d0d7de",
        surface: "#ffffff",
        fontFamily: "system-ui, sans-serif",
      },
    });

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain("图 1 · 审评准入趋势");
    expect(svg).toContain("国产首次注册占比升至 72.1% &amp; 审评提速 &lt;显著&gt;");
    expect(svg).toContain("2021—2026年前三季度 · 境内第三类首次注册批准件数（单位：件）");
    expect(svg).toContain("国产占比 72.1%");
    expect(svg).toContain('<path d="M0 0 L120 80" stroke="navy" />');
    expect(svg).toContain("数据来源：");
    expect(svg).toContain("国家药监局医疗器械注册数据库");
    expect(svg).toContain("注：2026Q1-Q3 为前三季累计值");
  });
});
