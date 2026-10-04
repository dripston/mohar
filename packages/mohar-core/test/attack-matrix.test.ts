/**
 * Integration + attack matrix against a LIVE local chain (Anvil) with the REAL contracts.
 * Nothing here is mocked except DNS (a stub resolver). Start a chain and deploy first:
 *   anvil --block-time 1 &  &&  forge script script/Deploy.s.sol --broadcast   (see TESTING.md)
 * The suite skips itself if no chain is reachable. Results are written to test-results/attack-matrix.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  anchorBatch,
  anchorSingle,
  batchProofFiles,
  certId,
  recordId,
  certificateRegistryAbi,
  clientsFromUrls,
  discloseFields,
  issuerRegistryAbi,
  makeReader,
  parseProofFile,
  prepareBatch,
  prepareCertificate,
  reinstateCert,
  revokeCert,
  shortCodeBytes8,
  singleProofFile,
  suspendCert,
  verifyByCode,
  verifyCertificate,
  type Deployment,
  type DnsResolver,
  type ProofFile,
  type Verdict,
  type VerifyResult,
  type Writer,
} from "../src";
import { issueTypedData } from "../src/eip712";

const RPC = process.env.MOHAR_RPC ?? "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../../deployments/anvil.json", import.meta.url), "utf8")) as Deployment;
dep.rpcUrls = [RPC];
const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const ROOT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
let live = false;
try {
  live = (await pub.getChainId()) === dep.chainId && (await pub.getCode({ address: dep.certificateRegistry })) !== undefined;
} catch {
  live = false;
}

const rows: { id: string; attack: string; expected: Verdict | string; actual: string; pass: boolean }[] = [];
function record(id: string, attack: string, expected: Verdict | string, r: VerifyResult | string) {
  const actual = typeof r === "string" ? r : r.verdict;
  rows.push({ id, attack, expected, actual, pass: actual === expected });
  expect(actual, attack).toBe(expected);
}

const rootAcct = privateKeyToAccount(ROOT_KEY);
const rootWallet = createWalletClient({ account: rootAcct, chain, transport: http(RPC) });

async function fund(addr: Address) {
  await pub.request({ method: "anvil_setBalance" as any, params: [addr, `0x${parseEther("100").toString(16)}`] as any });
}
async function chainNow() {
  return Number((await pub.getBlock()).timestamp);
}
async function warp(seconds: number) {
  await pub.request({ method: "evm_increaseTime" as any, params: [seconds] as any });
  await pub.request({ method: "evm_mine" as any, params: [] as any });
}
async function rootTx(functionName: string, args: unknown[], abi: any = issuerRegistryAbi, address = dep.issuerRegistry) {
  const hash = await rootWallet.writeContract({ address, abi, functionName, args, chain } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
}

const DOMAIN = "acharya.ac.in";
const identities = new Set<string>();
const dns: DnsResolver = async (domain, identity) =>
  domain === DOMAIN && identities.has(identity.toLowerCase())
    ? { status: "match", provider: "stub" }
    : { status: "mismatch", provider: "stub", found: [] };
const dnsDown: DnsResolver = async () => ({ status: "unreachable", errors: ["stub: offline"] });

function mkReader() {
  return makeReader(dep, clientsFromUrls([RPC]));
}
const verify = (input: Parameters<typeof verifyCertificate>[0], resolver = dns, reader = mkReader()) =>
  verifyCertificate(input, { reader, dns: resolver });

async function newIssuer(name = "Acharya Institute", domain = DOMAIN) {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  await fund(account.address);
  await rootTx("registerIssuer", [account.address, domain, name, true]);
  identities.add(account.address.toLowerCase());
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const w: Writer = { wallet, publicClient: pub, deployment: dep };
  return { account, w, key };
}

const docFor = (issuer: Address, over: Record<string, any> = {}) => ({
  version: "mohar/1",
  issuer: { address: issuer, domain: DOMAIN, name: "Acharya Institute" },
  recipient: { name: "Rehaan N", email: "rehaan@example.com", rollNo: String(Math.random()).slice(2, 10) },
  credential: { title: "B.E. AI Engineering", grade: "8.34", issuedOn: "2028-06-01", expiresOn: null, ...over },
});

const tamper = (f: ProofFile, path: string, value: unknown): ProofFile => {
  const copy = structuredClone(f);
  copy.fields[path]!.value = JSON.stringify(value);
  return copy;
};

describe.skipIf(!live)("attack matrix (live chain, real contracts)", () => {
  let A: Awaited<ReturnType<typeof newIssuer>>;
  let B: Awaited<ReturnType<typeof newIssuer>>;
  let good: ProofFile;
  let goodId: Hex;

  beforeAll(async () => {
    A = await newIssuer();
    B = await newIssuer("Bob University", "bob.edu");
    const p = prepareCertificate(docFor(A.account.address) as any);
    const { txHash } = await anchorSingle(A.w, p);
    good = singleProofFile(dep, A.account.address, p, txHash);
    goodId = certId(good.documentRoot);
  });

  afterAll(() => {
    mkdirSync(new URL("../test-results", import.meta.url), { recursive: true });
    writeFileSync(
      new URL("../test-results/attack-matrix.json", import.meta.url),
      JSON.stringify({ chainId: dep.chainId, contract: dep.certificateRegistry, ranAt: new Date().toISOString(), rows }, null, 2),
    );
  });

  it("A0 genuine certificate verifies (full proof)", async () => {
    const r = await verify({ file: good });
    record("A0", "Genuine certificate, full proof file", "VERIFIED", r);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.mode).toBe("full");
  });

  it("A0b genuine certificate verifies from the link header alone (link mode)", async () => {
    const r = await verify({ header: { chainId: good.chainId, signer: good.signer, documentRoot: good.documentRoot, expiresAt: good.expiresAt, anchor: good.anchor } });
    record("A0b", "Genuine certificate, link/QR only", "VERIFIED", r);
    expect(r.mode).toBe("link");
    expect(r.checks[3]!.status).toBe("warn"); // field contents not proven in link mode
  });

  it("A1 tampered field (grade 8.34 -> 9.8) is pinpointed", async () => {
    const r = await verify({ file: tamper(good, "credential.grade", "9.8") });
    record("A1", "Tampered field: grade 8.34 -> 9.8", "TAMPERED", r);
    expect(r.fields!.filter((f) => !f.ok).map((f) => f.path)).toEqual(["credential.grade"]);
  });

  it("A1b tamper + recompute everything (attacker builds a fresh self-consistent tree)", async () => {
    const forged = prepareCertificate(docFor(A.account.address, { grade: "9.8" }) as any);
    const f = singleProofFile(dep, A.account.address, forged);
    record("A1b", "Forged document with a freshly built tree (root never anchored)", "TAMPERED", await verify({ file: f }));
  });

  it("A2 field removed from a full file", async () => {
    const f = structuredClone(good);
    delete f.fields["credential.grade"];
    const r = await verify({ file: f });
    record("A2", "Field silently removed from a full file", "TAMPERED", r);
  });

  it("A3 swapped issuer: valid certificate re-labelled with another registered issuer key", async () => {
    const f = { ...structuredClone(good), signer: B.account.address };
    record("A3", "Swapped issuer (signer field replaced by another accredited key): nothing anchored under that issuer", "TAMPERED", await verify({ file: f }));
  });

  it("A4 fake issuer wallet: attacker signs with an unregistered key and tries to anchor", async () => {
    const evilKey = generatePrivateKey();
    const evil = privateKeyToAccount(evilKey);
    await fund(evil.address);
    const w: Writer = { wallet: createWalletClient({ account: evil, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
    const p = prepareCertificate(docFor(evil.address) as any);
    let outcome = "anchored";
    try {
      await anchorSingle(w, p);
    } catch (e) {
      outcome = /KeyNotActive/.test(String(e)) ? "REJECTED_ON_CHAIN" : `error: ${String(e).slice(0, 80)}`;
    }
    record("A4", "Fake issuer wallet tries to anchor", "REJECTED_ON_CHAIN", outcome);
    // and presenting such a file anyway:
    const f = singleProofFile(dep, evil.address, p);
    record("A4b", "Forged file signed by an unregistered key", "UNKNOWN_ISSUER", await verify({ file: f }));
  });

  it("A5 replayed signature cannot anchor twice or on another root", async () => {
    const p = prepareCertificate(docFor(A.account.address) as any);
    const nonce = await pub.readContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "nonces", args: [A.account.address] });
    const sig = await A.w.wallet.signTypedData(
      issueTypedData(dep.chainId, dep.certificateRegistry, { issuer: A.account.address, root: p.built.documentRoot, expiresAt: 0n, nonce }),
    );
    const call = (root: Hex) =>
      A.w.wallet.writeContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "issue", args: [A.account.address, root, 0n, sig], chain });
    const h = await call(p.built.documentRoot);
    await pub.waitForTransactionReceipt({ hash: h });
    const other = prepareCertificate(docFor(A.account.address) as any);
    let replay = "accepted";
    try {
      await pub.simulateContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "issue", args: [A.account.address, other.built.documentRoot, 0n, sig], account: B.account });
    } catch (e) {
      replay = /BadSignature/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("A5", "Replay a used signature on a different root", "REJECTED_ON_CHAIN", replay);
    let again = "accepted";
    try {
      await pub.simulateContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "issue", args: [A.account.address, p.built.documentRoot, 0n, sig], account: B.account });
    } catch (e) {
      again = /AlreadyAnchored/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("A5b", "Replay a used signature on the same root", "REJECTED_ON_CHAIN", again);
  });

  it("A6 revoked certificate shows reason and time", async () => {
    const p = prepareCertificate(docFor(A.account.address) as any);
    await anchorSingle(A.w, p);
    const f = singleProofFile(dep, A.account.address, p);
    await revokeCert(A.w, { kind: "single", rid: recordId(A.account.address, f.documentRoot) }, 2);
    const r = await verify({ file: f });
    record("A6", "Revoked (issued in error)", "REVOKED", r);
    expect(r.checks[4]!.detail).toContain("Issued in error");
  });

  it("A6b revoked certificates cannot be un-revoked, and strangers cannot revoke", async () => {
    const p = prepareCertificate(docFor(A.account.address) as any);
    await anchorSingle(A.w, p);
    const id = recordId(A.account.address, p.built.documentRoot);
    let stranger = "accepted";
    try {
      await revokeCert(B.w, { kind: "single", rid: id }, 1);
    } catch (e) {
      stranger = /NotController/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("A6b", "Another accredited issuer tries to revoke someone else's certificate", "REJECTED_ON_CHAIN", stranger);
    await revokeCert(A.w, { kind: "single", rid: id }, 5);
    let unrevoke = "accepted";
    try {
      await reinstateCert(A.w, { kind: "single", rid: id });
    } catch (e) {
      unrevoke = /BadTransition/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("A6c", "Issuer tries to un-revoke", "REJECTED_ON_CHAIN", unrevoke);
  });

  it("A7 suspended then reinstated", async () => {
    const p = prepareCertificate(docFor(A.account.address) as any);
    await anchorSingle(A.w, p);
    const f = singleProofFile(dep, A.account.address, p);
    const ref = { kind: "single" as const, rid: recordId(A.account.address, f.documentRoot) };
    await suspendCert(A.w, ref);
    record("A7", "Suspended certificate", "SUSPENDED", await verify({ file: f }));
    await reinstateCert(A.w, ref);
    record("A7b", "Reinstated after suspension", "VERIFIED", await verify({ file: f }));
  });

  it("A8 expired certificate", async () => {
    const exp = (await chainNow()) + 30;
    const doc = docFor(A.account.address);
    const p = prepareCertificate(doc as any);
    p.expiresAt = exp; // bound on chain at issuance
    await anchorSingle(A.w, p);
    const f = singleProofFile(dep, A.account.address, p);
    record("A8a", "Before expiry", "VERIFIED", await verify({ file: f }));
    await warp(120);
    record("A8", "Expired certificate", "EXPIRED", await verify({ file: f }));
  });

  it("A8c lying about expiry in the file", async () => {
    const exp = (await chainNow()) + 3600;
    const p = prepareCertificate(docFor(A.account.address) as any);
    p.expiresAt = exp;
    await anchorSingle(A.w, p);
    const f = { ...singleProofFile(dep, A.account.address, p), expiresAt: exp + 10_000_000 };
    record("A8c", "Expiry extended in the file", "TAMPERED", await verify({ file: f }));
  });

  it("A9 issuer revoked: certificates before the cutoff stay valid, after are invalid", async () => {
    const C = await newIssuer("Cutoff College");
    const early = prepareCertificate(docFor(C.account.address) as any);
    await anchorSingle(C.w, early);
    const earlyFile = singleProofFile(dep, C.account.address, early);
    await warp(100);
    const cutoff = await chainNow();
    await warp(100);
    const late = prepareCertificate(docFor(C.account.address) as any);
    await anchorSingle(C.w, late);
    const lateFile = singleProofFile(dep, C.account.address, late);
    await rootTx("revokeIssuer", [C.account.address, BigInt(cutoff), 1]);
    record("A9a", "Issuer key revoked: cert issued BEFORE cutoff", "VERIFIED", await verify({ file: earlyFile }));
    record("A9b", "Issuer key revoked: cert issued AFTER cutoff", "ISSUER_REVOKED", await verify({ file: lateFile }));
    let blocked = "anchored";
    try {
      await anchorSingle(C.w, prepareCertificate(docFor(C.account.address) as any));
    } catch (e) {
      blocked = /KeyNotActive/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("A9c", "Revoked issuer key tries to issue again", "REJECTED_ON_CHAIN", blocked);
  });

  it("A10 key rotation: the new key manages old certificates", async () => {
    const D = await newIssuer("Rotation Univ");
    const p = prepareCertificate(docFor(D.account.address) as any);
    await anchorSingle(D.w, p);
    const f = singleProofFile(dep, D.account.address, p);
    const newKey = generatePrivateKey();
    const nAcct = privateKeyToAccount(newKey);
    await fund(nAcct.address);
    await warp(5);
    await rootTx("rotateIssuerKey", [D.account.address, nAcct.address]);
    const nw: Writer = { wallet: createWalletClient({ account: nAcct, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
    record("A10a", "After rotation, certificate issued by old key still valid", "VERIFIED", await verify({ file: f }));
    await revokeCert(nw, { kind: "single", rid: recordId(D.account.address, f.documentRoot) }, 4);
    record("A10b", "New key revokes certificate issued by the old key", "REVOKED", await verify({ file: f }));
  });

  it("A11 unknown ID (never issued)", async () => {
    const ghost = prepareCertificate(docFor(A.account.address) as any);
    const header = { chainId: dep.chainId, signer: A.account.address, documentRoot: ghost.built.documentRoot, expiresAt: 0, anchor: { kind: "single" as const } };
    record("A11", "Unknown ID, link mode", "NOT_FOUND", await verify({ header }));
  });

  it("A12 malformed QR / input", async () => {
    const { parseVerifyInput, parseProofFile } = await import("../src");
    let outcome = "parsed";
    try {
      parseVerifyInput("https://mohar.app/verify/MHR-AAAA-BBBB-CCCC-D#!!!notbase64");
    } catch {
      outcome = "MALFORMED";
    }
    record("A12", "Malformed QR fragment", "MALFORMED", outcome);
    let o2 = "parsed";
    try {
      parseProofFile('{"format":"mohar-proof/1"}');
    } catch {
      o2 = "MALFORMED";
    }
    record("A12b", "Malformed proof file", "MALFORMED", o2);
  });

  it("A13 wrong chain", async () => {
    const r = await verify({ file: { ...structuredClone(good), chainId: 1 } });
    record("A13", "Certificate for another chain", "WRONG_CHAIN", r);
  });

  it("A14 forged PDF: real QR header, edited text", async () => {
    const forged = tamper(good, "recipient.name", "Someone Else");
    const r = await verify({ file: forged });
    record("A14", "Forged PDF: genuine QR pasted on edited content", "TAMPERED", r);
    // the same QR alone (link mode) cannot detect it, which is why the verdict labels the mode
    const link = await verify({ header: { chainId: good.chainId, signer: good.signer, documentRoot: good.documentRoot, expiresAt: good.expiresAt, anchor: good.anchor } });
    expect(link.mode).toBe("link");
    expect(link.checks[3]!.status).toBe("warn");
  });

  it("A15 batch: 25 certificates in one transaction, each verifies; revoke exactly one", async () => {
    const E = await newIssuer("Batch College");
    const docs = Array.from({ length: 25 }, (_, i) => docFor(E.account.address, { title: `Course ${i}` }) as any);
    const b = prepareBatch(docs);
    const { txHash, gasPerCert } = await anchorBatch(E.w, b);
    const files = batchProofFiles(dep, E.account.address, b, txHash);
    expect(gasPerCert).toBeLessThan(5000);
    const results = await Promise.all(files.slice(0, 6).map((f) => verify({ file: f })));
    record("A15a", "Batch certificates verify (sampled 6/25)", "VERIFIED", results.every((r) => r.verdict === "VERIFIED") ? "VERIFIED" : "mixed");
    const target = files[3]!;
    const anchor = target.anchor as Extract<typeof target.anchor, { kind: "batch" }>;
    await revokeCert(E.w, { kind: "batch", identity: E.account.address, batchRoot: anchor.batchRoot, documentRoot: target.documentRoot, expiresAt: target.expiresAt, proof: anchor.proof }, 2);
    record("A15b", "Revoke one batch member", "REVOKED", await verify({ file: target }));
    record("A15c", "Sibling in the same batch stays valid", "VERIFIED", await verify({ file: files[4]! }));
    const forgedProof = { ...structuredClone(files[5]!), anchor: { ...files[5]!.anchor, proof: files[6]!.anchor.kind === "batch" ? files[6]!.anchor.proof : [] } } as ProofFile;
    record("A15d", "Wrong Merkle proof for a batch member", "TAMPERED", await verify({ file: forgedProof }));
    rows.push({ id: "A15e", attack: `Batch gas per certificate (25 certs)`, expected: "< 5000", actual: String(Math.round(gasPerCert)), pass: gasPerCert < 5000 });
  });

  it("A16 selective disclosure: hidden grade, still verified, marked partial", async () => {
    const hidden = { ...structuredClone(good), fields: discloseFields(good.fields, ["recipient.name", "credential.title"]), partial: true };
    const r = await verify({ file: hidden });
    record("A16", "Selective disclosure (grade hidden)", "VERIFIED", r);
    expect(r.mode).toBe("partial");
    expect(r.fields!.find((f) => f.path === "credential.grade")).toBeUndefined();
    const lied = tamper(hidden, "credential.title", "M.Tech Quantum");
    record("A16b", "Selective disclosure with an edited disclosed field", "TAMPERED", await verify({ file: lied }));
  });

  it("A17 DNS unreachable degrades gracefully; DNS mismatch is a hard fail", async () => {
    const r = await verify({ file: good }, dnsDown);
    record("A17", "DNS-over-HTTPS unreachable", "VERIFIED_DOMAIN_UNCHECKED", r);
    expect(r.checks[1]!.status).toBe("warn");
    const mismatch: DnsResolver = async () => ({ status: "mismatch", provider: "stub", found: [] });
    record("A17b", "Domain record missing/changed", "UNKNOWN_ISSUER", await verify({ file: good }, mismatch));
  });

  it("A18 RPC down: no verdict, never a false green", async () => {
    const dead = makeReader(dep, clientsFromUrls(["http://127.0.0.1:1"], 500));
    const r = await verify({ file: good }, dns, dead);
    record("A18", "All RPC endpoints unreachable", "CANNOT_REACH_CHAIN", r);
  });

  it("A19 RPC fallback: first endpoint dead, second answers", async () => {
    const reader = makeReader(dep, clientsFromUrls(["http://127.0.0.1:1", RPC], 800));
    const r = await verify({ file: good }, dns, reader);
    record("A19", "First RPC dead, fallback answers", "VERIFIED", r);
  });

  it("A20 short code resolves a single-issued certificate on chain", async () => {
    const r = await verifyByCode(shortCodeBytes8(goodId), { reader: mkReader(), dns });
    record("A20", "Typed short code (single-issued)", "VERIFIED", r);
    expect(r.mode).toBe("code");
    const miss = await verifyByCode("0x1234567890abcde0", { reader: mkReader(), dns });
    record("A20b", "Unknown short code", "NOT_FOUND", miss);
  });
});

// ====================================================================================================================
// Review pass: squatting, lying files, chain time vs browser time, provider health, signature lifecycle.
describe.skipIf(!live)("review pass (live chain, real contracts)", () => {
  let X: Awaited<ReturnType<typeof newIssuer>>; // honest issuer
  let Y: Awaited<ReturnType<typeof newIssuer>>; // malicious accredited issuer
  beforeAll(async () => {
    X = await newIssuer("Honest University");
    Y = await newIssuer("Malicious College");
  });

  it("R1 root squatting (single): a rival who copies the root first cannot block or hijack the real issuance", async () => {
    const p = prepareCertificate(docFor(X.account.address) as any);
    // Y front-runs: anchors X's exact root under Y's own signature
    await anchorSingle(Y.w, p);
    // X still lands
    const { txHash } = await anchorSingle(X.w, p);
    const f = singleProofFile(dep, X.account.address, p, txHash);
    record("R1", "Rival anchored the same document root first; real issuer still verifies", "VERIFIED", await verify({ file: f }));
    // Y cannot revoke X's certificate
    let stranger = "accepted";
    try {
      await revokeCert(Y.w, { kind: "single", rid: recordId(X.account.address, p.built.documentRoot) }, 1);
    } catch (e) {
      stranger = /NotController/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("R1b", "Rival tries to revoke the honest issuer certificate", "REJECTED_ON_CHAIN", stranger);
    // Y has a separate record that is never mistaken for X's
    const asY = { ...structuredClone(f), signer: Y.account.address };
    const ry = await verify({ file: asY });
    expect(ry.issuer?.name).toBe("Malicious College");
  });

  it("R2 root squatting (batch): a rival cannot pre-claim a batch root or revoke through it", async () => {
    const docs = Array.from({ length: 4 }, (_, i) => docFor(X.account.address, { title: `Squat ${i}` }) as any);
    const b = prepareBatch(docs);
    await anchorBatch(Y.w, b); // rival anchors X's batchRoot first
    const { txHash } = await anchorBatch(X.w, b);
    const files = batchProofFiles(dep, X.account.address, b, txHash);
    record("R2", "Rival anchored the same batch root first; real batch still verifies", "VERIFIED", await verify({ file: files[1]! }));
    const t = files[2]!;
    const anchor = t.anchor as Extract<typeof t.anchor, { kind: "batch" }>;
    // the rival revokes "that member" through ITS OWN batch record
    await revokeCert(Y.w, { kind: "batch", identity: Y.account.address, batchRoot: anchor.batchRoot, documentRoot: t.documentRoot, expiresAt: t.expiresAt, proof: anchor.proof }, 1);
    record("R2b", "Honest batch member stays valid after the rival revokes it in the rival namespace", "VERIFIED", await verify({ file: t }));
  });

  it("R3 a PDF / JSON that lies about its own status is ignored: only chain + math decide", async () => {
    const p = prepareCertificate(docFor(X.account.address) as any);
    const { txHash } = await anchorSingle(X.w, p);
    const f = singleProofFile(dep, X.account.address, p, txHash);
    await revokeCert(X.w, { kind: "single", rid: recordId(X.account.address, p.built.documentRoot) }, 2);
    const liar = { ...structuredClone(f), verdict: "VERIFIED", status: "ACTIVE", revoked: false, issuer: { name: "Harvard", verified: true } };
    const parsed = parseProofFile(JSON.stringify(liar));
    record("R3", "Revoked certificate whose file claims status ACTIVE / verdict VERIFIED", "REVOKED", await verify({ file: parsed }));

    // and the reverse: a good certificate whose file claims it is revoked is not 'revoked' by the file
    const g = prepareCertificate(docFor(X.account.address) as any);
    const gt = await anchorSingle(X.w, g);
    const gf = singleProofFile(dep, X.account.address, g, gt.txHash);
    const liar2 = parseProofFile(JSON.stringify({ ...gf, status: "REVOKED", verdict: "REVOKED" }));
    record("R3b", "Active certificate whose file claims REVOKED", "VERIFIED", await verify({ file: liar2 }));

    // a lying 'issuer' block inside the file body cannot rename the issuer
    const r = await verify({ file: parsed });
    expect(r.issuer?.name).toBe("Honest University");
  });

  it("R4 time: expiry is judged on the chain clock, never the browser clock", async () => {
    const p = prepareCertificate(docFor(X.account.address) as any);
    p.expiresAt = (await chainNow()) + 40;
    const { txHash } = await anchorSingle(X.w, p);
    const f = singleProofFile(dep, X.account.address, p, txHash);
    // browser clock 70 years in the future: certificate must still be valid on chain
    const early = await verifyCertificate({ file: f }, { reader: mkReader(), dns, now: () => 4_000_000_000 });
    record("R4", "Browser clock set to the year 2096; certificate not yet expired on chain", "VERIFIED", early);
    expect(early.chainTime!.timestamp).toBeLessThan(4_000_000_000);
    await warp(120);
    // browser clock in 1970: certificate must be expired because the chain says so
    const late = await verifyCertificate({ file: f }, { reader: mkReader(), dns, now: () => 0 });
    record("R4b", "Browser clock set to 1970; chain time is past expiry", "EXPIRED", late);
    expect(late.chainTime!.timestamp).toBeGreaterThanOrEqual(p.expiresAt);
  });

  it("R5 issuedAt comes from block.timestamp: the issuer cannot backdate or choose it", async () => {
    const p = prepareCertificate(docFor(X.account.address, { issuedOn: "1999-01-01" }) as any);
    const before = await chainNow();
    const { txHash } = await anchorSingle(X.w, p);
    const f = singleProofFile(dep, X.account.address, p, txHash);
    const r = await verify({ file: f });
    expect(r.cert!.issuedAt).toBeGreaterThanOrEqual(before);
    expect(r.cert!.issuedAt).toBeLessThanOrEqual(await chainNow());
    rows.push({ id: "R5", attack: "Document says issued 1999; chain issuedAt is block time", expected: "issuedAt = block.timestamp", actual: String(r.cert!.issuedAt), pass: r.cert!.issuedAt >= before });
  });

  it("R6 provider health: a dead provider is reported, not hidden; a lone survivor is flagged degraded", async () => {
    const p = prepareCertificate(docFor(X.account.address) as any);
    const { txHash } = await anchorSingle(X.w, p);
    const f = singleProofFile(dep, X.account.address, p, txHash);
    // 1 dead + 2 live = quorum of two
    const q = await verify({ file: f }, dns, makeReader(dep, clientsFromUrls(["http://127.0.0.1:1", RPC, RPC], 800)));
    record("R6", "One of three providers down: quorum of two", "VERIFIED", q);
    expect(q.providers).toMatchObject({ asked: 3, answered: 2, agreed: 2, down: 1, degraded: false });
    // 2 dead + 1 live = single source
    const s = await verify({ file: f }, dns, makeReader(dep, clientsFromUrls(["http://127.0.0.1:1", "http://127.0.0.1:2", RPC], 800)));
    record("R6b", "Two of three providers down: single source, flagged", "VERIFIED", s);
    expect(s.providers).toMatchObject({ asked: 3, answered: 1, down: 2, degraded: true });
    // all dead = no verdict, kind=down
    const d = await verify({ file: f }, dns, makeReader(dep, clientsFromUrls(["http://127.0.0.1:1", "http://127.0.0.1:2"], 500)));
    record("R6c", "Every provider down", "CANNOT_REACH_CHAIN", d);
    expect(d.unreachable).toBe("down");
  });

  it("R7 signatures: a cancelled signature cannot be relayed by a stranger", async () => {
    const p = prepareCertificate(docFor(X.account.address) as any);
    const nonce = (await pub.readContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "nonces", args: [X.account.address] })) as bigint;
    const sig = await X.w.wallet.signTypedData(issueTypedData(dep.chainId, dep.certificateRegistry, { issuer: X.account.address, root: p.built.documentRoot, expiresAt: 0n, nonce }));
    const relayer = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain, transport: http(RPC) });
    await fund(relayer.account.address);
    // the issuer changes their mind before anyone relays it
    const cancel = await X.w.wallet.writeContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "invalidatePendingSignatures", chain } as any);
    await pub.waitForTransactionReceipt({ hash: cancel });
    let relayed = "accepted";
    try {
      const h = await relayer.writeContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "issue", args: [X.account.address, p.built.documentRoot, 0n, sig], chain } as any);
      const rc = await pub.waitForTransactionReceipt({ hash: h });
      if (rc.status !== "success") relayed = "REJECTED_ON_CHAIN";
    } catch (e) {
      relayed = /BadSignature/.test(String(e)) ? "REJECTED_ON_CHAIN" : String(e).slice(0, 80);
    }
    record("R7", "Relayer submits a signature the issuer cancelled", "REJECTED_ON_CHAIN", relayed);
  });
});

// ====================================================================================================================
// Contract v2: issuer type + accreditation source reach the verifier.
describe.skipIf(!live)("contract v2 (live chain)", () => {
  it("V1 issuer type and accreditation source are read from the chain and shown by the verifier", async () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    await fund(account.address);
    await rootTx("registerIssuer", [account.address, DOMAIN, "Demo Tehsil Office", true, 2, "Ministry notified list (demo)"]);
    identities.add(account.address.toLowerCase());
    const w: Writer = { wallet: createWalletClient({ account, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
    const p = prepareCertificate(docFor(account.address) as any);
    const { txHash } = await anchorSingle(w, p);
    const r = await verify({ file: singleProofFile(dep, account.address, p, txHash) });
    record("V1", "Revenue office listed by a (demo) ministry list verifies with its type", "VERIFIED", r);
    expect(r.issuer?.issuerType).toBe("REVENUE_OFFICE");
    expect(r.issuer?.accreditationSource).toBe("Ministry notified list (demo)");
    expect(r.checks[0]!.detail).toContain("revenue office");
  });

  it("V2 a four-argument legacy registration defaults to type OTHER with no source", async () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    await fund(account.address);
    await rootTx("registerIssuer", [account.address, DOMAIN, "Legacy Issuer", true]);
    identities.add(account.address.toLowerCase());
    const w: Writer = { wallet: createWalletClient({ account, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
    const p = prepareCertificate(docFor(account.address) as any);
    const { txHash } = await anchorSingle(w, p);
    const r = await verify({ file: singleProofFile(dep, account.address, p, txHash) });
    expect(r.issuer?.issuerType).toBe("OTHER");
  });
});

// ====================================================================================================================
// VERIFY.md claim: "no personal data on chain".
describe.skipIf(!live)("no personal data on chain (live chain)", () => {
  it("V3 recipient name, email and roll number never appear in any transaction input or log, anywhere on the chain", async () => {
    const startBlock = await pub.getBlockNumber({ cacheTime: 0 }); // scan only what this test wrote: the shared chain keeps growing across runs
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    await fund(account.address);
    await rootTx("registerIssuer", [account.address, DOMAIN, "PII Test College", true, 1, "test"]);
    identities.add(account.address.toLowerCase());
    const w: Writer = { wallet: createWalletClient({ account, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
    const marker = `Zyxwv${Date.now().toString(36)}`;
    const doc = docFor(account.address, { title: `Title ${marker}` }) as any;
    doc.recipient = { name: `Name ${marker}`, email: `${marker}@example.com`, rollNo: `ROLL-${marker}` };
    const single = prepareCertificate(doc);
    await anchorSingle(w, single);
    const batch = prepareBatch([doc, { ...doc, recipient: { ...doc.recipient, name: `Other ${marker}` } }]);
    await anchorBatch(w, batch);

    // positive control: plant the marker in one transaction so we know the scan CAN find it
    const control = await w.wallet.sendTransaction({ to: account.address, data: `0x${Buffer.from(marker, "utf8").toString("hex")}`, chain } as any);
    await pub.waitForTransactionReceipt({ hash: control });
    let controlFound = false;
    const needles = [`Name ${marker}`, `${marker}@example.com`, `ROLL-${marker}`, `Title ${marker}`, marker].map((s) => Buffer.from(s, "utf8").toString("hex"));
    const latest = await pub.getBlockNumber({ cacheTime: 0 }); // viem caches block numbers for a few seconds; a stale value hides the newest blocks
    let scanned = 0;
    for (let n = startBlock; n <= latest; n++) {
      const block = await pub.getBlock({ blockNumber: n, includeTransactions: true });
      for (const tx of block.transactions) {
        const rc = await pub.getTransactionReceipt({ hash: tx.hash });
        const haystack = [tx.input, ...rc.logs.flatMap((l) => [l.data, ...l.topics])].join("").toLowerCase().replace(/0x/g, "");
        for (const needle of needles) {
          const isMarker = needle === needles[4];
          if (tx.hash === control && isMarker) controlFound = haystack.includes(needle);
          else expect(haystack.includes(needle), `${needle} found in tx ${tx.hash}`).toBe(false);
        }
        scanned++;
      }
    }
    expect(controlFound, "the scan must detect a planted marker, otherwise this test proves nothing").toBe(true);
    expect(scanned).toBeGreaterThanOrEqual(5);
    rows.push({ id: "V3", attack: `No personal data on chain: scanned ${scanned} transactions and their logs`, expected: "none found", actual: "none found", pass: true });
  });
});
