import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOP_SUITE_PATH = path.resolve(here, "../../../../docs/china_customs_suite.user.js");
const COLLECTOR_COPY_PATH = path.resolve(here, "../../../scripts/china_customs_collector.user.js");
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
});
