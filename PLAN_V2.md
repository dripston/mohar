# MOHAR PLAN V2: Phases 7 to 16
Algothon'26 · PS ID ALG-BC-01 · Replaces the phase list in PLAN.md from Phase 7 onward. Phases 0 to 6 stay as built.

## 0. Status snapshot (where we stand)

Done: research, core library (field salted Merkle, batches, EIP-712, short codes), contracts (IssuerRegistry, CertificateRegistry), chain access with two RPC agreement, 12 verdicts, web app (verify, issuer, holder, authority), Playwright, docs, UI redesign.
Evidence so far: 51 Foundry tests (fuzz and invariants), 41 attack scenarios on a local chain, 22 Playwright tests, Slither 0 high.
Gap: everything runs on local Anvil only. Repo is private (dripston/mohar). Several review risks from REVIEW list are not yet closed.

## 1. The pitch (updated)

"Scholarship and benefit schemes lose crores to fake institutions and fake documents. Mohar lets a ministry publish who is a genuine issuer, lets institutes and revenue offices issue tamper proof credentials, and lets a student prove eligibility while showing only what the scheme needs. When an audit finds a fake institute, one revocation flips every credential and application it touched, in seconds."

Still fully ALG-BC-01. Every Must Have stays. The scheme layer sits on top of issuance, verification, revocation and the QR link.

Honest claim to repeat in every Q&A: Mohar proves WHO issued something and that it has NOT CHANGED and is STILL VALID. It does not prove the underlying claim is true. If an authority lists a fake institute, Mohar cannot know. What Mohar adds: the list is public, auditable, and revocable from a chosen date.

## 2. Rules for the coding agent (apply to every phase)

1. One phase at a time. Stop after each phase. Report: what was built, what is untested, what you are unsure about.
2. Write a failing test before every fix. No fix without proof the bug was real.
3. Never fake on chain behaviour with a database. The chain is the source of truth.
4. Never trust embedded data (PDF, JSON, bundle). Recompute everything.
5. Synthetic data only for caste, income, marks. Never real personal data. Label demo issuers as demo.
6. Never claim legal compliance (DPDP or any law). Say "designed for data minimisation".
7. AI never decides a verdict. AI may only help prepare inputs, with a human confirm step.
8. After each phase explain the key code in plain words so the owner can defend it to judges.
9. Run the full test suite at the end of every phase. A red suite blocks the next phase.
10. Commit after every phase with tag phase-N. Keep CHANGELOG.md.
11. Disclose every AI assisted component in AI_DISCLOSURE.md as you go.

## 3. Priority tiers and cut order

M = must ship. S = should ship. C = could ship if gates are green.

| Phase | Tier | Name |
|---|---|---|
| 7 | M | Audit and Contract v2 |
| 8 | M | Live on Base Sepolia |
| 9 | M | Scholarship layer |
| 10 | M | Bulk screening |
| 11 | S | Privacy receipt |
| 12 | C | AI assists |
| 13 | M | Hardening pass 2 |
| 14 | S | UI and demo polish |
| 15 | M | Docs and submission pack |
| 16 | M | Rehearsal and Q&A |

Cut order when time runs short (cut from the top): Phase 12, then Phase 11, then reduce Phase 14, then reduce Phase 9 to issuer types plus checklist only. Never cut 7, 8, 10, 13, 15, 16.

## 4. Time map (event date unknown, pick the row that fits)

| Days left | Plan |
|---|---|
| 3 | Phase 7 (squatting fix, XSS, PDF trust, selective disclosure leak only), Phase 8, Phase 10 (generic bulk verify), Phase 15, Phase 16 |
| 5 | Add Phase 9 (issuer types, checklist, flags, bundle), Phase 11, light Phase 14, Phase 13 reduced |
| 7 or more | Everything except Phase 12. Do Phase 12 only if every gate is green |

## 5. Gates (do not pass a gate on a promise)

G1 after Phase 8: judge can scan a QR on their own phone over mobile data and see a live VERIFIED from Base Sepolia. This alone is a competitive submission.
G2 after Phase 10: scheme story runs end to end, bulk screen of 1,000 shows planted bad items all caught.
G3 after Phase 13: hostile audit has no open high or medium findings.

## 6. Phases

