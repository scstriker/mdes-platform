export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type CsvRow = {
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
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "empty csv" }] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const key of REQUIRED) {
    if (!headers.includes(key)) {
      return {
        rows: [],
        errors: [{ line: 1, message: `missing required header: ${key}` }],
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

  dataLines.forEach((line, idx) => {
    const lineNo = idx + 2;
    const cols = splitCsvLine(line);
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
