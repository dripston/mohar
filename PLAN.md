# MOHAR: Blockchain Certificate Issuing & Verification
Algothon'26 · PS ID: ALG-BC-01 · Working name "Mohar" (seal). Rename anytime.

> Rule for the coding agent: build phase by phase. After every phase, stop, summarize what was built, list what is untested, and wait for approval. Never fake on-chain behavior with a database. The chain is the source of truth.

---

## 0. The Pitch (what judges should remember)

"Every certificate on Mohar carries proof of three things anyone can check in 3 seconds, without trusting us: **who issued it**, **that not one character changed**, and **that it's still valid right now**. Students can share only the fields they want. Universities issue 1,000 certificates for the price of one transaction."

### Must Have → how we exceed it

| Must Have | Baseline teams | Mohar |
|---|---|---|
| Issuer workflow | Single form, single admin | Accredited issuer registry, DNS domain proof, single + bulk CSV issuance, templates |
| Unique verification ID | Random ID in DB | Deterministic ID (`keccak256(documentRoot)`) + short human code (e.g. `MHR-7F3K-92QD-X4MP-C`) used as a pointer, never as proof |
| QR/link verification | QR to a page | QR carries a small header + proof in the URL fragment (never hits a server); full field-level check uses the PDF/file. Verify works even if our backend is dead |
| Public verification page | Shows "valid" | Live 5-point trust checklist read straight from chain, tamper diff showing exactly which field changed |
| Status/revocation | Boolean flag | Revoke with reason code + timestamp, suspend/reinstate, expiry, issuer-level revocation with time cutoff |
| Integrity checking | Hash of whole cert | Per-field salted Merkle tree: detects AND pinpoints tampering, enables selective disclosure |
| Bonus: origin | Trust our server | EIP-712 issuer signature + on-chain issuer registry + DNS TXT domain binding |

---

## 1. Architecture

```
                 ┌─────────────────────────────┐
  Issuer UI ───▶ │  Next.js app (issuer portal) │ ── drafts/templates ──▶ Postgres (Supabase)
  (wallet)       │  packages/mohar-core         │     (convenience only, never trust)
                 └──────────────┬──────────────┘
                                │ wagmi/viem tx
                                ▼
         ┌──────────────────────────────────────────┐
         │  Base Sepolia (EVM testnet)              │
         │  IssuerRegistry.sol                      │
         │  CertificateRegistry.sol                 │
         └──────────────────────────────────────────┘
                                ▲
                                │ public RPC read (no backend)
  Anyone ──▶ /verify/[id]#data ─┘   + DNS-over-HTTPS lookup for domain proof
```

**Chain:** Base Sepolia (cheap, reliable faucets). Backup: local Anvil fork for demo day if RPC flakes.
**Contracts:** Solidity 0.8.24+, Foundry (unit, fuzz, invariant tests), OpenZeppelin (AccessControl, EIP712, ECDSA, MerkleProof).
**Frontend:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Framer Motion, wagmi + viem + RainbowKit.
**Core lib:** `packages/mohar-core` shared by issuer and verifier: canonical JSON, salting, Merkle tree, EIP-712 typed data, ID derivation.
**PDF:** pdf-lib (embed certificate JSON as PDF attachment + QR on the page).
**No PII on chain. Ever.** Only hashes, roots, issuer addresses, status, timestamps.

---

## 2. Core Cryptography (the heart, understand this deeply)

### 2.1 Certificate document
```json
{
  "version": "mohar/1",
  "issuer": { "address": "0x...", "domain": "acharya.ac.in", "name": "Acharya Institute" },
  "recipient": { "name": "Rehaan N", "email": "..." },
  "credential": { "title": "B.E. AI Engineering", "grade": "8.34", "issuedOn": "2028-06-01", "expiresOn": null },
  "salts": { "...one random 32-byte salt per field..." }
}
```

