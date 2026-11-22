import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./helpers/harness";

const here = path.dirname(fileURLToPath(import.meta.url));
const DICT_CSV_PATH = path.resolve(here, "../../../data/hs_dict_202601.csv");
const GOLD_JSON_PATH = path.resolve(here, "../../../data/gold_standard_2024_37_hs8.json");
const GOLD_XLSX_PATH = path.resolve(here, "../../../../docs/我国海关平台-2024年度仪器仪表海关进出口年度数据统计.xlsx");

const MINIMAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

type GoldItem = {
  hs8: string;
  rowNumber: number;
  importUsd: number;
  exportUsd: number | null;
};

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function loadGoldStandardSheet1(dictHs8Set: Set<string>): GoldItem[] {
  const snapshot = JSON.parse(fs.readFileSync(GOLD_JSON_PATH, "utf8")) as { items: GoldItem[] };
  if (!fs.existsSync(GOLD_XLSX_PATH)) {
    return snapshot.items.filter((it) => dictHs8Set.has(it.hs8));
  }
  const buf = fs.readFileSync(GOLD_XLSX_PATH);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const total = buf.readUInt16LE(eocd + 10);
  let cd = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; slice: Buffer }>();
  for (let i = 0; i < total; i++) {
    const method = buf.readUInt16LE(cd + 10);
    const compSize = buf.readUInt32LE(cd + 20);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const localOff = buf.readUInt32LE(cd + 42);
    const name = buf.subarray(cd + 46, cd + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    entries.set(name, { method, slice: buf.subarray(start, start + compSize) });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  const readXml = (name: string) => {
    const e = entries.get(name);
    if (!e) return "";
    return (e.method === 8 ? zlib.inflateRawSync(e.slice) : e.slice).toString("utf8");
  };

  const sst: string[] = [];
  const sstXml = readXml("xl/sharedStrings.xml");
  for (const m of sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const tm of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
      text += unescapeXml(tm[1]);
    }
    sst.push(text);
  }

  const sheetXml = readXml("xl/worksheets/sheet1.xml");
  const out: GoldItem[] = [];
  for (const rm of sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rm[1]);
    const cells: Record<string, string> = {};
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = /\br="([A-Z]+)\d+"/.exec(cm[1])?.[1];
      if (!col) continue;
      const t = /\bt="([^"]+)"/.exec(cm[1])?.[1] ?? "";
      const vm = /<v>([\s\S]*?)<\/v>/.exec(cm[2] ?? "");
      if (t === "s" && vm) cells[col] = sst[Number(vm[1])] ?? "";
      else if (vm) cells[col] = unescapeXml(vm[1]);
    }
    const code = (cells["B"] ?? "").trim();
    if (/^\d{8}$/.test(code) && dictHs8Set.has(code)) {
      const impRaw = (cells["H"] ?? "").trim();
      const expRaw = (cells["N"] ?? "").trim();
      out.push({
        hs8: code,
        rowNumber,
        importUsd: Number(impRaw),
        exportUsd: expRaw === "" ? null : Number(expRaw),
      });
    }
  }
  expect(out).toEqual(snapshot.items);
  return out;
}

function splitAnnualAcross12Months(total: number): number[] {
  const base = Math.floor(total / 12);
  const rem = total - base * 12;
  return Array.from({ length: 12 }, (_, idx) => (idx < rem ? base + 1 : base));
}

