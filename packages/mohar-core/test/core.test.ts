import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildBatch,
  buildDocument,
  canonicalJson,
  certId,
  COUNT_PATH,
  decodeLinkHeader,
  decodePresentation,
  diffFields,
  discloseFields,
  encodeLinkHeader,
  encodePresentation,
  fitsQr,
  flatten,
  hashIssue,
  issueTypedData,
  parseProofFile,
  parseShortCode,
  parseVerifyInput,
  buildVerifyUrl,
  recoverIssuer,
  shortCode,
  shortCodeBytes8,
  unflatten,
  verifyField,
  verifyInBatch,
  type JsonValue,
  type ProofFile,
} from "../src";

/** Deterministic salts: salt(path) = keccak256("salt:" + path). Golden vectors depend on this. */
const saltFor = (path: string): Hex => keccak256(toHex(`salt:${path}`));
const ISSUER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

const DOC: JsonValue = {
  version: "mohar/1",
  issuer: { address: ISSUER, domain: "acharya.ac.in", name: "Acharya Institute" },
  recipient: { name: "Rehaan N", email: "rehaan@example.com" },
  credential: { title: "B.E. AI Engineering", grade: "8.34", issuedOn: "2028-06-01", expiresOn: null },
};

function build(doc: JsonValue = DOC) {
  const paths = [...flatten(doc).map((f) => f.path), COUNT_PATH];
  const salts = Object.fromEntries(paths.map((p) => [p, saltFor(p)]));
  return buildDocument(doc, { salts });
}

describe("canonical json", () => {
  it("sorts keys and strips whitespace", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
  });
  it("is insensitive to key order", () => {
    expect(canonicalJson({ a: 1, b: { d: 1, c: 2 } })).toBe(canonicalJson({ b: { c: 2, d: 1 }, a: 1 }));
  });
  it("rejects undefined and non-finite numbers", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: NaN })).toThrow();
  });
  it("distinguishes string 8.34 from number 8.34 and null from 'null'", () => {
    const f = (v: JsonValue) => flatten({ a: v })[0]!.value;
    expect(f("8.34")).not.toBe(f(8.34));
    expect(f(null)).not.toBe(f("null"));
  });
});

describe("flatten / unflatten", () => {
  it("round-trips nested objects and arrays", () => {
    const doc: JsonValue = { a: { b: [1, { c: "x" }, []], d: {} }, e: null };
    expect(unflatten(flatten(doc))).toEqual(doc);
  });
  it("rejects keys that would corrupt paths", () => {
    expect(() => flatten({ "a.b": 1 })).toThrow();
    expect(() => flatten({ "a[0]": 1 })).toThrow();
  });
});