### 2.2 Per-field salted leaves
- Flatten fields to paths: `recipient.name`, `credential.grade`, etc.
- `leaf = keccak256(bytes.concat(keccak256(abi.encode(path, value, salt))))` (double hash, same as OpenZeppelin's standard Merkle leaf; stops a leaf from ever being confused with an inner node).
- Salt stops brute forcing ("is grade 8.34? try 8.35...").
- Sort leaves, build Merkle tree (sorted-pair hashing, OZ `MerkleProof` compatible) → `documentRoot`.
- Salts are secret to the holder: an issuer must archive the full cert file (with salts) for each holder, because a lost salt cannot be regenerated.

**Why this wins:**
1. Tamper diff: verifier recomputes each leaf, so it knows WHICH field changed, not just "invalid".
2. Selective disclosure: holder shares name + degree, hides grade. Hidden fields replaced by their leaf hash. Root still matches.

### 2.3 Batch issuance
- Many `documentRoot`s → one `batchRoot` Merkle tree.
- One transaction stores `batchRoot`. Each cert carries its Merkle proof up to the batch.
- Demo: issue 500 certs from CSV in 1 tx, show gas cost per cert.

### 2.4 Issuer signature (EIP-712)
- Issuer wallet signs typed data `{ batchRoot, issuerAddress, chainId, contract, nonce }`.
- Contract verifies signer == registered issuer. Verifier page re-verifies off chain too.

### 2.5 Verification ID and short code
- `certId = keccak256(documentRoot)` (32 bytes). This is the real identity. Single-issued certs are stored on chain under it; batch certs are not individually on chain (only `batchRoot` is), so their `certId` is proven by a Merkle proof up to the batch.
- Short code = Crockford base32 of the first 8 bytes of `certId`, shown as `MHR-XXXX-XXXX-XXXX-C` (12 chars = 60 bits, plus 1 check char). The old 8-char format was only 40 bits, which collides after about a million certs. **The short code is a human-friendly pointer only, never the proof.** After any lookup the verifier recomputes `certId` from the data and compares full 32 bytes.
- How a typed code is resolved:
  1. **Single-issued cert:** the contract emits `Issued(bytes32 indexed certId, bytes8 indexed shortCode, ...)`. The verifier does `getLogs` filtered by the `shortCode` topic. Fully on chain, no server.
  2. **Batch cert, full link or file in hand:** the proof is inside the link/file, so the code is just a label. No lookup needed.
  3. **Batch cert, only the typed code:** the chain cannot answer (that is the price of 1 tx for N certs). Use an optional **proof resolver**: a plain static file/endpoint `GET /proofs/<shortCode>.json` published by the issuer or by us, holding the cert's header + Merkle proof (never salts or fields). It is untrusted: the verifier checks the returned proof against the on-chain `batchRoot`, so a lying resolver can only cause "not found", never a false VERIFIED. If the resolver is down, say so and ask for the link/file. State this limitation openly in the pitch.
  - If two certs share a short code, show both candidates and ask for the full link.

### 2.6 Two verification modes, QR and link format
A QR code holds at most about 2.9 KB, and a cert with 12 fields and 12 salts plus a proof is bigger than that after encoding. So the QR never carries the fields. There are two modes:

| | **Link mode** (QR / URL / code) | **Full-proof mode** (PDF / `.mohar.json` file) |
|---|---|---|
| Carries | header only: version, issuer address, `documentRoot`, batch proof, `expiresAt` (about 300-600 bytes for 500-cert batches: 32 B per proof level) | everything: fields, salts, header, proof |
| Proves | issuer is accredited, signature valid, this root is anchored, status now | all of that, **plus** every field is intact (tamper diff) |
| Does not prove | that the printed text matches the root | nothing further |
| Entry | scan QR, paste link or code | drag-drop PDF (JSON is an attachment), upload JSON |

Link: `https://mohar.app/verify/MHR-7F3K-92QD-X4MP-C#<base64url compressed header+proof>` (fragment never reaches any server). QR budget rule: encoded payload must be 1,200 bytes or less; if a selective-disclosure presentation fits, its QR may carry it, otherwise it falls back to link mode and the holder shares the file. The verify page labels the mode in the verdict ("Issuer and status verified. Upload the certificate file to verify its contents.") so link mode is never mistaken for full verification. A forged PDF with a real QR pasted on it passes link mode but fails full-proof mode, which is why the Forgery Playground uses full-proof mode.

---

## 3. Smart Contracts

### IssuerRegistry.sol
- Roles: `ROOT_AUTHORITY` (accreditation body, e.g. "AICTE demo"), `ISSUER`.
- `registerIssuer(address, string domain, string name)` by root. Root checks the DNS TXT record at onboarding and records `domainCheckedAt` (block timestamp) on chain, so the domain check still has an on-chain answer ("checked by root on <date>") when live DNS lookups fail (see section 4.2.1).
- `revokeIssuer(address, uint64 effectiveFrom, uint8 reason)`: certs issued **before** `effectiveFrom` stay valid, after are invalid. Handles stolen key without nuking honest history.
- `rotateIssuerKey(old, new)`: links new key to same issuer identity.
- Events for everything.

### CertificateRegistry.sol
- `issue(bytes32 root, uint64 expiresAt, bytes sig)` single. Emits `Issued(bytes32 indexed certId, bytes8 indexed shortCode, address indexed issuer, uint64 expiresAt)`.
- `issueBatch(bytes32 batchRoot, uint32 count, bytes sig)`. Emits `BatchIssued(bytes32 indexed batchRoot, address indexed issuer, uint32 count)`. Batch certs have no per-cert event (section 2.5).
- `revoke(bytes32 id, uint8 reasonCode)`, `suspend(id)`, `reinstate(id)`. Only original issuer.
- `getStatus(id) → (issuer, issuedAt, expiresAt, status, reasonCode, revokedAt)`.
- `verifyInBatch(batchRoot, leaf, proof)` view.
- Reason codes: `KEY_COMPROMISE, ISSUED_IN_ERROR, MISCONDUCT, SUPERSEDED, OTHER`.
- Cannot overwrite existing root. Cannot un-revoke (suspend is the reversible one).

### Security requirements
- Checks-effects-interactions, custom errors, no unbounded loops.
- Replay protection: chainId + contract address + nonce in EIP-712 domain.
- Pausable by root for emergencies (document why).
- Slither run, zero high findings. Fuzz + invariant tests:
  - revoked never returns VALID
  - non-issuer can never issue/revoke
  - issuer revoked at T: certs after T invalid, before T valid

---

## 4. Product Surfaces

### 4.1 Issuer portal
- Connect wallet → role detected from registry.
- Onboarding: prove domain by adding DNS TXT `mohar-issuer=0xABC...`. Portal checks it live.
- Template designer: pick fields, upload logo, live certificate preview.
- Single issue form + Bulk CSV upload with validation table (bad rows highlighted, fixed inline).
- One-click "Sign & Anchor" → progress: hashing → signing → tx pending → confirmed (with explorer link).
- Output: PDF per cert (QR + embedded JSON), ZIP for bulk, email/share links.
- Registry dashboard: issued, revoked, expiring, search, revoke with reason modal.

### 4.2 Public verify portal (the star)
Entry points: scan QR (camera), paste link/code, drag-drop PDF, upload JSON.

5-point trust checklist, animating in one by one:
1. ✅ Issuer registered and accredited on chain
2. ✅ Issuer domain verified (`acharya.ac.in` via DNS)
3. ✅ Signature valid, signed by issuer key
4. ✅ Data intact (Merkle root matches on-chain record)
5. ✅ Status: active, not revoked, not expired

Big verdict states: **VERIFIED**, **REVOKED** (reason + date), **TAMPERED** (field diff), **EXPIRED**, **UNKNOWN ISSUER**, plus two honest degraded states: **VERIFIED (domain unchecked)** and **CANNOT REACH CHAIN** (grey, never green or red). The page also shows which mode ran (link vs full proof, section 2.6).

Tamper view: highlight changed field red, show "this field does not match what the issuer signed".
"Verify independently" panel: contract address, tx hash, raw proof, explorer link. Judges love this.
Works offline from backend: kill the server live in demo, verify still works.

#### 4.2.1 Failure handling: RPC and DNS
**Chain reads (RPC).** The verifier ships an ordered list of public Base Sepolia endpoints in `deployments/base-sepolia.json` (primary `https://sepolia.base.org`, then 2-3 other free public providers; confirm each is alive when we build, since free endpoints change), loaded with viem's `fallback` transport and a 4 s timeout per endpoint. The user can paste their own RPC URL in the "Verify independently" panel. Rules:
- A VERIFIED or REVOKED verdict needs the status call to succeed on at least 2 different providers that agree. One-provider answers show as "single source" with a warning.
- If all endpoints fail: show **CANNOT REACH CHAIN**, never a verdict. Offer retry, custom RPC, and the last known result **clearly stamped "cached, as of <time>, not live"**. A cached result is never shown as green.
- Demo day: `NEXT_PUBLIC_RPC_MODE=anvil` points the same code to the local Anvil fork (Phase 10 fallback script).

**Domain proof (DNS-over-HTTPS).** Try Cloudflare (`https://cloudflare-dns.com/dns-query`), then Google (`https://dns.google/resolve`), 3 s timeout each, asking for TXT `mohar-issuer=0x...` on the issuer domain.
- Lookup succeeds and matches: check 2 is green.
- Lookup succeeds and does not match: check 2 is red and the verdict becomes UNKNOWN ISSUER. A domain that changed its record is a real warning.
- All DoH providers fail (network blocked, CORS, timeout): check 2 becomes grey "could not check live". It falls back to the on-chain `domainCheckedAt` from IssuerRegistry ("domain was checked by the accreditation authority on <date>"). The verdict is **VERIFIED (domain unchecked)**, and checks 1, 3, 4, 5 still stand because they come from the chain. DNS failure never turns a valid cert red.

### 4.3 Holder view
- Open own cert, toggle which fields to reveal, generate new QR with selective disclosure.
- Add to LinkedIn, download PDF, copy link.

### 4.4 Employer bulk verify
- Upload CSV of codes/links → table of verdicts. Real HR use case.

### 4.5 Forgery Playground (demo weapon)
- Judge picks a real cert, edits any field in a form, hits verify, watches it fail and pinpoint the edit. Then tries forging with a fake issuer wallet. Fails again.

---

## 5. Phases

Each phase ends shippable. Phases 1 to 6 = complete, winning core. 7 onwards = the "undeniable" layer.

### Phase 0: Research (no code)
Study how existing systems do it and write `RESEARCH.md`:
- Blockcerts (MIT Media Lab): Merkle batching, open standard
- OpenCerts / TradeTrust (Singapore GovTech): salted field obfuscation, DNS TXT issuer identity, document store contract
- Ethereum Attestation Service (EAS): schema based attestations, revocation model
- W3C Verifiable Credentials 2.0 + Status List: data model, revocation lists
- EIP-712, ERC-5192 (soulbound)
For each: what they do well, their weaknesses, what Mohar takes, what Mohar does better. End with a "why our design" section usable in the pitch.

### Phase 1: Monorepo + mohar-core
- pnpm monorepo: `apps/web`, `packages/contracts`, `packages/mohar-core`.
- mohar-core: canonical JSON, salt gen, leaf hashing, Merkle tree + proofs, selective disclosure, short code (60-bit + check char), URL encode/decode for both modes (link header and full file, with the 1,200-byte QR budget check), EIP-712 types.
- Vitest tests incl. golden vectors (same input → same root, always).

### Phase 2: Contracts
- IssuerRegistry + CertificateRegistry per section 3.
- Foundry unit + fuzz + invariant tests, gas report, Slither.
- Deploy script to Anvil and Base Sepolia, verify source on explorer, write `deployments/base-sepolia.json`.
- Cross-test: root computed in TS mohar-core == root verified in Solidity.

### Phase 3: Issuer portal (core)
- Wallet connect, role gating, single issuance end to end on testnet, PDF + QR output, revoke flow.

### Phase 4: Verify portal (core)
- Link/code/QR/PDF entry, 5-point checklist, all verdict states, chain-only reads, independent verification panel.

### Phase 5: Revocation & lifecycle depth
- Suspend/reinstate, expiry, reason codes, issuer revocation with time cutoff, key rotation, all reflected in verify UI.

### Phase 6: Testing evidence
- Playwright e2e for every verdict state.
- `TESTING.md` attack matrix: tampered field, swapped issuer, replayed signature, revoked cert, revoked issuer before/after cutoff, expired, unknown ID, malformed QR, wrong chain, forged PDF. Each with expected vs actual + screenshot.

### Phase 7: Innovation layer
- Batch issuance from CSV (1 tx, many certs) + gas per cert stat
- Selective disclosure holder view
- DNS TXT issuer domain verification
- Tamper field diff
- Employer bulk verify

### Phase 8: Wow layer
- Forgery Playground
- Optional soulbound token (ERC-5192) to holder wallet, mirrors status
- Public issuer profile pages (stats, history, revocation transparency)
- Gasless issuing via relayer (issuer signs, relayer pays) if time allows

### Phase 9: UI polish (bring in the designer)
- Design system: tokens, dark + light, one strong accent, serif for certificate, mono for hashes.
- Verdict animations, skeleton states, every error state designed, mobile verify flow perfect (judges scan with phones).
- Certificate template that looks like a real premium certificate.

### Phase 10: Submission + demo
- README: problem, solution, architecture diagram, run steps, contract addresses, AI tools disclosure, limitations, roadmap.
- `ARCHITECTURE.md` with decision log (why Base, why Merkle, why EIP-712, why no PII on chain).
- Demo video backup. Seeded demo data. Local Anvil fallback script.
- Demo script (section 6). Q&A prep (section 7).

---

## 6. Demo Script (5 minutes)

1. **Hook (20s):** "India has a fake degree problem. Verifying one today means emails and weeks. Watch us do it in 3 seconds."
2. **Issue (60s):** Register issuer, DNS proof, bulk issue 200 certs from CSV, one tx, show cost.
3. **Verify (40s):** Judge scans QR on their own phone. 5 green checks.
4. **Tamper (40s):** Forgery Playground: change grade 7.1 → 9.8. TAMPERED, field highlighted.
5. **Revoke (30s):** Revoke with "issued in error". Rescan. REVOKED + reason + timestamp.
6. **Trustless (30s):** Kill backend server. Verify still works. "You don't have to trust us."
7. **Privacy (30s):** Holder hides grade, shares new QR, still verified.
8. **Close (30s):** Test matrix, architecture, what's next.

---

## 7. Judge Q&A Prep (Rehaan must answer these without notes)

- Why blockchain and not a signed database? (No single party can rewrite history or silently revoke; public auditability; verification survives our company dying.)
- What if the issuer's key is stolen? (Issuer revocation with time cutoff + key rotation.)
- What stops the issuer from revoking unfairly? (Revocations are public, timestamped, with reason; the issuer's reputation is on chain.)
- Where is personal data stored? (Never on chain. Only salted hashes. Data lives in the cert the holder owns.)
- Why salts? (Prevent brute forcing hashed fields.)
- Why Merkle batching? (Cost: 1 tx for N certs. Proof size grows log N.)
- Gas cost per certificate? (Have the real number.)
- What if your website goes down? (Verify reads chain directly; contracts are public.)
- How do you know an issuer is really that university? (Root accreditation + DNS TXT domain proof.)
- What happens when testnet resets / mainnet plan? (Deploy to L2 mainnet like Base; costs fractions of a rupee per batch.)
- What's a known limitation? (Root authority is a trust point; roadmap: multi-sig/DAO accreditation.)

---

## 8. Definition of Done
- [ ] Every Must Have works on Base Sepolia, live, not mocked
- [ ] Bonus: integrity + origin proven both on chain and client side
- [ ] All verdict states demo-able
- [ ] Foundry tests + fuzz + invariants green, Slither clean
- [ ] TESTING.md attack matrix complete
- [ ] README + architecture diagram + AI disclosure + limitations
- [ ] Demo video backup + Anvil fallback
- [ ] Rehaan can explain every contract function
