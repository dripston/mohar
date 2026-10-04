# Mohar review pass: Phases 1 to 6

Scope: audit only, no new features. Method for each item: write a test that fails on the old code, fix, confirm green.

**Final state:** Foundry 62 pass, core 122 pass (incl. 25-row live attack matrix + review rows), Playwright 41 pass.

**How "red first" was proven**
- Contracts: the squat tests were run against the old contract and failed with `AlreadyAnchored()` (single and batch).
- Core: `test/review.test.ts` was run against the pre-review `canonical.ts`, `link.ts`, `dns.ts`; 10 tests failed (listed under each finding), then passed after the fixes.
- Playwright: new specs were written together with the fixes (the old UI had no provider-health state, no `provider-note`, no `chain-time` to assert against). Where I could not show red, the table says so.

## Findings

| # | Finding | Severity | Proof test | Fix | Status |
|---|---------|----------|-----------|-----|--------|
| 1a | **Root squatting, single.** Any accredited issuer could copy a pending `documentRoot` and `issue()` it first. The real issuer's tx reverted `AlreadyAnchored`, and the verifier then saw the wrong signer. The squatter also controlled revoke/suspend of the record. | **High** (needs a malicious accredited issuer and a visible mempool; public Base mempool is thin, but the design allowed it) | `ReviewTest.test_squat_singleRoot_cannotBlockOrHijack` (red: `AlreadyAnchored`), attack matrix R1/R1b | Records keyed `keccak256(identity, root)` (`recordId`). Identity, not key, so rotation still works. | Fixed |
| 1b | **Root squatting, batch.** Same attack on `batchRoot`; the squatter then owned `revokeFromBatch` for every member. | **High** | `test_squat_batchRoot_cannotBlockOrHijack` (red), R2/R2b | Batch keyed `keccak256(identity, batchRoot)`; member rid `keccak256(identity, batchRoot, documentRoot)`. `getBatchCert(identity, ...)`. Core (`ids.ts`, `chain.ts`, `verify.ts`, `issue.ts`), dashboard, independent-check panel and e2e fixtures updated. | Fixed |
| 1c | The old test `test_batch_cannotReanchor` and `test_issue_cannotOverwriteRoot` **enshrined the bug** (expected a rival to be rejected). | Medium (weak test) | rewritten | Now assert same identity cannot re-anchor, rival gets a separate record | Fixed |
| 2 | Merkle: second preimage, double hashing, sorted pairs, odd nodes, count leaf. | none found | `review.test.ts` section 2: wrong-field proof, extended/truncated proofs, internal-node-as-leaf, field-vs-batch leaf confusion, every batch size 1..33, forged/dropped count leaf | No change needed. Leaf preimage is >= 192 bytes (abi.encode of 2 strings + bytes32) and internal nodes are 64 bytes, so the two can never collide; leaves are double-hashed (OZ standard). A 1-entry batch has root == leaf hash (documented, harmless). | Verified, tests added |
| 3a | **No Unicode normalisation.** The same name typed on macOS (NFD) and Windows (NFC) produced different committed values; keys that collide after NFC would have merged silently. | Medium | `canonicalisation > NFC...`, `keys that collide...` (red on old code) | `normaliseText`: NFC; refuse unpaired surrogates, control chars, bidi overrides; refuse NFC key collisions and empty keys. Verification never normalises (it hashes the exact signed bytes). | Fixed |
| 3b | **Numbers.** `1e21`, `1e-7`, unsafe integers and `-0` printed differently across languages. | Low | `numbers: ...` (red) | Refuse exponent forms and unsafe integers; `-0` prints `0`. Dates stay strings validated as real `YYYY-MM-DD`. | Fixed |
| 3c | Null vs missing vs `""` vs `"null"`; key order. | none | `null, empty string, missing...`, `key order` | Already distinct (and the field-count leaf commits to presence). Test added. | Verified |
| 3d | **TS and Solidity agreement.** | none | Golden vectors: `scripts/gen-vectors.ts` writes `test/vectors/golden.json` (NFD input, empty, null, -0, Devanagari, emoji, RTL, shuffled keys); `Golden.t.sol` re-derives each leaf with `abi.encode` and proves it into the TS root; also asserts NFC bytes `c3a9`. Inline snapshot pins a TS root. | | Verified |
| 4a | **XSS.** Forged values: `<script>`, `<img onerror>`, `javascript:`, bidi override, 1,900 chars, RTL, 5,000 fields, 6 MB and 4 MB junk. React escaping already held; no `dangerouslySetInnerHTML` anywhere. | none for script injection | Playwright X1-X4 (`window.__xss` stays undefined, no `img/script` nodes, no horizontal overflow) | Added defence in depth: invisible/bidi characters stripped from rendered values with a visible "hidden characters removed" note, `dir="auto"`, scroll cap on long values, upload cap 20 MB -> 5 MB. | Verified + hardened |
| 4b | **Bidi spoofing** (`‮` makes `gpj.exe` read as a different name). | Medium | X1, `rejects unpaired surrogates...` | Refused at issuance (single form, CSV rows) and stripped at display and in the PDF. | Fixed |
| 4c | **PDF generation crashed on non-Latin names.** pdf-lib built-in fonts throw on Devanagari/emoji; an Indian issuer could not print an Indian name. Long values also ran off the page. | **High for usability** (the product's market) | Playwright I-X2 (Devanagari name still downloads a PDF) | `fitText`: unencodable glyphs become `?`, text shrinks/truncates to the page. The exact text always travels in the embedded proof. | Fixed. **Residual:** the printed PDF shows `?` for non-Latin names until a Unicode font is bundled. |
| 4d | Issuer form: 10,000-char title, bidi in name. | Low | I-X3 | Length caps and text checks already/now enforced with plain messages | Verified |
| 5a | **Lying PDF/JSON.** Embedded `verdict`, `status`, `revoked`, fake `issuer` block. | none exploitable | Playwright P1 (revoked cert, PDF says ACTIVE -> REVOKED; issuer name not "Harvard"), P2, P3; attack matrix R3/R3b | Verifier already ignored them, but `parseProofFile` spread unknown keys through. It now builds a fresh object field by field (whitelist). | Verified + hardened (red: `embedded verdict...are dropped`) |
| 5b | **Decompression bombs.** `gunzipSync` and pdf-lib inflate had no output ceiling: a ~60 KB payload expands to 64 MB+. | Medium (browser tab freeze/OOM) | `zip bomb presentation...` (red), Playwright P4 (80 MB of zeros in a PDF -> calm MALFORMED in < 15 s) | Streaming inflate with a hard 2 MB cap for presentations and PDF attachments. | Fixed |
| 5c | No size limits on proof files (fields, path/value length, proof depth). | Medium | `size limits...` (red), X4 | `LIMITS` in `parseProofFile` (200 fields, 200-char paths, 2,000-char values, 40 proof hashes, 2 MB). | Fixed |
| 6a | **Selective disclosure leaks.** Hidden value, salt, path. | none | `selective disclosure` section: none of path/value/salt appear in the shared JSON | No change. Salt is 256 bits from `crypto.getRandomValues`; identical documents get unrelated roots. | Verified |
| 6b | **Brute force of a low-entropy hidden field** (grade 0.00..10.00, letters, "First Class") against the shared sibling hashes, with 0 / 1 / empty / path-derived salts. | none | `brute force...` (0 hits) | Safe because the salt is unknown and random. It would be unsafe only if an issuer supplied weak salts via the `salts` option (used only by test vectors). | Verified |
| 6c | **What still leaks:** the paths you do disclose, and the total field count (`meta.fieldCount`), so "this has 9 fields" reveals that an optional field such as `grade` exists. | Low, **accepted** | `what IS revealed...` | Fixing needs padding leaves, which changes the format; not done in a no-features pass. | Documented, not fixed |
| 7 | **Time.** `issuedAt`, expiry and key cut-offs. | none | Contract: `test_issuedAt_isBlockTimestamp...`; live R4 (browser clock set to year 2096 -> still VERIFIED; set to 1970 after warping the chain -> EXPIRED), R5 (document claims 1999, chain says block time) | Contracts only ever use `block.timestamp`. New: every read is pinned to one block and the result carries that block's number and timestamp (`chainTime`); the UI footer says "Read at block N, chain time ...". The browser clock is used for display only. | Verified + surfaced |
| 8a | **Pending signatures could not be cancelled.** A signature the issuer changed their mind about stayed relayable by anyone forever (no deadline, no nonce bump). | Medium | `test_signer_canCancelPendingSignatures` (red: function missing), live R7 | `invalidatePendingSignatures()` bumps the caller's nonce. | Fixed. **Residual:** signatures still have no expiry timestamp (changing the typed data is a breaking format change). |
| 8b | Replay after key rotation / key revocation / other chain / other contract / twice / tampered fields. | none | `test_oldSignature_afterKeyRotation_isDead`, `...doesNotReplayAcrossContracts`, `...AcrossChains`, `...cannotBeUsedTwiceOrWithTamperedFields` | Already protected (EIP-712 domain, per-signer nonce, `isKeyValidAt(now)`). | Verified |
| 8c | Third-party submitters can relay a signature. | Low, by design (gasless issuance) | `test_issue_anyoneCanRelay` | A relayer can only do exactly what the issuer signed; it can order, not alter. A relayer who front-runs the issuer's nonce just forces a re-sign. | Accepted |
| 9a | **Two-RPC rule.** Old reader: 1 answer was silently accepted as "agreed 1"; a 1-vs-1 split threw an error shown as "Cannot reach the chain"; no stale-block handling; providers could be read at different blocks. | **High** (a lone lying RPC could produce a green tick without any warning) | `provider quorum` suite (9 cases) and Playwright N1-N7 | Reads pinned to one block; providers whose head is > 120 s behind are excluded; majority of >= 2 wins and dissent is counted; a lone survivor (when several are configured) is returned but flagged `degraded` with an amber banner; 1-vs-1 gives "Providers disagree" with retry; all down gives "Cannot reach the chain" with retry. | Fixed |
| 9b | Single configured provider (local dev). | none | `one provider configured is NOT flagged degraded` | No peer to compare with. | Verified |
| 10 | **QR density.** | see table below | `scripts/qr-study.mts`, `docs/qr-study.json` | The QR the app prints carries link mode only. | Studied; see below |
| 11a | **CSV formula injection.** `manifest.csv` echoed names verbatim, so `=HYPERLINK(...)` would execute when the issuer opened it in Excel. | Medium | `formula injection...` (+ validation rejects leading `= + - @` in name/title/grade) | Export cells get a leading `'`; import rows with those leads are flagged. | Fixed |
| 11b | **Bad encoding.** `File.text()` turned invalid bytes into U+FFFD names, signed on chain. | Medium | `bad encoding...` | Strict UTF-8 decode (BOM and UTF-16 handled); clear error otherwise. | Fixed |
| 11c | Duplicates, shifted columns (unquoted comma), 10k rows, missing columns, empty file. | Low | `CSV import / export` suite | Duplicate and "extra column" row errors; parse ceiling 20,000 rows (batch ceiling stays 1,000); all with plain row messages. 10,000 rows parse in < 2 s. | Fixed |
| 12a | **Short code lookup scanned event logs from the deploy block.** Public RPCs cap `getLogs` ranges, so on Base Sepolia this breaks after a while. | **High** for the real network | `test_code_resolvesWithoutLogScan_andFlagsClash` | `resolveCode(code)` on chain (first record wins). | Fixed |
| 12b | **Code collisions.** 60 bits; if two certificates share a code the old lookup silently returned the first. | Low | same test + 200,000-id collision sample (0) | Contract marks the clash; verifier answers "This code is ambiguous, open the link" instead of picking one. | Fixed |
| 12c | Check character coverage. | none | exhaustive single-character substitution over 40 codes x 13 positions x 31 symbols; all adjacent transpositions of 200 codes; 20,000-id round trip | Mod-37 check detects every single substitution and every adjacent transposition of different symbols. | Verified |
| 12d | **Batch certificates have no code path.** A batch member cannot be found by code alone. | Design limit | `batch certificates have no code index` | UI already says "needs the link". No fix without listing every member on chain. | Not fixable cheaply |
| 13a | **DoH treated SERVFAIL/REFUSED as "wrong domain".** A resolver hiccup produced `UNKNOWN_ISSUER` instead of "could not check". | Medium | `SERVFAIL / REFUSED = unreachable` (red) | Only NOERROR and NXDOMAIN are real answers. | Fixed |
| 13b | **Demo DNS zone passed as a real tick.** `local-demo-zone` returned a green "domain verified". The switch was a single env flag. | Medium | Playwright E1 (check 2 is now `warn` and reads "DEMO ONLY") | Results from the stand-in are marked `demo` and printed as a warning; the stand-in is only reachable when `chainId === 31337` even if the flag leaks into a real build. | Fixed |
| 13c | Remaining trust in infrastructure on a real network. | Info | | (1) DNS answer comes from the first DoH provider that replies; no DNSSEC `AD` check, so one DoH provider can lie. (2) Both DoH providers and the RPCs are public third parties. (3) `domainCheckedAt` is the authority's attestation, not independent. (4) The app origin serves the JS that does the verifying: a compromised host could ship a lying verifier (mitigation is the "verify independently" `cast` command). (5) Base Sepolia sequencer is a single operator. | Documented, not fixable in code |

## QR study (item 10)

Error correction M. "Camera model" assumes a 1080p frame with the QR filling 40% of it and needs >= 3 px per module. `jsQR` decode of the generated bitmaps (the app's own decoder) succeeds for every payload that fits; this proves encoding correctness only, not optics.

| Payload | Bytes | QR version (L/M/Q) | Modules | px/module in the app (360 px) | Phone at arm's length |
|---|---|---|---|---|---|
| Link, single-issued, any field count | 134 | 6 / **8** / 9 | 49 | 7.1 | ok |
| Link, batch of 200 (8 proof hashes) | 520 | 15 / **18** / 22 | 89 | 4.0 | ok |
| Full proof (gzip), 3 fields | ~1,040 | 23 / 26 / 32 | 121 | 2.9 | ok (borderline at 360 px, wants >= 7 cm printed) |
| Full proof (gzip), 8 fields | ~2,010 | 33 / 38 / >40 | 169 | 2.1 | marginal |
| Full proof (gzip), 15 fields | ~3,430 | >40 | - | - | **impossible** (v40 holds 2,953 bytes) |
| Full proof, raw JSON, 3 / 8 / 15 fields | 2.2 KB / 5.6 KB / 11 KB | v39 / >40 / >40 | | | no |

The link payload is independent of the number of fields because fields never go in the QR, so 3, 8 and 15 field certificates all print at v8 (single) or v18 (200-batch). **Fallback for the full proof:** keep it out of the QR. It travels in the PDF attachment, the `.mohar.json` file, or the `#P...` share link. If a paper-only full proof is ever needed, split it across numbered QRs or print a short link plus a short code (the verifier already accepts both).

**Could not do:** a real scan from a phone screen at arm's length. There is no device in this environment. What to test by hand: print or display the v8 and v18 codes at 4 cm and 6 cm wide on a phone, from 60 cm, in room light and with screen glare; the study predicts v8 at >= 3 cm and v18 at >= 5 cm.

## Things I could not fix, or did not

1. **Signatures have no deadline.** Mitigated by `invalidatePendingSignatures`, but a signature that is never cancelled is valid until used. A deadline changes the EIP-712 type and every signed vector.
2. **Field count leaks** (6c). Needs padding leaves, a format change.
3. **PDF shows `?` for non-Latin names.** Needs a bundled Unicode font (and shaping for Devanagari); the proof file remains exact.
4. **Batch certificates cannot be found by code** (12d).
5. **DNS is only as honest as one DoH provider** (13c); no DNSSEC validation in the browser.
6. **Real phone scan** not performed.
7. **Base Sepolia is still not deployed**; everything above ran on local Anvil. Fresh deployment is required because the contract ABI changed (`getBatchCert`, `getBatch`, `batchRid`, `Issued` event, new `recordId`, `resolveCode`, `invalidatePendingSignatures`). `deployments/anvil.json` was regenerated.
8. The extra-provider switch `NEXT_PUBLIC_EXTRA_RPC_URLS` exists only to let the e2e suite make one node look like three; it is honoured on the local chain only.

## Behaviour changes to know about

- Contract ABI and storage layout changed (see above); old deployments are incompatible.
- Existing archived proof files still verify, but their issuer's dashboard row ids are recomputed from the issuer identity, so nothing needs migrating.
- Check 2 on the local demo chain now shows a warning ("DEMO ONLY") instead of a tick.
