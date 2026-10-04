/**
 * Canonical JSON + field flattening.
 *
 * Every value that reaches a hash goes through here first, so two machines that
 * hold the same certificate always produce the same leaves (and the same root).
 */

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonValue[] | { [k: string]: JsonValue };

/** Deterministic JSON: keys sorted by UTF-16 code unit, no whitespace. Rejects non-JSON values. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (obj[k] === undefined) throw new Error(`canonicalJson: undefined at "${k}"`);
        parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
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
        const keys = Object.keys(v).sort();
        if (keys.length === 0) out.push({ path, value: "{}" });
        for (const k of keys) {
          if (k.includes(".") || k.includes("[") || k.includes("]")) throw new Error(`flatten: illegal key "${k}"`);
          walk(v[k] as JsonValue, path ? `${path}.${k}` : k);
        }
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
