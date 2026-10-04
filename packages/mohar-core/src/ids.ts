import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";

/** certId = keccak256(documentRoot). The only real identity of a certificate. */
export function certId(documentRoot: Hex): Hex {
  return keccak256(documentRoot);
}

// Crockford base32: no I, L, O, U. Check symbols extend the alphabet (mod 37).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK = ALPHABET + "*~$=U";

/** First 8 bytes of certId with the last nibble zeroed (= exactly 60 bits). Matches Solidity `bytes8(id) & 0xFFFFFFFFFFFFFFF0`. */
export function shortCodeBytes8(id: Hex): Hex {
  const b = hexToBytes(id).slice(0, 8);
  b[7] = b[7]! & 0xf0;
  return bytesToHex(b);
}

function bigFromBytes(b: Uint8Array): bigint {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return n;
}

function format(n: bigint): string {
  let s = "";
  for (let i = 11; i >= 0; i--) s += ALPHABET[Number((n >> BigInt(i * 5)) & 31n)];
  const check = CHECK[Number(n % 37n)]!;
  return `MHR-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${check}`;
}

/** `MHR-XXXX-XXXX-XXXX-C`: 12 base32 chars (60 bits) + 1 check symbol. A pointer for humans, never the proof. */
export function shortCode(id: Hex): string {
  return format(bigFromBytes(hexToBytes(shortCodeBytes8(id))) >> 4n);
}

export type ParsedCode = { ok: true; bytes8: Hex; code: string } | { ok: false; reason: string };

/** Forgiving parser: case-insensitive, optional dashes, maps O->0 and I/L->1 like Crockford says. */
export function parseShortCode(input: string): ParsedCode {
  let s = input.trim().toUpperCase().replace(/^MHR[-\s]?/, "").replace(/[-\s]/g, "");
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 13) return { ok: false, reason: "A Mohar code has 13 characters after MHR-." };
  let n = 0n;
  for (const ch of s.slice(0, 12)) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, reason: `Invalid character "${ch}".` };
    n = (n << 5n) | BigInt(v);
  }
  if (CHECK[Number(n % 37n)] !== s[12]) return { ok: false, reason: "Check character does not match, likely a typo." };
  const b = new Uint8Array(8);
  let v = n << 4n;
  for (let i = 7; i >= 0; i--) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return { ok: true, bytes8: bytesToHex(b), code: format(n) };
}
