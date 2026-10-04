import type { Address } from "viem";
import type { IssuerKind } from "./chain";
import { discloseFields } from "./merkle";
import { parseProofFile, parseShare } from "./link";
import { verifyCertificate, type Verdict, type VerifyDeps, type VerifyResult } from "./verify";
import type { ProofFile, ShareMeta } from "./types";

/**
 * Scholarship layer. Everything here is DEMO: synthetic people, demo issuers, a demo scheme.
 * Flags like `flags.income_lte_250000` are salted leaves INSIDE the normal Merkle tree, attested by the issuer.
 * They are NOT zero knowledge: the verifier trusts the issuer that the flag is true, and learns nothing else.
 */

export type CredentialType = "enrolment" | "caste" | "income";

export const TYPE_PATH = "credential.type";
export const APPLICANT_PATH = "recipient.applicantId";

// ------------------------------------------------------------------ templates (synthetic)

export interface TemplateBase {
  issuer: { address: Address; domain: string; name: string };
  applicantId: string;
  name: string;
  issuedOn: string;
  expiresOn: string | null;
}

/** Enrolment Certificate: issued by an Institute. */
export function enrolmentDoc(b: TemplateBase, x: { instituteId: string; course: string; year: string; active: boolean }) {
  return {
    version: "mohar/1" as const,
    issuer: b.issuer,
    recipient: { name: b.name, applicantId: b.applicantId },
    credential: { type: "enrolment", title: "Enrolment Certificate (DEMO)", issuedOn: b.issuedOn, expiresOn: b.expiresOn, instituteId: x.instituteId, course: x.course, year: x.year },
    flags: { enrolment_active: x.active },
  };
}

/** Caste Certificate: issued by a Revenue Office. Carries a flag leaf for ST status (synthetic). */
export function casteDoc(b: TemplateBase, x: { category: "ST" | "SC" | "OBC" | "GEN"; officerRank: string }) {
  return {
    version: "mohar/1" as const,
    issuer: b.issuer,
    recipient: { name: b.name, applicantId: b.applicantId },
    credential: { type: "caste", title: "Caste Certificate (DEMO)", issuedOn: b.issuedOn, expiresOn: b.expiresOn, category: x.category, officerRank: x.officerRank },
    flags: { st_category: x.category === "ST" },
  };
}

export const INCOME_THRESHOLDS = [250000, 600000] as const;

/** Income Certificate: issued by a Revenue Office. The figure is private; only the threshold flags are meant to be shared. */
export function incomeDoc(b: TemplateBase, x: { income: number }) {
  const flags: Record<string, boolean> = {};
  for (const t of INCOME_THRESHOLDS) flags[`income_lte_${t}`] = x.income <= t;
  return {
    version: "mohar/1" as const,
    issuer: b.issuer,
    recipient: { name: b.name, applicantId: b.applicantId },
    credential: { type: "income", title: "Income Certificate (DEMO)", issuedOn: b.issuedOn, expiresOn: b.expiresOn, income: String(x.income), address: "synthetic address, not real" },
    flags,
  };
}

// ------------------------------------------------------------------ scheme checklist

export interface Requirement {
  id: string;
  label: string;
  credentialType: CredentialType;
  issuerType: IssuerKind;
  /** every named flag must be disclosed, proven and equal to true */
  flagsTrue: string[];
}

export interface Scheme {
  id: string;
  name: string;
  /** always true in this build: scheme limits are demo values, not law */
  demo: true;
  requirements: Requirement[];
}