### Phase 7: Audit and Contract v2 (M)

Why first: fixing contract level issues after deploying forces a redeploy and a reseed. Fix first, deploy once.

7.1 Truth audit (VERIFY.md)
* Run the hostile judge audit. For each public claim, mark PROVEN, PARTIAL or FALSE with evidence: works with backend stopped, two RPC agreement, field level tamper pinpoint, hidden fields never leak, issuer cutoff semantics, gas per certificate, tests really assert, no personal data on chain.
* Clean clone run using only README steps. Log every failure.

7.2 Review fixes (REVIEW.md), failing test first for each
* Root squatting: key records by keccak256(issuer, root). Update core, contracts, web.
* Merkle: second preimage, leaf double hashing, sorted pairs, odd node handling, field count leaf. Crafted fake proofs.
* Canonicalization: unicode NFC, number and date formats, key order, null versus missing. Golden vectors must match between TypeScript and Solidity.
* XSS: script tags, long strings, RTL text, huge payloads in verify page, PDF preview, issuer UI. Escape everything.
* PDF and JSON upload: ignore any embedded verdict, status or issuer claim. Test a PDF with a lying embedded status.
* Selective disclosure: hidden fields never leak salt or value. Check what field names and count reveal. Brute force test on a low entropy hidden field.
* Timing: issuedAt only from block.timestamp. Expiry and cutoffs use chain time, never browser time.
* Signatures: replay after key rotation, after issuer revocation, across chains and contracts. Third party submitter griefing.
* Two RPC rule: define behaviour for one down, disagree, stale block. Clear UI state, never a hard fail.
* QR size: measure link size and QR version for 3, 8 and 15 field certificates. Test scan from a phone at arm's length. Define fallback.
* CSV: formula injection, 10k rows, duplicates, bad encoding, missing columns. Limits and clear row errors.
* Short codes: collisions, check character coverage, batch resolution path. Fuzz.
* Label anything that trusts the server or the demo DNS zone.

7.3 Contract v2 additions (do now so we deploy once)
* IssuerRegistry: add issuerType (INSTITUTE, REVENUE_OFFICE, EMPLOYER, OTHER) and accreditationSource (short string, for example "Ministry notified list (demo)"). Both set by the root authority only.
* Emit events for every registry change.
* Authority blast radius note: write AUTHORITY.md describing what a stolen authority key can do, and the proposed mitigation (Safe multisig, optional timelock). Implement multisig only if cheap.
* Pause stops issuance only. Never blocks revoke or verify. Test it.
* Keep all existing 51 tests green plus new ones. Re run Slither and fuzz.

7.4 Dry run deploy
* Deploy v2 to Base Sepolia once as a rehearsal to catch key, faucet, RPC and verification problems early. This is a throwaway deployment.

Exit gate: REVIEW.md and VERIFY.md written, every real bug has a failing then passing test, v2 contracts green, dry run deploy worked.

### Phase 8: Live on Base Sepolia (M)

8.1 Deploy v2 for real to Base Sepolia, verify source on BaseScan, write deployments/base-sepolia.json. Deployer key only through env var, never committed.
8.2 Wire web app through env config. Keep Anvil as a labelled fallback mode.
8.3 Real DNS: add a TXT record on a domain we own and verify the issuer domain live over DNS over HTTPS (Cloudflare, then Google). Demo DNS zone stays for Anvil only and is labelled.
8.4 RPC policy: three providers. Two agree is full confidence. One reachable shows a "single source" warning. None is CANNOT_REACH_CHAIN. Document it.
8.5 Host frontend (Vercel). Test the verify flow on a real phone over mobile data. Report failures.
8.6 Seed script: one certificate in each verdict state (VERIFIED, REVOKED, SUSPENDED, EXPIRED, ISSUER_REVOKED) plus a tampered file. Output SEED.md with links and QR images.
8.7 Gas in rupees: measure real gas per certificate in a 200 certificate batch on Base Sepolia, convert to rupees using a stated gas price and exchange rate with the date and source. Label as an estimate.
8.8 Playwright against Sepolia, not only Anvil. Update TESTING.md and evidence screenshots.
8.9 Backup: local Anvil one command fallback script, plus a recorded demo video of the core flow.

