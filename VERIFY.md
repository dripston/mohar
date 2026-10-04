# VERIFY.md: truth audit of what Mohar claims

Every claim the README, pitch or UI makes, graded **PROVEN** (a test or run shows it), **PARTIAL** (true with limits) or **FALSE/UNTESTED** (not shown yet). Nothing here is graded from memory: the evidence column names the test or file.

| # | Claim | Grade | Evidence / limit |
|---|---|---|---|
| 1 | A certificate's content cannot change without verification failing | PROVEN | `attack-matrix.test.ts` (tampered field, tampered file, swapped proof), Merkle recompute in `verify.ts`; golden vectors cross-checked in Solidity (`Golden.t.sol`) |
| 2 | Verification recomputes everything and never trusts data embedded in the file | PROVEN | `review.test.ts` (lying PDF/JSON/QR cases); web `e2e/review.spec.ts` P1-P5 |
| 3 | Another issuer cannot squat or overwrite a record (root squatting) | PROVEN | `Review.t.sol` squat tests; mutation "record not namespaced by identity" is killed (4 failing) |
| 4 | One Merkle root anchors a whole batch, ~540-580 gas per certificate at 200 | PARTIAL | Measured on Anvil (`GAS.md`, local). Base Sepolia measurement needs the funded key; mainnet rupees are an estimate, not measured |
| 5 | Issuance signatures cannot be replayed | PROVEN | EIP-712 + per-signer nonce; mutation "nonce not incremented" killed (3 tests fail) |
| 6 | Revocation / suspension work and cannot be undone by the wrong party | PROVEN | `CertificateRegistry` tests; mutations "controller check removed", "revoked can be un-revoked" killed |
| 7 | Issuer key revocation uses a cutoff date; earlier certificates stay valid; cutoff can only move earlier | PROVEN | Mutations "cutoff boundary", "revocation may be moved later", "key revocation not checked at issue time" all killed |
| 8 | Pause stops issuance only; revoke, suspend, reinstate and reads keep working | PROVEN | `V2.t.sol`; mutations "pause blocks nothing" and "anyone can pause" killed |
| 9 | Only the root authority can list issuers or set their type | PROVEN | `V2.t.sol`; mutation "anyone can set issuer type" killed |
| 10 | No personal data is stored on chain | PROVEN | `attack-matrix.test.ts` V3: scans every on-chain byte for the recipient's strings, with a positive control that proves the scan can find them |
| 11 | Expiry and key-cutoff decisions use chain time, not the browser clock | PROVEN | `review.test.ts` (clock skew), `verify.ts` uses the pinned block timestamp |
| 12 | Reading the chain needs agreement of several providers | PARTIAL | Quorum logic tested with mock providers and 3 local endpoints. **Real independence of Base Sepolia public RPCs is not proven** (they may share infrastructure) |
| 13 | Verification works with the Mohar backend stopped | PARTIAL | Verify page reads chain + proof file in the browser; tested on localhost. **Not yet tested on a deployed host or over mobile data** |
| 14 | Domain proof is checked live over DNS-over-HTTPS | PARTIAL | Code and mocks tested. **No real domain TXT record has been checked end to end** (needs a domain the owner controls). The demo zone is labelled DEMO ONLY and only available on chain 31337 |
| 15 | Hostile proof files (zip bomb, 10k fields, unicode tricks, bidi) are rejected safely | PROVEN | `review.test.ts` LIMITS tests, bounded inflate; e2e N1-N7 |
| 16 | CSV bulk import cannot inject formulas or be tricked by encoding | PROVEN | `csv.ts` hardening tests, e2e I-X1..3 |
| 17 | A short code resolves to one certificate, and a clash is reported not guessed | PROVEN | `resolveCode` tests, `ambiguous` flag in the UI |
| 18 | The QR code fits a scannable size for a typical certificate link | PARTIAL | `docs/qr-study.json`: fits for compact links; large proofs fall back to a file. Scan reliability on real phones is untested |
| 19 | Deployed on Base Sepolia, source verified on BaseScan | **FALSE (not yet)** | `deployments/base-sepolia.json` is a placeholder (`deployed:false`). Needs the funded key (`PRIVATE_KEY` env) and optional `ETHERSCAN_API_KEY` |
| 20 | Works on a real phone over mobile data | **UNTESTED** | Needs the deployed site (Vercel) and a device |
| 21 | Legal compliance (DPDP, IT Act) | **NOT CLAIMED** | The design minimises data (nothing personal on chain, per-field disclosure). We do not claim compliance |
| 22 | The root authority is trustworthy | NOT CLAIMED | See `AUTHORITY.md`: it is the one trusted party; a stolen key's blast radius is listed there |

## Test status at the end of Phase 7

| Suite | Result |
|---|---|
| Foundry (`forge test`) | 71 passed, 0 failed (unit, fuzz, invariant, TS<->Solidity cross-checks, review, v2) |
| Mutation spot check (`packages/contracts/mutate.sh`) | 14 mutations, all killed by real test failures. An earlier run reported two "kills" with 0 failing tests; those were compile errors, not kills. They were rewritten to compile and re-run: nonce (3 failing), pause (2 failing). The script now reports `BROKEN` for non-compiling mutants |
| Core vitest | 125 passed, 0 failed (unit, golden vectors, review, live-chain attack matrix) |
| Playwright | Last full pass was 41/41 **before** contract v2; re-run needed against v2 |

## What is NOT proven

- Anything on a public network (deploy, BaseScan, real RPC independence, real DNS, mobile data).
- Real-world adoption: no issuer has been onboarded; the demo issuer is labelled demo.
- Mutation testing covers 14 hand-picked mutations, not all possible bugs.
