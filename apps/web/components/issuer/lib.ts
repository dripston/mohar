import type { Address } from "viem";
import { buildVerifyUrl, certId, shortCode, type CertRef, type ProofFile } from "@mohar/core";
import { APP_ORIGIN, deployment } from "@/lib/config";

// ------------------------------------------------------------------ archive (localStorage)

export const archiveKey = (identity: string) => `mohar.issued.${deployment.chainId}.${identity}`;

export function loadArchive(identity: Address | string): ProofFile[] {
  try {
    const raw = window.localStorage.getItem(archiveKey(identity));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ProofFile[]) : [];
  } catch {
    return [];
  }
}

/** Append (deduplicated by documentRoot). Returns false when the browser refused to store it. */
export function saveToArchive(identity: Address | string, files: ProofFile[]): boolean {
  try {
    const have = loadArchive(identity);
    const seen = new Set(have.map((f) => f.documentRoot));
    const next = [...have, ...files.filter((f) => !seen.has(f.documentRoot))];
    window.localStorage.setItem(archiveKey(identity), JSON.stringify(next));
    window.dispatchEvent(new Event("mohar-archive"));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ proof file helpers

export const fieldValue = (f: ProofFile, path: string): string => {
  const d = f.fields[path];
  if (!d) return "";
  try {
    const v = JSON.parse(d.value);
    return v === null ? "" : String(v);
  } catch {
    return d.value;
  }
};

export const certIdOf = (f: ProofFile) => certId(f.documentRoot);
export const codeOf = (f: ProofFile) => shortCode(certId(f.documentRoot));

export const linkFor = (f: ProofFile) =>
  buildVerifyUrl(APP_ORIGIN, codeOf(f), {
    chainId: f.chainId,
    signer: f.signer,
    documentRoot: f.documentRoot,
    expiresAt: f.expiresAt,
    anchor: f.anchor,
  });

export function refFor(f: ProofFile): CertRef {
  return f.anchor.kind === "single"
    ? { kind: "single", certId: certId(f.documentRoot) }
    : { kind: "batch", batchRoot: f.anchor.batchRoot, documentRoot: f.documentRoot, expiresAt: f.expiresAt, proof: f.anchor.proof };
}

// ------------------------------------------------------------------ validation

export interface CertInput {
  name: string;
  email: string;
  title: string;
  grade: string;
  issuedOn: string;
  expiresOn: string;
}
export type CertErrors = Partial<Record<keyof CertInput, string>>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isRealDate = (s: string) => {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function validateCert(v: CertInput): CertErrors {
  const e: CertErrors = {};
  const name = v.name.trim();
  if (!name) e.name = "Enter the recipient's full name.";
  else if (name.length > 120) e.name = "Keep the name under 120 characters.";
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = "This does not look like an email address.";
  const title = v.title.trim();
  if (!title) e.title = "Enter the credential title, for example B.E. in AI Engineering.";
  else if (title.length > 200) e.title = "Keep the title under 200 characters.";
  if (v.grade.trim().length > 40) e.grade = "Keep the grade under 40 characters.";
  if (!v.issuedOn.trim()) e.issuedOn = "Choose the date of issue.";
  else if (!isRealDate(v.issuedOn.trim())) e.issuedOn = "Use the format YYYY-MM-DD, for example 2026-06-01.";
  if (v.expiresOn.trim()) {
    if (!isRealDate(v.expiresOn.trim())) e.expiresOn = "Use the format YYYY-MM-DD, or leave blank for no expiry.";
    else if (v.expiresOn.trim() < todayIso()) e.expiresOn = "The expiry date is in the past, so the chain would reject it.";
    else if (!e.issuedOn && v.expiresOn.trim() < v.issuedOn.trim()) e.expiresOn = "Expiry must be on or after the issue date.";
  }
  return e;
}

export function buildDoc(v: CertInput, issuer: { identity: Address; domain: string; name: string }) {
  const email = v.email.trim();
  const grade = v.grade.trim();
  return {
    version: "mohar/1" as const,
    issuer: { address: issuer.identity as string, domain: issuer.domain, name: issuer.name },
    recipient: { name: v.name.trim(), ...(email ? { email } : {}) },
    credential: {
      title: v.title.trim(),
      ...(grade ? { grade } : {}),
      issuedOn: v.issuedOn.trim(),
      expiresOn: v.expiresOn.trim() ? v.expiresOn.trim() : null,
    },
  };
}

// ------------------------------------------------------------------ errors in plain language

export function explainError(e: unknown): string {
  const parts: string[] = [];
  let cur: any = e;
  for (let i = 0; cur && i < 6; i++) {
    for (const k of ["shortMessage", "message", "details", "name"]) if (typeof cur[k] === "string") parts.push(cur[k]);
    if (cur.data?.errorName) parts.push(cur.data.errorName);
    if (cur.code === 4001) parts.push("UserRejected");
    cur = cur.cause;
  }
  const t = parts.join(" | ");
  const has = (re: RegExp) => re.test(t);
  if (has(/UserRejected|User rejected|User denied|rejected the request|ACTION_REJECTED/i))
    return "You declined the request in your wallet. Nothing was sent to the chain, and you can try again.";
  if (has(/KeyNotActive/)) return "This wallet's key is not active in the issuer registry (it may have been revoked). The accreditation authority needs to restore or rotate it.";
  if (has(/AlreadyAnchored/)) return "This exact certificate is already anchored on chain. Each certificate carries fresh random salts, so submit it again to get a new one.";
  if (has(/BadExpiry/)) return "The expiry date has already passed on the chain's clock. Choose a later expiry date, or leave it blank.";
  if (has(/IsPaused/)) return "New issuance is paused by the accreditation authority for now. Existing certificates can still be revoked.";
  if (has(/BadSignature/)) return "The signature did not match the connected wallet. Reconnect the wallet and try again.";
  if (has(/NotController/)) return "Only the issuer that created this certificate can change its status, using an active key.";
  if (has(/BadTransition/)) return "This certificate is not in a state that allows that action. Refresh the status and try again.";
  if (has(/UnknownCert|UnknownBatch|NotInBatch/)) return "The chain does not recognise this certificate. The archived file may belong to a different network.";
  if (has(/BadReason/)) return "Choose one of the listed revocation reasons.";
  if (has(/EmptyBatch/)) return "There are no certificates to anchor.";
  if (has(/insufficient funds|exceeds the balance/i)) return "This wallet does not have enough funds to pay for the transaction.";
  if (has(/ChainUnreachable|Could not reach|fetch failed|Failed to fetch|HTTP request failed|ECONNREFUSED|network/i))
    return "Could not reach the blockchain node. Check your connection and try again.";
  if (has(/reverted/i)) return "The transaction was rejected by the contract. Nothing was changed.";
  return ((e as any)?.shortMessage as string) || (e as Error)?.message?.split("\n")[0] || "Something went wrong. Please try again.";
}

export const REASON_OPTIONS = [
  { code: 1, label: "Key compromise" },
  { code: 2, label: "Issued in error" },
  { code: 3, label: "Misconduct" },
  { code: 4, label: "Superseded" },
  { code: 5, label: "Other" },
] as const;

export const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