describe("G5 / AC-017：164 税号 11 类字典核验、覆盖矩阵登记与 37 重合码年度金标准逐项对账", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 30_000);

  afterAll(async () => {
    await h?.dispose();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it(
    "核验 202601 字典（164 HS8 / 117 HS6 / 11 类 / SHA-256 / 901819 跨类）与回填覆盖表（含历史年份当年不适用目录依据）",
    async () => {
      const rawDictBytes = fs.readFileSync(DICT_CSV_PATH);
      const actualDictSha = createHash("sha256").update(rawDictBytes).digest("hex");
      expect(actualDictSha).toBe("ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b");

      // 1) 空库查询 2024 年覆盖矩阵：164 × 12 × 2 × 4 = 15,744 格全为 missing
      const cov2024Res = await h.request("/api/trade/coverage?year=2024");
      expect(cov2024Res.status).toBe(200);
      const cov2024 = (await cov2024Res.json()) as {
        dictVersion: string;
        dictSha256: string;
        hs8Count: number;
        hs6Count: number;
        categoryCount: number;
        monthCount: number;
        summary: {
          totalCells: number;
          received: number;
          confirmedEmpty: number;
          missing: number;
          notApplicable: number;
          publishableMonths: number;
          publishedMonths: number;
        };
      };
      expect(cov2024.dictVersion).toBe("202601");
      expect(cov2024.dictSha256).toBe("ab8e97496fbc9500877f02adc61ab214788f79234b9cb1f565a98f77a683a59b");
      expect(cov2024.hs8Count).toBe(164);
      expect(cov2024.hs6Count).toBe(117);
      expect(cov2024.categoryCount).toBe(11);
      expect(cov2024.monthCount).toBe(12);
      expect(cov2024.summary).toEqual({
        totalCells: 15_744,
        received: 0,
        confirmedEmpty: 0,
        missing: 15_744,
        notApplicable: 0,
        publishableMonths: 0,
        publishedMonths: 0,
      });

      // 2) 回填范围 2024-01 至最近完整月 2026-10（34 个自然月 × 164 × 8 = 44,608 格）
      const backfillRes = await h.request("/api/trade/coverage?fromMonth=2024-01&toMonth=2026-10");
      expect(backfillRes.status).toBe(200);
      const backfill = (await backfillRes.json()) as typeof cov2024;
      expect(backfill.monthCount).toBe(34);
      expect(backfill.summary.totalCells).toBe(164 * 34 * 2 * 4);
      expect(backfill.summary.missing).toBe(44_608);

      // 3) 历史年份当年不适用登记：将 90222190 在 2023 年标为 applicable=0 并附目录依据，核验覆盖表与 163 码整月发布
      await h.sql([
        `INSERT INTO trade_hs_year_applicability (dict_version, year, hs8, applicable, basis_note)
         VALUES ('202601', 2023, '90222190', 0, '2023年版进出口税则尚未单列该八位子目')`,
      ]);

      const cov2023Res = await h.request("/api/trade/coverage?year=2023&hs8=90222190");
      expect(cov2023Res.status).toBe(200);
      const cov2023 = (await cov2023Res.json()) as typeof cov2024 & {
        cells: Array<{ month: string; hs8: string; status: string; basis: string | null }>;
      };
      expect(cov2023.summary).toEqual({
        totalCells: 15_744,
        received: 0,
        confirmedEmpty: 0,
        missing: 163 * 12 * 2 * 4,
        notApplicable: 1 * 12 * 2 * 4,
        publishableMonths: 0,
        publishedMonths: 0,
      });
      expect(cov2023.cells).toHaveLength(96);
      expect(cov2023.cells.every((c) => c.status === "notApplicable" && c.basis === "2023年版进出口税则尚未单列该八位子目")).toBe(true);
    },
    30_000,
  );

  it(
    "全量 164 税号 2024 年 12 个月入库发布：核验 15,744 格零缺采（含官网无记录 PNG 举证）并逐项复核金标准 37 项进口与 36 项已知出口",
    async () => {
      const dictLines = fs
        .readFileSync(DICT_CSV_PATH, "utf8")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(1)
        .map((line) => {
          const cols = line.split(",");
          return {
            category: cols[1].trim(),
            name: cols[2].trim(),
            hs8: cols[3].trim(),
            hs6: cols[4].trim(),
          };
        });
      expect(dictLines).toHaveLength(164);

      // 核验 901819 八位子目分属“医用诊断装备”与“生命支持装备”
      const split901819 = dictLines.filter((d) => d.hs6 === "901819");
      expect(new Set(split901819.map((d) => d.category))).toEqual(new Set(["医用诊断装备", "生命支持装备"]));

      const allHs8Set = new Set(dictLines.map((d) => d.hs8));
      const goldItems = loadGoldStandardSheet1(allHs8Set);
      expect(goldItems).toHaveLength(37);

      const goldImportSum = goldItems.reduce((acc, g) => acc + g.importUsd, 0);
      const knownExportItems = goldItems.filter((g) => g.exportUsd !== null);
      const goldExportSum = knownExportItems.reduce((acc, g) => acc + (g.exportUsd ?? 0), 0);
      expect(goldImportSum).toBe(17_410_795_225);
      expect(knownExportItems).toHaveLength(36);
      expect(goldExportSum).toBe(13_792_423_197);

      const special90222190 = goldItems.find((g) => g.hs8 === "90222190");
      expect(special90222190).toEqual({
        hs8: "90222190",
        rowNumber: 126,
        importUsd: 5_215_518,
        exportUsd: null,
      });

      const nameMap = new Map(dictLines.map((d) => [d.hs8, d.name]));
      const impSchedule = new Map(goldItems.map((g) => [g.hs8, splitAnnualAcross12Months(g.importUsd)]));
      const expSchedule = new Map(knownExportItems.map((g) => [g.hs8, splitAnnualAcross12Months(g.exportUsd!)]));

      const impActiveCodes = goldItems.map((g) => g.hs8);
      const impEmptyCodes = dictLines.map((d) => d.hs8).filter((c) => !impSchedule.has(c));
      const expActiveCodes = knownExportItems.map((g) => g.hs8);
      const expEmptyCodes = dictLines.map((d) => d.hs8).filter((c) => !expSchedule.has(c));

      expect(impActiveCodes).toHaveLength(37);
      expect(impEmptyCodes).toHaveLength(127);
      expect(expActiveCodes).toHaveLength(36);
      expect(expEmptyCodes).toHaveLength(128);

      const buildCsv = (
        codes: string[],
        schedule: Map<string, number[]>,
        mIdx: number,
        grouping: "product" | "partner" | "regime" | "region",
      ) => {
        if (grouping === "product") {
          const rows = ["商品编码,商品名称,第一数量,第一计量单位,第二数量,第二计量单位,美元"];
          for (const hs8 of codes) {
            const usd = schedule.get(hs8)![mIdx];
            rows.push(`${hs8},${nameMap.get(hs8)},10,台,50,千克,${usd}`);
          }
          return rows.join("\n");
        }
        const header =
          grouping === "partner"
            ? "商品编码,商品名称,贸易伙伴编码,贸易伙伴名称,美元"
            : grouping === "regime"
              ? "商品编码,商品名称,贸易方式编码,贸易方式名称,美元"
              : "商品编码,商品名称,收发货人注册地编码,收发货人注册地名称,美元";
        const rows = [header];
        const [c1, n1, c2, n2] =
          grouping === "partner"
            ? ["502", "美国", "304", "德国"]
            : grouping === "regime"
              ? ["10", "一般贸易", "14", "进料加工贸易"]
              : ["4403", "广东深圳", "3100", "上海市"];
        for (const hs8 of codes) {
          const usd = schedule.get(hs8)![mIdx];
          const p1 = Math.floor(usd * 0.6);
          const p2 = usd - p1;
          rows.push(`${hs8},${nameMap.get(hs8)},${c1},${n1},${p1}`);
          rows.push(`${hs8},${nameMap.get(hs8)},${c2},${n2},${p2}`);
        }
        return rows.join("\n");
      };

      const groupings = ["product", "partner", "regime", "region"] as const;
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const month = `2024-${String(mIdx + 1).padStart(2, "0")}`;
        for (const grouping of groupings) {
          // (a) 进口：37 个有值税号 CSV + 127 个无记录税号 PNG 证据
          const fdImpCsv = new FormData();
          fdImpCsv.set(
            "manifest",
            JSON.stringify({
              dictVersion: "202601",
              month,
              flow: "import",
              currency: "USD",
              grouping,
              hs8: impActiveCodes,
              emptyHs8: [],
            }),
          );
          fdImpCsv.set("file", new File([buildCsv(impActiveCodes, impSchedule, mIdx, grouping)], `fixture_${month}_imp_${grouping}.csv`, { type: "text/csv" }));
          const r1 = await h.request("/api/trade/import", { method: "POST", body: fdImpCsv });
          expect(r1.status).toBe(200);

          const fdImpEmpty = new FormData();
          fdImpEmpty.set(
            "manifest",
            JSON.stringify({
              dictVersion: "202601",
              month,
              flow: "import",
              currency: "USD",
              grouping,
              hs8: impEmptyCodes,
              emptyHs8: impEmptyCodes,
            }),
          );
          fdImpEmpty.set("emptyEvidence", new File([MINIMAL_PNG], `empty_${month}_imp_${grouping}.png`, { type: "image/png" }));
          const r2 = await h.request("/api/trade/import", { method: "POST", body: fdImpEmpty });
          expect(r2.status).toBe(200);

          // (b) 出口：36 个有值税号 CSV + 128 个无记录税号 PNG 证据
          const fdExpCsv = new FormData();
          fdExpCsv.set(
            "manifest",
            JSON.stringify({
              dictVersion: "202601",
              month,
              flow: "export",
              currency: "USD",
              grouping,
              hs8: expActiveCodes,
              emptyHs8: [],
            }),
          );
          fdExpCsv.set("file", new File([buildCsv(expActiveCodes, expSchedule, mIdx, grouping)], `fixture_${month}_exp_${grouping}.csv`, { type: "text/csv" }));
          const r3 = await h.request("/api/trade/import", { method: "POST", body: fdExpCsv });
          expect(r3.status).toBe(200);

          const fdExpEmpty = new FormData();
          fdExpEmpty.set(
            "manifest",
            JSON.stringify({
              dictVersion: "202601",
              month,
              flow: "export",
              currency: "USD",
              grouping,
              hs8: expEmptyCodes,
              emptyHs8: expEmptyCodes,
            }),
          );
          fdExpEmpty.set("emptyEvidence", new File([MINIMAL_PNG], `empty_${month}_exp_${grouping}.png`, { type: "image/png" }));
          const r4 = await h.request("/api/trade/import", { method: "POST", body: fdExpEmpty });
          expect(r4.status).toBe(200);
        }
      }

      // 核验 2024 年覆盖矩阵：37*12*4 + 36*12*4 = 3,504 received，127*12*4 + 128*12*4 = 12,240 confirmedEmpty，0 missing
      const covAfterRes = await h.request("/api/trade/coverage?year=2024&hs8=30061000");
      expect(covAfterRes.status).toBe(200);
      const covAfter = (await covAfterRes.json()) as {
        summary: {
          totalCells: number;
          received: number;
          confirmedEmpty: number;
          missing: number;
          notApplicable: number;
          publishableMonths: number;
          publishedMonths: number;
        };
        cells: Array<{ status: string; batchId: string | null; evidenceSha256: string | null }>;
      };
      expect(covAfter.summary).toEqual({
        totalCells: 15_744,
        received: 3_504,
        confirmedEmpty: 12_240,
        missing: 0,
        notApplicable: 0,
        publishableMonths: 12,
        publishedMonths: 12,
      });
      expect(covAfter.cells).toHaveLength(96);
      expect(covAfter.cells.every((c) => c.status === "confirmedEmpty" && Boolean(c.batchId) && Boolean(c.evidenceSha256))).toBe(true);

      // 核验 2024 年度发布快照：11 个一级类别顺序一致、164 个 HS8 齐全、37 重合码进口与 36 已知出口逐项零误差
      const ovRes = await h.request("/api/trade/overview?period=2024");
      expect(ovRes.status).toBe(200);
      const ov = (await ovRes.json()) as {
        status: string;
        totals: { importUsd: number; exportUsd: number; balanceUsd: number };
        categories: Array<{ category: string; hs8Count: number }>;
        hsItems: Array<{ hs8: string; category: string; importUsd: number; exportUsd: number }>;
      };
      expect(ov.status).toBe("published");
      expect(ov.categories.map((c) => c.category)).toEqual([
        "医用诊断装备",
        "治疗装备",
        "生命支持装备",
        "急救与应急专用装备",
        "康复医疗装备",
        "IVD",
        "植介入器械",
        "专科医疗器械",
        "医用耗材及无源器械",
        "感染防护与医院配套",
        "其他",
      ]);
      expect(ov.hsItems).toHaveLength(164);
      expect(ov.totals.importUsd).toBe(17_410_795_225);
      expect(ov.totals.exportUsd).toBe(13_792_423_197);

      const hsByCode = new Map(ov.hsItems.map((it) => [it.hs8, it]));
      expect(hsByCode.get("90181930")?.category).toBe("生命支持装备");
      expect(hsByCode.get("90181941")?.category).toBe("医用诊断装备");

      for (const g of goldItems) {
        const item = hsByCode.get(g.hs8);
        expect(item, `missing hs8 ${g.hs8}`).toBeTruthy();
        expect(item!.importUsd).toBe(g.importUsd);
        if (g.exportUsd !== null) {
          expect(item!.exportUsd).toBe(g.exportUsd);
        }
      }
    },
    60_000,
  );
});
