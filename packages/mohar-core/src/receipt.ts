import { keccak256, toBytes } from "viem";
import { canonicalJson } from "./canonical";
import { COUNT_PATH, type ShareMeta } from "./types";
import type { VerifyResult } from "./verify";

/** A receipt is only ever built from a verification that just ran. Older results must be re-checked first. */
export const RECEIPT_MAX_AGE_SECS = 600;

export interface ReceiptBody {
  format: "mohar-receipt/1";
  verdict: string;
  headline: string;
  mode: string;
  checks: { label: string; status: string; detail: string }[];
  chain: { chainId: number; contract: string; issuerRegistry: string; block?: number; blockTime?: string };
  verifiedAt: string;
  issuer?: { name: string; domain: string; type?: string; accreditationSource?: string };
  certId?: string;
  /** only fields the holder chose to show, only after they were proven against the signed root */
  disclosed: { path: string; value: unknown }[];
  share?: ShareMeta & { note: string };
  note: string;
}

export interface Receipt extends ReceiptBody {
  /** keccak256 of the canonical JSON of everything above: any edit to the receipt changes it */
  receiptHash: string;
}

const NOTE =
  "Designed for data minimisation: this receipt lists only fields the holder disclosed, never hidden fields or salts. It is evidence of one check at one block, not a legal certificate.";
const SHARE_NOTE = "Purpose, recipient and expiry are advisory labels set by the holder. A copied link carries them along, so they cannot be enforced.";

export function hashReceipt(body: ReceiptBody): string {
  return keccak256(toBytes(canonicalJson(JSON.parse(JSON.stringify(body)))));
}

export function buildReceipt(r: VerifyResult, share?: ShareMeta, nowUnix = Math.floor(Date.now() / 1000)): Receipt {
  if (nowUnix - r.verifiedAt > RECEIPT_MAX_AGE_SECS) throw new Error("receipt refused: verification is stale, check again first");
  const body: ReceiptBody = {
    format: "mohar-receipt/1",
    verdict: r.verdict,
    headline: r.headline,
    mode: r.mode,
    checks: r.checks.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
    chain: {
      chainId: r.independent?.chainId ?? 0,
      contract: r.independent?.contract ?? "",
      issuerRegistry: r.independent?.issuerRegistry ?? "",
      block: r.chainTime?.block,
      blockTime: r.chainTime ? new Date(r.chainTime.timestamp * 1000).toISOString() : undefined,
    },
    verifiedAt: new Date(r.verifiedAt * 1000).toISOString(),
    issuer: r.issuer ? { name: r.issuer.name, domain: r.issuer.domain, type: r.issuer.issuerType, accreditationSource: r.issuer.accreditationSource } : undefined,
    certId: r.certId,
    disclosed: (r.fields ?? []).filter((f) => f.ok && f.path !== COUNT_PATH).map((f) => ({ path: f.path, value: f.value })),
    ...(share ? { share: { ...share, note: SHARE_NOTE } } : {}),
    note: NOTE,
  };
  return { ...body, receiptHash: hashReceipt(body) };
}

/** Recompute the hash: false means the receipt was edited after it was made. */
export function receiptIntact(r: Receipt): boolean {
  const { receiptHash, ...body } = r;
  try {
    return hashReceipt(body as ReceiptBody) === receiptHash;
  } catch {
    return false;
  }
}