Exit gate G1: phone scan over mobile data shows live VERIFIED. Backend stopped, verify still works.

### Phase 9: Scholarship layer (M)

Goal: show the CBI style scenario end to end using synthetic data. Three actors: Authority (demo ministry), Institute, Revenue Office.

9.1 Issuer types and accreditation tag in UI
* Authority portal registers issuers with type and accreditation source. Verify page shows "Issuer type: Revenue Office, listed by Ministry (demo)".
* A credential issued by the wrong issuer type for a requirement fails that requirement.

9.2 Credential templates (synthetic)
* Enrolment Certificate (Institute): name, institute id, course, year, enrolment active.
* Caste Certificate (Revenue Office): category, issuing officer rank. Include flag leaf for ST status.
* Income Certificate (Revenue Office): income value plus salted threshold flag leaves (for example income_lte_250000, income_lte_600000).
* Flags are issuer attested salted leaves inside the existing Merkle tree. They are NOT zero knowledge. State this everywhere.
* Do not hardcode real scheme limits as truth. Scheme limits live in the demo checklist and are labelled demo.

9.3 Scheme checklist object
* Small JSON schema: scheme id and name, list of requirements, each with credential type, required issuer type, and conditions on disclosed flags (flag name equals true), plus global rules (not expired, not revoked, issuer not revoked at issue time).
* Preloaded demo scheme: "Demo ST Scholarship".
* Verdict per requirement with reason codes. Aggregate verdicts: ELIGIBLE, NOT_ELIGIBLE (with failed criteria), INVALID (tamper, revoked, issuer revoked), INCOMPLETE (missing credential).

9.4 Student bundle and sharing
* Student holds several credentials and selects what to disclose for one scheme. The app shows exactly what will be shared before sharing.
* Bundle format: a .mohar file (and a link when small enough). QR is for single credentials only. Document why (QR size).
* Hidden fields never leave: no income figure, no address, no salts for hidden leaves.

9.5 Officer view
* Officer picks the scheme, drops the bundle, sees a checklist of green ticks or red crosses with reasons. No income figure, no address.
* Every check is recomputed fresh from the chain. Nothing from the bundle is trusted.

9.6 Authority actions flow through
* Authority revokes an institute with an effective date. Certificates issued before stay valid, after turn red. Officer's next check shows ISSUER_REVOKED for affected applications.

9.7 Tests
* Playwright for each aggregate verdict and each failing requirement.
* Wrong issuer type, missing credential, expired, tampered flag, revoked credential, revoked issuer before and after cutoff.
* Test that hidden fields are absent from every shared artifact.

Exit gate: full scene runs on Sepolia with synthetic data.

### Phase 10: Bulk screening (M)

Goal: scheme officer screens 1,000 applications and gets a shortlist with no personal data shown.

10.1 /bulk page. Inputs: ZIP of bundles (scheme mode) or ZIP of certificates and CSV of links (generic mode).
10.2 Performance: batch RPC reads (multicall), cache issuer and batch lookups, concurrency limit, progress bar. Target 1,000 items under 30 seconds on Sepolia. Measure and report real timings on a normal laptop.
10.3 Output: summary bar (eligible, not eligible, invalid, incomplete), sortable and filterable table with reason codes, click a row for the full checklist, export CSV report (formula injection safe).
10.4 Seed set: 1,000 applications on Sepolia with a ground truth file. Plant at least 30 bad items across all failure kinds (tampered, revoked, suspended, expired, revoked issuer, wrong issuer type, missing credential).
10.5 Differential test: for every item, the bulk verdict must equal the single item verdict. Any difference fails the build.
10.6 Accuracy test: all planted bad items flagged, zero false flags on good items. Report numbers.
10.7 "Audit finds a fake institute" scene: authority revokes one institute with a cutoff date, rerun the screen, show the flagged count change with timing.
10.8 Safety: file size and count limits, zip bomb protection, malformed files give a row error not a crash, escape every rendered field.

Exit gate G2: story runs end to end, numbers match ground truth, timings recorded.

### Phase 11: Privacy receipt (S)

