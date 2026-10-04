# TESTING

Everything here was run against a **live local EVM chain (Anvil) with the real, deployed contracts**. The only simulated component is DNS on the local network (a labelled `local-demo-zone`).

Reproduce: `powershell -File scripts/dev-chain.ps1`, then `forge test` (packages/contracts), `pnpm --filter @mohar/core test`, `pnpm --filter @mohar/web e2e`, then `node scripts/make-testing-md.mjs`.

## Suites

| Suite | What it proves |
|---|---|
| Foundry (`packages/contracts/test`) | Unit tests per function, 1000-run fuzz tests, stateful invariants (revoked never Active, non-issuers never succeed, cutoff splits history), TS<->Solidity cross-language vectors |
| Vitest unit (`mohar-core/test/core.test.ts`) | Canonical JSON, golden vectors (same input, same root), Merkle proofs, selective disclosure, short codes, link/QR formats, EIP-712 binding |
| Vitest attack matrix (`attack-matrix.test.ts`) | Full verification pipeline on a live chain for every attack below |
| Playwright (`apps/web/e2e`) | The same verdicts through the real UI, plus issuer/holder/admin flows and a phone viewport |

### Foundry output

```
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 176.73ms (155.30ms CPU time)
Suite result: ok. 39 passed; 0 failed; 0 skipped; finished in 188.38ms (173.12ms CPU time)
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 4.84s (13.55s CPU time)
Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 19.82s (19.78s CPU time)
Ran 4 test suites in 19.85s (25.03s CPU time): 51 tests passed, 0 failed, 0 skipped (51 total tests)
```

## Attack matrix: protocol level (41/41 passing)

