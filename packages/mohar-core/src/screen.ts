import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import type { DnsResolver } from "./dns";
import { parseProofFile } from "./link";
import { evaluateBundle, parseBundle, type Aggregate, type Bundle, type ReasonCode, type Scheme, type SchemeResult } from "./scheme";
import { verifyCertificate, type VerifyDeps } from "./verify";

/** Limits for an uploaded ZIP of applications. A real batch of 1,000 is far below all of them. */
export const ZIP_LIMITS = {
  maxZipBytes: 256 * 1024 * 1024,
  maxEntries: 5000,
  maxEntryBytes: 256 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
} as const;

export interface ScreenItem {
  name: string;
  /** a parsed bundle, or the reason it could not be read (a row error, never a crash) */
  bundle?: Bundle;
  error?: string;
}

/** Read a ZIP of .mohar / .json bundles. Bad entries become row errors; a hostile archive is refused whole. */
export function readZip(data: Uint8Array): ScreenItem[] {
  if (data.length > ZIP_LIMITS.maxZipBytes) throw new Error("zip too large");
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        if (f.name.endsWith("/")) return false;
        count++;
        if (count > ZIP_LIMITS.maxEntries) throw new Error("zip has too many files");
        // declared size is checked BEFORE inflating, so a bomb never expands
        if (f.originalSize > ZIP_LIMITS.maxEntryBytes) return false;
        total += f.originalSize;
        if (total > ZIP_LIMITS.maxTotalBytes) throw new Error("zip expands too large");
        return /\.(mohar|json)$/i.test(f.name);
      },
    });
  } catch (e) {
    throw new Error(`zip refused: ${(e as Error).message}`);
  }
  const items: ScreenItem[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (bytes.length > ZIP_LIMITS.maxEntryBytes) {
      items.push({ name, error: "file too large" });
      continue;
    }
    try {
      items.push({ name, bundle: parseBundle(strFromU8(bytes)) });
    } catch (e) {
      items.push({ name, error: (e as Error).message.slice(0, 160) });
    }
  }
  return items.sort((a, b) => (a.name < b.name ? -1 : 1));
}

export interface ScreenRow {
  name: string;
  aggregate: Aggregate | "ROW_ERROR";
  applicantId?: string;
  /** requirement id -> reason code */
  codes: Record<string, ReasonCode>;
  failed: string[];
  error?: string;
  result?: SchemeResult;
  /** an earlier file in this batch already carries this applicant id: a replayed or copied bundle */
  duplicateOf?: string;
}

export interface ScreenSummary {
  total: number;
  counts: Record<Aggregate | "ROW_ERROR", number>;
  ms: number;
  perSecond: number;
  block?: number;
  duplicates: number;
}

/** Memoise DNS per (domain, identity): a bulk run asks about a handful of issuers, not 3,000 times. */
export function memoDns(inner: DnsResolver): DnsResolver {
  const cache = new Map<string, ReturnType<DnsResolver>>();
  return (domain, identity) => {
    const k = `${domain}|${identity.toLowerCase()}`;
    let p = cache.get(k);
    if (!p) {
      p = inner(domain, identity);
      cache.set(k, p);
    }
    return p;
  };
}

/** Fixed-size worker pool. Order of results follows the input. */
async function pool<T, R>(items: T[], size: number, fn: (t: T, i: number) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
        onDone?.(++done);
      }
    }),
  );
  return out;
}

export interface ScreenOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Screen many applications. `deps` should carry a pinned reader (see makeReader `pinMs`) and a memoised DNS resolver. */
export async function screenBundles(items: ScreenItem[], scheme: Scheme, deps: VerifyDeps, opts: ScreenOptions = {}) {
  const t0 = Date.now();
  const rows = await pool(
    items,
    opts.concurrency ?? 24,
    async (it): Promise<ScreenRow> => {
      if (!it.bundle) return { name: it.name, aggregate: "ROW_ERROR", codes: {}, failed: [], error: it.error ?? "unreadable" };
      try {
        const r = await evaluateBundle(it.bundle, scheme, deps);
        return {
          name: it.name,
          aggregate: r.aggregate,
          applicantId: r.applicantId,
          codes: Object.fromEntries(r.requirements.map((q) => [q.id, q.code])),
          failed: r.failed,
          result: r,
        };
      } catch (e) {
        return { name: it.name, aggregate: "ROW_ERROR", codes: {}, failed: [], error: (e as Error).message.slice(0, 160) };
      }
    },
    (d) => opts.onProgress?.(d, items.length),
  );
  markDuplicates(rows);
  const ms = Date.now() - t0;
  const counts: ScreenSummary["counts"] = { ELIGIBLE: 0, NOT_ELIGIBLE: 0, INVALID: 0, INCOMPLETE: 0, UNREACHABLE: 0, ROW_ERROR: 0 };
  for (const r of rows) counts[r.aggregate]++;
  const block = rows.find((r) => r.result?.chainTime)?.result?.chainTime?.block;
  const summary: ScreenSummary = { total: rows.length, counts, ms, perSecond: rows.length / Math.max(ms / 1000, 0.001), block, duplicates: rows.filter((r) => r.duplicateOf).length };
  return { rows, summary };
}

/**
 * One person, one application. A valid bundle can be copied and handed in again under another file name, which
 * cryptography cannot stop (it is genuinely valid). What we can do is say so: the second file is flagged with the first.
 */
export function markDuplicates(rows: ScreenRow[]): void {
  const first = new Map<string, string>();
  for (const r of rows) {
    if (!r.applicantId) continue;
    const seen = first.get(r.applicantId);
    if (seen) r.duplicateOf = seen;
    else first.set(r.applicantId, r.name);
  }
}

/** Generic mode: a ZIP of single proof files, one verdict each. */
export async function screenProofFiles(files: { name: string; json: string }[], deps: VerifyDeps, opts: ScreenOptions = {}) {
  return pool(
    files,
    opts.concurrency ?? 24,
    async (f) => {
      try {
        const r = await verifyCertificate({ file: parseProofFile(f.json) }, deps);
        return { name: f.name, verdict: r.verdict as string };
      } catch (e) {
        return { name: f.name, verdict: "ROW_ERROR", error: (e as Error).message.slice(0, 160) };
      }
    },
    (d) => opts.onProgress?.(d, files.length),
  );
}

// ------------------------------------------------------------------ report

/** A cell that a spreadsheet could execute as a formula is neutralised with a leading apostrophe; quotes are escaped. */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV report. Holds verdicts and reason codes only: no names, no income, no addresses. */
export function reportCsv(rows: ScreenRow[], scheme: Scheme): string {
  const head = ["file", "applicant_id", "verdict", "duplicate_of", "failed_requirements", ...scheme.requirements.map((r) => `code_${r.id}`), "error"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, r.applicantId, r.aggregate, r.duplicateOf, r.failed.join(" "), ...scheme.requirements.map((q) => r.codes[q.id] ?? ""), r.error].map(csvCell).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Test / seeding helper: pack text files into a ZIP. */
export function makeZip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