11.1 Purpose label, recipient name and advisory expiry on shares. Verifier shows them and warns when expired. State clearly that expiry and purpose are advisory because links can be copied.
11.2 Verification receipt export (PDF and JSON): verdict, checklist, block number, chain, contract address, timestamp, disclosed field names and values only. Never hidden fields or salts. Receipt hash for tamper evidence. Receipt is built from fresh checks only.
11.3 Playwright test that blocks every request except RPC and DNS over HTTPS and still gets a verdict (nothing sent to our server).
11.4 UI wording: "designed for data minimisation". Never a compliance claim.

### Phase 12: AI assists (C, only if G1 and G2 are green)

12.1 Scheme rules to checklist: officer pastes scheme eligibility text, an LLM proposes the checklist JSON, the officer edits and confirms, cryptographic checks do the verifying. Validate output against the schema. Never auto apply.
12.2 Legacy digitisation: issuer uploads scanned paper certificates, OCR plus LLM extract fields into the bulk issue template, a human confirms every row before anything is signed. If time is short, ship a clearly labelled mock with one real example.
12.3 Rule: AI never produces or changes a verdict. Log AI use in AI_DISCLOSURE.md.
12.4 Tests: malformed AI output rejected, human confirm required, verdict unaffected by AI.

### Phase 13: Hardening pass 2 (M)

13.1 Hostile contract audit on v2: new fields, access control, event completeness, pause semantics, reentrancy, bounds. Failing test first for each finding. Re run Slither, fuzz, invariants.
13.2 New invariants: revoked never returns valid, only authority sets issuer type, issuer cutoff semantics hold.
13.3 Fuzz the parsers: bundle files, zip files, JSON, CSV, QR payloads.
13.4 Re run every XSS and trust test on the new scholarship screens.
13.5 Write SECURITY.md: findings, fixes, residual risks, authority key blast radius.
13.6 Re run the attack matrix on Sepolia. Expand it with scholarship attacks (wrong issuer type, forged flag, swapped bundle, replayed bundle).

Exit gate G3: no open high or medium findings.

### Phase 14: UI and demo polish (S)

Owner: designer pass (Suhail) with agent implementing.
14.1 Design system: tokens, dark and light, one accent, serif for certificates, mono for hashes.
14.2 Verdict screens: clear ELIGIBLE, NOT_ELIGIBLE, INVALID, INCOMPLETE and all 12 original verdicts. Tamper diff readable at a glance.
14.3 Officer screen and student share preview designed for clarity: what is shared, what is hidden.
14.4 Mobile verify flow perfect on a mid range phone. Every error and empty state designed.
14.5 Demo mode: one click seeded data, big text mode for projectors, countdown free.

### Phase 15: Docs and submission pack (M)

15.1 README: problem, solution, architecture diagram, run steps, contract addresses, live demo URL, test results, limitations, roadmap.
15.2 ARCHITECTURE.md: decision log (why Base, why Merkle, why EIP-712, why no personal data on chain, why issuer flags are not zero knowledge).
15.3 TESTING.md generated from real runs plus evidence screenshots.
15.4 SECURITY.md, AUTHORITY.md, REVIEW.md, VERIFY.md linked from README.
15.5 AI_DISCLOSURE.md: every AI assisted component, external API, library and dataset.
15.6 Claims register (section 9) reviewed and every slide claim cited or removed.
15.7 Make repo public or add judges at submission. Remove secrets from history. Check .env files.
15.8 Final clean clone test on a fresh machine or container.

### Phase 16: Rehearsal and Q&A (M)

16.1 DEFENSE.md: one certificate traced from issue to verify with file and function names, every contract function (who calls, what can go wrong), the 20 hardest judge questions with 30 second answers.
16.2 Agent quizzes the owner on 10 questions one by one and grades answers. Repeat until clean.
16.3 Five full demo dry runs with a timer. At least two with a "judge" trying to forge a certificate.
16.4 Failure drills: RPC down, Wi Fi down, phone camera fails, wallet popup fails. Each has a rehearsed fallback (Anvil script, recorded video, printed QR cards).
16.5 Print QR cards for each verdict state as backup.

## 7. Demo script (5 minutes)