Chain id 31337, CertificateRegistry `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, run at 2026-10-04T07:32:21.191Z.

| ID | Attack / scenario | Expected | Actual | Result |
|---|---|---|---|---|
| A0 | Genuine certificate, full proof file | `VERIFIED` | `VERIFIED` | PASS |
| A0b | Genuine certificate, link/QR only | `VERIFIED` | `VERIFIED` | PASS |
| A1 | Tampered field: grade 8.34 -> 9.8 | `TAMPERED` | `TAMPERED` | PASS |
| A1b | Forged document with a freshly built tree (root never anchored) | `TAMPERED` | `TAMPERED` | PASS |
| A2 | Field silently removed from a full file | `TAMPERED` | `TAMPERED` | PASS |
| A3 | Swapped issuer (signer field replaced by another accredited key) | `UNKNOWN_ISSUER` | `UNKNOWN_ISSUER` | PASS |
| A4 | Fake issuer wallet tries to anchor | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A4b | Forged file signed by an unregistered key | `UNKNOWN_ISSUER` | `UNKNOWN_ISSUER` | PASS |
| A5 | Replay a used signature on a different root | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A5b | Replay a used signature on the same root | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A6 | Revoked (issued in error) | `REVOKED` | `REVOKED` | PASS |
| A6b | Another accredited issuer tries to revoke someone else's certificate | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A6c | Issuer tries to un-revoke | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A7 | Suspended certificate | `SUSPENDED` | `SUSPENDED` | PASS |
| A7b | Reinstated after suspension | `VERIFIED` | `VERIFIED` | PASS |
| A8 | Expired certificate | `EXPIRED` | `EXPIRED` | PASS |
| A8a | Before expiry | `VERIFIED` | `VERIFIED` | PASS |
| A8c | Expiry extended in the file | `TAMPERED` | `TAMPERED` | PASS |
| A9a | Issuer key revoked: cert issued BEFORE cutoff | `VERIFIED` | `VERIFIED` | PASS |
| A9b | Issuer key revoked: cert issued AFTER cutoff | `ISSUER_REVOKED` | `ISSUER_REVOKED` | PASS |
| A9c | Revoked issuer key tries to issue again | `REJECTED_ON_CHAIN` | `REJECTED_ON_CHAIN` | PASS |
| A10a | After rotation, certificate issued by old key still valid | `VERIFIED` | `VERIFIED` | PASS |
| A10b | New key revokes certificate issued by the old key | `REVOKED` | `REVOKED` | PASS |
| A11 | Unknown ID, link mode | `NOT_FOUND` | `NOT_FOUND` | PASS |
| A12 | Malformed QR fragment | `MALFORMED` | `MALFORMED` | PASS |
| A12b | Malformed proof file | `MALFORMED` | `MALFORMED` | PASS |
| A13 | Certificate for another chain | `WRONG_CHAIN` | `WRONG_CHAIN` | PASS |
| A14 | Forged PDF: genuine QR pasted on edited content | `TAMPERED` | `TAMPERED` | PASS |
| A15a | Batch certificates verify (sampled 6/25) | `VERIFIED` | `VERIFIED` | PASS |
| A15b | Revoke one batch member | `REVOKED` | `REVOKED` | PASS |
| A15c | Sibling in the same batch stays valid | `VERIFIED` | `VERIFIED` | PASS |
| A15d | Wrong Merkle proof for a batch member | `TAMPERED` | `TAMPERED` | PASS |
| A15e | Batch gas per certificate (25 certs) | `< 5000` | `4327` | PASS |
| A16 | Selective disclosure (grade hidden) | `VERIFIED` | `VERIFIED` | PASS |
| A16b | Selective disclosure with an edited disclosed field | `TAMPERED` | `TAMPERED` | PASS |
| A17 | DNS-over-HTTPS unreachable | `VERIFIED_DOMAIN_UNCHECKED` | `VERIFIED_DOMAIN_UNCHECKED` | PASS |
| A17b | Domain record missing/changed | `UNKNOWN_ISSUER` | `UNKNOWN_ISSUER` | PASS |
| A18 | All RPC endpoints unreachable | `CANNOT_REACH_CHAIN` | `CANNOT_REACH_CHAIN` | PASS |
| A19 | First RPC dead, fallback answers | `VERIFIED` | `VERIFIED` | PASS |
| A20 | Typed short code (single-issued) | `VERIFIED` | `VERIFIED` | PASS |
| A20b | Unknown short code | `NOT_FOUND` | `NOT_FOUND` | PASS |

## Attack matrix: through the UI (23/23 passing)

Each row has a screenshot taken by Playwright at the moment of the assertion.

| ID | Attack / scenario | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|
| A1-accredit-issuer | Authority accredits an issuer on chain | `Active` | `Active` | PASS | [screenshot](docs/evidence/A1-accredit-issuer.png) |
| A2-revoke-key-cutoff | Authority revokes a key from a past moment | `Revoked` | `Revoked` | PASS | [screenshot](docs/evidence/A2-revoke-key-cutoff.png) |
| E1-verified-full | Genuine certificate, full proof file | `VERIFIED` | `VERIFIED` | PASS | [screenshot](docs/evidence/E1-verified-full.png) |
| E2-verified-link | Genuine certificate, QR link only | `VERIFIED` | `VERIFIED` | PASS | [screenshot](docs/evidence/E2-verified-link.png) |
| E3-tampered | Grade edited 8.34 -> 9.8 | `TAMPERED` | `TAMPERED` | PASS | [screenshot](docs/evidence/E3-tampered.png) |
| E4-forged-pdf | Forged PDF: real QR on edited content | `TAMPERED` | `TAMPERED` | PASS | [screenshot](docs/evidence/E4-forged-pdf.png) |
| E6-revoked | Revoked (issued in error) | `REVOKED` | `REVOKED` | PASS | [screenshot](docs/evidence/E6-revoked.png) |
| E7-suspended | Suspended | `SUSPENDED` | `SUSPENDED` | PASS | [screenshot](docs/evidence/E7-suspended.png) |
| E8-expired | Expired | `EXPIRED` | `EXPIRED` | PASS | [screenshot](docs/evidence/E8-expired.png) |
| E9a-issuer-cutoff-before | Issuer key revoked: certificate issued BEFORE cutoff | `VERIFIED` | `VERIFIED` | PASS | [screenshot](docs/evidence/E9a-issuer-cutoff-before.png) |
| E9b-issuer-cutoff-after | Issuer key revoked: certificate issued AFTER cutoff | `ISSUER_REVOKED` | `ISSUER_REVOKED` | PASS | [screenshot](docs/evidence/E9b-issuer-cutoff-after.png) |
| E10-batch-revoked | One certificate in a batch revoked | `REVOKED` | `REVOKED` | PASS | [screenshot](docs/evidence/E10-batch-revoked.png) |
| E11-unknown-id | Unknown certificate ID | `NOT_FOUND` | `NOT_FOUND` | PASS | [screenshot](docs/evidence/E11-unknown-id.png) |
| E12-wrong-chain | Certificate for another chain | `WRONG_CHAIN` | `WRONG_CHAIN` | PASS | [screenshot](docs/evidence/E12-wrong-chain.png) |
| E13-malformed-qr | Malformed QR fragment | `MALFORMED` | `MALFORMED` | PASS | [screenshot](docs/evidence/E13-malformed-qr.png) |
| E14-selective-disclosure | Holder hides grade and email, shares new link | `VERIFIED` | `VERIFIED` | PASS | [screenshot](docs/evidence/E14-selective-disclosure.png) |
| E15-server-dead | Our server unreachable, verification continues | `REVOKED` | `REVOKED` | PASS | [screenshot](docs/evidence/E15-server-dead.png) |
| I1-issue-single | Issuer signs (EIP-712) and anchors one certificate | `confirmed` | `confirmed` | PASS | [screenshot](docs/evidence/I1-issue-single.png) |
| I3-revoke-flow | Revoke from dashboard, rescan shows REVOKED + reason | `REVOKED` | `REVOKED` | PASS | [screenshot](docs/evidence/I3-revoke-flow.png) |
| I4a-bulk-validation | Bulk CSV: invalid row highlighted before anchoring | `flagged` | `flagged` | PASS | [screenshot](docs/evidence/I4a-bulk-validation.png) |
| I4b-bulk-anchored | 39 certificates anchored in one transaction | `anchored` | `anchored` | PASS | [screenshot](docs/evidence/I4b-bulk-anchored.png) |
| M1-mobile-verified | Phone-width verify (Pixel 7) | `VERIFIED` | `VERIFIED` | PASS | [screenshot](docs/evidence/M1-mobile-verified.png) |
| M2-mobile-revoked | Phone-width revoked state (Pixel 7) | `REVOKED` | `REVOKED` | PASS | [screenshot](docs/evidence/M2-mobile-revoked.png) |

## Coverage of the required attacks

| Required case | Where |
|---|---|
| Tampered field | A1, A1b, A2, E3 |
| Swapped issuer | A3, A4b |
| Replayed signature | A5, A5b (contract-level, plus Foundry `test_issue_replayIsImpossible`) |
| Revoked certificate | A6, E6 |
| Revoked issuer before / after cutoff | A9a, A9b, E9a, E9b |
| Expired | A8, E8 |
| Unknown ID | A11, A20b, E11 |
| Malformed QR | A12, A12b, E13 |
| Wrong chain | A13, E12 |
| Forged PDF | A14, E4 |
| Fake issuer wallet | A4 |
| Suspend / reinstate | A7, A7b |
| Key rotation | A10a, A10b |
| Batch issuance, revoke one member | A15a-e, E10 |
| Selective disclosure | A16, A16b, E14 |
| DNS failure degrades, DNS mismatch fails | A17, A17b |
| RPC down / fallback | A18, A19 |
| Backend unreachable | E15 |
