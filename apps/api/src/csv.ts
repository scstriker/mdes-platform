// What JSON.parse can return. Typing `dims` this way (rather than as
// Record<string, unknown>) lets postgres' sql.json() accept it.
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type CsvRow = {
  /** 1-based line in the original CSV text, counting blank lines. */
  line: number;
  indicator_id: string;
  period: string;
  geo: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  dims: JsonObject;
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
};

const REQUIRED = ["indicator_id", "period"] as const;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseObservationCsv(text: string, maxRows = 5000): CsvParseResult {
  // Number lines before dropping blank ones, so reported line numbers match
  // the uploaded file.
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l, idx) => ({ content: l.trimEnd(), lineNo: idx + 1 }))
    .filter((l) => l.content.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "empty csv" }] };
  }

  const header = lines[0];
  const headers = splitCsvLine(header.content).map((h) => h.trim().toLowerCase());
  for (const key of REQUIRED) {
    if (!headers.includes(key)) {
      return {
        rows: [],
        errors: [{ line: header.lineNo, message: `missing required header: ${key}` }],
      };
    }
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > maxRows) {
    return {
      rows: [],
      errors: [{ line: 0, message: `row limit exceeded: ${dataLines.length} > ${maxRows}` }],
    };
  }

  const rows: CsvRow[] = [];
  const errors: { line: number; message: string }[] = [];

  dataLines.forEach(({ content, lineNo }) => {
    const cols = splitCsvLine(content);
    const get = (name: string) => {
      const i = headers.indexOf(name);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };

    const indicator_id = get("indicator_id");
    const period = get("period");
    if (!indicator_id || !period) {
      errors.push({ line: lineNo, message: "indicator_id and period are required" });
      return;
    }

    const rawNum = get("value_num");
    let value_num: number | null = null;
    if (rawNum !== "") {
      const n = Number(rawNum);
      if (Number.isNaN(n)) {
        errors.push({ line: lineNo, message: `invalid value_num: ${rawNum}` });
        return;
      }
      value_num = n;
    }

    const rawDims = get("dims");
    let dims: JsonObject = {};
    if (rawDims) {
      try {
        const parsed = JSON.parse(rawDims);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          dims = parsed as JsonObject;
        } else {
          errors.push({ line: lineNo, message: "dims must be a JSON object" });
          return;
        }
      } catch {
        errors.push({ line: lineNo, message: "dims is not valid JSON" });
        return;
      }
    }

    const value_text = get("value_text") || null;
    if (value_num === null && !value_text) {
      errors.push({ line: lineNo, message: "either value_num or value_text is required" });
      return;
    }

    rows.push({
      line: lineNo,
      indicator_id,
      period,
      geo: get("geo") || "CN",
      value_num,
      value_text,
      unit: get("unit") || "",
      dims,
    });
  });

  return { rows, errors };
}
