# MOHAR Research (Phase 0)

Scope: what existing systems do, where they fall short, what Mohar takes and improves. Date: 2026-10-04.
Legend: [V] = verified against the cited source this session. [K] = from prior knowledge, re-check before quoting to judges.

---

## 1. Blockcerts (MIT Media Lab + Learning Machine, now Hyland)

**Sources:** https://github.com/blockchain-certificates/cert-verifier-js , https://www.blockcerts.org

**What it does well**
- Open standard; certificate is a signed JSON-LD document anchored by a Merkle proof (Merkle Proof 2017/2019 signature suites) to a Bitcoin/Ethereum tx. [K]
- Batching: many certs share one anchor transaction; each cert carries its own proof path. [K]
- Verifier library does stepwise verification with status callbacks (format, hash, Merkle receipt, tx, issuer key, revocation). [V]
- Revocation: classic revocation list (query by assertionId) and, in newer versions, BitstringStatusList/StatusList2021 with TTL caching. [V]
- Issuer identity via an issuer profile URL plus public key. [V]

**Weaknesses**
- Whole-document hash: no per-field leaves, so no selective disclosure and no way to say which field was altered. [K]
- Issuer trust = "whatever the HTTPS profile URL says"; no on-chain accreditation or registry. [V/K]
- Verification depends on external services: block explorer APIs, DIF universal resolver for DIDs, hosted revocation endpoints. [V]
- Revocation is off-chain (list on the issuer's server): if the issuer's server dies, revocation status is unavailable or unprovable.
- v1 certs dropped in verifier v5, i.e. format churn. [V]

**Mohar takes:** batch-anchoring with Merkle proofs; step-by-step verification UX.
**Mohar does better:** per-field salted leaves (tamper pinpointing + selective disclosure); issuer registry and revocation state live on chain; no explorer or profile-URL dependency for core verdict.

---

## 2. OpenCerts / TradeTrust (Singapore GovTech, OpenAttestations framework)

**Sources:** https://github.com/TradeTrust/tradetrust , https://cdn.jsdelivr.net/npm/@tradetrust-tt/tt-verify@9.7.5/README.md , https://arxiv.org/pdf/1910.04622 (security analysis of a similar Merkle-anchored scheme)

**What it does well**
- Batching: documents are batched into a Merkle root; the root is published on chain and queried to prove provenance. [V]
- Document store contract: `issue(hash)` and `revoke(hash)` on a per-issuer contract. [V]
- Issuer identity via DNS-TXT record binding the document store address to a domain (e.g. a university domain). Record format, verified from the dnsprove package docs: `"openatts net=ethereum netId=3 addr=0x2f60...C36C"` (prefix, network, network id, document store address). [V]
- Built-in field obfuscation: documents can be redacted while the document hash still verifies; redacted data moves into a privacy object in the signature block. [V, via W3C-list/GovTech material] Per-field random salts are the mechanism, but the exact salt format (UUID) was not confirmed from primary docs. [K]
- An optional issuer-registry check exists: the verifier reports `ISSUER_IDENTITY` via either `OpenAttestationDnsTxt` or an `OpencertsRegistryVerifier` (a registry of known issuers). [V, search snippet]
- Mature, government-backed, in production for Singapore education and trade documents.

**Weaknesses**
- The default identity proof is DNS-TXT: whoever controls a domain's TXT record is "the issuer", so a lapsed or hijacked domain can re-point trust. A registry-based verifier exists (OpenCerts registry), but it is an off-chain/verifier-side allowlist, not an on-chain accreditation contract with roles. We did not find evidence either way on how it is governed. [V/K]
- Revocation is per-document-hash only. No suspend, no reason code, no issuer-level revocation with a time cutoff, no key rotation story. [K]
- One contract per issuer: discovery relies on DNS rather than a shared registry; no cross-issuer transparency.
- Redaction is hash-obfuscation inside a JSON blob; no signed typed data, no short human verification code.
- Verification flow is tied to the hosted OpenCerts/TradeTrust verifier frontends and network providers.

**Mohar takes:** salted-field redaction idea; DNS TXT as one of two identity proofs; Merkle batch root anchored on chain; `revoke(hash)` primitive.
**Mohar does better:** DNS is *added to* (not a substitute for) an on-chain accreditation registry with roles, so domain takeover alone cannot mint a trusted issuer; revoke with reason code, suspend/reinstate, expiry; issuer revocation with `effectiveFrom` cutoff (stolen key does not nuke honest history); key rotation; EIP-712 typed signature; short human code; QR in URL fragment with client-side verification.

---

## 3. Ethereum Attestation Service (EAS)

**Sources:** https://docs.attest.org , https://www.quicknode.com/guides/ethereum-development/smart-contracts/what-is-ethereum-attestation-service-and-how-to-use-it

**What it does well**
- General-purpose public good: two core contracts (SchemaRegistry, EAS) plus an optional resolver contract per schema. [V]
- Schemas define the data shape; each attestation has a UID; `revocable` is a per-schema and per-attestation boolean. [V]
- Resolver contracts run custom logic on attest/revoke (payments, allow-lists, hooks). [V]
- Offchain attestations (signed, EIP-712 style) plus onchain; large ecosystem and tooling. [K]

**Weaknesses (for credentials)**
- Generic: no notion of an accredited issuer set, no issuer-level revocation, no suspension, no expiry-aware verdicts beyond a timestamp field. Anyone can attest under any schema; trust is entirely a client-side policy problem.
- Revocation is binary and per-UID; no reason code or reversible state in the base protocol. [K]
- EAS has `multiAttest` / `multiRevoke`, which batch many calls into one transaction, but each attestation is still stored on chain as its own record (storage and gas grow linearly with N). Mohar stores one root for N certs. Attestation data is typically on chain too (PII risk if misused).
- No per-field selective disclosure or tamper diff in the core model.

**Mohar takes:** schema-versioned data (`version: mohar/1`), UID-style deterministic IDs, resolver-like gating (only registry-listed issuers may write), the "revocable" explicitness.
**Mohar does better:** purpose-built lifecycle (active/suspended/revoked/expired + reasons), issuer registry with accreditation, batching in one tx, hashes only on chain, selective disclosure.
**Honest note:** EAS is the credible "why not just use EAS?" question. Answer: EAS is the storage rail; Mohar is the credential trust model. A future adapter could mirror Mohar roots into EAS.

---

## 4. W3C Verifiable Credentials 2.0 + Bitstring Status List

**Sources:** https://www.w3.org/TR/vc-data-model-2.0/ (W3C Recommendation, 15 May 2025) [V], https://www.w3.org/TR/vc-bitstring-status-list/ [V]

**What it does well**
- Clean role model: issuer, holder, verifier, verifiable data registry. [V]
- `credentialStatus` with `BitstringStatusListEntry`; purposes: revocation, suspension, refresh, message. [V]
- Status list is a compressed bitstring, minimum 131,072 bits (16 KB); GZIP shrinks a sparse list to a few hundred bytes. Bundling gives "herd privacy" (verifier checking one bit does not tell the issuer which credential). [V]
- Securing options: Data Integrity, JOSE/COSE, SD-JWT and BBS for selective disclosure. [V]

**Weaknesses**
- Status list is an HTTP-hosted credential: availability and integrity depend on the issuer's server. Dead server = unknown status (or cached stale status).
- Spec itself notes privacy only holds if issuers/verifiers cooperate (unique lists or tracking defeat it). [V]
- Model is transport-agnostic: no anchor, no issuer accreditation, no tamper-evident history of *when* a bit flipped.
- BBS/SD-JWT selective disclosure needs newer crypto libraries; wallet ecosystem still maturing.

**Mohar takes:** the vocabulary (issuer/holder/verifier, revocation vs suspension, status purposes); credential JSON designed to be mappable to a VC 2.0 envelope later.
**Mohar does better:** status lives on chain with timestamps and reasons (auditable history, no server to die); selective disclosure with plain Merkle + salts (no exotic crypto, easy to audit). **Trade-off to admit:** a bitstring list scales status for millions at near-zero cost and has better lookup privacy; on-chain per-cert status is publicly enumerable by ID. Roadmap: on-chain bitstring per batch.

---

## 5. EIP-712 (typed structured data signing)

**Source:** https://eips.ethereum.org/EIPS/eip-712 (Final) [V]

**Good:** wallets show readable fields instead of an opaque hash; domain separator (`name`, `version`, `chainId`, `verifyingContract`, `salt`) binds a signature to one app, chain, and contract. [V]
**Weakness / gotcha:** the standard explicitly provides **no replay protection**; apps must add nonces or idempotency. [V]
**Mohar takes:** sign `{batchRoot, issuer, nonce, expiry...}` under a domain with chainId + contract. **Mohar does better:** adds the nonce and "cannot overwrite an existing root" rule the standard leaves to the app; verifier re-checks the signature off chain as well as in the contract.

---

## 6. ERC-5192 (minimal soulbound NFTs)

**Source:** https://eips.ethereum.org/EIPS/eip-5192 (Final) [V]

**Good:** tiny interface: `locked(tokenId)`, `Locked`/`Unlocked` events, ERC-165 id `0xb45a3c0e`; when locked, ERC-721 transfers must revert. [V] Wallets and marketplaces can recognise non-transferable tokens.
**Weakness for credentials:** a token in a wallet is an *address* link, which leaks identity and invites doxxing; loss of wallet = loss of credential; it proves ownership, not integrity or validity, unless the contract also mirrors status; minting a token per person costs a tx each.
**Mohar takes:** optional Phase 8 add-on only, a lock-by-default token mirroring registry status for holders who opt in. **Mohar does better:** core credential never requires a holder wallet; holder owns a file/QR, wallet-less and privacy-preserving.

---

## 7. Comparison

| | Blockcerts | OpenCerts/TradeTrust | EAS | W3C VC 2.0 | **Mohar** |
|---|---|---|---|---|---|
| Batch anchor | Yes | Yes | Batches calls, stores each attestation on chain | n/a | Yes, 1 root for N certs |
| Field-level tamper diff | No | No | No | Depends on suite | **Yes** |
| Selective disclosure | No | Salted redaction | No | SD-JWT/BBS | **Yes (Merkle+salt)** |
| Issuer accreditation | No | DNS + optional verifier-side registry | No | Out of scope | **On-chain registry + DNS** |
| Revocation on chain | No (list) | Hash revoke | Binary | Hosted list | **Reason, suspend, cutoff** |
| Works if issuer server dies | Partly | Mostly | Yes | No | **Yes** |
| Key compromise story | Weak | Weak | None | Varies | **Cutoff + rotation** |

---

## 8. Why our design (pitch-ready)

1. **"Three proofs, zero trust in us."** Who issued it (on-chain accreditation + DNS domain), that not one character changed (Merkle root on chain), that it is valid right now (on-chain status). Verification reads the chain directly; kill our server and it still works.
2. **We show *what* was forged, not just *that* it failed.** Per-field salted leaves turn "invalid" into "grade was changed from 7.1 to 9.8."
3. **Holders control disclosure.** Share name and degree, hide grade; the root still verifies. No exotic cryptography, just salts and Merkle proofs anyone can audit.
4. **A thousand certificates for the price of one transaction.** One batch root, log-size proofs, fractions of a rupee per certificate on an L2.
5. **Real-world key hygiene.** Revoke an issuer *as of a time*: certificates issued before stay valid, after are void. Stolen keys do not erase an honest university's history.
6. **No personal data on chain. Ever.** Only hashes, roots, addresses, status.
7. **Standing on shoulders.** Merkle batching from Blockcerts, salted redaction and DNS identity from TradeTrust, schema discipline from EAS, status vocabulary from W3C VC 2.0, typed signing from EIP-712. Mohar fuses them and closes the gaps: accreditation, lifecycle, tamper pinpointing, and server-independence.

**One-liner:** "Blockcerts proved batching, TradeTrust proved domain identity, W3C proved status semantics. Mohar puts all three on chain, per field, and survives its own founders."

**Known limits to state upfront (credibility):** root authority is a trust point (roadmap: multisig/DAO); on-chain status is enumerable by ID (roadmap: per-batch bitstring); testnet today, L2 mainnet later.

## 9. Open items to re-verify before the pitch
- OpenAttestation salt format (UUID per field) and how the OpenCerts registry is governed: DNS-TXT format is now verified; the other two are not (primary docs did not load).
- Blockcerts signature suite names and anchoring chains (blockcerts.org).
- EAS revocation specifics (docs.attest.org pages did not load; confirmed via QuickNode guide and search only).

---

## 10. Recommended changes to PLAN.md (all applied)

| # | Change | Why |
|---|---|---|
| 1 | Two verification modes: link mode (header + proof) and full-proof mode (file/PDF with fields + salts) | A QR holds about 2.9 KB; fields plus salts do not fit. Link mode proves issuer, status, root; only the file proves field contents. |
| 2 | Short code widened to 60 bits + check char, and demoted to a pointer | 40 bits collides near 1M certs. Identity is always the full 32-byte `certId`. |
| 3 | Single certs emit `Issued(certId, shortCode)` events; batch certs resolve via an untrusted proof resolver or the link itself | Batch certs are not on chain individually. The resolver cannot fake a result because proofs are checked against `batchRoot`. |
| 4 | Double-hashed Merkle leaves, OZ-compatible sorted pairs | Rules out leaf/inner-node confusion; lets Solidity reuse `MerkleProof`. |
| 5 | `domainCheckedAt` stored in IssuerRegistry | Gives the domain check an on-chain answer when live DNS fails. |
| 6 | RPC fallback list with 2-provider agreement; DoH fallback list; two grey degraded states (CANNOT REACH CHAIN, VERIFIED (domain unchecked)) | A flaky network must never produce a false green or a false red. |
| 7 | Issuer must archive each holder's full file (salts) | Salts cannot be regenerated. |

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Root authority is a single trust point | Whoever holds it can accredit fake issuers or pause the system | State it upfront; roadmap multisig/DAO; every action is a public event; pause powers documented. |
| Cross-language hash mismatch (TS vs Solidity `abi.encode` of strings, canonical JSON) | Valid certs fail to verify | Golden vectors in Phase 1; Phase 2 cross-test is a gate, not an extra. |
| Free public RPC endpoints are rate-limited or change | Demo-day failure | Fallback list, 2-provider check, local Anvil fallback, rehearsed. |
| Testnet reset or faucet outage | Lose deployed state | Deploy script is re-runnable, seeded demo data script, Anvil fallback. |
| DNS-over-HTTPS blocked by venue network or CORS | Check 2 cannot run | Two providers, then on-chain `domainCheckedAt` fallback and a grey state. |
| Link-mode QR copied onto a forged PDF | Passes issuer and status, shows fake text | Verdict labels the mode; full-proof mode catches it; demonstrate in the Playground. |
| Lost salts or lost holder file | Holder cannot prove fields | Issuer archives files; link mode still proves existence and status. |
| On-chain status is publicly enumerable by `certId` | Anyone who knows an ID can see status | No PII on chain; IDs are unguessable hashes; roadmap per-batch bitstring status. |
| Typed short code for a batch cert cannot be resolved by the chain alone | Worse UX than single certs | Resolver plus link; disclose as a known limit. |
| Scope creep (phases 7-8 are large) | Core phases 1-6 left unpolished | Phases are shippable gates; do not start 7 until 6 is green. |
| Relayer / gasless issuing adds a trusted payer | Extra attack surface | Optional, last; signature binds issuer so relayer cannot alter content. |
