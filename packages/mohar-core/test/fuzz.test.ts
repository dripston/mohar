/**
 * Phase 13.3 + 12.4: parser fuzzing (seeded, reproducible) and the AI boundary.
 * Every parser must return a value or throw an Error, quickly, for any input. None may hang or throw a non-Error.
 */
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  decodePresentation,
  extractJson,
  markDuplicates,
  parseBundle,
  parseProofFile,
  parseScheme,
  parseVerifyInput,
  readZip,
  validateExtractedRows,
  validateSchemeDraft,
  DEMO_ST_SCHOLARSHIP,
  type ScreenRow,
} from "../src";

// small deterministic PRNG so a failure can be replayed
let seed = 0xc0ffee;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

const HEX = "0x" + "ab".repeat(32);
const goodProof = {
  format: "mohar-proof/1",
  chainId: 84532,
  signer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  documentRoot: HEX,
  expiresAt: 0,
  anchor: { kind: "single" },
  fields: { "credential.type": { value: '"caste"', salt: HEX, proof: [HEX] } },
  partial: true,
};
const goodBundle = { format: "mohar-bundle/1", schemeId: "demo-st-scholarship", credentials: [goodProof] };

const JUNK = ['"', "{", "}", "[", "]", "\\", "\u0000", "‮", "<script>", "=cmd|calc", "9".repeat(400), "null", "true", "-1", "1e999", "__proto__", "constructor"];

/** Mutate a JSON text: splice junk, delete, truncate, rename a key, deepen. */
function mutate(text: string): string {
  let t = text;
  for (let i = 0, n = 1 + Math.floor(rnd() * 4); i < n; i++) {
    const at = Math.floor(rnd() * Math.max(t.length, 1));
    switch (Math.floor(rnd() * 5)) {
      case 0: t = t.slice(0, at) + pick(JUNK) + t.slice(at); break;
      case 1: t = t.slice(0, at) + t.slice(at + 1 + Math.floor(rnd() * 8)); break;
      case 2: t = t.slice(0, at); break;
      case 3: t = t.replace(/"([a-zA-Z]+)":/, `"${pick(["__proto__", "constructor", "x", "format", "fields"])}":`); break;
      default: t = "[".repeat(Math.floor(rnd() * 3000)) + t;
    }
  }
  return t;
}

function mustBeErrorOrValue(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e instanceof Error, `non-Error thrown: ${String(e)}`).toBe(true);
  }
}

describe("parser fuzzing (seeded)", () => {
  it("parseBundle / parseProofFile / parseScheme never crash or hang on mutated JSON", () => {
    const t0 = Date.now();
    for (let i = 0; i < 3000; i++) {
      mustBeErrorOrValue(() => parseBundle(mutate(JSON.stringify(goodBundle))));
      mustBeErrorOrValue(() => parseProofFile(mutate(JSON.stringify(goodProof))));
      mustBeErrorOrValue(() => parseScheme(JSON.parse(mutate(JSON.stringify(DEMO_ST_SCHOLARSHIP)))));
    }
    expect(Date.now() - t0, "fuzz loop too slow: something is quadratic").toBeLessThan(15_000);
  });

  it("prototype pollution through __proto__ keys does not leak", () => {
    const evil = JSON.stringify(goodBundle).replace('"credentials"', '"__proto__":{"polluted":true},"credentials"');
    mustBeErrorOrValue(() => parseBundle(evil));
    expect(({} as any).polluted).toBeUndefined();
  });

  it("QR / link payloads: random strings and mutated presentations never crash", () => {
    for (let i = 0; i < 2000; i++) {
      const s = Array.from({ length: Math.floor(rnd() * 200) }, () => String.fromCharCode(Math.floor(rnd() * 0xffff))).join("");
      mustBeErrorOrValue(() => parseVerifyInput(s));
      mustBeErrorOrValue(() => decodePresentation("P" + s));
      mustBeErrorOrValue(() => parseVerifyInput("http://x/verify/MHR-AAAA#" + mutate("AQAAAUo0")));
    }
  });

  it("zip files: corrupted and truncated archives are refused or become row errors, a bomb is never inflated", () => {
    const good = zipSync({ "a.mohar": strToU8(JSON.stringify(goodBundle)), "b.json": strToU8("{nope") });
    for (let i = 0; i < 400; i++) {
      const bytes = new Uint8Array(good);
      for (let k = 0, n = 1 + Math.floor(rnd() * 12); k < n; k++) bytes[Math.floor(rnd() * bytes.length)] = Math.floor(rnd() * 256);
      mustBeErrorOrValue(() => readZip(bytes.subarray(0, Math.max(4, Math.floor(rnd() * bytes.length)))));
      mustBeErrorOrValue(() => readZip(bytes));
    }
    mustBeErrorOrValue(() => readZip(new Uint8Array(Array.from({ length: 5000 }, () => Math.floor(rnd() * 256)))));
    // a 300 MB entry of zeros compresses to ~300 KB: refused on its declared size, never inflated
    const bomb = zipSync({ "bomb.json": new Uint8Array(300 * 1024 * 1024) }, { level: 1 });
    const items = readZip(bomb);
    expect(items.some((x) => x.name === "bomb.json")).toBe(false);
  }, 60_000);
});