1. Hook (30s): "Scholarship money lost to fake institutions. CBI alleged 830 of 1,572 audited institutions were non operational, fake or partly fake, about Rs 144 crore." (Say "alleged".)
2. Issue (45s): authority lists an institute and a revenue office. Each issues a credential to a student.
3. Apply (45s): student sees what the scheme needs, sees exactly what will be shared, shares. Officer sees green ticks, no income figure, no address.
4. Forge (45s): judge edits one field. TAMPERED with the field highlighted. Judge tries a fake issuer. Rejected.
5. Audit scene (60s): bulk screen of 1,000 applications with timer. Authority revokes one institute. Rerun. Affected applications turn red.
6. Trustless (30s): stop our backend. Verify still works. Phone scan from the judge's own phone.
7. Close (45s): test counts, attack matrix, limits stated honestly.

## 8. Q&A additions (owner must answer without notes)

* Why not the National Scholarship Portal as is? (It is a central database we must trust and that fake entries got into. Mohar makes issuer identity, revocation and issuance public and verifiable by anyone, without calling a central server.)
* Who is the root authority? (A ministry or regulator in the real world. In the demo we play that role and say so.)
* What if the authority lists a fake institute? (Mohar cannot know. The list is public and auditable, and revocation with a cutoff date flips everything it touched.)
* What if a genuine institute enrols fake students? (Cryptography cannot catch that. Public issuance records make audits and anomaly checks faster.)
* Are the income flags zero knowledge? (No. They are issuer attested salted flags inside the Merkle tree. Real zero knowledge range proofs are roadmap.)
* Is this DPDP compliant? (We do not claim compliance. It is designed for data minimisation: officers see only what the scheme needs, nothing is sent to our server during verify.)
* Why blockchain and not a signed database? (No single party can rewrite history or silently revoke, anyone can audit, and verification survives our company.)
* Key theft? (Issuer revocation with a time cutoff and key rotation.)
* Gas per certificate in rupees? (Use the measured figure from Phase 8, with date and assumptions.)
* What stops an issuer revoking unfairly? (Revocations are public, timestamped, with reasons.)

## 9. Claims register (use only what is verified)

| Claim | Status |
|---|---|
| CBI FIR (Aug 2023): 830 of 1,572 institutions across 21 states non operational, fake or partly fake, about Rs 144.33 crore loss, 2017-18 to 2021-22 | Verified across several outlets and a Rajya Sabha reply. Say "alleged". |
| Karnataka: 249 guest lecturers lost jobs over fake or invalid PhD certificates (July 2026) | One outlet seen. Confirm with a second before the slide. |
| Tribal Affairs scheme needs caste certificate from officer not below Tahsildar, income certificate, institute verification, ministry notified institute list | Verified in ministry guideline documents. |
| SIH 2026 problem statement SIH26238 text | NOT verified. Check on sih.gov.in before showing. |
| Scheme income limits (for example Rs 2.5 lakh) | Seen only on an aggregator site. Demo value, label as demo. |
| WES delay and price claims | Promotional source. Do not use on stage. |
| DigiLocker comparison | Opinion piece. Do not claim without checking. |
| Friend's DigiVault win | Not verified. Ask for the result page. Not used in our submission. |

## 10. Rubric map

| Criterion | Weight | Where we earn it |
|---|---|---|
| Functionality and completion | 30 | Phase 8 live Sepolia, Phase 9 and 10 end to end story, G1 and G2 |
| Technical implementation | 20 | Merkle per field, batch roots, EIP-712, issuer cutoff revocation, contract v2, differential tests |
| Innovation and problem understanding | 20 | Issuer authority registry plus audit scene, eligibility without disclosure, bulk screening with ground truth |
| UX and presentation | 15 | Phase 14, big verdict screens, phone verify, clean demo |
| Testing and edge cases | 15 | 51 plus new Foundry tests, attack matrix on Sepolia, Playwright, bulk accuracy report, fuzzed parsers |

## 11. Definition of done

* Every ALG-BC-01 Must Have works live on Base Sepolia, none mocked
* Bonus proven: data unchanged and issuer origin, on chain and client side
* Phone scan over mobile data works
* Scholarship scene and bulk screen run with recorded numbers
* No open high or medium findings
* README, ARCHITECTURE, TESTING, SECURITY, AI_DISCLOSURE complete
* Demo video, Anvil fallback and printed QR cards ready
* Owner can explain every contract function and answer the 20 hardest questions alone
