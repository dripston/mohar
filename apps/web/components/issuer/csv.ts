import type { CertInput } from "./lib";

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

export const csvEscape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const TEMPLATE_CSV = [
  CSV_COLUMNS.join(","),
  "Ananya Rao,ananya@example.com,B.E. in Artificial Intelligence,8.72 CGPA,2026-06-01,",
  'Imran Sheikh,imran@example.com,"Diploma in Cloud Computing, Level 2",First Class,2026-06-01,2031-06-01',
].join("\n");

export type BulkRow = CertInput & { key: number };

export function rowsFromCsv(text: string): { rows: BulkRow[] } | { error: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "This file is empty. Download the template to see the expected columns." };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must be a header such as ${CSV_COLUMNS.join(", ")}.` };
  const idx = (c: string) => header.indexOf(c);
  const get = (r: string[], c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
  const rows = table.slice(1).map<BulkRow>((r, i) => ({
    key: i,
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
