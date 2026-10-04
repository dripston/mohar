# Scholarship layer, bulk screening and privacy receipts (Phases 9-11)

Everything here is a **demo with synthetic data**. Names are "Applicant 0001", issuers are labelled `(demo)`, incomes are random, and the scheme limits live in a demo checklist, not in law. Mohar is designed for data minimisation; it makes no compliance claim.

## The scene

Three actors: an **Authority** (demo ministry, the root of the issuer registry), an **Institute** (issues Enrolment Certificates) and a **Revenue Office** (issues Caste and Income Certificates). A student holds the three certificates and builds one application bundle for one scheme. A scheme officer checks it.

## Flags are attested, not zero knowledge

An income certificate carries `flags.income_lte_250000` and `flags.income_lte_600000`; a caste certificate carries `flags.st_category`; an enrolment carries `flags.enrolment_active`. Each flag is an ordinary salted leaf in the certificate's Merkle tree, signed by the issuer like every other field. The student can show the flag and hide the income figure. This is **not** zero-knowledge: the verifier trusts the issuer that the flag is true. What it proves is that the issuer, accredited as the right type, committed to that flag, and that the flag was not edited.

## Scheme checklist

`packages/mohar-core/src/scheme.ts`. A scheme is a small JSON object: id, name, and requirements. Each requirement names a credential type, the issuer type that must have issued it, and flags that must be disclosed, proven and `true`. Global rules (not expired, not revoked, issuing key not revoked at issue time, domain check) come from the normal verification pipeline for every requirement.

Per-requirement reason codes: `OK, MISSING, WRONG_ISSUER_TYPE, FLAG_FALSE, FLAG_NOT_DISCLOSED, APPLICANT_MISMATCH, EXPIRED, SUSPENDED, REVOKED, ISSUER_REVOKED, TAMPERED, UNKNOWN_ISSUER, NOT_FOUND, MALFORMED, WRONG_CHAIN, CANNOT_REACH_CHAIN`.

Aggregate verdicts, in priority order:

| Verdict | Meaning |
|---|---|
| UNREACHABLE | chain providers down or split; no verdict (an addition to the four in the plan, for honesty) |
| INVALID | a credential is tampered, revoked, from a revoked issuer, unknown, not on chain, or credentials belong to different applicants |
| INCOMPLETE | a required credential is missing |
| NOT_ELIGIBLE | genuine credentials, but expired, suspended, wrong issuer type or a flag is false |
| ELIGIBLE | all requirements pass |

## Bundles and why QR is for single credentials only

A bundle is a `.mohar` JSON file: for each requirement, the matching credential with **only** `credential.type`, `recipient.applicantId` and the flags it needs. Name, income, address and the salts of every hidden leaf are removed before the file exists. The app shows the exact "shared / stays on your device" lists before the student downloads. Three credentials with Merkle proofs are several kilobytes; a QR that holds that is not reliably scannable (`docs/qr-study.json`), so QR stays for a single credential and bundles are files.

The applicant id (`APP-0001`) is a pseudonymous label disclosed so the officer can tell the three credentials belong to the same person. It is the one identifier that travels.

## Officer view

Drop a bundle; every credential is verified fresh from the chain; nothing in the file is believed (extra keys like `"aggregate":"ELIGIBLE"` are dropped by the parser). The officer sees ticks and crosses with reason codes. No income figure or address is in the bundle, so none can appear.

## Authority actions flow through

The authority revokes an institute's key with an effective date. Certificates issued before the date stay valid; those after turn `ISSUER_REVOKED`, and the next officer check or bulk screen shows it. The date can only move earlier, never later.

## Bulk screening

`/bulk` takes a ZIP of bundles and returns a shortlist table, summary bar, sort/filter, row detail and a CSV report (verdicts and reason codes only; cells starting `= + - @` are prefixed so spreadsheets will not run them).

How it is fast: one pinned chain snapshot reused for the run (every verdict is judged at the same block), cached issuer lookups, one DNS lookup per issuer, JSON-RPC batching (many reads per HTTP request), and a worker pool. The plan asked for multicall; JSON-RPC batching was used instead because it needs no extra contract on the chain.

Safety: archive size, entry count, per-entry and total declared size are checked **before** inflating; a malformed entry becomes a `ROW_ERROR` row, never a crash; every rendered value is stripped of control and bidi characters and React-escaped. A ZIP of CSV links (the "generic mode") is not built; generic mode takes proof files via `screenProofFiles` in code only.

Measured timings: see `docs/bulk-timings.json` (machine, node and date are recorded in the file). They are local Anvil timings, one provider, not Sepolia.

## Privacy receipt (Phase 11)

After a check, **Verification receipt** exports JSON and PDF: verdict, the five checks, chain id, contract, block number and block time, issuer, and the fields the holder chose to disclose (verified ones only). Never hidden fields or salts. `receiptHash` is keccak256 of the canonical JSON of everything else; edit any byte and `receiptIntact` fails. A receipt is refused for a result older than ten minutes, so it always comes from a fresh check.

Purpose, recipient and expiry labels on a share are **advisory**: a link can be copied, so they are shown (and an expired one warns) but cannot be enforced. The UI says so.

A Playwright test blocks every request except the chain RPC and DNS-over-HTTPS and still gets a verdict: nothing is sent to our server.
