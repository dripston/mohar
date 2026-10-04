import { getAddress, type Address, type Hex } from "viem";
import { ChainUnreachable, type ChainCert, type ChainIssuer, type Reader, type UnreachableKind } from "./chain";
import type { DnsResolver } from "./dns";
import { certId, recordId, shortCode } from "./ids";
import { COUNT_PATH, type Anchor, type ProofFile } from "./types";
import { diffFields, verifyInBatch } from "./merkle";
import type { LinkHeader } from "./link";

export type Verdict =
  | "VERIFIED"
  | "VERIFIED_DOMAIN_UNCHECKED"
  | "REVOKED"
  | "SUSPENDED"
  | "EXPIRED"
  | "TAMPERED"
  | "UNKNOWN_ISSUER"
  | "ISSUER_REVOKED"
  | "NOT_FOUND"
  | "WRONG_CHAIN"
  | "CANNOT_REACH_CHAIN"
  | "MALFORMED";

/** link = header only; full = every field proven; partial = holder-chosen subset proven; code = status by short code only */
export type Mode = "link" | "full" | "partial" | "code";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";
export interface Check {
  id: 1 | 2 | 3 | 4 | 5;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface FieldResult {
  path: string;
  value: unknown;
  ok: boolean;
}

export interface VerifyResult {
  verdict: Verdict;
  mode: Mode;
  headline: string;
  checks: Check[];
  issuer?: { identity: Address; name: string; domain: string; signer: Address };
  cert?: ChainCert;
  certId?: Hex;
  code?: string;
  /** full/partial only: every disclosed field and whether it matches the signed root */
  fields?: FieldResult[];
  hiddenFields?: boolean;
  /** everything a skeptic needs to re-check on their own (the "Verify independently" panel) */
  independent?: {
    chainId: number;
    contract: Address;
    issuerRegistry: Address;
    documentRoot?: Hex;
    batchRoot?: Hex;
    proof?: Hex[];
    certId?: Hex;
    txHint?: string;
  };
  providers?: ProviderSummary;
  /** why the chain could not be read, when the verdict is CANNOT_REACH_CHAIN */
  unreachable?: UnreachableKind;
  /** block the answer was read at; its timestamp is the "now" every expiry / cut-off check ran against */
  chainTime?: { block: number; timestamp: number };
  /** browser clock (display only, never used to decide anything) */
  verifiedAt: number;
}

export interface ProviderSummary {
  asked: number;
  agreed: number;
  answered: number;
  stale: number;
  down: number;
  dissent: number;
  degraded: boolean;
}

export interface VerifyInput {
  header?: LinkHeader;
  file?: ProofFile;
}

export interface VerifyDeps {
  reader: Reader;
  dns: DnsResolver;
  now?: () => number;
}

const LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Issuer registered and accredited on chain",
  2: "Issuer domain verified",
  3: "Signature valid, signed by issuer key",
  4: "Data intact (root matches the on-chain record)",
  5: "Status: active, not revoked, not expired",
};

const HEADLINES: Record<Verdict, string> = {
  VERIFIED: "Verified",
  VERIFIED_DOMAIN_UNCHECKED: "Verified (domain could not be checked live)",
  REVOKED: "Revoked",
  SUSPENDED: "Suspended",
  EXPIRED: "Expired",
  TAMPERED: "Tampered",
  UNKNOWN_ISSUER: "Unknown issuer",
  ISSUER_REVOKED: "Issuer key revoked",
  NOT_FOUND: "Not found on chain",
  WRONG_CHAIN: "Wrong chain",
  CANNOT_REACH_CHAIN: "Cannot reach the chain",
  MALFORMED: "Malformed input",
};

const REASONS = ["", "Key compromise", "Issued in error", "Misconduct", "Superseded", "Other"];
export const reasonText = (code: number) => REASONS[code] ?? "Unknown";

function blank(): Check[] {
  return ([1, 2, 3, 4, 5] as const).map((id) => ({ id, label: LABELS[id], status: "skip" as CheckStatus, detail: "Not run" }));
}

function set(checks: Check[], id: 1 | 2 | 3 | 4 | 5, status: CheckStatus, detail: string) {
  const c = checks[id - 1]!;
  c.status = status;
  c.detail = detail;
}