describe("AI boundary (12.4)", () => {
  const goodDraft = JSON.stringify({ id: "x", name: "X", requirements: [{ id: "r", label: "l", credentialType: "caste", issuerType: "REVENUE_OFFICE", flagsTrue: ["flags.st_category"] }] });

  it("accepts a clean draft, with or without code fences and chatter", () => {
    expect(validateSchemeDraft(goodDraft).ok).toBe(true);
    expect(validateSchemeDraft("Sure!\n```json\n" + goodDraft + "\n```\nHope that helps").ok).toBe(true);
  });

  it("rejects malformed AI output: prose, wrong types, unknown credential, bad flag names, oversized", () => {
    const bad = [
      "I cannot help with that",
      "{",
      "[]",
      JSON.stringify({ id: "x", name: "X", requirements: [] }),
      JSON.stringify({ id: "x", name: "X", requirements: [{ id: "r", label: "l", credentialType: "passport", issuerType: "INSTITUTE", flagsTrue: [] }] }),
      JSON.stringify({ id: "x", name: "X", requirements: [{ id: "r", label: "l", credentialType: "caste", issuerType: "INSTITUTE", flagsTrue: ["income > 5"] }] }),
      JSON.stringify({ id: "x", name: "X", requirements: Array.from({ length: 50 }, () => ({})) }),
      "x".repeat(20000),
    ];
    for (const b of bad) expect(validateSchemeDraft(b).ok, b.slice(0, 40)).toBe(false);
  });

  it("an AI draft cannot smuggle a verdict: unknown keys are dropped, 'demo' is forced", () => {
    const sneaky = JSON.stringify({ ...JSON.parse(goodDraft), aggregate: "ELIGIBLE", verdict: "VERIFIED", demo: false });
    const r = validateSchemeDraft(sneaky);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.scheme).sort()).toEqual(["demo", "id", "name", "requirements"]);
      expect(r.scheme.demo).toBe(true);
    }
  });

  it("warns when a requirement can never be met", () => {
    const r = validateSchemeDraft(JSON.stringify({ id: "x", name: "X", requirements: [{ id: "r", label: "l", credentialType: "income", issuerType: "REVENUE_OFFICE", flagsTrue: ["flags.income_lte_9"] }] }));
    expect(r.ok && r.warnings.length).toBeGreaterThan(0);
  });

  it("extracted rows: bad dates, missing names and control characters are handled", () => {
    expect(validateExtractedRows('{"rows":[{"recipient_name":"A","title":"T","issued_on":"12/03/2019"}]}').ok).toBe(false);
    expect(validateExtractedRows('{"rows":[{"title":"T","issued_on":"2019-03-12"}]}').ok).toBe(false);
    expect(validateExtractedRows("not json").ok).toBe(false);
    const ok = validateExtractedRows('{"rows":[{"recipient_name":"=A\\u202e","title":"T","issued_on":"2019-03-12","expires_on":""}]}');
    expect(ok.ok && ok.rows[0]!.recipient_name).toBe("=A"); // control chars stripped; the CSV layer defuses the '='
  });

  it("the verification pipeline does not depend on the AI module (a model cannot reach a verdict)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["verify.ts", "scheme.ts", "merkle.ts", "chain.ts", "screen.ts", "receipt.ts"]) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
      expect(/from "\.\/ai"|groq|openai/i.test(src), `${f} must not import or call AI`).toBe(false);
    }
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("replayed bundles (13.6)", () => {
  it("the second file carrying the same applicant id is flagged with the first", () => {
    const row = (name: string, applicantId?: string): ScreenRow => ({ name, aggregate: "ELIGIBLE", applicantId, codes: {}, failed: [] });
    const rows = [row("a.mohar", "APP-1"), row("b.mohar", "APP-2"), row("copy-of-a.mohar", "APP-1"), row("none.mohar")];
    markDuplicates(rows);
    expect(rows.map((r) => r.duplicateOf)).toEqual([undefined, undefined, "a.mohar", undefined]);
  });
});