/** Global rules (not expired, not revoked, key not revoked at issue time) are enforced by the verifier for every requirement. */
export const DEMO_ST_SCHOLARSHIP: Scheme = {
  id: "demo-st-scholarship",
  name: "Demo ST Scholarship",
  demo: true,
  requirements: [
    { id: "enrolled", label: "Currently enrolled at an institute", credentialType: "enrolment", issuerType: "INSTITUTE", flagsTrue: ["flags.enrolment_active"] },
    { id: "st", label: "Belongs to ST category", credentialType: "caste", issuerType: "REVENUE_OFFICE", flagsTrue: ["flags.st_category"] },
    { id: "income", label: "Family income at most 2.5 lakh (demo limit)", credentialType: "income", issuerType: "REVENUE_OFFICE", flagsTrue: ["flags.income_lte_250000"] },
  ],
};

/** Strict structural check of a scheme object (an officer may paste one). */
export function parseScheme(raw: unknown): Scheme {
  const bad = (m: string): never => {
    throw new Error(`malformed scheme: ${m}`);
  };
  const s = raw as Scheme;
  if (!s || typeof s !== "object") bad("not an object");
  if (typeof s.id !== "string" || typeof s.name !== "string" || s.id.length > 80 || s.name.length > 120) bad("id/name");
  if (!Array.isArray(s.requirements) || s.requirements.length === 0 || s.requirements.length > 20) bad("requirements");
  const types = ["enrolment", "caste", "income"];
  const kinds = ["OTHER", "INSTITUTE", "REVENUE_OFFICE", "EMPLOYER"];
  const requirements = s.requirements.map((r) => {
    if (typeof r.id !== "string" || typeof r.label !== "string" || !types.includes(r.credentialType) || !kinds.includes(r.issuerType)) bad("requirement");
    if (!Array.isArray(r.flagsTrue) || r.flagsTrue.length > 20 || !r.flagsTrue.every((f) => typeof f === "string" && /^flags\.[A-Za-z0-9_]{1,60}$/.test(f))) bad("flagsTrue");
    return { id: r.id.slice(0, 40), label: r.label.slice(0, 160), credentialType: r.credentialType, issuerType: r.issuerType, flagsTrue: [...r.flagsTrue] };
  });
  return { id: s.id, name: s.name, demo: true, requirements };
}

// ------------------------------------------------------------------ bundle

export interface Bundle {
  format: "mohar-bundle/1";
  schemeId: string;
  share?: ShareMeta;
  credentials: ProofFile[];
}

export const BUNDLE_LIMITS = { maxBytes: 256 * 1024, maxCredentials: 12 } as const;

const val = (f: ProofFile, path: string): unknown => {
  const d = f.fields[path];
  if (!d) return undefined;
  try {
    return JSON.parse(d.value);
  } catch {
    return undefined;
  }
};
export const credentialTypeOf = (f: ProofFile) => val(f, TYPE_PATH);

/** The exact leaf paths that leave the device for one requirement: type, applicant id, and the flags it needs. Nothing else. */
export function disclosurePlan(req: Requirement): string[] {
  return [TYPE_PATH, APPLICANT_PATH, ...req.flagsTrue];
}

export interface ShareLine {
  requirement: string;
  credentialType: CredentialType;
  /** present when the student holds a matching credential */
  held: boolean;
  disclose: string[];
  /** fields of that credential that stay on the device */
  hidden: string[];
}

/** What the student sees BEFORE sharing: per requirement, what leaves and what stays. */
export function previewShare(scheme: Scheme, held: ProofFile[]): ShareLine[] {
  return scheme.requirements.map((r) => {
    const f = held.find((h) => credentialTypeOf(h) === r.credentialType);
    const plan = disclosurePlan(r);
    return {
      requirement: r.label,
      credentialType: r.credentialType,
      held: !!f,
      disclose: f ? plan.filter((p) => f.fields[p]) : plan,
      hidden: f ? Object.keys(f.fields).filter((p) => !plan.includes(p) && p !== "meta.fieldCount").sort() : [],
    };
  });
}