function finish(
  verdict: Verdict,
  mode: Mode,
  checks: Check[],
  now: number,
  extra: Partial<VerifyResult> = {},
  headline?: string,
): VerifyResult {
  return { verdict, mode, headline: headline ?? HEADLINES[verdict], checks, verifiedAt: now, ...extra };
}

function anchorOf(input: VerifyInput): { header: LinkHeader; file?: ProofFile } {
  if (input.file) {
    const f = input.file;
    return {
      file: f,
      header: { chainId: f.chainId, signer: f.signer, documentRoot: f.documentRoot, expiresAt: f.expiresAt, anchor: f.anchor },
    };
  }
  return { header: input.header! };
}

/**
 * The verification pipeline. Everything that decides the verdict comes from the chain (read through the
 * quorum reader) or from math over data the holder supplied. Our own servers are never consulted.
 */
export async function verifyCertificate(input: VerifyInput, deps: VerifyDeps): Promise<VerifyResult> {
  const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();
  const checks = blank();
  if (!input.header && !input.file) {
    return finish("MALFORMED", "link", checks, now, {}, "Nothing to verify");
  }
  const { header, file } = anchorOf(input);
  const mode: Mode = file ? (file.partial ? "partial" : "full") : "link";
  const dep = deps.reader.deployment;
  const id = certId(header.documentRoot);
  const code = shortCode(id);
  const independent = {
    chainId: dep.chainId,
    contract: dep.certificateRegistry,
    issuerRegistry: dep.issuerRegistry,
    documentRoot: header.documentRoot,
    batchRoot: header.anchor.kind === "batch" ? header.anchor.batchRoot : undefined,
    proof: header.anchor.kind === "batch" ? header.anchor.proof : undefined,
    certId: id,
  };
  const base = { code, certId: id, independent };

  if (header.chainId !== dep.chainId) {
    set(checks, 1, "fail", `Certificate is for chain ${header.chainId}, this verifier reads chain ${dep.chainId}.`);
    return finish("WRONG_CHAIN", mode, checks, now, base);
  }

  try {
    // ------------------------------------------------------------------ 1. issuer on chain
    const issuer = await deps.reader.getIssuerByKey(header.signer);
    if (!issuer) {
      set(checks, 1, "fail", `Signing key ${header.signer} is not registered with the accreditation authority.`);
      return finish("UNKNOWN_ISSUER", mode, checks, now, { ...base, providers: providersOf(deps) });
    }
    set(checks, 1, "pass", `${issuer.name} is accredited (key ${short(header.signer)}).`);

    // ------------------------------------------------------------------ 2. domain
    const dns = await deps.dns(issuer.domain, issuer.identity);
    let domainUnchecked = false;
    if (dns.status === "match") {
      set(checks, 2, "pass", `${issuer.domain} publishes mohar-issuer=${short(issuer.identity)} (via ${dns.provider}).`);
    } else if (dns.status === "mismatch") {
      set(checks, 2, "fail", `${issuer.domain} does not publish a matching mohar-issuer record${dns.found.length ? ` (found ${dns.found.join(", ")})` : ""}.`);
    } else {
      domainUnchecked = true;
      set(
        checks,
        2,
        "warn",
        issuer.domainCheckedAt
          ? `Live DNS lookup failed. The accreditation authority confirmed ${issuer.domain} on ${fmtDate(issuer.domainCheckedAt)}.`
          : "Live DNS lookup failed and no on-chain domain confirmation exists.",
      );
    }
    const issuerInfo = { identity: issuer.identity, name: issuer.name, domain: issuer.domain, signer: header.signer };

    // ------------------------------------------------------------------ chain record
    let cert: ChainCert;
    if (header.anchor.kind === "single") {
      cert = await deps.reader.getCert(recordId(issuer.identity, header.documentRoot));
    } else {
      const a = header.anchor as Extract<Anchor, { kind: "batch" }>;
      if (!verifyInBatch(a.batchRoot, header.documentRoot, header.expiresAt, a.proof)) {
        set(checks, 3, "fail", "The Merkle proof does not connect this certificate to its batch.");
        set(checks, 4, "fail", "Certificate is not a member of the batch it claims.");
        return finish("TAMPERED", mode, checks, now, { ...base, issuer: issuerInfo, providers: providersOf(deps) });
      }
      cert = await deps.reader.getBatchCert(issuer.identity, a.batchRoot, header.documentRoot, header.expiresAt, a.proof);
    }
    const providers = providersOf(deps);

    // ------------------------------------------------------------------ 3. signer matches the anchored record
    if (cert.state === "NotFound") {
      set(checks, 3, "fail", "No issuance record for this certificate exists on chain.");
      set(checks, 4, "fail", "This issuer never anchored this root.");
      // A full file whose root nobody issued is a forgery, not merely an unknown cert.
      const verdict: Verdict = file && !file.partial ? "TAMPERED" : file ? "TAMPERED" : "NOT_FOUND";
      return finish(verdict, mode, checks, now, { ...base, issuer: issuerInfo, providers });
    }
    if (cert.signer.toLowerCase() !== header.signer.toLowerCase()) {
      set(checks, 3, "fail", `On-chain record was signed by ${short(cert.signer)}, not ${short(header.signer)}.`);
      return finish("UNKNOWN_ISSUER", mode, checks, now, { ...base, issuer: issuerInfo, cert, providers });
    }
    set(checks, 3, "pass", `Issuance signed with EIP-712 by ${short(cert.signer)} and verified by the contract.`);

    // ------------------------------------------------------------------ 4. data integrity
    let fields: FieldResult[] | undefined;
    let tampered = false;
    let hidden = false;
    if (header.anchor.kind === "single" && cert.expiresAt !== header.expiresAt) {
      tampered = true;
    }
    if (file) {
      const diffs = diffFields(header.documentRoot, file.fields);
      fields = diffs.map((d) => ({ path: d.path, ok: d.ok, value: safeParse(file.fields[d.path]!.value) }));
      const bad = diffs.filter((d) => !d.ok);
      let detail = "";
      if (bad.length) {
        tampered = true;
        detail = `${bad.length} field${bad.length > 1 ? "s do" : " does"} not match what the issuer signed: ${bad.map((b) => b.path).join(", ")}.`;
      }
      const countField = file.fields[COUNT_PATH];
      if (!file.partial) {
        const declared = countField ? Number(JSON.parse(countField.value)) : NaN;
        const present = Object.keys(file.fields).filter((p) => p !== COUNT_PATH).length;
        if (!Number.isFinite(declared) || declared !== present) {
          tampered = true;
          detail += ` The file lists ${present} fields but the issuer committed to ${Number.isFinite(declared) ? declared : "an unknown number"}.`;
        }
        const idField = file.fields["issuer.address"];
        if (idField && getAddressSafe(JSON.parse(idField.value)) !== issuer.identity) {
          tampered = true;
          detail += " The issuer address inside the document differs from the accredited issuer.";
        }
      } else {
        hidden = true;
      }
      const shown = diffs.filter((d) => d.path !== COUNT_PATH).length;
      if (tampered) {
        set(checks, 4, "fail", detail.trim() || "Expiry in the file differs from the on-chain record.");
      } else {
        set(
          checks,
          4,
          "pass",
          file.partial
            ? `${shown} disclosed field${shown === 1 ? "" : "s"} match the signed root. Other fields are hidden by the holder.`
            : `All ${shown} fields match the signed root.`,
        );
      }
    } else if (tampered) {
      set(checks, 4, "fail", "Expiry in the link differs from the on-chain record.");
    } else {
      set(checks, 4, "warn", "Root is anchored on chain. Upload the certificate file to check the field contents.");
    }
    const common = { ...base, issuer: issuerInfo, cert, fields, hiddenFields: hidden, providers, chainTime: chainTimeOf(deps) };
    if (tampered) return finish("TAMPERED", mode, checks, now, common);

    // ------------------------------------------------------------------ 5. status
    switch (cert.state) {
      case "Revoked":
        set(checks, 5, "fail", `Revoked on ${fmtDate(cert.updatedAt)}. Reason: ${reasonText(cert.reason)}.`);
        return finish("REVOKED", mode, checks, now, common);
      case "IssuerRevoked":
        set(checks, 5, "fail", `The issuing key was revoked as of a date before this certificate was issued (${fmtDate(cert.issuedAt)}).`);
        return finish("ISSUER_REVOKED", mode, checks, now, common);
      case "Suspended":
        set(checks, 5, "fail", `Suspended by the issuer on ${fmtDate(cert.updatedAt)}. This can be lifted.`);
        return finish("SUSPENDED", mode, checks, now, common);
      case "Expired":
        set(checks, 5, "fail", `Expired on ${fmtDate(cert.expiresAt)}.`);
        return finish("EXPIRED", mode, checks, now, common);
      default:
        set(checks, 5, "pass", cert.expiresAt ? `Active. Valid until ${fmtDate(cert.expiresAt)}.` : "Active. No expiry.");
    }

    if (dns.status === "mismatch") return finish("UNKNOWN_ISSUER", mode, checks, now, common);
    return finish(domainUnchecked ? "VERIFIED_DOMAIN_UNCHECKED" : "VERIFIED", mode, checks, now, common);
  } catch (e) {
    if (e instanceof ChainUnreachable) {
      set(checks, 1, "warn", unreachableText(e));
      return finish("CANNOT_REACH_CHAIN", mode, checks, now, { ...base, providers: providersOf(deps), unreachable: e.kind }, unreachableHeadline(e.kind));
    }
    throw e;
  }
}

