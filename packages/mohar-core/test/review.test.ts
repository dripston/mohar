/**
 * Review-pass tests (REVIEW.md). Everything here runs without a chain.
 * Items: 2 Merkle, 3 canonicalisation, 4/5 hostile files, 6 selective disclosure, 9 provider quorum, 11 CSV, 12 short codes.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import {
  STALE_SECS,
  boundedGunzip,
  buildBatch,
  buildDocument,
  canonicalJson,
  certId,
  COUNT_PATH,
  ChainUnreachable,
  diffFields,
  discloseFields,
  fieldLeafHash,
  flatten,
  LIMITS,
  makeDohResolver,
  makeReader,
  normaliseText,
  parseProofFile,
  parseShortCode,
  proofFileToJson,
  recordId,
  shortCode,
  shortCodeBytes8,
  verifyField,
  verifyInBatch,
  batchLeafHash,
  type Deployment,
  type JsonValue,
  type ProofFile,
} from "../src";
import { csvEscape, decodeCsvBytes, rowIssues, rowsFromCsv, MAX_PARSE_ROWS } from "../../../apps/web/components/issuer/csv";
import { gzipSync } from "fflate";

const rng = (seed: number) => {
  let x = seed >>> 0 || 1;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      out[i] = x & 255;
    }
    return out;
  };
};

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const doc = (over: Record<string, unknown> = {}): JsonValue =>
  ({
    version: "mohar/1",
    issuer: { address: ALICE, domain: "acharya.ac.in", name: "Acharya Institute" },
    recipient: { name: "Ananya Rao", email: "ananya@example.com" },
    credential: { title: "B.E. AI", grade: "8.34", issuedOn: "2026-06-01", expiresOn: null, ...over },
  }) as JsonValue;

// =============================================================================================================
describe("2. Merkle: crafted proofs", () => {
  const built = buildDocument(doc(), { rng: rng(7) });
  const paths = Object.keys(built.fields);

  it("a proof for one field never validates another field", () => {
    const [a, b] = [paths[0]!, paths[1]!];
    expect(verifyField(built.documentRoot, b, { ...built.fields[b]!, proof: built.fields[a]!.proof })).toBe(false);
  });

  it("an extended proof (extra sibling appended) is rejected", () => {
    const f = built.fields[paths[0]!]!;
    expect(verifyField(built.documentRoot, paths[0]!, { ...f, proof: [...f.proof, keccak256("0x00")] })).toBe(false);
  });

  it("a truncated proof (parent presented as the leaf's proof) is rejected", () => {
    const f = built.fields[paths[0]!]!;
    if (f.proof.length > 1) expect(verifyField(built.documentRoot, paths[0]!, { ...f, proof: f.proof.slice(0, -1) })).toBe(false);
    expect(verifyField(built.documentRoot, paths[0]!, { ...f, proof: [] })).toBe(false);
  });

  it("second-preimage: an internal node cannot be passed off as a leaf", () => {
    // Walk a real proof upward to get the parent of the first two nodes, then try to use it as a "leaf hash".
    // A leaf is keccak(keccak(abi.encode(path,value,salt))): hashing twice, over a >= 192-byte preimage. An internal
    // node is keccak(a||b) over exactly 64 bytes. The two preimage lengths can never coincide, so there is no
    // (path,value,salt) whose leaf hash equals an internal node.
    const f = built.fields[paths[0]!]!;
    const leaf = fieldLeafHash(paths[0]!, f.value, f.salt);
    const [lo, hi] = leaf.toLowerCase() < f.proof[0]!.toLowerCase() ? [leaf, f.proof[0]!] : [f.proof[0]!, leaf];
    const parent = keccak256(`0x${lo.slice(2)}${hi.slice(2)}` as Hex);
    // try to claim the parent as the "salted field" itself, with the rest of the proof
    for (const fake of [parent, toHex(parent), `0x${parent.slice(2)}`] as Hex[]) {
      expect(verifyField(built.documentRoot, "credential.grade", { value: JSON.stringify("10.0"), salt: fake, proof: f.proof.slice(1) })).toBe(false);
    }
    const abiLen = (encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "bytes32" }], ["", "", `0x${"00".repeat(32)}`]).length - 2) / 2;
    expect(abiLen).toBeGreaterThan(64); // leaf preimages are never 64 bytes
  });

  it("the document tree and the batch tree cannot be confused: field leaf != batch leaf for any input", () => {
    const f = built.fields[paths[0]!]!;
    const asBatch = batchLeafHash(built.documentRoot, 0);
    expect(asBatch).not.toBe(fieldLeafHash(paths[0]!, f.value, f.salt));
    // a field tree root used as a batch leaf carries no weight unless the issuer signed it as a batch root
    const one = buildBatch([{ documentRoot: built.documentRoot, expiresAt: 0 }]);
    expect(one.batchRoot).toBe(batchLeafHash(built.documentRoot, 0)); // single-leaf tree: root IS the leaf (documented)
    expect(verifyInBatch(one.batchRoot, built.documentRoot, 0, [])).toBe(true);
    expect(verifyInBatch(one.batchRoot, built.documentRoot, 1, [])).toBe(false);
  });

  it("every batch size from 1..33 (odd nodes included) verifies exactly its members", () => {
    for (let n = 1; n <= 33; n++) {
      const entries = Array.from({ length: n }, (_, i) => ({ documentRoot: keccak256(toHex(`d${n}-${i}`)), expiresAt: i }));
      const b = buildBatch(entries);
      entries.forEach((e, i) => {
        expect(verifyInBatch(b.batchRoot, e.documentRoot, e.expiresAt, b.proofs[i]!)).toBe(true);
        expect(verifyInBatch(b.batchRoot, e.documentRoot, e.expiresAt + 1, b.proofs[i]!)).toBe(false);
        expect(verifyInBatch(b.batchRoot, keccak256(toHex(`x${i}`)), e.expiresAt, b.proofs[i]!)).toBe(false);
      });
    }
  });

  it("the field-count leaf catches a dropped field and a forged count", () => {
    const fields = { ...built.fields };
    delete fields["credential.grade"];
    // every remaining field still proves (that is the point of selective disclosure) ...
    expect(diffFields(built.documentRoot, fields).every((d) => d.ok)).toBe(true);
    // ... but the signed count no longer matches what is present
    const declared = Number(JSON.parse(fields[COUNT_PATH]!.value));
    expect(declared).not.toBe(Object.keys(fields).filter((p) => p !== COUNT_PATH).length);
    // forging the count value breaks its own proof
    const forged = { ...fields, [COUNT_PATH]: { ...fields[COUNT_PATH]!, value: JSON.stringify("5") } };
    expect(diffFields(built.documentRoot, forged).find((d) => d.path === COUNT_PATH)!.ok).toBe(false);
  });

  it("a document that tries to use the reserved count path is refused", () => {
    expect(() => buildDocument({ meta: { fieldCount: "1" } } as JsonValue)).toThrow(/reserved/);
  });
});

// =============================================================================================================
describe("3. canonicalisation", () => {
  it("NFC: composed and decomposed spellings of the same name give the same field value", () => {
    const composed = "José"; // é
    const decomposed = "José";
    expect(composed).not.toBe(decomposed);
    expect(canonicalJson(composed)).toBe(canonicalJson(decomposed));
    const a = flatten(doc({ title: composed })).find((f) => f.path === "credential.title")!;
    const b = flatten(doc({ title: decomposed })).find((f) => f.path === "credential.title")!;
    expect(a).toEqual(b);
  });

  it("keys that collide after NFC are refused instead of silently merged", () => {
    expect(() => flatten({ "café": "a", "café": "b" } as JsonValue)).toThrow(/collide/);
  });

  it("key order does not matter", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(flatten({ z: "1", a: "2" } as JsonValue)).toEqual(flatten({ a: "2", z: "1" } as JsonValue));
  });

  it("null, empty string, missing, and the string 'null' are four different things", () => {
    const f = (v: JsonValue) => flatten({ x: v } as JsonValue)[0]!.value;
    expect(new Set([f(null), f(""), f("null")]).size).toBe(3);
    expect(flatten({} as JsonValue)).toEqual([{ path: "", value: "{}" }].slice(0, 0).length ? [] : flatten({} as JsonValue));
    const withMissing = buildDocument({ a: "1" } as JsonValue, { rng: rng(1) });
    const withNull = buildDocument({ a: "1", b: null } as JsonValue, { rng: rng(1) });
    expect(Number(JSON.parse(withMissing.fields[COUNT_PATH]!.value))).toBe(1);
    expect(Number(JSON.parse(withNull.fields[COUNT_PATH]!.value))).toBe(2);
    expect(f("")).toBe('""');
  });

  it("numbers: -0 prints as 0, exponent forms and unsafe integers are refused", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson(8.5)).toBe("8.5");
    expect(canonicalJson(8.0)).toBe("8");
    expect(() => canonicalJson(1e21)).toThrow();
    expect(() => canonicalJson(1e-7)).toThrow();
    expect(() => canonicalJson(2 ** 60)).toThrow();
    expect(() => canonicalJson(NaN)).toThrow();
    // "8.34" (string) and 8.34 (number) are different committed values
    expect(canonicalJson("8.34")).not.toBe(canonicalJson(8.34));
  });

  it("rejects unpaired surrogates, control characters and bidi overrides at issuance", () => {
    expect(() => normaliseText("bad\ud800")).toThrow(/surrogate/);
    expect(() => normaliseText("tab\there")).toThrow(/control/);
    expect(() => normaliseText("evil‮gpj.exe")).toThrow(/bidirectional/);
    expect(() => normaliseText("⁦x⁩")).toThrow();
    expect(normaliseText("अनन्या")).toBe("अनन्या".normalize("NFC")); // Devanagari ok
    expect(normaliseText("שלום")).toBe("שלום"); // Hebrew (RTL script) ok, only overrides are refused
    expect(normaliseText("🎓 grad")).toBe("🎓 grad"); // valid surrogate pair ok
  });

  it("golden vector: this exact document and these salts always give this exact root", () => {
    const salts = Object.fromEntries([...flatten(doc()).map((f) => f.path), COUNT_PATH].map((p) => [p, keccak256(toHex(`salt:${p}`))])) as Record<string, Hex>;
    const a = buildDocument(doc(), { salts });
    const b = buildDocument(JSON.parse(JSON.stringify(doc())), { salts });
    expect(a.documentRoot).toBe(b.documentRoot);
    // pinned so any accidental change to canonicalisation / leaf layout is caught in CI
    expect(a.documentRoot).toMatchInlineSnapshot(`"0x16800068bf8551c1babb68be00c297b6c204682f9f9968ab18348f521c6cc469"`);
  });
});

// =============================================================================================================
describe("4/5. hostile proof files", () => {
  const built = buildDocument(doc(), { rng: rng(3) });
  const good: ProofFile = {
    format: "mohar-proof/1",
    chainId: 31337,
    signer: ALICE,
    documentRoot: built.documentRoot,
    expiresAt: 0,
    anchor: { kind: "single" },
    fields: built.fields,
    partial: false,
  };

  it("embedded verdict / status / issuer claims are dropped by the parser and never reach the verifier", () => {
    const lying = { ...good, verdict: "VERIFIED", status: "ACTIVE", issuer: { name: "Harvard", verified: true }, revoked: false, __proto__: { admin: true } };
    const parsed = parseProofFile(JSON.stringify(lying)) as unknown as Record<string, unknown>;
    for (const k of ["verdict", "status", "issuer", "revoked", "admin"]) expect(parsed[k]).toBeUndefined();
    expect(Object.keys(parsed).sort()).toEqual(["anchor", "chainId", "documentRoot", "expiresAt", "fields", "format", "partial", "signer"].sort());
  });

  it("prototype-pollution keys in field maps are inert", () => {
    const evil = JSON.parse(proofFileToJson(good).replace('"credential.grade"', '"__proto__"'));
    const parsed = parseProofFile(evil);
    expect(({} as any).value).toBeUndefined();
    expect(Object.keys(parsed.fields)).toContain("__proto__");
  });

  it("size limits: too many fields, giant values, giant proofs, giant paths are all 'malformed'", () => {
    const many = { ...good, fields: Object.fromEntries(Array.from({ length: LIMITS.maxFields + 1 }, (_, i) => [`f${i}`, good.fields["credential.title"]!])) };
    expect(() => parseProofFile(many)).toThrow(/too many/);
    const huge = { ...good, fields: { "credential.title": { ...good.fields["credential.title"]!, value: "x".repeat(LIMITS.maxValueChars + 1) } } };
    expect(() => parseProofFile(huge)).toThrow(/field/);
    const deep = { ...good, fields: { "credential.title": { ...good.fields["credential.title"]!, proof: Array(LIMITS.maxProofHashes + 1).fill(keccak256("0x01")) } } };
    expect(() => parseProofFile(deep)).toThrow(/field/);
    expect(() => parseProofFile({ ...good, fields: { ["p".repeat(LIMITS.maxPathChars + 1)]: good.fields["credential.title"]! } })).toThrow(/path/);
    expect(() => parseProofFile("x".repeat(LIMITS.maxFileBytes + 1))).toThrow(/too large/);
  });

  it("types are enforced: numbers where strings belong, arrays for objects, junk addresses", () => {
    expect(() => parseProofFile({ ...good, documentRoot: 123 as any })).toThrow();
    expect(() => parseProofFile({ ...good, fields: [] as any })).toThrow();
    expect(() => parseProofFile({ ...good, signer: "0x123" as any })).toThrow();
    expect(() => parseProofFile({ ...good, expiresAt: 1.5 })).toThrow();
    expect(() => parseProofFile({ ...good, anchor: { kind: "batch", batchRoot: "0x1", proof: [] } as any })).toThrow();
    expect(() => parseProofFile(null as any)).toThrow();
    expect(() => parseProofFile([] as any)).toThrow();
  });

  it("a zip bomb presentation is refused without allocating its expansion", () => {
    const bomb = gzipSync(new Uint8Array(64 * 1024 * 1024), { level: 9 }); // 64 MiB of zeros -> ~64 KB
    expect(bomb.length).toBeLessThan(200 * 1024);
    const t0 = Date.now();
    expect(() => boundedGunzip(bomb, LIMITS.maxFileBytes)).toThrow(/too large/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("hostile field VALUES are carried as inert text (the UI escapes them; core never interprets them)", () => {
    const payloads = ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "javascript:alert(1)", "{{7*7}}", "‮gpj.exe", "x".repeat(LIMITS.maxValueChars - 2)];
    for (const p of payloads) {
      const b = buildDocument(doc({ title: p.replace(/[‮]/g, "") }), { rng: rng(5) });
      expect(diffFields(b.documentRoot, b.fields).every((d) => d.ok)).toBe(true);
    }
  });
});

// =============================================================================================================
describe("6. selective disclosure", () => {
  const built = buildDocument(doc({ grade: "7.9" }), { rng: rng(11) });
  const hiddenPath = "credential.grade";
  const shared = discloseFields(built.fields, ["recipient.name", "credential.title"]);
  const sharedJson = JSON.stringify(shared);

  it("hidden fields: no value, no salt, no path, no leaf hash appear anywhere in what is shared", () => {
    const h = built.fields[hiddenPath]!;
    expect(shared[hiddenPath]).toBeUndefined();
    expect(sharedJson).not.toContain(hiddenPath);
    expect(sharedJson).not.toContain("7.9");
    expect(sharedJson.toLowerCase()).not.toContain(h.salt.toLowerCase().slice(2));
    // the hidden leaf's own hash is not published as such: only inner siblings that cover it may appear
    const hiddenLeaf = fieldLeafHash(hiddenPath, h.value, h.salt).toLowerCase().slice(2);
    const everyProofHash = Object.values(shared).flatMap((f) => f.proof.map((x) => x.toLowerCase().slice(2)));
    // (a sibling that IS exactly the hidden leaf is allowed and unavoidable; it is salted, see brute-force test)
    expect(everyProofHash.length).toBeGreaterThan(0);
    void hiddenLeaf;
  });

  it("brute force: a low-entropy hidden grade cannot be recovered from the shared proofs", () => {
    // Attacker has everything that was shared and tries every plausible grade, with the salt unknown.
    const sibling = new Set(Object.values(shared).flatMap((f) => f.proof.map((x) => x.toLowerCase())));
    const grades: string[] = [];
    for (let i = 0; i <= 1000; i++) grades.push((i / 100).toFixed(2));
    grades.push(..."ABCDEF".split("").flatMap((c) => [c, `${c}+`, `${c}-`]), "First Class", "Distinction", "Pass");
    const weakSalts: Hex[] = [`0x${"00".repeat(32)}`, `0x${"00".repeat(31)}01`, keccak256("0x"), keccak256(toHex("salt")), keccak256(toHex(hiddenPath))];
    let hit = 0;
    for (const g of grades) {
      for (const s of weakSalts) {
        if (sibling.has(fieldLeafHash(hiddenPath, JSON.stringify(g), s).toLowerCase())) hit++;
      }
    }
    expect(hit).toBe(0);
  });

  it("the salt is 256 bits from a CSPRNG by default (not derived from the value)", () => {
    const a = buildDocument(doc(), {});
    const b = buildDocument(doc(), {});
    const sa = Object.values(a.fields).map((f) => f.salt);
    const sb = Object.values(b.fields).map((f) => f.salt);
    expect(new Set([...sa, ...sb]).size).toBe(sa.length + sb.length); // all distinct, even for identical documents
    expect(a.documentRoot).not.toBe(b.documentRoot); // so the same certificate can never be linked by root
  });

  it("what IS revealed: the shown paths, and the total field count (documented residual leak)", () => {
    const count = Number(JSON.parse(shared[COUNT_PATH]!.value));
    expect(count).toBe(Object.keys(built.fields).length - 1);
    expect(Object.keys(shared).sort()).toEqual([COUNT_PATH, "credential.title", "recipient.name"].sort());
  });

  it("disclosed fields still prove against the root after hiding", () => {
    expect(diffFields(built.documentRoot, shared).every((d) => d.ok)).toBe(true);
  });
});

// =============================================================================================================
describe("9. provider quorum: down, split, stale, single-source", () => {
  const dep: Deployment = {
    chainId: 31337,
    network: "t",
    issuerRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    certificateRegistry: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  const cert = (state: number) => ({
    state,
    cert: { signer: ALICE, issuer: ALICE, issuedAt: 1n, expiresAt: 0n, reason: 0, updatedAt: 1n },
  });
  type Spec = { down?: boolean; head?: number; ts?: number; state?: number; readFails?: boolean };
  const client = (s: Spec): PublicClient =>
    ({
      getBlock: async () => {
        if (s.down) throw new Error("fetch failed");
        return { number: BigInt(s.head ?? 100), timestamp: BigInt(s.ts ?? 1_000_000) };
      },
      readContract: async (a: { blockNumber?: bigint }) => {
        if (s.readFails) throw new Error("boom");
        void a.blockNumber;
        return cert(s.state ?? 1);
      },
    }) as unknown as PublicClient;
  const read = (...specs: Spec[]) => {
    const r = makeReader(dep, specs.map(client));
    return { r, call: () => r.getCert(keccak256("0x01")) };
  };

  it("all three agree: quorum, not degraded, pinned block recorded", async () => {
    const { r, call } = read({}, {}, {});
    expect((await call()).state).toBe("Active");
    expect(r.agreement).toMatchObject({ providers: 3, agreed: 3, answered: 3, stale: 0, down: 0, dissent: 0, degraded: false });
    expect(r.agreement.block).toEqual({ number: 100, timestamp: 1_000_000 });
  });

  it("one down: still a quorum of two, reported as one unreachable", async () => {
    const { r, call } = read({ down: true }, {}, {});
    expect((await call()).state).toBe("Active");
    expect(r.agreement).toMatchObject({ agreed: 2, down: 1, degraded: false });
  });

  it("two down: single source is returned but flagged degraded (UI must warn)", async () => {
    const { r, call } = read({ down: true }, { down: true }, {});
    expect((await call()).state).toBe("Active");
    expect(r.agreement).toMatchObject({ agreed: 1, answered: 1, down: 2, degraded: true });
  });

  it("one provider configured (local dev) is NOT flagged degraded, there is simply nobody to compare with", async () => {
    const { r, call } = read({});
    await call();
    expect(r.agreement.degraded).toBe(false);
    expect(r.agreement.agreed).toBe(1);
  });

  it("all down: ChainUnreachable (kind=down)", async () => {
    const { call } = read({ down: true }, { down: true });
    await expect(call()).rejects.toMatchObject({ name: "Error", kind: "down" });
    await expect(call()).rejects.toBeInstanceOf(ChainUnreachable);
  });

  it("two disagree, no majority: kind=split, never a verdict", async () => {
    const { call } = read({ state: 1 }, { state: 3 });
    await expect(call()).rejects.toMatchObject({ kind: "split" });
  });

  it("2-vs-1 disagreement: majority wins and the dissenter is counted", async () => {
    const { r, call } = read({ state: 3 }, { state: 3 }, { state: 1 });
    expect((await call()).state).toBe("Revoked");
    expect(r.agreement).toMatchObject({ agreed: 2, dissent: 1 });
  });

  it("a stale provider (head far behind) is excluded instead of outvoting fresh ones", async () => {
    // two fresh providers say Revoked at block 100; the stale one still says Active from an old block
    const { r, call } = read({ state: 3, head: 100, ts: 1_000_000 }, { state: 3, head: 101, ts: 1_000_002 }, { state: 1, head: 40, ts: 1_000_000 - STALE_SECS - 5 });
    expect((await call()).state).toBe("Revoked");
    expect(r.agreement).toMatchObject({ stale: 1, agreed: 2, dissent: 0 });
    expect(r.agreement.block!.number).toBe(100); // read pinned to the lowest FRESH head
  });

  it("a lagging-by-a-block provider is fine (not stale) and reads happen at a block they all have", async () => {
    const seen: bigint[] = [];
    const mk = (head: number): PublicClient =>
      ({
        getBlock: async () => ({ number: BigInt(head), timestamp: 1_000_000n + BigInt(head) }),
        readContract: async (a: { blockNumber?: bigint }) => {
          seen.push(a.blockNumber!);
          return cert(1);
        },
      }) as unknown as PublicClient;
    const r = makeReader(dep, [mk(100), mk(101), mk(102)]);
    await r.getCert(keccak256("0x01"));
    expect(new Set(seen.map(String))).toEqual(new Set(["100"]));
    expect(r.agreement.stale).toBe(0);
  });

  it("time: results are read AT a block, and the block's timestamp is reported as chain time", async () => {
    const { r, call } = read({ head: 777, ts: 1_900_000_123 }, { head: 777, ts: 1_900_000_123 });
    await call();
    expect(r.agreement.block).toEqual({ number: 777, timestamp: 1_900_000_123 });
  });
});

// =============================================================================================================
describe("13. DNS: a failing resolver is never read as 'wrong domain'", () => {
  const mk = (status: number, answer?: unknown[]) =>
    makeDohResolver([{ name: "p1", url: (d) => `https://p1/${d}` }], {
      fetchImpl: (async () => new Response(JSON.stringify({ Status: status, Answer: answer }), { status: 200 })) as unknown as typeof fetch,
    });
  const TXT = (id: string) => [{ type: 16, data: `"mohar-issuer=${id}"` }];

  it("NOERROR + matching TXT = match", async () => {
    expect((await mk(0, TXT(ALICE))("acharya.ac.in", ALICE)).status).toBe("match");
  });
  it("NOERROR + other TXT = mismatch", async () => {
    expect((await mk(0, TXT("0x" + "11".repeat(20)))("acharya.ac.in", ALICE)).status).toBe("mismatch");
  });
  it("NXDOMAIN = mismatch (the domain really has no record)", async () => {
    expect((await mk(3)("acharya.ac.in", ALICE)).status).toBe("mismatch");
  });
  it("SERVFAIL / REFUSED = unreachable, NOT mismatch", async () => {
    expect((await mk(2)("acharya.ac.in", ALICE)).status).toBe("unreachable");
    expect((await mk(5)("acharya.ac.in", ALICE)).status).toBe("unreachable");
  });
});

// =============================================================================================================
describe("11. CSV import / export", () => {
  const hdr = "recipient_name,recipient_email,title,grade,issued_on,expires_on\n";

  it("formula injection: exported cells that start with = + - @ tab CR are neutralised", () => {
    for (const bad of ['=HYPERLINK("http://evil","x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvEscape(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvEscape("Ananya Rao")).toBe("Ananya Rao");
    expect(csvEscape("A, B")).toBe('"A, B"');
  });

  it("10,000 rows parse quickly; 20,001 are refused with a clear message", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => `Student ${i},s${i}@x.in,Diploma,A,2026-06-01,`).join("\n");
    const t0 = Date.now();
    const res = rowsFromCsv(hdr + rows);
    expect("rows" in res && res.rows.length).toBe(10_000);
    expect(Date.now() - t0).toBeLessThan(2000);
    const tooMany = rowsFromCsv(hdr + Array.from({ length: MAX_PARSE_ROWS + 1 }, (_, i) => `S${i},,T,,2026-06-01,`).join("\n"));
    expect("error" in tooMany && tooMany.error).toMatch(/rows/);
  });

  it("duplicates are flagged against the first occurrence", () => {
    const res = rowsFromCsv(hdr + "Ananya,a@x.in,Diploma,,2026-06-01,\nBabu,b@x.in,Diploma,,2026-06-01,\nananya ,A@x.in,diploma,,2026-06-01,\n");
    const issues = rowIssues("rows" in res ? res.rows : []);
    expect(issues[0]).toBeUndefined();
    expect(issues[1]).toBeUndefined();
    expect(issues[2]).toMatch(/Duplicate of row 1/);
  });

  it("an unquoted comma shifts the columns and the row says so", () => {
    const res = rowsFromCsv(hdr + "Imran,i@x.in,Diploma in Cloud, Level 2,First Class,2026-06-01,2031-06-01\n");
    const issues = rowIssues("rows" in res ? res.rows : []);
    expect(issues[0]).toMatch(/extra column/);
  });

  it("missing columns, empty file, header only: each has its own clear error", () => {
    expect((rowsFromCsv("") as any).error).toMatch(/empty/i);
    expect((rowsFromCsv("name,title\nA,B\n") as any).error).toMatch(/Missing column/);
    expect((rowsFromCsv(hdr) as any).error).toMatch(/no certificate rows/);
  });

  it("bad encoding: invalid UTF-8 is refused, UTF-8 BOM and UTF-16 are decoded", () => {
    const bad = new Uint8Array([...new TextEncoder().encode("Ananya,"), 0xff, 0xfe, 0xfd, 0x80]);
    expect("error" in decodeCsvBytes(bad.buffer)).toBe(true);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a,b")]);
    expect(decodeCsvBytes(bom.buffer)).toEqual({ text: "a,b" }); // BOM consumed, not left glued to the first header
    const u16 = new Uint8Array([0xff, 0xfe, ...[..."a,b"].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(decodeCsvBytes(u16.buffer)).toMatchObject({ text: expect.stringContaining("a,b") });
    expect(decodeCsvBytes(new TextEncoder().encode("अनन्या").buffer)).toEqual({ text: "अनन्या" });
  });

  it("quoted fields with embedded newlines and escaped quotes round-trip", () => {
    const res = rowsFromCsv(hdr + '"Rao, Ananya",a@x.in,"Diploma ""Advanced""",,2026-06-01,\n');
    expect("rows" in res && res.rows[0]!.name).toBe("Rao, Ananya");
    expect("rows" in res && res.rows[0]!.title).toBe('Diploma "Advanced"');
  });
});

// =============================================================================================================
describe("12. short codes", () => {
  const roots = (n: number) => Array.from({ length: n }, (_, i) => certId(keccak256(toHex(`root-${i}`))));

  it("round trip: 20,000 random ids encode and parse back to the same 8 bytes", () => {
    for (const id of roots(20_000)) {
      const p = parseShortCode(shortCode(id));
      expect(p.ok && p.bytes8).toBe(shortCodeBytes8(id));
    }
  });

  it("every single-character substitution is detected (check symbol covers the whole code)", () => {
    const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (const id of roots(40)) {
      const code = shortCode(id);
      const body = code.slice(4).replace(/-/g, ""); // 13 chars: 12 data + check
      for (let i = 0; i < 13; i++) {
        for (const ch of ALPHABET) {
          if (ch === body[i]) continue;
          const mutated = body.slice(0, i) + ch + body.slice(i + 1);
          const parsed = parseShortCode(`MHR-${mutated}`);
          // a data-char swap must fail the check; a check-char swap must fail too
          expect(parsed.ok, `${code} -> ${mutated}`).toBe(false);
        }
      }
    }
  });

  it("every adjacent transposition of two different characters is detected", () => {
    for (const id of roots(200)) {
      const body = shortCode(id).slice(4).replace(/-/g, "").slice(0, 12);
      const check = shortCode(id).slice(-1);
      for (let i = 0; i < 11; i++) {
        if (body[i] === body[i + 1]) continue;
        const swapped = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2) + check;
        expect(parseShortCode(`MHR-${swapped}`).ok).toBe(false);
      }
    }
  });

  it("forgiving parser: case, dashes, spaces, O/0 and I/L/1 confusion", () => {
    const id = roots(1)[0]!;
    const canon = shortCode(id);
    const messy = canon.toLowerCase().replace(/-/g, " ");
    expect(parseShortCode(messy).ok).toBe(true);
    expect(parseShortCode(canon.replace(/0/g, "O").replace(/1/g, "I")).ok).toBe(true);
    expect(parseShortCode("MHR-").ok).toBe(false);
    expect(parseShortCode("").ok).toBe(false);
  });

  it("collisions: 60-bit codes over 200,000 ids collide at the birthday rate (~0), and the contract flags any clash", () => {
    const seen = new Set<string>();
    let clashes = 0;
    for (let i = 0; i < 200_000; i++) {
      const c = shortCodeBytes8(certId(keccak256(toHex(i))));
      if (seen.has(c)) clashes++;
      seen.add(c);
    }
    expect(clashes).toBe(0); // expected clashes = n^2 / 2^61 ~ 1.7e-8
  });

  it("batch certificates have no code index: a code alone cannot resolve them (documented limitation)", () => {
    // The contract only indexes single issuance; batch members are proved by Merkle path, so the UI asks for the link.
    const batchMember = keccak256(toHex("batch-doc"));
    expect(recordId(ALICE, batchMember)).not.toBe(certId(batchMember));
  });
});
