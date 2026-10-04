/**
 * Phase 13.6: the attack matrix against the REAL Base Sepolia deployment, read-only (no transactions, no gas).
 * Real public RPCs (quorum of 3) and real DNS-over-HTTPS. Uses the files written by the Sepolia seed.
 *   SEPOLIA=1 pnpm --filter @mohar/core exec vitest run test/sepolia-attacks.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientsFromUrls, makeDohResolver, makeReader, parseProofFile, verifyCertificate, type Deployment, type ProofFile } from "../src";

const on = process.env.SEPOLIA === "1";
const url = (p: string) => new URL(p, import.meta.url);
const dep = JSON.parse(readFileSync(url("../../../deployments/base-sepolia.json"), "utf8")) as Deployment;
const RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"];
const load = (n: string): ProofFile => parseProofFile(readFileSync(url(`../../../docs/seed/${n}.mohar.json`), "utf8"));
const run = (file: ProofFile) =>
  verifyCertificate({ file }, { reader: makeReader({ ...dep, rpcUrls: RPCS }, clientsFromUrls(RPCS, 8000)), dns: makeDohResolver() });

describe.skipIf(!on)("attack matrix on Base Sepolia (read-only)", () => {
  it("genuine certificate: VERIFIED, real DNS, at least two providers agree", async () => {
    const r = await run(load("verified"));
    expect(r.verdict).toBe("VERIFIED");
    expect(r.providers!.agreed).toBeGreaterThanOrEqual(2);
    expect(r.checks[1]!.status).toBe("pass");
    expect(r.checks[1]!.detail).not.toMatch(/DEMO/);
  }, 60_000);

  it("states seeded on chain are read back exactly", async () => {
    for (const [n, v] of [["revoked", "REVOKED"], ["suspended", "SUSPENDED"], ["expired", "EXPIRED"], ["issuer-revoked", "ISSUER_REVOKED"], ["batch-valid", "VERIFIED"], ["batch-revoked", "REVOKED"]] as const) {
      expect((await run(load(n))).verdict, n).toBe(v);
    }
  }, 120_000);

  it("A1 edited field -> TAMPERED", async () => {
    const f = load("verified");
    f.fields["credential.grade"] = { ...f.fields["credential.grade"]!, value: JSON.stringify("A+") };
    expect((await run(f)).verdict).toBe("TAMPERED");
  }, 60_000);

  it("A2 a field from another certificate spliced in -> TAMPERED", async () => {
    const f = load("verified");
    const other = load("revoked");
    f.fields["recipient.name"] = other.fields["recipient.name"]!;
    expect((await run(f)).verdict).toBe("TAMPERED");
  }, 60_000);

  it("A3 dropping a field from a 'full' file -> TAMPERED", async () => {
    const f = load("verified");
    delete f.fields["credential.grade"];
    expect((await run(f)).verdict).toBe("TAMPERED");
  }, 60_000);

  it("A4 someone else's signer address on a genuine root -> UNKNOWN_ISSUER", async () => {
    const f = load("verified");
    f.signer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    expect((await run(f)).verdict).toBe("UNKNOWN_ISSUER");
  }, 60_000);

  it("A5 wrong chain id -> WRONG_CHAIN", async () => {
    const f = load("verified");
    f.chainId = 1;
    expect((await run(f)).verdict).toBe("WRONG_CHAIN");
  }, 60_000);

  it("A6 batch member with a sibling's proof -> TAMPERED", async () => {
    const f = load("batch-valid");
    const g = load("batch-revoked");
    if (f.anchor.kind !== "batch" || g.anchor.kind !== "batch") throw new Error("fixture is not a batch");
    f.anchor = { ...f.anchor, proof: g.anchor.proof };
    expect((await run(f)).verdict).toBe("TAMPERED");
  }, 60_000);

  it("A7 a revoked batch member cannot borrow a valid sibling's status", async () => {
    const f = load("batch-revoked");
    expect((await run(f)).verdict).toBe("REVOKED");
  }, 60_000);

  it("A8 expiry edited to the future on an expired certificate -> TAMPERED (expiry is bound on chain)", async () => {
    const f = load("expired");
    f.expiresAt = f.expiresAt + 10 * 365 * 86400;
    expect((await run(f)).verdict).toBe("TAMPERED");
  }, 60_000);

  it("A9 lying extra keys in the file are ignored by the parser", async () => {
    const raw = JSON.parse(readFileSync(url("../../../docs/seed/revoked.mohar.json"), "utf8"));
    raw.verdict = "VERIFIED";
    raw.status = "Active";
    expect((await run(parseProofFile(raw))).verdict).toBe("REVOKED");
  }, 60_000);

  it("A10 all providers unreachable -> CANNOT_REACH_CHAIN, never a guess", async () => {
    const dead = ["http://127.0.0.1:9", "http://127.0.0.1:10", "http://127.0.0.1:11"];
    const r = await verifyCertificate({ file: load("verified") }, { reader: makeReader({ ...dep, rpcUrls: dead }, clientsFromUrls(dead, 1500)), dns: makeDohResolver() });
    expect(r.verdict).toBe("CANNOT_REACH_CHAIN");
  }, 30_000);
});
