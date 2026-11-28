import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseCustomsCsvBytes,
  parseMultiMonthCustomsCsvBytes,
  validateTradeBulkManifest,
  validateTradeManifest,
} from "../src/trade";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_DOCS_SUITE_PATH = path.resolve(here, "../../../docs/china_customs_suite.user.js");
const OUTER_SUITE_PATH = path.resolve(here, "../../../../docs/china_customs_suite.user.js");
const COLLECTOR_COPY_PATH = path.resolve(here, "../../../scripts/china_customs_collector.user.js");
const TOP_SUITE_PATH = fs.existsSync(REPO_DOCS_SUITE_PATH)
  ? REPO_DOCS_SUITE_PATH
  : fs.existsSync(OUTER_SUITE_PATH)
    ? OUTER_SUITE_PATH
    : COLLECTOR_COPY_PATH;
const EXPECTED_DICT_SHA256 = "ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b";

function loadUserscriptHeadless(scriptPath: string, fetchImpl?: typeof fetch) {
  const code = fs.readFileSync(scriptPath, "utf8");
  const sandbox: Record<string, unknown> = {
    TextEncoder,
    TextDecoder,
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    crypto: globalThis.crypto,
    Buffer,
    setTimeout,
    clearTimeout,
    console,
    btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
    atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
    fetch: fetchImpl ?? (async () => new Response("", { status: 200 })),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: path.basename(scriptPath) });
  return sandbox;
}

