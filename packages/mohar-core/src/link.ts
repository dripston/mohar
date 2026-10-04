import { bytesToHex, getAddress, hexToBytes, type Address, type Hex } from "viem";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Anchor, ProofFile } from "./types";

/**
 * Link mode: a tiny binary header (issuer key, root, expiry, batch proof) in the URL fragment.
 * It proves who issued the credential and its live status, but carries no field data.
 * Layout (big endian):
 *   u8 version=1 | u8 flags (bit0 = batch) | u32 chainId | 20B signer | 32B documentRoot | u64 expiresAt
 *   [batch only] 32B batchRoot | u8 n | n * 32B proof
 */
export interface LinkHeader {
  chainId: number;
  signer: Address;
  documentRoot: Hex;
  expiresAt: number;
  anchor: Anchor;
}

/** Hard budget for anything that is rendered into a QR code (a version-40 QR holds about 2.9 KB). */
export const QR_BUDGET_BYTES = 1200;

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeLinkHeader(h: LinkHeader): Uint8Array {
  const batch = h.anchor.kind === "batch";
  const proof = batch ? (h.anchor as Extract<Anchor, { kind: "batch" }>).proof : [];
  if (proof.length > 255) throw new Error("proof too long");
  const out = new Uint8Array(2 + 4 + 20 + 32 + 8 + (batch ? 33 + 32 * proof.length : 0));
  const dv = new DataView(out.buffer);
  let o = 0;
  out[o++] = 1;
  out[o++] = batch ? 1 : 0;
  dv.setUint32(o, h.chainId);
  o += 4;
  out.set(hexToBytes(h.signer), o);
  o += 20;
  out.set(hexToBytes(h.documentRoot), o);
  o += 32;
  dv.setBigUint64(o, BigInt(h.expiresAt));
  o += 8;
  if (h.anchor.kind === "batch") {
    out.set(hexToBytes(h.anchor.batchRoot), o);
    o += 32;
    out[o++] = proof.length;
    for (const p of proof) {
      out.set(hexToBytes(p), o);
      o += 32;
    }
  }
  return out;
}

export function decodeLinkHeader(bytes: Uint8Array): LinkHeader {
  if (bytes.length < 66 || bytes[0] !== 1) throw new Error("unsupported link header");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const batch = (bytes[1]! & 1) === 1;
  let o = 2;
  const chainId = dv.getUint32(o);
  o += 4;
  const signer = getAddress(bytesToHex(bytes.slice(o, o + 20)));
  o += 20;
  const documentRoot = bytesToHex(bytes.slice(o, o + 32));
  o += 32;
  const expiresAtBig = dv.getBigUint64(o);
  if (expiresAtBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("expiry out of range");
  o += 8;
  let anchor: Anchor = { kind: "single" };
  if (batch) {
    if (bytes.length < o + 33) throw new Error("truncated header");
    const batchRoot = bytesToHex(bytes.slice(o, o + 32));
    o += 32;
    const n = bytes[o++]!;
    if (bytes.length !== o + 32 * n) throw new Error("bad proof length");
    const proof: Hex[] = [];
    for (let i = 0; i < n; i++, o += 32) proof.push(bytesToHex(bytes.slice(o, o + 32)));
    anchor = { kind: "batch", batchRoot, proof };
  } else if (bytes.length !== o) {
    throw new Error("trailing bytes");
  }
  return { chainId, signer, documentRoot, expiresAt: Number(expiresAtBig), anchor };
}

export function buildVerifyUrl(origin: string, code: string, header: LinkHeader): string {
  return `${origin.replace(/\/$/, "")}/verify/${code}#${toBase64Url(encodeLinkHeader(header))}`;
}

export type ParsedLink = { code?: string; header?: LinkHeader; presentation?: ProofFile };

/**
 * Parse whatever a user pastes: a full verify URL, `/verify/<code>#frag`, a bare code, or a bare fragment.
 * Fragments starting with `P` are gzip'd proof files (selective disclosure presentations), `H` are headers.
 */
export function parseVerifyInput(input: string): ParsedLink {
  const raw = input.trim();
  const hashAt = raw.indexOf("#");
  const frag = hashAt >= 0 ? raw.slice(hashAt + 1) : "";
  const before = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const codeMatch = before.match(/MHR-[0-9A-Za-z-]+/i);
  const out: ParsedLink = {};
  if (codeMatch) out.code = codeMatch[0].toUpperCase();
  if (frag) {
    if (frag.startsWith("P")) out.presentation = decodePresentation(frag);
    else out.header = decodeLinkHeader(fromBase64Url(frag.startsWith("H") ? frag.slice(1) : frag));
  }
  return out;
}

// ----------------------------------------------------------------- proof files

export function proofFileToJson(f: ProofFile): string {
  return JSON.stringify(f, null, 2);
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/** Strict structural validation. Anything that fails here is "malformed", not "tampered". */
export function parseProofFile(json: string | unknown): ProofFile {
  const f = (typeof json === "string" ? JSON.parse(json) : json) as ProofFile;
  const bad = (m: string) => {
    throw new Error(`malformed proof file: ${m}`);
  };
  if (!f || typeof f !== "object") bad("not an object");
  if (f.format !== "mohar-proof/1") bad("unknown format");
  if (!Number.isInteger(f.chainId) || f.chainId <= 0) bad("chainId");
  if (typeof f.signer !== "string") bad("signer");
  getAddress(f.signer);
  if (!HEX32.test(f.documentRoot)) bad("documentRoot");
  if (!Number.isInteger(f.expiresAt) || f.expiresAt < 0) bad("expiresAt");
  if (!f.anchor || (f.anchor.kind !== "single" && f.anchor.kind !== "batch")) bad("anchor");
  if (f.anchor.kind === "batch") {
    if (!HEX32.test(f.anchor.batchRoot) || !Array.isArray(f.anchor.proof) || !f.anchor.proof.every((p) => HEX32.test(p)))
      bad("batch anchor");
  }
  if (!f.fields || typeof f.fields !== "object") bad("fields");
  for (const [p, d] of Object.entries(f.fields)) {
    if (typeof d?.value !== "string" || !HEX32.test(d.salt) || !Array.isArray(d.proof) || !d.proof.every((x) => HEX32.test(x)))
      bad(`field ${p}`);
  }
  return { ...f, partial: Boolean(f.partial) };
}

/** Compact, gzip'd, URL-safe presentation (what a holder shares after hiding fields). Prefix `P`. */
export function encodePresentation(f: ProofFile): string {
  return "P" + toBase64Url(gzipSync(strToU8(JSON.stringify(f)), { level: 9 }));
}

export function decodePresentation(frag: string): ProofFile {
  if (!frag.startsWith("P")) throw new Error("not a presentation");
  const bytes = gunzipSync(fromBase64Url(frag.slice(1)));
  if (bytes.length > 512 * 1024) throw new Error("presentation too large");
  return parseProofFile(strFromU8(bytes));
}

/** Can this payload be a scannable QR code under the budget? */
export function fitsQr(payload: string): boolean {
  return new TextEncoder().encode(payload).length <= QR_BUDGET_BYTES;
}
