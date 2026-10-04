import type { CertInput } from "./certinput";

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const CSV_COLUMNS = ["recipient_name", "recipient_email", "title", "grade", "issued_on", "expires_on"] as const;
const REQUIRED = ["recipient_name", "title", "issued_on"] as const;

/**
 * Cells that Excel / Sheets / LibreOffice would evaluate as a formula (=, +, -, @, tab, CR). A recipient called
 * =HYPERLINK("http://evil",...) must open as text in the manifest, so these get a leading apostrophe.
 */
export const FORMULA_START = /^[=+\-@\t\r]/;
export const csvEscape = (raw: string) => {
  const v = FORMULA_START.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** Hard ceiling on rows we will even parse, so a hostile or accidental 5-million-row file cannot freeze the tab. */
export const MAX_PARSE_ROWS = 20_000;

/** Decode CSV bytes as strict UTF-8 (or UTF-16 with a BOM). Never silently turns bad bytes into U+FFFD names. */
export function decodeCsvBytes(buf: ArrayBuffer): { text: string } | { error: string } {
  const b = new Uint8Array(buf);
  try {
    if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le", { fatal: true }).decode(b) };
    if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder("utf-16be", { fatal: true }).decode(b) };
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b) };
  } catch {
    return { error: "This file is not valid UTF-8 text, so names could be corrupted. In Excel choose Save As, CSV UTF-8, and upload that." };
  }
}

export const TEMPLATE_CSV = [
  CSV_COLUMNS.join(","),
  "Ananya Rao,ananya@example.com,B.E. in Artificial Intelligence,8.72 CGPA,2026-06-01,",
  'Imran Sheikh,imran@example.com,"Diploma in Cloud Computing, Level 2",First Class,2026-06-01,2031-06-01',
].join("\n");

export type BulkRow = CertInput & { key: number; /** cells beyond the header width (an unquoted comma shifted the columns) */ extra?: number };

/** Row-level problems about the row as a whole: shifted columns and exact duplicates. Indexed like `rows`. */
export function rowIssues(rows: BulkRow[]): (string | undefined)[] {
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    if (r.extra) return `This row has ${r.extra} extra column${r.extra > 1 ? "s" : ""}. A comma inside a value needs the value wrapped in double quotes.`;
    const k = [r.name, r.email, r.title, r.issuedOn].map((x) => x.trim().toLowerCase().normalize("NFC")).join("|");
    const first = seen.get(k);
    if (first !== undefined) return `Duplicate of row ${first + 1}: same recipient, email, title and issue date.`;
    seen.set(k, i);
    return undefined;
  });
}

export function rowsFromCsv(text: string): { rows: BulkRow[] } | { error: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "This file is empty. Download the template to see the expected columns." };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must be a header such as ${CSV_COLUMNS.join(", ")}.` };
  const idx = (c: string) => header.indexOf(c);
  const get = (r: string[], c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
  if (table.length - 1 > MAX_PARSE_ROWS)
    return { error: `This file has ${(table.length - 1).toLocaleString("en-IN")} rows. The most we can read is ${MAX_PARSE_ROWS.toLocaleString("en-IN")}; split it into smaller files.` };
  const rows = table.slice(1).map<BulkRow>((r, i) => ({
    key: i,
    extra: r.filter((c, j) => j >= header.length && c.trim() !== "").length,
    name: get(r, "recipient_name"),
    email: get(r, "recipient_email"),
    title: get(r, "title"),
    grade: get(r, "grade"),
    issuedOn: get(r, "issued_on"),
    expiresOn: get(r, "expires_on"),
  }));
  if (rows.length === 0) return { error: "The file has a header but no certificate rows." };
  return { rows };
}
