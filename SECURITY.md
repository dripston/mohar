# SECURITY.md

Scope: contracts v2 (deployed on Base Sepolia, source verified), the verification library, the scholarship/bulk/receipt layers, the AI routes. Honest summary: **no open high or medium findings after Phase 13**; several low/informational items and residual risks are listed below. This is a hackathon-grade review by the builders and their tooling, **not an independent audit**.

## What was done in Phase 13

| Method | Result |
|---|---|
| Slither (102 detectors) on `src/` | 13 results, all informational/low (see table) |
| Manual hostile read of `CertificateRegistry` and `IssuerRegistry` v2 | no high/medium. Access control, namespacing, nonce use, pause semantics, reentrancy surface (none: no external calls except view calls to the registry) checked |
| Foundry: 78 tests incl. fuzz (1,000 runs each) and invariants (`revokedNeverActive`, `outsidersNeverSucceed`, `issuedStaysKnown`, `cutoffSplitsHistory`) | pass |
| New `Hardening.t.sol` (7 tests): only root sets issuer type (fuzz), other issuer cannot touch my batch, every lifecycle change emits `StatusChanged`, pause blocks only issuance, pending signatures can be killed, reinstate cannot resurrect, garbage batch proofs never materialise | pass. They pin existing behaviour; no bug was found, so there was no "failing first" case |
| Mutation spot check (14 hand-picked mutants) | all killed by real test failures |
| Parser fuzzing (`fuzz.test.ts`, seeded): bundle, proof file, scheme, link/QR payloads, corrupted ZIPs, a 300 MB zip bomb | no crash, no hang, no non-Error throw, no prototype pollution; found nothing |
| XSS/trust re-run on scholarship screens (Playwright): hostile share labels, file names, AI output | rendered as text, no script ran |
| Attack matrix on the real Base Sepolia deployment (`sepolia-attacks.test.ts`, read-only) | see `TESTING` evidence; run with `SEPOLIA=1` |
| Scholarship attacks (Anvil, `scheme.test.ts` + Playwright): wrong issuer type, forged flag, swapped bundle, mixed applicants, revoked/expired/suspended credential, lying bundle keys, replayed bundle | all give the expected verdict; replay is **flagged, not preventable** (below) |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Low | `Paused` / `Unpaused` events have an unindexed address | Accepted. Fixing means redeploying and re-seeding; the field is still in the log |
| 2 | Low | `invalidatePendingSignatures()` changes the nonce without an event | Accepted; off-chain tools can read `nonces(signer)` |
| 3 | Info | Slither "dangerous strict equality" on `expiresAt == 0` / status checks | By design: zero means "no expiry" / "not set" |
| 4 | Info | Slither "timestamp" comparisons | By design: expiry and key cutoffs are judged on block time (the verifier uses chain time, not the browser's). L2 sequencers can skew a few seconds |
| 5 | Info | `ECDSA.tryRecover` return partly unused | The error code is checked; the recovered address is compared to `signer` |
| 6 | Info | `issueBatch` stores `count` as declared by the issuer; it is not checked against the tree | Informational only; membership is proven by Merkle proof, never by count |
| 7 | Low | 60-bit short codes can be made ambiguous by an accredited issuer who grinds collisions | Detected and reported as "ambiguous"; a code is a pointer, not an identity |

## Residual risks (stated, not fixed)

1. **The root authority is a single key.** It can list or classify any issuer, revoke a key from a past date, and pause issuance. It cannot forge a certificate, edit an issued one, or silently un-revoke a key (cutoffs only move earlier). Blast radius of a stolen root key: attacker lists a fake issuer or revokes honest keys (visible on chain, fixable only by a new root, which v2 does not support) and can pause issuance. See `AUTHORITY.md`. Mitigation on the roadmap: multisig and timelock.
2. **Issuer flags are attested, not zero knowledge.** A verifier trusts the accredited issuer that `income_lte_250000` is true.
3. **Bundle replay.** A valid bundle can be handed in twice, or by someone else. The share's purpose/recipient/expiry are advisory labels. Mohar flags duplicate applicant ids in a bulk run; it cannot bind a bundle to a person without a holder key, which is roadmap.
4. **A genuine institute can enrol fake students.** Cryptography cannot catch that; public issuance records make audits faster.
5. **Public RPC providers may share infrastructure.** Two agreeing providers is not proof of independence. A lone provider is flagged "single source".
6. **DNS proof depends on the registrar and DoH resolvers.** The demo uses a free DuckDNS name for the TXT record.
7. **AI routes send text to a third party (Groq).** Documented in `AI_DISCLOSURE.md`. They are optional; verification never calls them.
8. **Public RPC load balancers lag.** This caused real seed failures (stale nonces); the signer and seed now wait for fresh state. A user submitting two transactions seconds apart on a public RPC can still hit it.
9. **The deployer key is a testnet key** kept in a git-ignored `.env`; it is the demo root authority. Do not reuse it anywhere.
10. **No formal verification and no external audit.**

## Reporting

Open an issue on the repository, or contact the team listed in the README.
