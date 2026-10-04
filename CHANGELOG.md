# CHANGELOG

## phase-7: truth audit, review fixes, contract v2
- VERIFY.md: every claim graded PROVEN / PARTIAL / FALSE.
- REVIEW.md: 13-item review of phases 1-6, each with a failing test first.
- Contract v2: records namespaced by issuer identity (fixes root squatting); issuer type and accreditation source (root-only, evented); key revocation cutoff that can only move earlier; key rotation; last-root guard; pause stops issuance only; on-chain short-code index; EIP-712 nonces with `invalidatePendingSignatures`.
- AUTHORITY.md: what the root can do and what a stolen key can do.
- Mutation spot check script (14 mutations, all killed).
- Verifier: quorum RPC reads pinned to one block, chain-time decisions, hardened proof-file parsing.
- Base Sepolia deploy script ready (`scripts/deploy-sepolia.sh`); **not yet run: needs the funded key**.

## phase-8 (prepared, blocked on credentials)
- Seed script (`pnpm seed`) and gas script (`pnpm gas`) work on Anvil; Sepolia runs need `PRIVATE_KEY`, a domain and an app origin.
- Not done: Sepolia deploy, BaseScan verification, real DNS TXT, Vercel hosting, phone test, demo video.