/** Code-only lookup: status by short code, no document data. Single-issued certificates only. */
export async function verifyByCode(
  bytes8: Hex,
  deps: VerifyDeps,
): Promise<VerifyResult & { needsLink?: boolean }> {
  const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();
  const checks = blank();
  try {
    const hit = await deps.reader.findByShortCode(bytes8);
    if (!hit) {
      return {
        ...finish("NOT_FOUND", "code", checks, now, { providers: providersOf(deps) }, "No single-issued certificate has this code"),
        needsLink: true,
      };
    }
    if (hit.ambiguous) {
      // A 60-bit code is a pointer, not an identity. If two certificates share one we refuse to pick for the user.
      set(checks, 3, "warn", "More than one certificate uses this code, so a code alone cannot say which one you hold.");
      return {
        ...finish("NOT_FOUND", "code", checks, now, { providers: providersOf(deps) }, "This code is ambiguous"),
        needsLink: true,
      };
    }
    const cert = hit.cert;
    const issuer = await deps.reader.getIssuerByKey(cert.signer);
    set(checks, 1, issuer ? "pass" : "fail", issuer ? `${issuer.name} is accredited.` : "Signing key unknown.");
    set(checks, 2, "skip", "Open the full link or file to check the domain and contents.");
    set(checks, 3, "pass", "Issuance record found on chain.");
    set(checks, 4, "warn", "A code identifies a certificate but carries no data. Upload the file to check the fields.");
    const verdict: Verdict =
      cert.state === "Active" ? "VERIFIED" : cert.state === "NotFound" ? "NOT_FOUND" : (cert.state.toUpperCase() as Verdict);
    const v: Verdict = cert.state === "IssuerRevoked" ? "ISSUER_REVOKED" : verdict;
    set(checks, 5, cert.state === "Active" ? "pass" : "fail", `State: ${cert.state}.`);
    return {
      ...finish(v, "code", checks, now, {
        cert,
        certId: hit.rid,
        providers: providersOf(deps),
        chainTime: chainTimeOf(deps),
        issuer: issuer ? { identity: issuer.identity, name: issuer.name, domain: issuer.domain, signer: cert.signer } : undefined,
      }),
    };
  } catch (e) {
    if (e instanceof ChainUnreachable) {
      return finish("CANNOT_REACH_CHAIN", "code", checks, now, { providers: providersOf(deps), unreachable: e.kind }, unreachableHeadline(e.kind));
    }
    throw e;
  }
}

function unreachableHeadline(kind: UnreachableKind): string {
  return kind === "split" ? "Providers disagree" : "Cannot reach the chain";
}

function unreachableText(e: ChainUnreachable): string {
  return e.kind === "split"
    ? "The chain providers gave different answers and none had a majority. Not giving a verdict until they agree. Try again shortly."
    : e.message;
}

const chainTimeOf = (d: VerifyDeps) =>
  d.reader.agreement.block ? { block: d.reader.agreement.block.number, timestamp: d.reader.agreement.block.timestamp } : undefined;

const providersOf = (d: VerifyDeps): ProviderSummary => {
  const a = d.reader.agreement;
  return { asked: a.providers, agreed: a.agreed, answered: a.answered, stale: a.stale, down: a.down, dissent: a.dissent, degraded: a.degraded };
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
const getAddressSafe = (v: unknown): string | null => {
  try {
    return getAddress(String(v));
  } catch {
    return null;
  }
};

export type { ChainIssuer };