/** Build the bundle: for each requirement, the matching credential with ONLY its planned leaves. Hidden fields and their salts are dropped. */
export function buildBundle(scheme: Scheme, held: ProofFile[], share?: ShareMeta): Bundle {
  const credentials: ProofFile[] = [];
  for (const r of scheme.requirements) {
    const f = held.find((h) => credentialTypeOf(h) === r.credentialType);
    if (!f) continue; // the officer will see INCOMPLETE; we never invent a credential
    const reveal = disclosurePlan(r).filter((p) => f.fields[p]);
    credentials.push({ ...f, fields: discloseFields(f.fields, reveal), partial: true });
  }
  return { format: "mohar-bundle/1", schemeId: scheme.id, ...(share ? { share } : {}), credentials };
}

export function bundleToJson(b: Bundle): string {
  return JSON.stringify(b);
}

/** Strict parse. Unknown keys are dropped; every credential goes through the proof-file whitelist parser. */
export function parseBundle(json: string | unknown): Bundle {
  if (typeof json === "string" && json.length > BUNDLE_LIMITS.maxBytes) throw new Error("malformed bundle: too large");
  const b = (typeof json === "string" ? JSON.parse(json) : json) as Bundle;
  if (!b || typeof b !== "object" || b.format !== "mohar-bundle/1") throw new Error("malformed bundle: unknown format");
  if (typeof b.schemeId !== "string" || b.schemeId.length > 80) throw new Error("malformed bundle: schemeId");
  if (!Array.isArray(b.credentials) || b.credentials.length > BUNDLE_LIMITS.maxCredentials) throw new Error("malformed bundle: credentials");
  const credentials = b.credentials.map((c) => parseProofFile(c));
  return { format: "mohar-bundle/1", schemeId: b.schemeId, share: parseShare(b.share), credentials };
}

/** Advisory expiry of a share, judged on chain time when known. A copied link ignores this, so it can only warn. */
export function shareExpired(share: ShareMeta | undefined, nowUnix: number): boolean {
  return !!share?.validUntil && nowUnix > share.validUntil;
}

// ------------------------------------------------------------------ evaluation

export type ReasonCode =
  | "OK"
  | "MISSING"
  | "WRONG_ISSUER_TYPE"
  | "FLAG_FALSE"
  | "FLAG_NOT_DISCLOSED"
  | "APPLICANT_MISMATCH"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED"
  | "ISSUER_REVOKED"
  | "TAMPERED"
  | "UNKNOWN_ISSUER"
  | "NOT_FOUND"
  | "MALFORMED"
  | "WRONG_CHAIN"
  | "CANNOT_REACH_CHAIN";

export type Aggregate = "ELIGIBLE" | "NOT_ELIGIBLE" | "INVALID" | "INCOMPLETE" | "UNREACHABLE";

export interface RequirementResult {
  id: string;
  label: string;
  pass: boolean;
  code: ReasonCode;
  detail: string;
  verdict?: Verdict;
  issuerName?: string;
}

export interface SchemeResult {
  scheme: string;
  aggregate: Aggregate;
  applicantId?: string;
  requirements: RequirementResult[];
  failed: string[];
  chainTime?: { block: number; timestamp: number };
  degraded: boolean;
}

/** Reason codes that mean the paper itself is bad (fraud signal), as opposed to "genuine but does not qualify". */
const INVALID_CODES: ReasonCode[] = ["REVOKED", "ISSUER_REVOKED", "TAMPERED", "UNKNOWN_ISSUER", "NOT_FOUND", "MALFORMED", "WRONG_CHAIN", "APPLICANT_MISMATCH"];

const VERDICT_CODE: Partial<Record<Verdict, ReasonCode>> = {
  REVOKED: "REVOKED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  TAMPERED: "TAMPERED",
  UNKNOWN_ISSUER: "UNKNOWN_ISSUER",
  ISSUER_REVOKED: "ISSUER_REVOKED",
  NOT_FOUND: "NOT_FOUND",
  WRONG_CHAIN: "WRONG_CHAIN",
  CANNOT_REACH_CHAIN: "CANNOT_REACH_CHAIN",
  MALFORMED: "MALFORMED",
};

