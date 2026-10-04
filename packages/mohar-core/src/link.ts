import { bytesToHex, getAddress, hexToBytes, type Address, type Hex } from "viem";
import { Gunzip, Unzlib, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Anchor, DisclosedField, ProofFile } from "./types";

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

/** Hard limits so a hostile file cannot hang or exhaust the verifier. A real certificate is far below all of them. */
export const LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxFields: 200,
  maxPathChars: 200,
  maxValueChars: 2000,
  maxProofHashes: 40, // a tree of 2^40 leaves
} as const;

/**
 * Strict structural validation. Anything that fails here is "malformed", not "tampered".
 * Returns a NEW object built field by field: unknown keys in the input (a lying "verdict", "status", "issuer"...)
 * are dropped here and can never reach the verifier or the UI. Only the chain and the math decide.
 */
export function parseProofFile(json: string | unknown): ProofFile {
  if (typeof json === "string" && json.length > LIMITS.maxFileBytes) throw new Error("malformed proof file: too large");
  const f = (typeof json === "string" ? JSON.parse(json) : json) as ProofFile;
  const bad = (m: string): never => {
    throw new Error(`malformed proof file: ${m}`);
  };
  if (!f || typeof f !== "object" || Array.isArray(f)) bad("not an object");
  if (f.format !== "mohar-proof/1") bad("unknown format");
  if (!Number.isInteger(f.chainId) || f.chainId <= 0) bad("chainId");
  if (typeof f.signer !== "string") bad("signer");
  const signer = getAddress(f.signer);
  if (typeof f.documentRoot !== "string" || !HEX32.test(f.documentRoot)) bad("documentRoot");
  if (!Number.isSafeInteger(f.expiresAt) || f.expiresAt < 0) bad("expiresAt");
  let anchor: Anchor;
  if (f.anchor?.kind === "single") anchor = { kind: "single" };
  else if (f.anchor?.kind === "batch") {
    const a = f.anchor;
    if (typeof a.batchRoot !== "string" || !HEX32.test(a.batchRoot) || !Array.isArray(a.proof) || a.proof.length > LIMITS.maxProofHashes || !a.proof.every((p) => typeof p === "string" && HEX32.test(p)))
      bad("batch anchor");
    anchor = { kind: "batch", batchRoot: a.batchRoot, proof: [...a.proof] };
  } else return bad("anchor");
  if (!f.fields || typeof f.fields !== "object" || Array.isArray(f.fields)) bad("fields");
  const entries = Object.entries(f.fields);
  if (entries.length > LIMITS.maxFields) bad("too many fields");
  const fields: Record<string, DisclosedField> = Object.create(null);
  for (const [p, d] of entries) {
    if (p.length > LIMITS.maxPathChars) bad("field path too long");
    if (
      typeof d?.value !== "string" ||
      d.value.length > LIMITS.maxValueChars ||
      typeof d.salt !== "string" ||
      !HEX32.test(d.salt) ||
      !Array.isArray(d.proof) ||
      d.proof.length > LIMITS.maxProofHashes ||
      !d.proof.every((x) => typeof x === "string" && HEX32.test(x))
    )
      bad(`field ${p.slice(0, 40)}`);
    fields[p] = { value: d.value, salt: d.salt, proof: [...d.proof] };
  }
  const txHash = typeof f.txHash === "string" && HEX32.test(f.txHash) ? f.txHash : undefined;
  return {
    format: "mohar-proof/1",
    chainId: f.chainId,
    signer,
    documentRoot: f.documentRoot,
    expiresAt: f.expiresAt,
    anchor,
    fields: { ...fields },
    partial: f.partial === true,
    ...(txHash ? { txHash } : {}),
  };
}

/** Compact, gzip'd, URL-safe presentation (what a holder shares after hiding fields). Prefix `P`. */
export function encodePresentation(f: ProofFile): string {
  return "P" + toBase64Url(gzipSync(strToU8(JSON.stringify(f)), { level: 9 }));
}

type Streamer = { push(chunk: Uint8Array, final?: boolean): void };

/** Feed `data` through a streaming inflater in small slices, stopping the moment the output exceeds `maxBytes`. */
function boundedStream(make: (onData: (chunk: Uint8Array) => void) => Streamer, data: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;
  const z = make((chunk) => {
    total += chunk.length;
    if (total > maxBytes) {
      overflow = true;
      return;
    }
    chunks.push(chunk);
  });
  const STEP = 4096;
  for (let i = 0; i < data.length && !overflow; i += STEP) z.push(data.subarray(i, i + STEP), i + STEP >= data.length);
  if (overflow) throw new Error("too large");
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Gunzip with a hard output cap, so a few hundred bytes of "zip bomb" cannot allocate gigabytes. */
export function boundedGunzip(data: Uint8Array, maxBytes: number): Uint8Array {
  try {
    return boundedStream((cb) => new Gunzip(cb), data, maxBytes);
  } catch (e) {
    throw new Error((e as Error).message === "too large" ? "presentation too large" : (e as Error).message);
  }
}

/** zlib (PDF FlateDecode) inflate with the same cap. */
export function boundedUnzlib(data: Uint8Array, maxBytes: number): Uint8Array {
  return boundedStream((cb) => new Unzlib(cb), data, maxBytes);
}

export function decodePresentation(frag: string): ProofFile {
  if (!frag.startsWith("P")) throw new Error("not a presentation");
  if (frag.length > LIMITS.maxFileBytes) throw new Error("presentation too large");
  const bytes = boundedGunzip(fromBase64Url(frag.slice(1)), LIMITS.maxFileBytes);
  return parseProofFile(strFromU8(bytes));
}

/** Can this payload be a scannable QR code under the budget? */
export function fitsQr(payload: string): boolean {
  return new TextEncoder().encode(payload).length <= QR_BUDGET_BYTES;
}
