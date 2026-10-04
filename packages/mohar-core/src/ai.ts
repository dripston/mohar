import { parseScheme, type Scheme } from "./scheme";

/**
 * AI assists. The rule that matters: an AI NEVER produces or changes a verdict. Nothing in this file is imported by
 * the verification pipeline (verify.ts, scheme.ts, merkle.ts); the model only drafts text that a human must read,
 * edit and confirm before it is used, and the draft is checked against a strict schema first. Cryptographic checks
 * do all the verifying afterwards.
 */

export const AI_LIMITS = { maxInputChars: 6000, maxOutputChars: 12000, maxRows: 200, maxImageBytes: 4 * 1024 * 1024 } as const;

/** Flags the demo credential templates can actually carry. A requirement on any other flag can never be met. */
export const KNOWN_FLAGS = ["flags.enrolment_active", "flags.st_category", "flags.income_lte_250000", "flags.income_lte_600000"] as const;

export const SCHEME_SYSTEM_PROMPT = `You turn scholarship eligibility text into a JSON checklist. Output ONLY one JSON object, no prose.
Schema: {"id": string, "name": string, "requirements": [{"id": string, "label": string, "credentialType": "enrolment"|"caste"|"income", "issuerType": "INSTITUTE"|"REVENUE_OFFICE"|"EMPLOYER"|"OTHER", "flagsTrue": string[]}]}
Rules: flagsTrue entries must look like "flags.<name>". Available flags: ${KNOWN_FLAGS.join(", ")}.
enrolment credentials come from an INSTITUTE; caste and income credentials come from a REVENUE_OFFICE.
Do not invent requirements the text does not state. Keep each label under 100 characters.`;

export const EXTRACT_SYSTEM_PROMPT = `You read scanned or typed paper certificates and list what is printed. Output ONLY one JSON object: {"rows":[{"recipient_name":string,"recipient_email":string,"title":string,"grade":string,"issued_on":"YYYY-MM-DD","expires_on":"YYYY-MM-DD"|""}]}.
One row per certificate. If a value is not printed, use an empty string. Never guess a name or a date.`;

/** Models sometimes wrap JSON in ``` fences or add a sentence around it. Pull out the first balanced object. */
export function extractJson(text: string): unknown {
  if (typeof text !== "string" || text.length > AI_LIMITS.maxOutputChars) throw new Error("AI output too large or not text");
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  if (start < 0) throw new Error("AI output contains no JSON object");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error("AI output JSON is incomplete");
}

export type DraftResult = { ok: true; scheme: Scheme; warnings: string[] } | { ok: false; error: string };

/** A proposed checklist is either a valid Scheme or an error. It is never applied automatically. */
export function validateSchemeDraft(raw: string): DraftResult {
  try {
    const scheme = parseScheme(extractJson(raw));
    const warnings: string[] = [];
    for (const r of scheme.requirements) {
      for (const f of r.flagsTrue) if (!(KNOWN_FLAGS as readonly string[]).includes(f)) warnings.push(`${r.id}: no credential template carries the flag ${f}, so this requirement can never pass.`);
      const want = { enrolment: "INSTITUTE", caste: "REVENUE_OFFICE", income: "REVENUE_OFFICE" }[r.credentialType];
      if (r.issuerType !== want) warnings.push(`${r.id}: ${r.credentialType} credentials are normally issued by ${want}, not ${r.issuerType}.`);
    }
    return { ok: true, scheme, warnings };
  } catch (e) {
    return { ok: false, error: `The AI draft was rejected: ${(e as Error).message}` };
  }
}

export interface ExtractedRow {
  recipient_name: string;
  recipient_email: string;
  title: string;
  grade: string;
  issued_on: string;
  expires_on: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, "").trim().slice(0, n) : "");

/** Rows read from a scan. Every row still needs a human tick before anything is signed. */
export function validateExtractedRows(raw: string): { ok: true; rows: ExtractedRow[] } | { ok: false; error: string } {
  try {
    const j = extractJson(raw) as { rows?: unknown };
    if (!Array.isArray(j.rows)) throw new Error('no "rows" array');
    if (j.rows.length > AI_LIMITS.maxRows) throw new Error("too many rows");
    const rows = j.rows.map((r: any, i: number) => {
      if (!r || typeof r !== "object") throw new Error(`row ${i + 1} is not an object`);
      const row: ExtractedRow = {
        recipient_name: clip(r.recipient_name, 120),
        recipient_email: clip(r.recipient_email, 120),
        title: clip(r.title, 160),
        grade: clip(r.grade, 60),
        issued_on: clip(r.issued_on, 10),
        expires_on: clip(r.expires_on, 10),
      };
      if (!row.recipient_name || !row.title) throw new Error(`row ${i + 1} has no name or title`);
      if (!DATE.test(row.issued_on) || Number.isNaN(Date.parse(row.issued_on))) throw new Error(`row ${i + 1} has no valid issue date`);
      if (row.expires_on && (!DATE.test(row.expires_on) || Number.isNaN(Date.parse(row.expires_on)))) throw new Error(`row ${i + 1} has a bad expiry date`);
      return row;
    });
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: `The AI extraction was rejected: ${(e as Error).message}` };
  }
}