describe("G6 / AC-018：china_customs_suite.user.js v4.0 医疗器械 164 码字典与低频单飞串行桥接", () => {
  it("顶层 docs/china_customs_suite.user.js 与 scripts/china_customs_collector.user.js 均暴露 __CUSTOMS_SUITE_BRIDGE__ 且通过 202601 字典 SHA-256 校验", async () => {
    const topSandbox = loadUserscriptHeadless(TOP_SUITE_PATH);
    const bridge = topSandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      version: string;
      dictVersion: string;
      verifyDictionary: () => Promise<{
        dictVersion: string;
        sha256: string;
        hs8Count: number;
        hs6Count: number;
        categoryCount: number;
      }>;
    };
    expect(bridge).toBeDefined();
    expect(bridge.version).toBe("4.0.0");
    expect(bridge.dictVersion).toBe("202601");

    const info = await bridge.verifyDictionary();
    expect(info).toEqual({
      dictVersion: "202601",
      sha256: EXPECTED_DICT_SHA256,
      hs8Count: 164,
      hs6Count: 117,
      categoryCount: 11,
    });

    const collectorSandbox = loadUserscriptHeadless(COLLECTOR_COPY_PATH);
    const collectorBridge = collectorSandbox.__CUSTOMS_SUITE_BRIDGE__ as typeof bridge;
    expect(collectorBridge).toBeDefined();
    const collectorInfo = await collectorBridge.verifyDictionary();
    expect(collectorInfo.sha256).toBe(EXPECTED_DICT_SHA256);
  });

  it("支持构造 monthFlag=1 年度按月查询参数（锁定 USD 与四分组），且拒绝跨自然年请求", () => {
    const topSandbox = loadUserscriptHeadless(TOP_SUITE_PATH);
    const bridge = topSandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      buildAnnualMonthlyParams: (opts: {
        year: number;
        startMonth: number;
        endMonth: number;
        flow: "import" | "export";
        grouping: "product" | "partner" | "regime" | "region";
        hs8: string[];
        selectTableState?: number;
      }) => URLSearchParams;
    };

    const params = bridge.buildAnnualMonthlyParams({
      year: 2024,
      startMonth: 1,
      endMonth: 12,
      flow: "import",
      grouping: "region",
      hs8: ["90181100", "90221200"],
      selectTableState: 3,
    });

    expect(params.get("iEType")).toBe("1");
    expect(params.get("currencyType")).toBe("usd");
    expect(params.get("year")).toBe("2024");
    expect(params.get("startMonth")).toBe("1");
    expect(params.get("endMonth")).toBe("12");
    expect(params.get("monthFlag")).toBe("1");
    expect(params.get("outerField1")).toBe("CODE_TS");
    expect(params.get("outerValue1")).toBe("90181100,90221200");
    expect(params.get("outerField2")).toBe("TRADE_CO_PORT");
  });

  it("严格执行 MAX_INFLIGHT=1 单飞互斥锁与 >=2500ms 低频间隔门限，严禁并发或高频请求", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const mockFetch: typeof fetch = async () => {
      await firstGate;
      const csvBytes = new TextEncoder().encode(
        "数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\r\n202401,90181100,心电图记录仪,10,台,5,千克,1000\r\n",
      );
      return new Response(csvBytes, { status: 200 });
    };

    const topSandbox = loadUserscriptHeadless(TOP_SUITE_PATH, mockFetch);
    const bridge = topSandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      MIN_REQUEST_INTERVAL_MS: number;
      validateDelayConfig: (minMs: number, maxMs: number) => void;
      fetchRawExportBase64: (opts: {
        year: number;
        startMonth: number;
        endMonth: number;
        monthFlag: "" | "1";
        flow: "import" | "export";
        grouping: "product" | "partner" | "regime" | "region";
        hs8: string[];
        selectTableState: number;
        skipPoliteWaitForUnitTest?: boolean;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        sha256?: string;
        base64?: string;
      }>;
    };

    expect(bridge.MIN_REQUEST_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
    expect(() => bridge.validateDelayConfig(500, 1000)).toThrow(/LOW_FREQUENCY_VIOLATION/);

    const p1 = bridge.fetchRawExportBase64({
      year: 2024,
      startMonth: 1,
      endMonth: 12,
      monthFlag: "1",
      flow: "import",
      grouping: "product",
      hs8: ["90181100"],
      selectTableState: 3,
      skipPoliteWaitForUnitTest: true,
    });

    // 并发发起第二个请求必须立即以 ERR_CONCURRENT_REQUEST_FORBIDDEN 拒绝
    await expect(
      bridge.fetchRawExportBase64({
        year: 2024,
        startMonth: 1,
        endMonth: 12,
        monthFlag: "1",
        flow: "export",
        grouping: "product",
        hs8: ["90181100"],
        selectTableState: 3,
        skipPoliteWaitForUnitTest: true,
      }),
    ).rejects.toThrow(/ERR_CONCURRENT_REQUEST_FORBIDDEN/);

    releaseFirst();
    const res1 = await p1;
    expect(res1.ok).toBe(true);
    expect(res1.base64).toBeTruthy();
  });

  it("遇到 HTTP 412 或 HTML 风控/验证响应时立即标记 circuitBreakRequired，绝不盲目重试或当作 CSV", async () => {
    const htmlFetch: typeof fetch = async () =>
      new Response("<!DOCTYPE html><html><body>请完成验证</body></html>", { status: 200 });

    const topSandbox = loadUserscriptHeadless(TOP_SUITE_PATH, htmlFetch);
    const bridge = topSandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      fetchRawExportBase64: (opts: {
        year: number;
        startMonth: number;
        endMonth: number;
        monthFlag: "" | "1";
        flow: "import" | "export";
        grouping: "product" | "partner" | "regime" | "region";
        hs8: string[];
        selectTableState: number;
        skipPoliteWaitForUnitTest?: boolean;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        circuitBreakRequired?: boolean;
      }>;
    };

    const outcome = await bridge.fetchRawExportBase64({
      year: 2024,
      startMonth: 1,
      endMonth: 1,
      monthFlag: "",
      flow: "import",
      grouping: "product",
      hs8: ["90181100"],
      selectTableState: 3,
      skipPoliteWaitForUnitTest: true,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("html_error_page");
    expect(outcome.circuitBreakRequired).toBe(true);
  });

  it("在非 HTTPS 上下文（http://stats.customs.gov.cn 无 crypto.subtle）下仍通过纯 JS SHA-256 精确核验 164 码字典", async () => {
    const code = fs.readFileSync(TOP_SUITE_PATH, "utf8");
    const nonSecureSandbox: Record<string, unknown> = {
      TextEncoder,
      TextDecoder,
      URLSearchParams,
      Uint8Array,
      Uint32Array,
      DataView,
      ArrayBuffer,
      crypto: {}, // 模拟 http:// 非安全上下文无 subtle
      Buffer,
      setTimeout,
      clearTimeout,
      console,
      btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
      atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
      fetch: async () => new Response("", { status: 200 }),
    };
    nonSecureSandbox.globalThis = nonSecureSandbox;
    vm.createContext(nonSecureSandbox);
    vm.runInContext(code, nonSecureSandbox, { filename: "china_customs_suite.user.js" });

    const bridge = nonSecureSandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      verifyDictionary: () => Promise<{ sha256: string; hs8Count: number }>;
    };
    const info = await bridge.verifyDictionary();
    expect(info.sha256).toBe(EXPECTED_DICT_SHA256);
    expect(info.hs8Count).toBe(164);
  });

  it("对齐海关真站 selectTableState 三分支规则，且遇 0 字节会话验证码门禁响应立即标记 captcha_session_gate_required 熔断", async () => {
    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const emptyFetch: typeof fetch = async () => new Response(new Uint8Array(0), { status: 200 });
      const sb = loadUserscriptHeadless(scriptPath, emptyFetch);
      const bridge = sb.__CUSTOMS_SUITE_BRIDGE__ as {
        computeOfficialSelectTableState: (
          year: number,
          startMonth: number,
          endMonth: number,
          currentStartTime?: string,
          currentEndTime?: string,
        ) => number;
        probeCount: (opts: {
          year: number;
          startMonth: number;
          endMonth: number;
          monthFlag: "" | "1";
          flow: "import" | "export";
          grouping: "product" | "partner" | "regime" | "region";
          hs8: string[];
          skipPoliteWaitForUnitTest?: boolean;
        }) => Promise<{ ok: boolean; reason?: string; circuitBreakRequired?: boolean }>;
        fetchRawExportBase64: (opts: {
          year: number;
          startMonth: number;
          endMonth: number;
          monthFlag: "" | "1";
          flow: "import" | "export";
          grouping: "product" | "partner" | "regime" | "region";
          hs8: string[];
          selectTableState?: number;
          skipPoliteWaitForUnitTest?: boolean;
        }) => Promise<{ ok: boolean; reason?: string; circuitBreakRequired?: boolean }>;
      };

      expect(bridge.computeOfficialSelectTableState(2024, 1, 12, "202504", "202610")).toBe(2);
      expect(bridge.computeOfficialSelectTableState(2026, 1, 10, "202504", "202610")).toBe(1);
      expect(bridge.computeOfficialSelectTableState(2025, 1, 12, "202504", "202610")).toBe(3);

      const probeRes = await bridge.probeCount({
        year: 2024,
        startMonth: 1,
        endMonth: 12,
        monthFlag: "1",
        flow: "import",
        grouping: "product",
        hs8: ["90181100"],
        skipPoliteWaitForUnitTest: true,
      });
      expect(probeRes.ok).toBe(false);
      expect(probeRes.reason).toBe("captcha_session_gate_required");
      expect(probeRes.circuitBreakRequired).toBe(true);

      const dlRes = await bridge.fetchRawExportBase64({
        year: 2024,
        startMonth: 1,
        endMonth: 12,
        monthFlag: "1",
        flow: "import",
        grouping: "product",
        hs8: ["90181100"],
        skipPoliteWaitForUnitTest: true,
      });
      expect(dlRes.ok).toBe(false);
      expect(dlRes.reason).toBe("captcha_session_gate_required");
      expect(dlRes.circuitBreakRequired).toBe(true);
    }
  });

  it("[P2-12] 生产探测在首个 selectTableState 未命中继续试探时，连续请求间严格执行限速等待并准确返回 requestCount", async () => {
    const sleepCalls: number[] = [];
    let fetchCalls = 0;
    const mockFetch: typeof fetch = async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response("", { status: 500 });
      }
      return new Response(JSON.stringify({ total: 2 }), { status: 200 });
    };

    const code = fs.readFileSync(TOP_SUITE_PATH, "utf8");
    const sandbox: Record<string, unknown> = {
      TextEncoder,
      TextDecoder,
      URLSearchParams,
      Uint8Array,
      Uint32Array,
      DataView,
      ArrayBuffer,
      crypto: globalThis.crypto,
      Buffer,
      setTimeout: (fn: () => void, ms?: number) => {
        sleepCalls.push(ms ?? 0);
        fn();
        return 0;
      },
      clearTimeout,
      console,
      btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
      atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
      fetch: mockFetch,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: "china_customs_suite.user.js" });

    const bridge = sandbox.__CUSTOMS_SUITE_BRIDGE__ as {
      probeCount: (opts: {
        year: number;
        startMonth: number;
        endMonth: number;
        monthFlag: "" | "1";
        flow: "import" | "export";
        grouping: "product";
        hs8: string[];
        stateCandidates: number[];
        minDelayMs: number;
        maxDelayMs: number;
      }) => Promise<{ ok: boolean; state: number; total: number; requestCount: number }>;
    };

    const res = await bridge.probeCount({
      year: 2024,
      startMonth: 1,
      endMonth: 1,
      monthFlag: "1",
      flow: "import",
      grouping: "product",
      hs8: ["90181100"],
      stateCandidates: [2, 1, 3],
      minDelayMs: 3500,
      maxDelayMs: 3500,
    });

    expect(res.ok).toBe(true);
    expect(res.state).toBe(1);
    expect(res.requestCount).toBe(2);
    expect(fetchCalls).toBe(2);
    // 第 2 次实际请求前必须等待 >= 3500ms（非 0ms 连发）
    expect(sleepCalls.some((ms) => ms >= 3400)).toBe(true);
  });

  it("[P2-13] scripts/china_customs_collector.user.js 与 docs/china_customs_suite.user.js 均保留手动采集面板并生成可导入清单", async () => {
    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const code = fs.readFileSync(scriptPath, "utf8");
      const downloads: Array<{ filename: string; text: string }> = [];
      const blobToText = new Map<string, string>();
      let blobSeq = 0;

      const elementsById = new Map<string, Record<string, unknown>>();
      const makeEl = (tag: string): Record<string, unknown> => {
        const listeners = new Map<string, Array<(e?: unknown) => unknown>>();
        const classSet = new Set<string>();
        let innerHtmlVal = "";
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          id: "",
          value: "",
          disabled: false,
          style: {},
          classList: {
            toggle(c: string) {
              if (classSet.has(c)) classSet.delete(c);
              else classSet.add(c);
            },
            contains(c: string) {
              return classSet.has(c);
            },
          },
          children: [] as unknown[],
          appendChild(child: Record<string, unknown>) {
            (this.children as unknown[]).push(child);
            if (child.id) elementsById.set(String(child.id), child);
            return child;
          },
          remove() {},
          addEventListener(ev: string, fn: (e?: unknown) => unknown) {
            const arr = listeners.get(ev) ?? [];
            arr.push(fn);
            listeners.set(ev, arr);
          },
          async click() {
            if (tag === "a" && typeof this.download === "string" && typeof this.href === "string") {
              downloads.push({ filename: this.download, text: blobToText.get(this.href) ?? "" });
            }
            for (const fn of listeners.get("click") ?? []) {
              await fn({ target: this });
            }
          },
        };
        Object.defineProperty(el, "innerHTML", {
          get: () => innerHtmlVal,
          set: (v: string) => {
            innerHtmlVal = v;
            const idRegex = /id="([^"]+)"/g;
            for (const m of v.matchAll(idRegex)) {
              if (!elementsById.has(m[1])) {
                const sub = makeEl("div");
                sub.id = m[1];
                if (m[1] === "inp-year") sub.value = "2024";
                if (m[1] === "inp-m-start") sub.value = "1";
                if (m[1] === "inp-m-end") sub.value = "2";
                if (m[1] === "sel-month-flag") sub.value = "1";
                if (m[1] === "sel-ietype") sub.value = "import";
                if (m[1] === "sel-grouping") sub.value = "product";
                if (m[1] === "sel-batch") sub.value = "PILOT";
                elementsById.set(m[1], sub);
              }
            }
          },
        });
        return el;
      };

      const head = makeEl("head");
      const body = makeEl("body");
      const fakeDoc = {
        readyState: "complete",
        head,
        body,
        createElement: (tag: string) => makeEl(tag),
        getElementById: (id: string) => elementsById.get(id) ?? null,
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      class FakeBlob {
        content: string;
        constructor(parts: unknown[]) {
          this.content = parts
            .map((p) => (p instanceof Uint8Array ? Buffer.from(p).toString("utf8") : String(p)))
            .join("");
        }
      }

      const csvBody =
        "数据年月,商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元\r\n" +
        "202401,90181100,心电图记录仪,10,台,5,千克,1000\r\n" +
        "202402,90181100,心电图记录仪,12,台,6,千克,1200\r\n";

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("getQueryDataListByWhere")) {
          return new Response(JSON.stringify({ total: 2 }), { status: 200 });
        }
        return new Response(new TextEncoder().encode(csvBody), { status: 200 });
      };

      const fakeWindow: Record<string, unknown> = {};
      fakeWindow.top = fakeWindow;
      fakeWindow.self = fakeWindow;

      const sandbox: Record<string, unknown> = {
        window: fakeWindow,
        document: fakeDoc,
        Blob: FakeBlob,
        URL: {
          createObjectURL: (b: FakeBlob) => {
            const key = `blob:test/${++blobSeq}`;
            blobToText.set(key, b.content);
            return key;
          },
          revokeObjectURL: () => {},
        },
        TextEncoder,
        TextDecoder,
        URLSearchParams,
        Uint8Array,
        Uint32Array,
        DataView,
        ArrayBuffer,
        crypto: globalThis.crypto,
        Buffer,
        alert: () => {},
        setTimeout: (fn: () => void) => {
          fn();
          return 0;
        },
        clearTimeout,
        console,
        btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
        atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
        fetch: mockFetch,
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox, { filename: path.basename(scriptPath) });

      // 等待 async initSuiteV4UI 完成字典校验并绑定事件监听器
      await new Promise((resolve) => setTimeout(resolve, 25));

      // 断言：挂载了手动采集面板与启动按钮
      expect(elementsById.has("customs-suite-panel")).toBe(true);
      const startBtn = elementsById.get("btn-start-suite") as { click: () => Promise<void> };
      expect(startBtn).toBeDefined();

      // 触发手动采集：必须同时下载 .raw.csv 与配套可导入 .manifest.json（及 .meta.json）
      await startBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const csvDl = downloads.find((d) => d.filename.endsWith(".raw.csv"));
      const manifestDl = downloads.find((d) => d.filename.endsWith(".manifest.json"));
      const metaDl = downloads.find((d) => d.filename.endsWith(".meta.json"));
      expect(csvDl).toBeDefined();
      expect(manifestDl).toBeDefined();
      expect(metaDl).toBeDefined();

      // stem 必须一致以便 scripts/import-customs-archive.mjs 自动配对导入
      expect(csvDl!.filename.replace(/\.raw\.csv$/, "")).toBe(manifestDl!.filename.replace(/\.manifest\.json$/, ""));
      const parsedManifest = JSON.parse(manifestDl!.text) as Record<string, unknown>;
      const checked = validateTradeBulkManifest(parsedManifest, {
        knownDictVersions: new Set(["202601"]),
        dictHs8Set: new Set(["90181100"]),
      });
      expect(checked.ok).toBe(true);
      if (checked.ok) {
        expect(checked.value.months).toEqual(["2024-01", "2024-02"]);
        expect(checked.value.probeVerifiedZero).toBe(true);
      }
    }
  });

  it('[P2-11] validateTradeManifest / validateTradeBulkManifest 严格校验 probeVerifiedZero 布尔类型，拒绝字符串 "false"', () => {
    const baseSingle = {
      dictVersion: "202601",
      month: "2024-01",
      flow: "import",
      currency: "USD",
      grouping: "product",
      hs8: ["90181100"],
      emptyHs8: [],
    };
    expect(validateTradeManifest({ ...baseSingle, probeVerifiedZero: "false" }).ok).toBe(false);
    expect(validateTradeManifest({ ...baseSingle, probeVerifiedZero: 1 }).ok).toBe(false);
    const okFalse = validateTradeManifest({ ...baseSingle, probeVerifiedZero: false });
    expect(okFalse.ok && okFalse.value.probeVerifiedZero).toBe(false);
    const okTrue = validateTradeManifest({ ...baseSingle, probeVerifiedZero: true });
    expect(okTrue.ok && okTrue.value.probeVerifiedZero).toBe(true);

    const baseBulk = {
      dictVersion: "202601",
      months: ["2024-01"],
      flow: "import",
      currency: "USD",
      grouping: "product",
      hs8: ["90181100"],
    };
    expect(validateTradeBulkManifest({ ...baseBulk, probeVerifiedZero: "false" }).ok).toBe(false);
    expect(validateTradeBulkManifest({ ...baseBulk, probeVerifiedZero: "true" }).ok).toBe(false);
    const bulkTrue = validateTradeBulkManifest({ ...baseBulk, probeVerifiedZero: true });
    expect(bulkTrue.ok && bulkTrue.value.probeVerifiedZero).toBe(true);
  });

  it("[P1-4] import-customs-archive 遇试点与正式 G01 共存同目录时自动跳过被覆盖的试点清单，避免 409 阻断导入", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      selectImportableManifestEntries: (
        files: string[],
        opts?: { dictVersion?: string; includePilot?: boolean },
      ) => { selected: Array<{ mfPath: string }>; skippedPilot: Array<{ mfPath: string }> };
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdes-archive-p14-"));
    try {
      const pilotDir = path.join(tmpDir, "2024", "import", "product", "PILOT-90181100", "r01");
      const formalDir = path.join(tmpDir, "2024", "import", "product", "G01", "r01");
      fs.mkdirSync(pilotDir, { recursive: true });
      fs.mkdirSync(formalDir, { recursive: true });

      const pilotMf = path.join(pilotDir, "customs_202601_2024_01-12_import_product_PILOT-90181100_r01.manifest.json");
      const formalMf = path.join(formalDir, "customs_202601_2024_01-12_import_product_G01_r01.manifest.json");
      fs.writeFileSync(
        pilotMf,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: ["90181100"],
        }),
      );
      fs.writeFileSync(
        formalMf,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: ["84231000", "90181100"],
        }),
      );

      // 混合目录：跳过被 G01 覆盖的 PILOT-90181100
      const mixed = importerMod.selectImportableManifestEntries([pilotMf, formalMf]);
      expect(mixed.selected.map((x) => x.mfPath)).toEqual([formalMf]);
      expect(mixed.skippedPilot.map((x) => x.mfPath)).toEqual([pilotMf]);

      // 独立试点目录：无正式批次覆盖时正常保留导入
      const pilotOnly = importerMod.selectImportableManifestEntries([pilotMf]);
      expect(pilotOnly.selected.map((x) => x.mfPath)).toEqual([pilotMf]);
      expect(pilotOnly.skippedPilot).toHaveLength(0);

      // [R2 P2-6] 部分重叠（试点含 2024-01 与 2024-02，正式仅覆盖 2024-01）绝不可跳过整份试点清单，必须显式报错
      const partialPilotMf = path.join(pilotDir, "customs_202601_2024_01-02_import_product_PILOT-90181100_r01.manifest.json");
      fs.writeFileSync(
        partialPilotMf,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01", "2024-02"],
          flow: "import",
          currency: "USD",
          grouping: "product",
          hs8: ["90181100"],
        }),
      );
      expect(() => importerMod.selectImportableManifestEntries([partialPilotMf, formalMf])).toThrow(
        /PILOT_PARTIAL_OVERLAP/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("[R2 P1-B] 零结果预检返回官方响应摘要并通过 renderEmptyQueryEvidence 同步更新页面凭证视图", async () => {
    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const code = fs.readFileSync(scriptPath, "utf8");
      const mountedById = new Map<string, Record<string, unknown>>();
      const makeDomEl = (tag: string): Record<string, unknown> => {
        const attrs = new Map<string, string>();
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          id: "",
          style: {},
          dataset: {},
          innerHTML: "",
          children: [] as unknown[],
          setAttribute(k: string, v: string) {
            attrs.set(k, v);
          },
          getAttribute(k: string) {
            return attrs.get(k) ?? null;
          },
          appendChild(child: Record<string, unknown>) {
            (this.children as unknown[]).push(child);
            if (child.id) mountedById.set(String(child.id), child);
            return child;
          },
          remove() {
            if (this.id) mountedById.delete(String(this.id));
          },
          addEventListener() {},
        };
        return el;
      };
      const fakeBody = makeDomEl("body");
      const fakeDoc = {
        readyState: "complete",
        head: makeDomEl("head"),
        body: fakeBody,
        createElement: (tag: string) => makeDomEl(tag),
        getElementById: (id: string) => mountedById.get(id) ?? null,
        querySelector: () => null,
        querySelectorAll: () => [],
      };
      const fakeWindow: Record<string, unknown> = { __MDES_HARNESS_HEADLESS_UI__: true };
      fakeWindow.top = fakeWindow;
      fakeWindow.self = fakeWindow;

      const zeroHtml = '<input type="hidden" id="totalSize" value="0"><p class="c-666">共查询到 <span>0</span> 条数据</p><div>暂无数据</div>';
      const sandbox: Record<string, unknown> = {
        window: fakeWindow,
        document: fakeDoc,
        location: { href: "http://stats.customs.gov.cn/indexEn" },
        TextEncoder,
        TextDecoder,
        URLSearchParams,
        Uint8Array,
        Uint32Array,
        DataView,
        ArrayBuffer,
        crypto: globalThis.crypto,
        Buffer,
        setTimeout,
        clearTimeout,
        console,
        btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
        atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
        fetch: async () => new Response(zeroHtml, { status: 200 }),
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox, { filename: path.basename(scriptPath) });

      const bridge = sandbox.__CUSTOMS_SUITE_BRIDGE__ as {
        probeCount: (opts: Record<string, unknown>) => Promise<{
          ok: boolean;
          total: number;
          state: number;
          zeroEvidence: {
            queryFingerprint: string;
            officialTotal: number;
            responseSha256: string;
            officialResponseExcerpt: string;
            requestParams: string;
          } | null;
        }>;
        renderEmptyQueryEvidence: (opts: Record<string, unknown>) => Promise<{
          ok: boolean;
          rendered: boolean;
          officialTotal: number;
          queryFingerprint: string;
        }>;
        clearEmptyQueryEvidence: () => boolean;
      };

      const probe = await bridge.probeCount({
        year: 2024,
        startMonth: 1,
        endMonth: 12,
        monthFlag: "1",
        flow: "export",
        grouping: "product",
        hs8: ["90181100"],
        stateCandidates: [2],
        skipPoliteWaitForUnitTest: true,
      });
      expect(probe.ok).toBe(true);
      expect(probe.total).toBe(0);
      expect(probe.zeroEvidence).not.toBeNull();
      expect(probe.zeroEvidence!.responseSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(probe.zeroEvidence!.officialResponseExcerpt).toContain("暂无数据");

      const rendered = await bridge.renderEmptyQueryEvidence({
        year: 2024,
        startMonth: 1,
        endMonth: 12,
        monthFlag: "1",
        flow: "export",
        grouping: "product",
        hs8: ["90181100"],
        selectTableState: probe.state,
        officialTotal: 0,
        responseSha256: probe.zeroEvidence!.responseSha256,
        officialResponseExcerpt: probe.zeroEvidence!.officialResponseExcerpt,
        requestParams: probe.zeroEvidence!.requestParams,
      });
      expect(rendered.ok).toBe(true);
      expect(rendered.rendered).toBe(true);
      expect(rendered.queryFingerprint).toBe(probe.zeroEvidence!.queryFingerprint);

      const overlay = mountedById.get("mdes-empty-evidence-overlay");
      expect(overlay).toBeDefined();
      expect(String(overlay!.innerHTML)).toContain("90181100");
      expect(String(overlay!.innerHTML)).toContain("2024-01 .. 2024-12");
      expect(String(overlay!.innerHTML)).toContain(probe.zeroEvidence!.responseSha256);

      expect(bridge.clearEmptyQueryEvidence()).toBe(true);
      expect(mountedById.has("mdes-empty-evidence-overlay")).toBe(false);
    }
  });

  it("[R2 P1-C / P2-5 / P2-7] 归档导入器核验 CSV 摘要与发布最终状态，字典摘要兼容 LF/CRLF 换行", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      verifyArchiveEntryIntegrity: (entry: {
        mfPath: string;
        manifestObj: Record<string, unknown>;
        months: string[];
      }) => { expectedSourceSha256: string; expectedDetailRowCount: number | null };
      sealEmptyEvidenceMeta: (pngPath: string) => {
        metaPath: string;
        emptyPngSha256: string;
        width: number;
        height: number;
      };
      fetchImportedBatchesAfterPublish: (
        client: { sendJson: (url: string) => Promise<{ status: number; json: unknown }> },
        dictVersion: string,
        importedBatchIds: string[],
      ) => Promise<Array<{ batchId: string; publishState: string; supersededBy: string | null }>>;
      verifyPublishOutcome: (args: {
        expectedMonths: string[];
        importedBatchIds?: string[];
        publishResponse: { status: number; json: Record<string, unknown> };
        batchesAfterPublish?: Array<{ batchId: string; publishState: string; supersededBy: string | null }> | null;
      }) => void;
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdes-archive-r2-"));
    try {
      const stem = "customs_202601_2024_01-01_import_product_G01_r01";
      const mfPath = path.join(tmpDir, `${stem}.manifest.json`);
      const csvPath = path.join(tmpDir, `${stem}.raw.csv`);
      const metaPath = path.join(tmpDir, `${stem}.meta.json`);

      const fullCsv = Buffer.from(
        "数据年月,商品编码,商品名称,美元\r\n202401,90181100,心电图记录仪,100\r\n202401,90181210,B超,200\r\n",
        "utf8",
      );
      const { createHash } = await import("node:crypto");
      const fullSha = createHash("sha256").update(fullCsv).digest("hex");

      const manifestObj = {
        dictVersion: "202601",
        months: ["2024-01"],
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: ["90181100", "90181210"],
        probeVerifiedZero: true,
      };
      fs.writeFileSync(mfPath, JSON.stringify(manifestObj));
      fs.writeFileSync(csvPath, fullCsv);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          grouping: "product",
          sha256: fullSha,
          byteLength: fullCsv.byteLength,
          inspection: {
            detailRowCount: 2,
            returnedHs8: ["90181100", "90181210"],
            unreturnedHs8: [],
          },
        }),
      );

      // 完整一致的归档文件通过核验
      const ok = importerMod.verifyArchiveEntryIntegrity({ mfPath, manifestObj, months: ["2024-01"] });
      expect(ok.expectedSourceSha256).toBe(fullSha);
      expect(ok.expectedDetailRowCount).toBe(2);

      // [R3 P1-3] 清单多出一个未查询的有效税号（CSV 摘要与行数均不变），必须因 HS8 范围失配立即拦截
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({
          mfPath,
          manifestObj: { ...manifestObj, hs8: ["90181100", "90181210", "90221200"] },
          months: ["2024-01"],
        }),
      ).toThrow(/清单多余=\[90221200\]/);

      // [R3 P1-3] .meta.json 缺少 HS8 范围凭证且 probeVerifiedZero=true 时必须拒绝上传
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          grouping: "product",
          sha256: fullSha,
          byteLength: fullCsv.byteLength,
          inspection: { detailRowCount: 2 },
        }),
      );
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({ mfPath, manifestObj, months: ["2024-01"] }),
      ).toThrow(/缺少原查询 HS8 范围凭证/);

      // 恢复合法 meta 后测试 CSV 缺行
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "import",
          grouping: "product",
          sha256: fullSha,
          byteLength: fullCsv.byteLength,
          inspection: {
            detailRowCount: 2,
            returnedHs8: ["90181100", "90181210"],
            unreturnedHs8: [],
          },
        }),
      );

      // [P1-C] 若归档后的 CSV 丢了一行（但仍是合法 CSV），必须因 SHA-256 失配立即拦截
      const truncatedCsv = Buffer.from("数据年月,商品编码,商品名称,美元\r\n202401,90181100,心电图记录仪,100\r\n", "utf8");
      fs.writeFileSync(csvPath, truncatedCsv);
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({ mfPath, manifestObj, months: ["2024-01"] }),
      ).toThrow(/ARCHIVE_INTEGRITY_ERROR/);

      // [P1-C] probeVerifiedZero=true 但缺失 .meta.json 同样拒绝上传
      fs.rmSync(metaPath);
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({ mfPath, manifestObj, months: ["2024-01"] }),
      ).toThrow(/ARCHIVE_INTEGRITY_ERROR/);

      // [P2-5] HTTP 200 但缺分组导致未发布、存在对账差异、或批次仍为 staged 均必须抛出非零错误
      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01", "2024-02"],
          publishResponse: {
            status: 200,
            json: { published: true, publishedMonths: ["2024-01"], reconciliationNotes: {} },
          },
        }),
      ).toThrow(/未发布月份=\[2024-02\]/);

      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01"],
          publishResponse: {
            status: 200,
            json: {
              published: false,
              publishedMonths: ["2024-01"],
              reconciliationNotes: { "2024-01": "import/partner/90181100: diff=10" },
            },
          },
        }),
      ).toThrow(/对账差异/);

      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01"],
          importedBatchIds: ["batch-staged"],
          publishResponse: {
            status: 200,
            json: { published: false, publishedMonths: ["2024-01"], reconciliationNotes: {} },
          },
          batchesAfterPublish: [{ batchId: "batch-staged", publishState: "staged", supersededBy: null }],
        }),
      ).toThrow(/batch-staged/);

      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01"],
          importedBatchIds: ["batch-pub"],
          publishResponse: {
            status: 200,
            json: { published: true, publishedMonths: ["2024-01"], reconciliationNotes: {} },
          },
          batchesAfterPublish: [{ batchId: "batch-pub", publishState: "published", supersededBy: null }],
        }),
      ).not.toThrow();

      // [R3 P2-2] 查不到任意一个导入 batchId、缺少批次核验数组或查询接口返回非 200 均必须显式报错
      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01"],
          importedBatchIds: ["batch-pub", "batch-missing-from-query"],
          publishResponse: {
            status: 200,
            json: { published: false, publishedMonths: ["2024-01"], reconciliationNotes: {} },
          },
          batchesAfterPublish: [{ batchId: "batch-pub", publishState: "published", supersededBy: null }],
        }),
      ).toThrow(/batch-missing-from-query/);

      expect(() =>
        importerMod.verifyPublishOutcome({
          expectedMonths: ["2024-01"],
          importedBatchIds: ["batch-staged"],
          publishResponse: {
            status: 200,
            json: { published: false, publishedMonths: ["2024-01"], reconciliationNotes: {} },
          },
          batchesAfterPublish: null,
        }),
      ).toThrow(/缺少发布后批次状态核验结果/);

      await expect(
        importerMod.fetchImportedBatchesAfterPublish(
          { sendJson: async () => ({ status: 500, json: { error: "boom" } }) },
          "202601",
          ["b1"],
        ),
      ).rejects.toThrow(/查询导入批次发布终态失败/);

      // [R3 P2-1] 手动零结果 PNG 经 sealEmptyEvidenceMeta 封签摘要后可直接通过导入器核验，且 HS8 不符时仍被 P1-3 拦截
      const emptyStem = "customs_202601_2024_01-01_export_product_PILOT-90181100_r01";
      const emptyMfPath = path.join(tmpDir, `${emptyStem}.manifest.json`);
      const emptyMetaPath = path.join(tmpDir, `${emptyStem}.meta.json`);
      const emptyPngPath = path.join(tmpDir, `${emptyStem}.empty.png`);
      // 合法 32x32 PNG 最小头
      const validPngBuf = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]),
        Buffer.from("IHDR", "ascii"),
        Buffer.from([0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, 8, 6, 0, 0, 0]),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
      ]);
      const emptyManifest = {
        dictVersion: "202601",
        months: ["2024-01"],
        flow: "export",
        currency: "USD",
        grouping: "product",
        hs8: ["90181100"],
        emptyHs8: ["90181100"],
        probeVerifiedZero: true,
      };
      fs.writeFileSync(emptyMfPath, JSON.stringify(emptyManifest));
      fs.writeFileSync(emptyPngPath, validPngBuf);
      fs.writeFileSync(
        emptyMetaPath,
        JSON.stringify({
          dictVersion: "202601",
          months: ["2024-01"],
          flow: "export",
          grouping: "product",
          queryFingerprint: "202601|2024-01..2024-01|mf=1|export|product|st=2|hs8=90181100",
          officialTotal: 0,
        }),
      );
      // 封签前缺 emptyPngSha256 被拒绝
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({ mfPath: emptyMfPath, manifestObj: emptyManifest, months: ["2024-01"] }),
      ).toThrow(/缺少 emptyPngSha256/);
      // 封签后通过核验
      const sealed = importerMod.sealEmptyEvidenceMeta(emptyPngPath);
      expect(sealed.emptyPngSha256).toMatch(/^[0-9a-f]{64}$/);
      const okEmpty = importerMod.verifyArchiveEntryIntegrity({
        mfPath: emptyMfPath,
        manifestObj: emptyManifest,
        months: ["2024-01"],
      });
      expect(okEmpty.expectedSourceSha256).toBe(sealed.emptyPngSha256);
      // 若清单多出未查询税号 90181210，与 queryFingerprint 不一致必须被 P1-3 拦截
      expect(() =>
        importerMod.verifyArchiveEntryIntegrity({
          mfPath: emptyMfPath,
          manifestObj: { ...emptyManifest, hs8: ["90181100", "90181210"], emptyHs8: ["90181100", "90181210"] },
          months: ["2024-01"],
        }),
      ).toThrow(/清单多余=\[90181210\]/);

      // [P2-7] 字典摘要在 LF 与 CRLF 换行下均精确匹配 EXPECTED_DICT_SHA256
      // @ts-expect-error -- CLI 脚本为无声明 .mjs
      const manifestTool = (await import("../../../scripts/trade-collection-manifest.mjs")) as {
        DEFAULT_DICT_PATH: string;
        loadAndVerifyHsDict202601: (p?: string) => { sha256: string; hs8Count: number };
      };
      const lfBytes = fs.readFileSync(manifestTool.DEFAULT_DICT_PATH);
      const crlfPath = path.join(tmpDir, "hs_dict_crlf.csv");
      const crlfText = lfBytes.toString("utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
      fs.writeFileSync(crlfPath, crlfText, "utf8");
      const crlfDict = manifestTool.loadAndVerifyHsDict202601(crlfPath);
      expect(crlfDict.sha256).toBe(EXPECTED_DICT_SHA256);
      expect(crlfDict.hs8Count).toBe(164);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("[R3 P2-1] 油猴手动采集遇到零结果时自动生成 .empty.png 与配套 emptyPngSha256 / requestedHs8，可直接被归档导入器核验通过", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      verifyArchiveEntryIntegrity: (entry: {
        mfPath: string;
        manifestObj: Record<string, unknown>;
        months: string[];
      }) => { expectedSourceSha256: string };
    };

    // 合法 32x32 PNG base64（供模拟浏览器 <canvas>.toDataURL("image/png") 返回）
    const fakePngBuf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0x00, 0x00, 0x00, 0x0d]),
      Buffer.from("IHDR", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, 8, 6, 0, 0, 0]),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
    ]);
    const fakePngDataUrl = `data:image/png;base64,${fakePngBuf.toString("base64")}`;

    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const code = fs.readFileSync(scriptPath, "utf8");
      const downloads: Array<{ filename: string; raw: Buffer }> = [];
      const blobToBuf = new Map<string, Buffer>();
      let blobSeq = 0;

      const elementsById = new Map<string, Record<string, unknown>>();
      const makeEl = (tag: string): Record<string, unknown> => {
        const listeners = new Map<string, Array<(e?: unknown) => unknown>>();
        const classSet = new Set<string>();
        const attrs = new Map<string, string>();
        let innerHtmlVal = "";
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          id: "",
          value: "",
          disabled: false,
          style: {},
          dataset: {},
          width: 0,
          height: 0,
          setAttribute(k: string, v: string) {
            attrs.set(k, v);
          },
          getAttribute(k: string) {
            return attrs.get(k) ?? null;
          },
          getContext() {
            if (tag.toLowerCase() !== "canvas") return null;
            return {
              fillStyle: "",
              strokeStyle: "",
              lineWidth: 1,
              font: "",
              fillRect() {},
              strokeRect() {},
              fillText() {},
            };
          },
          toDataURL() {
            return fakePngDataUrl;
          },
          classList: {
            toggle(c: string) {
              if (classSet.has(c)) classSet.delete(c);
              else classSet.add(c);
            },
            contains(c: string) {
              return classSet.has(c);
            },
          },
          children: [] as unknown[],
          appendChild(child: Record<string, unknown>) {
            (this.children as unknown[]).push(child);
            if (child.id) elementsById.set(String(child.id), child);
            return child;
          },
          remove() {
            if (this.id) elementsById.delete(String(this.id));
          },
          addEventListener(ev: string, fn: (e?: unknown) => unknown) {
            const arr = listeners.get(ev) ?? [];
            arr.push(fn);
            listeners.set(ev, arr);
          },
          async click() {
            if (tag === "a" && typeof this.download === "string" && typeof this.href === "string") {
              downloads.push({ filename: this.download, raw: blobToBuf.get(this.href) ?? Buffer.alloc(0) });
            }
            for (const fn of listeners.get("click") ?? []) {
              await fn({ target: this });
            }
          },
        };
        Object.defineProperty(el, "innerHTML", {
          get: () => innerHtmlVal,
          set: (v: string) => {
            innerHtmlVal = v;
            const idRegex = /id="([^"]+)"/g;
            for (const m of v.matchAll(idRegex)) {
              if (!elementsById.has(m[1])) {
                const sub = makeEl("div");
                sub.id = m[1];
                if (m[1] === "inp-year") sub.value = "2024";
                if (m[1] === "inp-m-start") sub.value = "1";
                if (m[1] === "inp-m-end") sub.value = "2";
                if (m[1] === "sel-month-flag") sub.value = "1";
                if (m[1] === "sel-ietype") sub.value = "export";
                if (m[1] === "sel-grouping") sub.value = "product";
                if (m[1] === "sel-batch") sub.value = "PILOT";
                elementsById.set(m[1], sub);
              }
            }
          },
        });
        return el;
      };

      const fakeDoc = {
        readyState: "complete",
        head: makeEl("head"),
        body: makeEl("body"),
        createElement: (tag: string) => makeEl(tag),
        getElementById: (id: string) => elementsById.get(id) ?? null,
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      class FakeBlob {
        buf: Buffer;
        constructor(parts: unknown[]) {
          this.buf = Buffer.concat(
            parts.map((p) => (p instanceof Uint8Array ? Buffer.from(p) : Buffer.from(String(p), "utf8"))),
          );
        }
      }

      const fakeWindow: Record<string, unknown> = {};
      fakeWindow.top = fakeWindow;
      fakeWindow.self = fakeWindow;

      const sandbox: Record<string, unknown> = {
        window: fakeWindow,
        document: fakeDoc,
        location: { href: "http://stats.customs.gov.cn/" },
        Blob: FakeBlob,
        URL: {
          createObjectURL: (b: FakeBlob) => {
            const key = `blob:zero/${++blobSeq}`;
            blobToBuf.set(key, b.buf);
            return key;
          },
          revokeObjectURL: () => {},
        },
        TextEncoder,
        TextDecoder,
        URLSearchParams,
        Uint8Array,
        Uint32Array,
        DataView,
        ArrayBuffer,
        crypto: globalThis.crypto,
        Buffer,
        alert: () => {},
        setTimeout: (fn: () => void) => {
          fn();
          return 0;
        },
        clearTimeout,
        console,
        btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
        atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
        fetch: async () => new Response('<input type="hidden" id="totalSize" value="0">暂无数据', { status: 200 }),
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox, { filename: path.basename(scriptPath) });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const startBtn = elementsById.get("btn-start-suite") as { click: () => Promise<void> };
      await startBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 25));

      const pngDl = downloads.find((d) => d.filename.endsWith(".empty.png"));
      const mfDl = downloads.find((d) => d.filename.endsWith(".manifest.json"));
      const metaDl = downloads.find((d) => d.filename.endsWith(".meta.json"));
      expect(pngDl).toBeDefined();
      expect(mfDl).toBeDefined();
      expect(metaDl).toBeDefined();

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdes-manual-zero-"));
      try {
        fs.writeFileSync(path.join(tmpDir, pngDl!.filename), pngDl!.raw);
        fs.writeFileSync(path.join(tmpDir, mfDl!.filename), mfDl!.raw);
        fs.writeFileSync(path.join(tmpDir, metaDl!.filename), metaDl!.raw);
        const manifestObj = JSON.parse(mfDl!.raw.toString("utf8")) as Record<string, unknown>;
        const verified = importerMod.verifyArchiveEntryIntegrity({
          mfPath: path.join(tmpDir, mfDl!.filename),
          manifestObj,
          months: manifestObj.months as string[],
        });
        expect(verified.expectedSourceSha256).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it("[R4 P1-1] 两个油猴脚本手动采集在预检和生成清单前按官网最新月份截断查询窗口，绝不将未公布月份确认为零", async () => {
    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const code = fs.readFileSync(scriptPath, "utf8");
      const downloads: Array<{ filename: string; text: string }> = [];
      const fetchedBodies: Array<{ url: string; body: string }> = [];
      const blobToText = new Map<string, string>();
      let blobSeq = 0;

      const elementsById = new Map<string, Record<string, unknown>>();
      const makeEl = (tag: string): Record<string, unknown> => {
        const listeners = new Map<string, Array<(e?: unknown) => unknown>>();
        const classSet = new Set<string>();
        let innerHtmlVal = "";
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          id: "",
          value: "",
          disabled: false,
          style: {},
          dataset: {},
          classList: {
            toggle(c: string) {
              if (classSet.has(c)) classSet.delete(c);
              else classSet.add(c);
            },
            contains(c: string) {
              return classSet.has(c);
            },
          },
          children: [] as unknown[],
          appendChild(child: Record<string, unknown>) {
            (this.children as unknown[]).push(child);
            if (child.id) elementsById.set(String(child.id), child);
            return child;
          },
          remove() {
            if (this.id) elementsById.delete(String(this.id));
          },
          addEventListener(ev: string, fn: (e?: unknown) => unknown) {
            const arr = listeners.get(ev) ?? [];
            arr.push(fn);
            listeners.set(ev, arr);
          },
          async click() {
            if (tag === "a" && typeof this.download === "string" && typeof this.href === "string") {
              downloads.push({ filename: this.download, text: blobToText.get(this.href) ?? "" });
            }
            for (const fn of listeners.get("click") ?? []) {
              await fn({ target: this });
            }
          },
        };
        Object.defineProperty(el, "innerHTML", {
          get: () => innerHtmlVal,
          set: (v: string) => {
            innerHtmlVal = v;
            for (const m of v.matchAll(/id="([^"]+)"/g)) {
              if (!elementsById.has(m[1])) {
                const sub = makeEl("div");
                sub.id = m[1];
                if (m[1] === "inp-year") sub.value = "2026";
                if (m[1] === "inp-m-start") sub.value = "1";
                if (m[1] === "inp-m-end") sub.value = "12";
                if (m[1] === "sel-month-flag") sub.value = "1";
                if (m[1] === "sel-ietype") sub.value = "import";
                if (m[1] === "sel-grouping") sub.value = "product";
                if (m[1] === "sel-batch") sub.value = "PILOT";
                elementsById.set(m[1], sub);
              }
            }
          },
        });
        return el;
      };

      const portalFrameDoc = {
        getElementById: (id: string) => {
          if (id === "currentStartTime") return { value: "202504" };
          if (id === "currentEndTime") return { value: "202610" };
          return null;
        },
      };
      const fakeDoc = {
        readyState: "complete",
        head: makeEl("head"),
        body: makeEl("body"),
        createElement: (tag: string) => makeEl(tag),
        getElementById: (id: string) => elementsById.get(id) ?? null,
        querySelector: (sel: string) => (sel === "iframe" ? { contentDocument: portalFrameDoc } : null),
        querySelectorAll: () => [],
      };

      class FakeBlob {
        content: string;
        constructor(parts: unknown[]) {
          this.content = parts
            .map((p) => (p instanceof Uint8Array ? Buffer.from(p).toString("utf8") : String(p)))
            .join("");
        }
      }

      const csv2026JanToOct = [
        "数据年月,商品编码,商品名称,美元",
        ...Array.from({ length: 10 }, (_, idx) => `2026${String(idx + 1).padStart(2, "0")},90181100,心电图记录仪,100`),
      ].join("\r\n") + "\r\n";

      const mockFetch = async (url: string, init?: { body?: URLSearchParams | string }) => {
        const bodyStr = init?.body ? String(init.body) : "";
        fetchedBodies.push({ url, body: bodyStr });
        if (url.includes("getQueryDataListByWhere")) {
          return new Response('<input type="hidden" id="totalSize" value="10">', { status: 200 });
        }
        return new Response(new TextEncoder().encode(csv2026JanToOct), { status: 200 });
      };

      const fakeWindow: Record<string, unknown> = {};
      fakeWindow.top = fakeWindow;
      fakeWindow.self = fakeWindow;

      const sandbox: Record<string, unknown> = {
        window: fakeWindow,
        document: fakeDoc,
        Blob: FakeBlob,
        URL: {
          createObjectURL: (b: FakeBlob) => {
            const key = `blob:r4p11/${++blobSeq}`;
            blobToText.set(key, b.content);
            return key;
          },
          revokeObjectURL: () => {},
        },
        TextEncoder,
        TextDecoder,
        URLSearchParams,
        Uint8Array,
        Uint32Array,
        DataView,
        ArrayBuffer,
        crypto: globalThis.crypto,
        Buffer,
        alert: () => {},
        setTimeout: (fn: () => void) => {
          fn();
          return 0;
        },
        clearTimeout,
        console,
        btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
        atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
        fetch: mockFetch,
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox, { filename: path.basename(scriptPath) });
      await new Promise((resolve) => setTimeout(resolve, 25));

      // 桥接函数单元测试：截断 2026-01..12 -> 2026-01..10，跳过 2026-11..12 与 2027-01..12
      const bridge = sandbox.__CUSTOMS_SUITE_BRIDGE__ as {
        clampWindowToLatestPublishedMonth: (opts: {
          year: number;
          startMonth: number;
          endMonth: number;
          currentEndTime?: string;
        }) => { endMonth: number; clamped: boolean; skipped: boolean };
      };
      expect(bridge.clampWindowToLatestPublishedMonth({ year: 2026, startMonth: 1, endMonth: 12 })).toMatchObject({
        endMonth: 10,
        clamped: true,
        skipped: false,
      });
      expect(bridge.clampWindowToLatestPublishedMonth({ year: 2026, startMonth: 11, endMonth: 12 })).toMatchObject({
        skipped: true,
      });
      expect(bridge.clampWindowToLatestPublishedMonth({ year: 2027, startMonth: 1, endMonth: 12 })).toMatchObject({
        skipped: true,
      });

      // 手动点击采集 2026 全年（1..12），必须被截断为 2026-01..2026-10，绝不把 2026-11/2026-12 写入清单
      const startBtn = elementsById.get("btn-start-suite") as { click: () => Promise<void> };
      await startBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(fetchedBodies.length).toBeGreaterThanOrEqual(2);
      for (const req of fetchedBodies) {
        const sp = new URLSearchParams(req.body);
        expect(sp.get("year")).toBe("2026");
        expect(sp.get("startMonth")).toBe("1");
        expect(sp.get("endMonth")).toBe("10");
      }

      const manifestDl = downloads.find((d) => d.filename.endsWith(".manifest.json"));
      expect(manifestDl).toBeDefined();
      expect(manifestDl!.filename).toContain("2026_01-10");
      expect(manifestDl!.filename).not.toContain("2026_01-12");
      const parsedManifest = JSON.parse(manifestDl!.text) as { months: string[]; probeVerifiedZero?: boolean };
      expect(parsedManifest.months).toEqual([
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      expect(parsedManifest.months).not.toContain("2026-11");
      expect(parsedManifest.months).not.toContain("2026-12");

      // 再测试用户手动选择完全未公布的 2026-11..12：不得发任何请求，不得下载任何清单
      const reqCountBefore = fetchedBodies.length;
      const dlCountBefore = downloads.length;
      (elementsById.get("inp-m-start") as { value: string }).value = "11";
      (elementsById.get("inp-m-end") as { value: string }).value = "12";
      await startBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(fetchedBodies.length).toBe(reqCountBefore);
      expect(downloads.length).toBe(dlCountBefore);
    }
  });

  it("[R4 P2-2] 三次修订链 A->B->C 发布 C 成功后，verifyPublishOutcome 与 fetchImportedBatchesAfterPublish 沿替代链核验终态", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      fetchImportedBatchesAfterPublish: (
        client: { sendJson: (url: string) => Promise<{ status: number; json: unknown }> },
        dictVersion: string,
        importedBatchIds: string[],
      ) => Promise<Array<{ batchId: string; publishState: string; supersededBy: string | null }>>;
      verifyPublishOutcome: (args: {
        expectedMonths: string[];
        importedBatchIds?: string[];
        publishResponse: { status: number; json: Record<string, unknown> };
        batchesAfterPublish?: Array<{ batchId: string; publishState: string; supersededBy: string | null }> | null;
      }) => void;
    };

    const pubOk = {
      status: 200,
      json: { published: true, publishedMonths: ["2024-01"], reconciliationNotes: {} },
    };

    // 场景 1：A -> B -> C（A/B 均为 staged，终态 C 为 published）=> 必须核验通过
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A", "batch-B", "batch-C"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "staged", supersededBy: "batch-C" },
          { batchId: "batch-C", publishState: "published", supersededBy: null },
        ],
      }),
    ).not.toThrow();

    // 场景 2：A -> B -> C 但终态 C 仍为 staged => 必须报错
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A", "batch-B", "batch-C"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "staged", supersededBy: "batch-C" },
          { batchId: "batch-C", publishState: "staged", supersededBy: null },
        ],
      }),
    ).toThrow(/batch-A/);

    // 场景 3：替代链循环 A -> B -> A 或缺失后继批次 => 必须报错
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A", "batch-B"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "staged", supersededBy: "batch-A" },
        ],
      }),
    ).toThrow(/batch-A/);

    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A"],
        publishResponse: pubOk,
        batchesAfterPublish: [{ batchId: "batch-A", publishState: "staged", supersededBy: "batch-missing-B" }],
      }),
    ).toThrow(/batch-missing-B/);

    // 场景 4：fetchImportedBatchesAfterPublish 自动沿 supersededBy 补齐中间及终态批次
    const store = new Map<string, { batchId: string; publishState: string; supersededBy: string | null }>([
      ["batch-A", { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" }],
      ["batch-B", { batchId: "batch-B", publishState: "staged", supersededBy: "batch-C" }],
      ["batch-C", { batchId: "batch-C", publishState: "published", supersededBy: null }],
    ]);
    const fetched = await importerMod.fetchImportedBatchesAfterPublish(
      {
        sendJson: async (url: string) => {
          const ids = decodeURIComponent(url.split("batchIds=")[1] ?? "").split(",");
          return {
            status: 200,
            json: { items: ids.map((id) => store.get(id)).filter(Boolean) },
          };
        },
      },
      "202601",
      ["batch-A"],
    );
    expect(fetched.map((x) => x.batchId).sort()).toEqual(["batch-A", "batch-B", "batch-C"]);
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A"],
        publishResponse: pubOk,
        batchesAfterPublish: fetched,
      }),
    ).not.toThrow();
  });

  it("[R5 P1-1] 汇总行金额非零且明细为空的 CSV 在油猴预检和共享后端解析器均被拒绝，绝不误判为零", () => {
    const summaryOnly123 = new TextEncoder().encode("数据年月,商品编码,商品名称,美元\r\n202401,合计,合计,123\r\n");

    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      const sb = loadUserscriptHeadless(scriptPath);
      const bridge = sb.__CUSTOMS_SUITE_BRIDGE__ as {
        inspectRawCustomsBytes: (bytes: Uint8Array, hs8: string[]) => { ok: boolean; reason?: string };
      };
      const insp = bridge.inspectRawCustomsBytes(summaryOnly123, ["90181100"]);
      expect(insp.ok).toBe(false);
      expect(insp.reason).toBe("summary_nonzero_without_detail_rows");
    }

    const singleParsed = parseCustomsCsvBytes(
      summaryOnly123,
      {
        dictVersion: "202601",
        month: "2024-01",
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: ["90181100"],
        emptyHs8: [],
      },
      { allowHeaderOnlyEmpty: true },
    );
    expect(singleParsed.ok).toBe(false);
    if (!singleParsed.ok) {
      expect(singleParsed.error.code).toBe("TRADE_CSV_INVALID");
    }

    const bulkParsed = parseMultiMonthCustomsCsvBytes(
      summaryOnly123,
      {
        dictVersion: "202601",
        months: ["2024-01"],
        flow: "import",
        currency: "USD",
        grouping: "product",
        hs8: ["90181100"],
        emptyHs8: [],
        probeVerifiedZero: true,
      },
      { allowHeaderOnlyEmpty: true },
    );
    expect(bulkParsed.ok).toBe(false);
    if (!bulkParsed.ok) {
      expect(bulkParsed.error.code).toBe("TRADE_CSV_INVALID");
    }
  });

  it("[R5 P1-2] 历史库查询失败（503/500）时绝不采信当前库等备用库返回的 0 条结果，保留待重试状态", async () => {
    for (const scriptPath of [TOP_SUITE_PATH, COLLECTOR_COPY_PATH]) {
      // 场景 1：查询 2024-01，历史库 state=2 返回 503，当前库 state=1 返回 0 -> 必须返回 ok:false, transientError:true，且不降级查 state=1
      const seenStates503: string[] = [];
      const fetch503: typeof fetch = async (_url, init) => {
        const sp = new URLSearchParams(String(init?.body ?? ""));
        const st = sp.get("selectTableState") ?? "";
        seenStates503.push(st);
        if (st === "2") {
          return new Response("Service Unavailable", { status: 503 });
        }
        return new Response(JSON.stringify({ total: 0 }), { status: 200 });
      };
      const sb503 = loadUserscriptHeadless(scriptPath, fetch503);
      const bridge503 = sb503.__CUSTOMS_SUITE_BRIDGE__ as {
        probeCount: (opts: Record<string, unknown>) => Promise<{
          ok: boolean;
          state: number | null;
          total: number | null;
          transientError?: boolean;
          reason?: string;
          requestCount?: number;
        }>;
      };
      const res503 = await bridge503.probeCount({
        year: 2024,
        startMonth: 1,
        endMonth: 1,
        monthFlag: "1",
        flow: "import",
        grouping: "product",
        hs8: ["90181100"],
        skipPoliteWaitForUnitTest: true,
      });
      expect(res503.ok).toBe(false);
      expect(res503.state).toBeNull();
      expect(res503.total).toBeNull();
      expect(res503.transientError).toBe(true);
      expect(res503.reason).toBe("http_503");
      expect(seenStates503).toEqual(["2"]);

      // 场景 2：查询 2024-01，历史库 state=2 返回 500（非瞬时），备用库 state=1 与 state=3 返回 0 -> 必须拒绝备用库零值
      const seenStates500: string[] = [];
      const fetch500: typeof fetch = async (_url, init) => {
        const sp = new URLSearchParams(String(init?.body ?? ""));
        const st = sp.get("selectTableState") ?? "";
        seenStates500.push(st);
        if (st === "2") {
          return new Response("Internal Error", { status: 500 });
        }
        return new Response(JSON.stringify({ total: 0 }), { status: 200 });
      };
      const sb500 = loadUserscriptHeadless(scriptPath, fetch500);
      const bridge500 = sb500.__CUSTOMS_SUITE_BRIDGE__ as typeof bridge503;
      const res500 = await bridge500.probeCount({
        year: 2024,
        startMonth: 1,
        endMonth: 1,
        monthFlag: "1",
        flow: "import",
        grouping: "product",
        hs8: ["90181100"],
        skipPoliteWaitForUnitTest: true,
      });
      expect(res500.ok).toBe(false);
      expect(res500.state).toBeNull();
      expect(res500.total).toBeNull();
      expect(res500.reason).toBe("http_500");
      expect(seenStates500).toEqual(["2", "1", "3"]);

      // 场景 3：查询 2026-01（属于当前库 state=1），当前库返回 503、历史库 state=2 返回 0 -> 同样必须返回 ok:false
      const seenStates2026: string[] = [];
      const fetch2026: typeof fetch = async (_url, init) => {
        const sp = new URLSearchParams(String(init?.body ?? ""));
        const st = sp.get("selectTableState") ?? "";
        seenStates2026.push(st);
        if (st === "1") {
          return new Response("Service Unavailable", { status: 503 });
        }
        return new Response(JSON.stringify({ total: 0 }), { status: 200 });
      };
      const sb2026 = loadUserscriptHeadless(scriptPath, fetch2026);
      const bridge2026 = sb2026.__CUSTOMS_SUITE_BRIDGE__ as typeof bridge503;
      const res2026 = await bridge2026.probeCount({
        year: 2026,
        startMonth: 1,
        endMonth: 1,
        monthFlag: "1",
        flow: "import",
        grouping: "product",
        hs8: ["90181100"],
        skipPoliteWaitForUnitTest: true,
      });
      expect(res2026.ok).toBe(false);
      expect(res2026.transientError).toBe(true);
      expect(seenStates2026).toEqual(["1"]);
    }
  });

  it("[R5 P2-1] 修订链 A(staged)->B(published)->C(staged) 重放 A 时必须走到终态 C 并因未发布而报错", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      verifyPublishOutcome: (args: {
        expectedMonths: string[];
        importedBatchIds?: string[];
        publishResponse: { status: number; json: Record<string, unknown> };
        batchesAfterPublish?: Array<{ batchId: string; publishState: string; supersededBy: string | null }> | null;
      }) => void;
    };

    const pubOk = {
      status: 200,
      json: { published: true, publishedMonths: ["2024-01"], reconciliationNotes: {} },
    };

    // 重放 A：中间批次 B 虽然是 published，但被最新修订 C(staged) 替代 -> 必须走到 C 并拒绝通过
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "published", supersededBy: "batch-C" },
          { batchId: "batch-C", publishState: "staged", supersededBy: null },
        ],
      }),
    ).toThrow(/batch-A/);

    // 重放已发布的 B 但其被暂存中的 C 替代 -> 同样必须报错
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-B"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-B", publishState: "published", supersededBy: "batch-C" },
          { batchId: "batch-C", publishState: "staged", supersededBy: null },
        ],
      }),
    ).toThrow(/batch-B/);

    // 终态 C 也已发布时 -> 核验通过
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "published", supersededBy: "batch-C" },
          { batchId: "batch-C", publishState: "published", supersededBy: null },
        ],
      }),
    ).not.toThrow();

    // B 已发布但指向缺失的后继 C -> 必须报错并指出缺失批次 C
    expect(() =>
      importerMod.verifyPublishOutcome({
        expectedMonths: ["2024-01"],
        importedBatchIds: ["batch-A"],
        publishResponse: pubOk,
        batchesAfterPublish: [
          { batchId: "batch-A", publishState: "staged", supersededBy: "batch-B" },
          { batchId: "batch-B", publishState: "published", supersededBy: "batch-C-missing" },
        ],
      }),
    ).toThrow(/batch-C-missing/);
  });

  it("[R5 P2-4] local-d1 导入模式将显式 --write-token 传递给本地客户端并在写请求携带 x-admin-token", async () => {
    // @ts-expect-error -- CLI 脚本为无声明 .mjs
    const importerMod = (await import("../../../scripts/import-customs-archive.mjs")) as {
      parseArgs: (argv: string[]) => { target: string; persistDir: string; writeToken: string };
      createHttpClient: (
        apiUrl: string,
        opts?: { writeToken?: string },
      ) => {
        sendMultipart: (pathname: string, form: FormData) => Promise<{ status: number; json: Record<string, unknown> }>;
        sendJson: (pathname: string, method?: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
      };
      createImporterClient: (
        opts: { target: string; apiUrl?: string; persistDir: string; writeToken: string },
        factories?: {
          httpFactory?: (apiUrl: string, opts?: { writeToken?: string }) => unknown;
          localD1Factory?: (persistDir: string, opts?: { writeToken?: string }) => Promise<unknown>;
        },
      ) => Promise<unknown>;
      createLocalD1Client: (
        persistDir: string,
        opts?: { writeToken?: string; extraVars?: string[] },
      ) => Promise<{
        sendJson: (pathname: string, method?: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
        dispose: () => Promise<void>;
      }>;
    };

    // 1) 参数解析与 local-d1 工厂透传 writeToken
    const parsed = importerMod.parseArgs(["--target", "local-d1", "--persist-dir", "/tmp/d1", "--write-token", "tok-local-99"]);
    expect(parsed.target).toBe("local-d1");
    expect(parsed.writeToken).toBe("tok-local-99");

    let capturedLocalArgs: { persistDir: string; writeToken?: string } | null = null;
    await importerMod.createImporterClient(parsed, {
      localD1Factory: async (persistDir, opts) => {
        capturedLocalArgs = { persistDir, writeToken: opts?.writeToken };
        return { ok: true };
      },
    });
    expect(capturedLocalArgs).toEqual({ persistDir: parsed.persistDir, writeToken: "tok-local-99" });

    // 2) createHttpClient 对 multipart 与 JSON 请求均携带 x-admin-token（否则被模拟 403 门禁拒绝）
    const seenTokens: Array<string | undefined> = [];
    const srv = http.createServer((req, res) => {
      const tok = typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"] : undefined;
      seenTokens.push(tok);
      if (tok !== "tok-local-99") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "TRADE_WRITE_DISABLED" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
    try {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const unauth = importerMod.createHttpClient(baseUrl);
      const r403 = await unauth.sendJson("/api/trade/publish", "POST", { dictVersion: "202601" });
      expect(r403.status).toBe(403);

      const auth = importerMod.createHttpClient(baseUrl, { writeToken: "tok-local-99" });
      const form = new FormData();
      form.append("manifest", "{}");
      const rMulti = await auth.sendMultipart("/api/trade/import-bulk", form);
      const rJson = await auth.sendJson("/api/trade/publish", "POST", { dictVersion: "202601" });
      expect(rMulti.status).toBe(200);
      expect(rJson.status).toBe(200);
      expect(seenTokens).toEqual([undefined, "tok-local-99", "tok-local-99"]);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }

    // 3) 真实本地 wrangler dev 配置 TRADE_WRITE_TOKEN 时，createLocalD1Client 携带正确 writeToken 放行，缺省令牌被 403 拦截
    const tmpPersist = fs.mkdtempSync(path.join(os.tmpdir(), "mdes-local-d1-tok-"));
    const tokenVal = "local-d1-test-write-token";
    const clientNoTok = await importerMod.createLocalD1Client(tmpPersist, {
      extraVars: [`TRADE_WRITE_TOKEN:${tokenVal}`],
    });
    try {
      const denied = await clientNoTok.sendJson("/api/trade/publish", "POST", { dictVersion: "202601" });
      expect(denied.status).toBe(403);
    } finally {
      await clientNoTok.dispose();
    }

    const clientWithTok = await importerMod.createLocalD1Client(tmpPersist, {
      writeToken: tokenVal,
      extraVars: [`TRADE_WRITE_TOKEN:${tokenVal}`],
    });
    try {
      const allowed = await clientWithTok.sendJson("/api/trade/publish", "POST", { dictVersion: "202601" });
      expect(allowed.status).not.toBe(403);
      expect((allowed.json?.error as { code?: string } | undefined)?.code).not.toBe("TRADE_WRITE_DISABLED");
    } finally {
      await clientWithTok.dispose();
      try {
        fs.rmSync(tmpPersist, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      } catch {
        // Windows 下 workerd 子进程释放 SQLite 临时文件句柄可能略有延迟
      }
    }
  }, 60_000);
});
