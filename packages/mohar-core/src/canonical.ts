/**
 * Canonical JSON + field flattening.
 *
 * Every value that reaches a hash goes through here first, so two machines that
 * hold the same certificate always produce the same leaves (and the same root).
 */

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonValue[] | { [k: string]: JsonValue };

/** Characters that make text render differently from how it reads: C0/C1 controls and bidi overrides/isolates. */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩﻿]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Normalise text the way every issuer-side input must be before it is hashed: Unicode NFC, so "e + combining acute"
 * and "precomposed e-acute" (the same name typed on a Mac or a Windows box) hash to the same value. Rejects
 * unpaired surrogates (they are not valid text and encode differently across languages) and invisible controls
 * or bidi overrides (they let a name read differently from what was signed).
 * Verification never calls this: it hashes the exact bytes the issuer committed to.
 */
export function normaliseText(s: string, what = "text"): string {
  if (LONE_SURROGATE.test(s)) throw new Error(`${what}: contains an unpaired surrogate`);
  if (UNSAFE_TEXT.test(s)) throw new Error(`${what}: contains a control or bidirectional-override character`);
  return s.normalize("NFC");
}

/**
 * Deterministic JSON: keys sorted by UTF-16 code unit, no whitespace. Rejects non-JSON values.
 * Numbers must be finite and print without an exponent (so Python, Go and JS agree); -0 prints as 0.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(normaliseText(value, "value"));
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
      if (Object.is(value, -0)) return "0";
      const out = JSON.stringify(value);
      if (/e/i.test(out)) throw new Error(`canonicalJson: ${out} would print differently across languages, use a string`);
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error("canonicalJson: integer outside the safe range, use a string");
      return out;
    }
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (obj[k] === undefined) throw new Error(`canonicalJson: undefined at "${k}"`);
        parts.push(`${JSON.stringify(normaliseText(k, "key"))}:${canonicalJson(obj[k])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}

export interface FlatField {
  /** dotted path, e.g. `credential.grade` or `credential.honours[1]` */
  path: string;
  /** canonical JSON encoding of the primitive. `"8.34"` and `8.34` differ, `null` and `"null"` differ. */
  value: string;
}

/** Flatten a nested document into (path, canonical-value) pairs, sorted by path. */
export function flatten(doc: JsonValue): FlatField[] {
  const out: FlatField[] = [];
  const walk = (v: JsonValue, path: string) => {
    if (v !== null && typeof v === "object") {
      if (Array.isArray(v)) {
        if (v.length === 0) out.push({ path, value: "[]" });
        v.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else {
        const norm = new Map<string, string>(); // normalised key -> original key
        for (const k of Object.keys(v)) {
          const nk = normaliseText(k, "key");
          if (nk === "") throw new Error("flatten: empty key");
          if (nk.includes(".") || nk.includes("[") || nk.includes("]")) throw new Error(`flatten: illegal key "${k}"`);
          if (norm.has(nk)) throw new Error(`flatten: keys collide after Unicode normalisation: "${k}"`);
          norm.set(nk, k);
        }
        const keys = [...norm.keys()].sort();
        if (keys.length === 0) out.push({ path, value: "{}" });
        for (const k of keys) walk(v[norm.get(k)!] as JsonValue, path ? `${path}.${k}` : k);
      }
    } else {
      if (!path) throw new Error("flatten: document root must be an object");
      out.push({ path, value: canonicalJson(v) });
    }
  };
  walk(doc, "");
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Inverse of {@link flatten}. Used to re-render a (possibly partial) disclosed document. */
export function unflatten(fields: FlatField[]): JsonValue {
  const root: Record<string, unknown> = {};
  for (const { path, value } of fields) {
    const tokens: { key: string | number; index: boolean }[] = [];
    for (const m of path.matchAll(/\[(\d+)\]|([^.[\]]+)/g)) {
      tokens.push(m[1] !== undefined ? { key: Number(m[1]), index: true } : { key: m[2]!, index: false });
    }
    if (tokens.length === 0) throw new Error(`unflatten: bad path ${path}`);
    let cur: any = root;
    tokens.forEach((tok, i) => {
      if (i === tokens.length - 1) {
        cur[tok.key] = JSON.parse(value);
      } else {
        if (cur[tok.key] === undefined) cur[tok.key] = tokens[i + 1]!.index ? [] : {};
        cur = cur[tok.key];
      }
    });
  }
  return root as JsonValue;
}
