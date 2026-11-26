import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { validateTradeBulkManifest, validateTradeManifest } from "../src/trade";

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
    const importerHref = pathToFileURL(path.resolve(here, "../../../scripts/import-customs-archive.mjs")).href;
    const importerMod = (await import(importerHref)) as {
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
    const importerHref = pathToFileURL(path.resolve(here, "../../../scripts/import-customs-archive.mjs")).href;
    const importerMod = (await import(importerHref)) as {
      verifyArchiveEntryIntegrity: (entry: {
        mfPath: string;
        manifestObj: Record<string, unknown>;
        months: string[];
      }) => { expectedSourceSha256: string; expectedDetailRowCount: number | null };
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
          inspection: { detailRowCount: 2 },
        }),
      );

      // 完整一致的归档文件通过核验
      const ok = importerMod.verifyArchiveEntryIntegrity({ mfPath, manifestObj, months: ["2024-01"] });
      expect(ok.expectedSourceSha256).toBe(fullSha);
      expect(ok.expectedDetailRowCount).toBe(2);

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

      // [P2-7] 字典摘要在 LF 与 CRLF 换行下均精确匹配 EXPECTED_DICT_SHA256
      const manifestToolHref = pathToFileURL(path.resolve(here, "../../../scripts/trade-collection-manifest.mjs")).href;
      const manifestTool = (await import(manifestToolHref)) as {
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
});