/**
 * Check one bundle against one scheme. Nothing in the bundle is believed: each credential is run through the full
 * verification pipeline (chain read, Merkle recompute, signer, status), and flags are read only from fields that
 * the pipeline proved belong to the signed root.
 */
export async function evaluateBundle(bundle: Bundle, scheme: Scheme, deps: VerifyDeps): Promise<SchemeResult> {
  const results: RequirementResult[] = [];
  const applicants = new Set<string>();
  let chainTime: SchemeResult["chainTime"];
  let degraded = false;
  const used = new Set<ProofFile>();

  for (const r of scheme.requirements) {
    const file = bundle.credentials.find((c) => !used.has(c) && credentialTypeOf(c) === r.credentialType);
    if (!file) {
      results.push({ id: r.id, label: r.label, pass: false, code: "MISSING", detail: `No ${r.credentialType} credential in the bundle.` });
      continue;
    }
    used.add(file);
    const v: VerifyResult = await verifyCertificate({ file }, deps);
    chainTime = v.chainTime ?? chainTime;
    degraded ||= !!v.providers?.degraded;
    const fail = (code: ReasonCode, detail: string) =>
      results.push({ id: r.id, label: r.label, pass: false, code, detail, verdict: v.verdict, issuerName: v.issuer?.name });

    if (v.verdict !== "VERIFIED" && v.verdict !== "VERIFIED_DOMAIN_UNCHECKED") {
      fail(VERDICT_CODE[v.verdict] ?? "MALFORMED", v.headline);
      continue;
    }
    const proven = new Map((v.fields ?? []).filter((f) => f.ok).map((f) => [f.path, f.value]));
    if (proven.get(TYPE_PATH) !== r.credentialType) {
      fail("MISSING", `Credential is not proven to be a ${r.credentialType} credential.`);
      continue;
    }
    if (v.issuer?.issuerType !== r.issuerType) {
      fail("WRONG_ISSUER_TYPE", `Needs an issuer of type ${r.issuerType}, got ${v.issuer?.issuerType ?? "unknown"}.`);
      continue;
    }
    const missing = r.flagsTrue.filter((f) => !proven.has(f));
    if (missing.length) {
      fail("FLAG_NOT_DISCLOSED", `Required flag not disclosed: ${missing.join(", ")}.`);
      continue;
    }
    const falseFlags = r.flagsTrue.filter((f) => proven.get(f) !== true);
    if (falseFlags.length) {
      fail("FLAG_FALSE", `Issuer attests ${falseFlags.join(", ")} is not true.`);
      continue;
    }
    const applicant = proven.get(APPLICANT_PATH);
    if (typeof applicant === "string") applicants.add(applicant);
    results.push({ id: r.id, label: r.label, pass: true, code: "OK", detail: v.headline, verdict: v.verdict, issuerName: v.issuer?.name });
  }

  // One person, one application: credentials for different applicants cannot be combined.
  if (applicants.size > 1) {
    for (const r of results) if (r.pass) Object.assign(r, { pass: false, code: "APPLICANT_MISMATCH", detail: "Credentials in this bundle belong to different applicants." });
  }
  const failed = results.filter((r) => !r.pass).map((r) => r.id);
  let aggregate: Aggregate;
  if (results.some((r) => r.code === "CANNOT_REACH_CHAIN")) aggregate = "UNREACHABLE";
  else if (results.some((r) => INVALID_CODES.includes(r.code))) aggregate = "INVALID";
  else if (results.some((r) => r.code === "MISSING")) aggregate = "INCOMPLETE";
  else if (failed.length) aggregate = "NOT_ELIGIBLE";
  else aggregate = "ELIGIBLE";
  return { scheme: scheme.id, aggregate, applicantId: applicants.size === 1 ? [...applicants][0] : undefined, requirements: results, failed, chainTime, degraded };
}
