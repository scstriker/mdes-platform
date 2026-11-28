import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2_SEED_STATISTICS, type Statistic } from "@mdes/shared";
import { StatisticFigure } from "../src/components/layout/statista-figure";
import Chart from "../src/lib/charts/chart";
import { echarts, type ChartOption } from "../src/lib/charts/echarts";
import { buildPptxBlob } from "../src/lib/charts/exporters/export-pptx";
import { renderStatisticSvg } from "../src/lib/charts/exporters/export-svg-png";
import { buildXlsxBlob } from "../src/lib/charts/exporters/export-xlsx";
import { PUBLICATION_LIGHT_THEME } from "../src/lib/charts/publication-theme";
import { buildShareCompositionSlices, buildStatisticChartOption } from "../src/lib/charts/templates";

const MRI_FORECAST_STAT = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-MKT-MRI-PROCUREMENT")!;
const DENSITY_DENOM_STAT = V2_SEED_STATISTICS.find((s) => s.statistic_id === "STAT-REG-DENSITY-PER100")!;

/**
 * 在无 jsdom 的 Node Vitest 环境中提供精简 DOM 容器桩，供 React 19 createRoot 验证 Chart 三阶段生命周期
 */
function installMinimalDomEnvironment(opts: { reducedMotion?: boolean; darkTheme?: boolean } = {}) {
  const resizeCallbacks: ResizeObserverCallback[] = [];

  class MockElement {
    nodeType = 1;
    tagName: string;
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style: Record<string, unknown> = {};
    dataset: Record<string, string> = {};
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    ownerDocument: unknown = null;
    attributes = new Map<string, string>();

    constructor(tagName: string, ownerDoc: unknown) {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDoc;
    }

    get firstChild() {
      return this.children[0] ?? null;
    }
    setAttribute(k: string, v: string) {
      this.attributes.set(k, String(v));
    }
    removeAttribute(k: string) {
      this.attributes.delete(k);
    }
    getAttribute(k: string) {
      return this.attributes.get(k) ?? null;
    }
    appendChild<T extends MockElement>(child: T): T {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild<T extends MockElement>(child: T): T {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
    insertBefore<T extends MockElement>(child: T, refNode: MockElement | null): T {
      child.parentNode = this;
      if (!refNode) {
        this.children.push(child);
        return child;
      }
      const idx = this.children.indexOf(refNode);
      if (idx >= 0) this.children.splice(idx, 0, child);
      else this.children.push(child);
      return child;
    }
    getContext() {
      return {
        font: "",
        measureText: (text: string) => ({ width: String(text ?? "").length * 7 }),
      };
    }
    addEventListener() {}
    removeEventListener() {}
  }

  class MockHTMLIFrameElement extends MockElement {}

  const doc: Record<string, unknown> = {
    nodeType: 9,
    documentElement: null as unknown,
    body: null as unknown,
    activeElement: null as unknown,
    defaultView: null as unknown,
    createElement(tag: string) {
      return new MockElement(tag, doc);
    },
    createElementNS(_ns: string, tag: string) {
      return new MockElement(tag, doc);
    },
    createTextNode(text: string) {
      return { nodeType: 3, nodeValue: text, ownerDocument: doc };
    },
    createComment(text: string) {
      return { nodeType: 8, nodeValue: text, ownerDocument: doc };
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const docEl = new MockElement("html", doc);
  if (opts.darkTheme) {
    docEl.dataset.theme = "dark";
  }
  const bodyEl = new MockElement("body", doc);
  doc.documentElement = docEl;
  doc.body = bodyEl;
  doc.activeElement = bodyEl;
  docEl.appendChild(bodyEl);

  const tokenMap: Record<string, string> = {
    "--chart-1": PUBLICATION_LIGHT_THEME.series[0]!,
    "--chart-2": PUBLICATION_LIGHT_THEME.series[1]!,
    "--chart-3": PUBLICATION_LIGHT_THEME.series[2]!,
    "--chart-4": PUBLICATION_LIGHT_THEME.series[3]!,
    "--chart-5": PUBLICATION_LIGHT_THEME.series[4]!,
    "--brand-navy": PUBLICATION_LIGHT_THEME.brandNavy,
    "--brand-sky": PUBLICATION_LIGHT_THEME.brandSky,
    "--brand-red": PUBLICATION_LIGHT_THEME.brandRed,
    "--info-bg": PUBLICATION_LIGHT_THEME.infoBg,
    "--surface-sunken": PUBLICATION_LIGHT_THEME.surfaceSunken,
    "--ink": PUBLICATION_LIGHT_THEME.ink,
    "--ink-muted": PUBLICATION_LIGHT_THEME.muted,
    "--border": PUBLICATION_LIGHT_THEME.border,
    "--border-strong": PUBLICATION_LIGHT_THEME.borderStrong,
    "--surface-raised": PUBLICATION_LIGHT_THEME.surface,
    "--font-sans": PUBLICATION_LIGHT_THEME.fontFamily,
  };

  const mockMatchMedia = (query: string) => ({
    matches:
      query.includes("prefers-reduced-motion")
        ? Boolean(opts.reducedMotion)
        : query.includes("prefers-color-scheme: dark")
          ? Boolean(opts.darkTheme)
          : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });

  class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      resizeCallbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  const win = {
    document: doc,
    Node: MockElement,
    Element: MockElement,
    HTMLElement: MockElement,
    HTMLIFrameElement: MockHTMLIFrameElement,
    matchMedia: mockMatchMedia,
    getComputedStyle: () => ({
      getPropertyValue: (prop: string) => tokenMap[prop] ?? "",
    }),
  };
  doc.defaultView = win;

  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("HTMLElement", MockElement);
  vi.stubGlobal("HTMLIFrameElement", MockHTMLIFrameElement);
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (prop: string) => tokenMap[prop] ?? "",
  }));
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(16);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  const container = new MockElement("div", doc);
  bodyEl.appendChild(container);

  return {
    container: container as unknown as HTMLElement,
    docEl,
    triggerResize(width: number, height: number) {
      for (const cb of resizeCallbacks) {
        cb(
          [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Batch 3：ECharts 6.1 三阶段生命周期、6 类视觉语法模板与离屏多格式导出", () => {
  it("Chart 在 option 更新时复用同一实例（不调用 dispose 或重复 init），跳过 0×0 resize，卸载时才 dispose，且遵循 prefers-reduced-motion", async () => {
    const env = installMinimalDomEnvironment({ reducedMotion: true });

    const realInit = echarts.init.bind(echarts);
    let createdInstance: ReturnType<typeof echarts.init> | null = null;

    const initSpy = vi.spyOn(echarts, "init").mockImplementation((_dom, theme, opts) => {
      const inst = realInit(null, theme, {
        ...(opts ?? {}),
        renderer: "svg",
        ssr: true,
        width: 640,
        height: 280,
        locale: "ZH",
      });
      createdInstance = inst;
      return inst;
    });

    const sampleInst = realInit(null, null, { renderer: "svg", ssr: true, width: 100, height: 100 });
    const proto = Object.getPrototypeOf(sampleInst) as {
      dispose: () => void;
      setOption: (opt: ChartOption, opts?: unknown) => void;
      resize: () => void;
    };
    sampleInst.dispose();

    const disposeSpy = vi.spyOn(proto, "dispose");
    const setOptionSpy = vi.spyOn(proto, "setOption");
    const resizeSpy = vi.spyOn(proto, "resize");

    const optA = () => ({
      xAxis: { type: "category" as const, data: ["2023", "2024"] },
      yAxis: { type: "value" as const },
      series: [{ type: "line" as const, data: [10, 20] }],
    });
    const optB = () => ({
      xAxis: { type: "category" as const, data: ["2023", "2024", "2025"] },
      yAxis: { type: "value" as const },
      series: [{ type: "bar" as const, data: [10, 20, 35] }],
    });

    const root = createRoot(env.container);

    await act(async () => {
      root.render(createElement(Chart, { option: optA, ariaLabel: "生命周期测试图" }));
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(0);
    expect(setOptionSpy).toHaveBeenCalledTimes(1);
    expect(createdInstance).not.toBeNull();

    // 验证 prefers-reduced-motion: reduce 强制关闭动画
    const firstPassedOption = setOptionSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstPassedOption.animation).toBe(false);

    // 更新 option prop：必须复用实例，严禁 dispose 或再次 init
    await act(async () => {
      root.render(createElement(Chart, { option: optB, ariaLabel: "生命周期测试图" }));
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(0);
    expect(setOptionSpy).toHaveBeenCalledTimes(2);
    expect(setOptionSpy.mock.calls[1]?.[1]).toEqual({
      replaceMerge: ["series", "xAxis", "yAxis"],
      lazyUpdate: true,
    });

    // ResizeObserver 跳过 0×0 隐藏容器，仅对正尺寸触发 resize
    env.triggerResize(0, 0);
    expect(resizeSpy).toHaveBeenCalledTimes(0);
    env.triggerResize(720, 300);
    expect(resizeSpy).toHaveBeenCalledTimes(1);

    // 卸载时才调用 dispose
    await act(async () => {
      root.unmount();
    });
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("覆盖全部 6 类视觉语法模板：实虚线预测衔接、正负增速零红绿、>6 项饼图合并「其他」与单点标签显隐", () => {
    for (const stat of V2_SEED_STATISTICS) {
      const built = buildStatisticChartOption(stat, {}, PUBLICATION_LIGHT_THEME);
      expect(built.option.series).toBeDefined();
      expect(built.projected.periods.length).toBeGreaterThan(0);
    }

    // 1) time_series 折线模式在含 E / F 状态点时拆分为实线段与虚线段且衔接不断线
    const mriLine = buildStatisticChartOption(MRI_FORECAST_STAT, { chartType: "line" }, PUBLICATION_LIGHT_THEME);
    const mriSeries = mriLine.option.series as Array<{ lineStyle?: { type?: string }; data?: Array<{ value: number | null }> }>;
    expect(mriSeries.length).toBe(2);
    expect(mriSeries[0]?.lineStyle?.type).toBe("solid");
    expect(mriSeries[1]?.lineStyle?.type).toBe("dashed");
    expect(mriSeries[0]?.data?.[4]?.value).toBe(124.6);
    expect(mriSeries[1]?.data?.[4]?.value).toBe(124.6);

    // 2) growth_rate 严禁红绿配色，使用深蓝 + 灰蓝且带正负号与 y=0 基准线
    const growthStat = V2_SEED_STATISTICS.find((s) => s.template_type === "growth_rate")!;
    const growthBuilt = buildStatisticChartOption(growthStat, {}, PUBLICATION_LIGHT_THEME);
    const growthJson = JSON.stringify(growthBuilt.option);
    expect(growthJson).toContain(PUBLICATION_LIGHT_THEME.series[0]);
    expect(growthJson).toContain(PUBLICATION_LIGHT_THEME.series[3]);
    expect(growthJson).not.toContain(PUBLICATION_LIGHT_THEME.brandRed);

    // 3) share_composition 超过 6 个分类时将尾部合并为「其他」
    const shareBase = V2_SEED_STATISTICS.find((s) => s.template_type === "share_composition")!;
    const eightCatStat: Statistic = {
      ...shareBase,
      dataset: {
        periods: ["类别一", "类别二", "类别三", "类别四", "类别五", "类别六", "类别七", "类别八"],
        series: [
          {
            key: "share_8",
            label: "占比",
            unit: "%",
            values: [25, 20, 16, 14, 10, 7, 5, 3],
          },
        ],
      },
    };
    const slices = buildShareCompositionSlices(
      buildStatisticChartOption(eightCatStat, { chartType: "pie" }, PUBLICATION_LIGHT_THEME).projected,
    );
    expect(slices).toHaveLength(6);
    expect(slices[5]?.name).toBe("其他");
    expect(slices[5]?.value).toBe(15);

    // 4) hiddenLabelCoords 支持单点隐藏标签
    const uihStat = V2_SEED_STATISTICS[0]!;
    const hiddenBuilt = buildStatisticChartOption(
      uihStat,
      { showLabels: true, hiddenLabelCoords: ["rd_ratio_pct:2024"] },
      PUBLICATION_LIGHT_THEME,
    );
    const uihData = (hiddenBuilt.option.series as Array<{ data: Array<{ period: string; label: { show: boolean } }> }>)[0]!.data;
    expect(uihData.find((d) => d.period === "2024")?.label.show).toBe(false);
    expect(uihData.find((d) => d.period === "2025")?.label.show).toBe(true);
  });

  it("离屏 SVG 导出在 document.documentElement.dataset.theme = 'dark' 时仍输出固定浅色白底出版物图卡", () => {
    installMinimalDomEnvironment({ darkTheme: true });
    expect((document.documentElement as HTMLElement).dataset.theme).toBe("dark");

    const pubSvg = renderStatisticSvg(MRI_FORECAST_STAT, { chartType: "line" }, { preset: "publication" });
    const bareSvg = renderStatisticSvg(MRI_FORECAST_STAT, { chartType: "line" }, { preset: "bare" });

    expect(pubSvg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(pubSvg).toContain("<svg");
    expect(pubSvg).toContain(`fill="${PUBLICATION_LIGHT_THEME.surface}"`);
    expect(pubSvg).toContain(MRI_FORECAST_STAT.title);
    expect(pubSvg).toContain("2023新版大型医用设备配置目录实施");
    expect(pubSvg).not.toContain("#0b1a2b");

    expect(bareSvg).toContain(`fill="${PUBLICATION_LIGHT_THEME.surface}"`);
    expect(bareSvg).not.toContain("数据来源：");
  });

  it("buildXlsxBlob 生成合法 ZIP/XLSX 二进制并包含 Data / Metadata / Sources / Methodology 四个工作表及「禁止推断」红线", async () => {
    const blob = await buildXlsxBlob(MRI_FORECAST_STAT, { chartType: "line" });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const archive = unzipSync(bytes);
    expect(archive["xl/workbook.xml"]).toBeDefined();
    expect(archive["xl/worksheets/sheet1.xml"]).toBeDefined();
    expect(archive["xl/worksheets/sheet2.xml"]).toBeDefined();
    expect(archive["xl/worksheets/sheet3.xml"]).toBeDefined();
    expect(archive["xl/worksheets/sheet4.xml"]).toBeDefined();

    const workbookXml = strFromU8(archive["xl/workbook.xml"]!);
    expect(workbookXml).toContain('name="Data"');
    expect(workbookXml).toContain('name="Metadata"');
    expect(workbookXml).toContain('name="Sources"');
    expect(workbookXml).toContain('name="Methodology"');

    const sheet1Xml = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    expect(sheet1Xml).toContain("frozen");

    const sharedStringsXml = strFromU8(archive["xl/sharedStrings.xml"]!);
    expect(sharedStringsXml).toContain("禁止推断");
    expect(sharedStringsXml).toContain("预测值（截至 2025-12 预测）");

    const denomBlob = await buildXlsxBlob(DENSITY_DENOM_STAT);
    const denomArchive = unzipSync(new Uint8Array(await denomBlob.arrayBuffer()));
    const denomStrings = strFromU8(denomArchive["xl/sharedStrings.xml"]!);
    expect(denomStrings).toContain("医疗器械生产企业数（分母）");
  });

  it("buildPptxBlob 生成合法 16:9 ZIP/PPTX 二进制且内嵌原生可编辑 OOXML 图表 ppt/charts/chart1.xml", async () => {
    const stat = V2_SEED_STATISTICS[1]!;
    const blob = await buildPptxBlob(stat, { chartType: "stacked_bar_100" });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const archive = unzipSync(bytes);
    expect(archive["ppt/slides/slide1.xml"]).toBeDefined();
    expect(archive["ppt/charts/chart1.xml"]).toBeDefined();

    const chartXml = strFromU8(archive["ppt/charts/chart1.xml"]!);
    expect(chartXml).toContain("chartSpace");
    expect(chartXml).toContain("barChart");
    expect(chartXml).toContain("percentStacked");
    expect(chartXml).toContain("90181310");
  }, 15_000);

  it("StatisticFigure 2.0 渲染完整页眉链接、图表设置、全屏查看、Copy for AI 与出处版本栏且零卡片阴影", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StatisticFigure statistic={MRI_FORECAST_STAT} />
      </MemoryRouter>,
    );

    expect(html).toContain("/statistics/STAT-MKT-MRI-PROCUREMENT");
    expect(html).toContain("Copy for AI");
    expect(html).toContain("复制引用");
    expect(html).toContain("图表设置");
    expect(html).toContain("第三章·磁共振设备市场（表 3-4）");
    expect(html).toContain("版本 v2026.10.1");
    expect(html).not.toContain('data-slot="card"');
  });
});