describe("document tree", () => {
  it("is deterministic given the same salts (golden vector)", () => {
    const a = build();
    const b = build();
    expect(a.documentRoot).toBe(b.documentRoot);
    // Pinned. If this changes, every issued certificate on chain stops verifying.
    expect(a.documentRoot).toMatchInlineSnapshot(`"0x8c932a917b18de5e53da13df291d78d9c68c5a69ecb30aba2474964c759416a1"`);
  });

  it("is independent of key order in the source document", () => {
    const reordered: JsonValue = {
      credential: { expiresOn: null, issuedOn: "2028-06-01", grade: "8.34", title: "B.E. AI Engineering" },
      recipient: { email: "rehaan@example.com", name: "Rehaan N" },
      issuer: { name: "Acharya Institute", domain: "acharya.ac.in", address: ISSUER },
      version: "mohar/1",
    };
    expect(build(reordered).documentRoot).toBe(build().documentRoot);
  });

  it("changes when any single character changes", () => {
    const base = build().documentRoot;
    const edited = structuredClone(DOC) as any;
    edited.credential.grade = "8.35";
    expect(build(edited).documentRoot).not.toBe(base);
  });

  it("different random salts give different roots for the same document", () => {
    expect(buildDocument(DOC).documentRoot).not.toBe(buildDocument(DOC).documentRoot);
  });

  it("every field verifies; a forged value is pinpointed", () => {
    const { documentRoot, fields } = build();
    expect(diffFields(documentRoot, fields).every((d) => d.ok)).toBe(true);
    const forged = structuredClone(fields);
    forged["credential.grade"]!.value = JSON.stringify("9.8");
    const bad = diffFields(documentRoot, forged).filter((d) => !d.ok);
    expect(bad.map((d) => d.path)).toEqual(["credential.grade"]);
  });

  it("a forged field with a recomputed leaf still fails against the real root", () => {
    const { documentRoot, fields } = build();
    const other = buildDocument({ ...(DOC as object), credential: { ...(DOC as any).credential, grade: "9.8" } } as JsonValue);
    const stolen = other.fields["credential.grade"]!;
    expect(verifyField(documentRoot, "credential.grade", stolen)).toBe(false);
    expect(verifyField(documentRoot, "credential.grade", fields["credential.grade"]!)).toBe(true);
  });

  it("a field cannot be moved to another path", () => {
    const { documentRoot, fields } = build();
    expect(verifyField(documentRoot, "credential.title", fields["credential.grade"]!)).toBe(false);
  });

  it("commits to the field count", () => {
    const { fields } = build();
    expect(fields[COUNT_PATH]!.value).toBe(JSON.stringify(String(flatten(DOC).length)));
  });

  it("selective disclosure hides fields but the root still matches", () => {
    const { documentRoot, fields } = build();
    const shown = discloseFields(fields, ["recipient.name", "credential.title"]);
    expect(Object.keys(shown).sort()).toEqual([COUNT_PATH, "credential.title", "recipient.name"].sort());
    expect(diffFields(documentRoot, shown).every((d) => d.ok)).toBe(true);
    expect(shown["credential.grade"]).toBeUndefined();
  });

  it("hidden fields cannot be brute forced: same value, different salt, different leaf", () => {
    const a = buildDocument(DOC).fields["credential.grade"]!;
    const b = buildDocument(DOC).fields["credential.grade"]!;
    expect(a.salt).not.toBe(b.salt);
  });

  it("works for the smallest possible document", () => {
    const t = buildDocument({ a: "x" });
    expect(diffFields(t.documentRoot, t.fields).every((d) => d.ok)).toBe(true);
  });
});

describe("batch", () => {
  const roots = Array.from({ length: 37 }, (_, i) => keccak256(toHex(`doc${i}`)));
  const entries = roots.map((r, i) => ({ documentRoot: r, expiresAt: i % 2 ? 0 : 2_000_000_000 + i }));

  it("every certificate proves membership, and proofs are log-sized", () => {
    const { batchRoot, proofs } = buildBatch(entries);
    entries.forEach((e, i) => expect(verifyInBatch(batchRoot, e.documentRoot, e.expiresAt, proofs[i]!)).toBe(true));
    expect(Math.max(...proofs.map((p) => p.length))).toBeLessThanOrEqual(6);
  });

  it("binds expiry: changing expiresAt breaks the proof", () => {
    const { batchRoot, proofs } = buildBatch(entries);
    expect(verifyInBatch(batchRoot, entries[0]!.documentRoot, 1, proofs[0]!)).toBe(false);
  });

  it("a proof for one certificate does not prove another", () => {
    const { batchRoot, proofs } = buildBatch(entries);
    expect(verifyInBatch(batchRoot, entries[1]!.documentRoot, entries[1]!.expiresAt, proofs[0]!)).toBe(false);
  });

  it("is independent of entry order", () => {
    expect(buildBatch(entries).batchRoot).toBe(buildBatch([...entries].reverse()).batchRoot);
  });

  it("a one-certificate batch works, an empty or duplicate one is refused", () => {
    const one = buildBatch([entries[0]!]);
    expect(verifyInBatch(one.batchRoot, entries[0]!.documentRoot, entries[0]!.expiresAt, one.proofs[0]!)).toBe(true);
    expect(() => buildBatch([])).toThrow();
    expect(() => buildBatch([entries[0]!, entries[0]!])).toThrow();
  });
});

