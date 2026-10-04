# Mohar architecture and decision log

```
 Issuer UI ──▶ Next.js app (apps/web)         drafts/archives live in the issuer's browser only
 (wallet)      @mohar/core (packages/mohar-core)
                     │ viem: EIP-712 signature + tx
                     ▼
        ┌────────────────────────────────────┐
        │ EVM chain (Base Sepolia / Anvil)   │
        │ IssuerRegistry.sol                 │  who may issue, key revocation with cutoff, rotation
        │ CertificateRegistry.sol            │  roots, batch roots, lifecycle, events
        └────────────────────────────────────┘
                     ▲  public RPC reads (2 providers must agree)
 Anyone ──▶ /verify/<code>#<header or presentation>   +  DNS-over-HTTPS TXT lookup
```

Verification touches **no Mohar server**. The page is static; it reads the chain and DNS directly from the browser.

## Packages

| Path | Role |
|---|---|
| `packages/mohar-core` | Canonical JSON, salted per-field leaves, Merkle trees and proofs, batches, short codes, link/QR formats, EIP-712 types, chain reader (quorum), DoH resolver, the verification pipeline, issuance helpers |
| `packages/contracts` | Foundry project: `IssuerRegistry`, `CertificateRegistry`, deploy script, unit + fuzz + invariant + cross-language tests |
| `apps/web` | Issuer portal, public verifier, holder (selective disclosure), accreditation admin; Playwright e2e |
| `deployments/` | `<network>.json` written by the deploy script |

## What is stored where

| Data | Chain | Holder's file | Issuer archive |
|---|---|---|---|
| Name, grade, email | never | yes | yes |
| Per-field salts | never | yes | yes (cannot be regenerated) |
| `documentRoot` / `batchRoot` | yes | yes | yes |
| Issuer key, issue time, expiry, status, reason | yes | n/a | n/a |

## Contract design

* **Record key (`rid`).** Single certificate: `certId = keccak256(documentRoot)`. Batch certificate: `keccak256(batchRoot, certId)`. The batch is part of the key, so a second accredited issuer cannot squat on or revoke somebody else's certificate by copying its document root into their own batch (test: `test_batch_squatting_isImpossible`).
* **Lazy materialisation.** A batch certificate has no storage until its issuer revokes or suspends it; until then its state is implied by a Merkle proof. This is what makes 1 transaction for N certificates possible, at about 580 gas per certificate for a 200-certificate batch (115,679 gas total, measured by `test_batch_gasPerCertificate`).
* **Expiry is bound on chain.** Single: stored. Batch: the leaf is `(documentRoot, expiresAt)`, so the expiry cannot be extended without breaking the proof.
* **Issuer key lifecycle.** `revokeIssuer(key, effectiveFrom, reason)`: certificates issued before `effectiveFrom` stay valid; later ones read `IssuerRevoked`. `effectiveFrom` may be in the past and a revocation can only move earlier. `rotateIssuerKey` is root-only so a thief holding the old key cannot rotate it away; the new key inherits control of the old certificates.
* **State precedence.** Revoked > IssuerRevoked > Suspended > Expired > Active. Revocation is terminal, suspension is reversible.
* **Pause scope.** `pause()` blocks new issuance only. Revoke, suspend, reinstate and all reads keep working, because during an incident honest issuers must still be able to withdraw certificates.
* **Gasless-ready.** `issue(signer, root, expiresAt, sig)` can be submitted by anyone; the EIP-712 signature binds issuer, root, expiry, per-signer nonce, chain id and contract.

## Decision log

**Why a public EVM L2 (Base) and not a signed database?** No single party, including us, can rewrite history or silently revoke; revocations are public and timestamped; and verification survives our company disappearing, because it needs only a public RPC and the contract address. Base Sepolia for the demo (cheap, reliable faucets), an L2 mainnet later; local Anvil is the offline demo fallback.

**Why a Merkle tree per document and not one hash of the whole document?** A whole-document hash can only say "invalid". Per-field salted leaves let the verifier say *which* field was changed, and let a holder reveal some fields while the root still verifies. Salts stop brute-forcing low-entropy values such as a grade.

**Why OpenZeppelin's StandardMerkleTree layout?** Double-hashed leaves remove leaf/inner-node confusion, and Solidity's audited `MerkleProof` verifies proofs produced in TypeScript with no custom code. A cross-language test re-derives every hash on chain.

**Why a per-field proof instead of one multiproof?** Independent proofs make selective disclosure trivial (drop fields, nothing else changes), let tampering be pinpointed to the exact field even when an attacker recomputes parts of the tree, and cost about 4 hashes per field. A `meta.fieldCount` leaf stops a "full" file from silently dropping fields.

**Why EIP-712?** Wallets show readable fields instead of a blob. EIP-712 has no replay protection of its own, so the domain pins chain id and contract and the message carries a per-signer nonce; the contract also refuses to anchor an existing root.

**Why no PII on chain, ever?** Chains are permanent and public. Only roots, addresses, timestamps and status go on chain.

**Why DNS plus an on-chain registry for issuer identity?** DNS alone lets whoever controls (or hijacks) a domain become "the issuer". The registry makes a human accreditation body the root of trust and DNS a second, independently checkable proof. If DNS lookups fail, the verdict degrades to "domain unchecked" using the authority's on-chain confirmation instead of turning a valid certificate red.

**Why two verification modes?** A QR cannot carry fields plus salts. Link mode (small header + Merkle path) proves issuer and live status; full-proof mode (PDF/file) additionally proves every field. The UI always says which ran, so a genuine QR pasted onto a forged PDF is not mistaken for full verification.

**Why 2-provider agreement on RPC reads?** One compromised or stale public RPC must not be able to turn a revoked certificate green. If providers disagree or none answer, the verifier shows "cannot reach the chain" instead of guessing.

**Why a 60-bit short code that is never the proof?** Humans can type it; it resolves directly for single certificates (event topic) and via a link/file for batch certificates. After any lookup the full 32-byte `certId` is recomputed and compared.

## Known limits (stated up front)

* The root authority is a trust point (roadmap: multisig / DAO accreditation). Everything it does is a public event.
* On-chain status is publicly enumerable by `certId` (IDs are unguessable hashes; roadmap: per-batch status bitstrings).
* A typed short code for a *batch* certificate cannot be resolved by the chain alone (that is the price of one transaction for N certificates); use the link or file.
* A holder who loses the file loses the salts. Issuers must archive complete files.
* Local demo uses a simulated DNS zone (labelled `local-demo-zone` in the UI); real networks use DNS-over-HTTPS.