describe("ids and short codes", () => {
  const id = certId(build().documentRoot);

  it("certId is keccak256(documentRoot)", () => {
    expect(id).toBe(keccak256(build().documentRoot));
  });

  it("short code round-trips through the parser", () => {
    const code = shortCode(id);
    expect(code).toMatch(/^MHR-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z*~$=]$/);
    const p = parseShortCode(code);
    expect(p.ok && p.bytes8).toBe(shortCodeBytes8(id));
  });

  it("parser is forgiving about case, dashes and look-alike characters", () => {
    const code = shortCode(id);
    const messy = code.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
    const p = parseShortCode(messy);
    expect(p.ok && p.code).toBe(code);
  });

  it("detects a typo through the check symbol", () => {
    const code = shortCode(id);
    const i = 6;
    const swapped = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
    expect(parseShortCode(swapped).ok).toBe(false);
  });

  it("uses exactly 60 bits: the last nibble of the on-chain bytes8 is zero", () => {
    expect(shortCodeBytes8(id).endsWith("0")).toBe(true);
  });

  it("is stable (golden vector)", () => {
    expect(shortCode(id)).toMatchInlineSnapshot(`"MHR-RA0P-SD5A-NJ5M-V"`);
  });
});

describe("link header and presentation", () => {
  const { documentRoot, fields } = build();
  const header = {
    chainId: 84532,
    signer: ISSUER,
    documentRoot,
    expiresAt: 0,
    anchor: { kind: "single" } as const,
  };
  const batch = buildBatch(Array.from({ length: 500 }, (_, i) => ({ documentRoot: keccak256(toHex(i)), expiresAt: 0 })));
  const batchHeader = {
    ...header,
    anchor: { kind: "batch" as const, batchRoot: batch.batchRoot, proof: batch.proofs[17]! },
  };

  it("round-trips single and batch headers", () => {
    expect(decodeLinkHeader(encodeLinkHeader(header))).toEqual(header);
    expect(decodeLinkHeader(encodeLinkHeader(batchHeader))).toEqual(batchHeader);
  });

  it("a 500-cert batch header fits a QR with room to spare", () => {
    const url = buildVerifyUrl("https://mohar.app", shortCode(certId(documentRoot)), batchHeader);
    expect(url.length).toBeLessThan(700);
    expect(fitsQr(url)).toBe(true);
  });

  it("parseVerifyInput handles full URLs and bare fragments", () => {
    const code = shortCode(certId(documentRoot));
    const url = buildVerifyUrl("https://mohar.app/", code, header);
    const p = parseVerifyInput(url);
    expect(p.code).toBe(code);
    expect(p.header).toEqual(header);
    expect(parseVerifyInput(code).header).toBeUndefined();
  });

  it("rejects truncated or padded headers", () => {
    const bytes = encodeLinkHeader(batchHeader);
    expect(() => decodeLinkHeader(bytes.slice(0, bytes.length - 1))).toThrow();
    expect(() => decodeLinkHeader(new Uint8Array([...bytes, 0]))).toThrow();
  });

  it("partial proof file round-trips through a compressed presentation", () => {
    const file: ProofFile = {
      format: "mohar-proof/1",
      chainId: 84532,
      signer: ISSUER,
      documentRoot,
      expiresAt: 0,
      anchor: { kind: "single" },
      fields: discloseFields(fields, ["recipient.name", "credential.title"]),
      partial: true,
    };
    const frag = encodePresentation(file);
    expect(decodePresentation(frag)).toEqual(file);
    expect(parseProofFile(JSON.stringify(file))).toEqual(file);
  });

  it("parseProofFile rejects malformed input", () => {
    expect(() => parseProofFile("{}")).toThrow(/malformed/);
    expect(() => parseProofFile("not json")).toThrow();
  });
});

describe("eip712", () => {
  const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const acct = privateKeyToAccount(key);
  const contract = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
  const msg = { issuer: acct.address, root: keccak256("0x01"), expiresAt: 0n, nonce: 0n };

  it("signature recovers to the issuer", async () => {
    const signature = await acct.signTypedData(issueTypedData(31337, contract, msg));
    expect(await recoverIssuer(31337, contract, msg, signature)).toBe(acct.address);
  });

  it("is bound to chain id, contract and nonce", () => {
    const base = hashIssue(31337, contract, msg);
    expect(hashIssue(8453, contract, msg)).not.toBe(base);
    expect(hashIssue(31337, "0x0000000000000000000000000000000000000001", msg)).not.toBe(base);
    expect(hashIssue(31337, contract, { ...msg, nonce: 1n })).not.toBe(base);
  });

  it("a signature replayed on another chain recovers to a different address", async () => {
    const signature = await acct.signTypedData(issueTypedData(31337, contract, msg));
    expect(await recoverIssuer(84532, contract, msg, signature)).not.toBe(acct.address);
  });
});
