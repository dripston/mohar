# Mohar: certificates that cannot lie

**Blockchain certificate issuing and verification, built around scholarship fraud.** Algothon'26, PS ALG-BC-01.

**Live:** https://mohar-theta.vercel.app · **Chain:** Base Sepolia · **Contracts verified on BaseScan:**
[IssuerRegistry `0xA623…55AC`](https://sepolia.basescan.org/address/0xA623d307e423aa090f9B397209fc9ab6086955AC#code) ·
[CertificateRegistry `0x7A08…0135`](https://sepolia.basescan.org/address/0x7A08A61DaE82f1bEdE7003fc83B8B09D26030135#code)

In one government audit, **830 of 1,572 institutions checked were alleged to be fake or non-operational**, collecting scholarships meant for SC, ST and low-income students. The root cause: nobody can check a certificate in seconds. Mohar lets accredited issuers **seal** certificates on a public chain so anyone can check them from a phone, while students disclose only what a scheme needs.

> No personal data on chain, ever: only salted hashes, Merkle roots, issuer addresses, status and timestamps. All demo data is synthetic and every demo issuer is labelled DEMO.

---

## Try it yourself (no wallet, no install, about 3 minutes)

### 1. Verify a certificate on your own phone
Open **https://mohar-theta.vercel.app/demo** on a laptop and scan the QR cards with your phone (mobile data works). Every verdict state is there, issued live on Base Sepolia:

| Card | Expected verdict |
|---|---|
| Valid certificate | VERIFIED |
| Tampered file (grade edited A to A+) | TAMPERED, names the changed field |
| Revoked (issued in error) | REVOKED |
| Suspended | SUSPENDED |
| Expired | EXPIRED |
| Issuer key revoked from before issue | ISSUER_REVOKED |
| Batch member, valid / revoked | VERIFIED / REVOKED (siblings unaffected) |

The phone reads the chain directly through several RPC providers that must agree, pinned to one block. No Mohar server is on the verification path. Each result links to the transaction on BaseScan.

### 2. Be a student: apply without oversharing
1. Download the three sample credentials:
   [student-enrolment.json](https://mohar-theta.vercel.app/demo/base-sepolia/scholarship/student-enrolment.json) ·
   [student-caste.json](https://mohar-theta.vercel.app/demo/base-sepolia/scholarship/student-caste.json) ·
   [student-income.json](https://mohar-theta.vercel.app/demo/base-sepolia/scholarship/student-income.json)
2. Open **/scheme**, keep **I'm a student**, and drop all three files in.
3. See what **leaves your device** (only sealed yes/no answers: enrolled, ST, income ≤ ₹2.5 lakh) and what **stays** (the income itself, address…). Click **Download application.mohar**.

### 3. Be the scholarship officer
1. On **/scheme**, click **I'm an officer** and drop the `application.mohar` you just made. Result: **ELIGIBLE**, with the issuer behind each requirement.
2. Drop [app-0003.mohar](https://mohar-theta.vercel.app/demo/base-sepolia/scholarship/app-0003.mohar), an applicant who edited their income certificate. Result: **INVALID, income TAMPERED**.

### 4. Screen a whole batch
Open **/bulk** and drop [applications.zip](https://mohar-theta.vercel.app/demo/base-sepolia/scholarship/applications.zip) (27 applications). Every one is checked in your browser, with a reason per row and CSV export. The batch has eligible, tampered, revoked, suspended, expired, wrong-issuer-type, missing-document and not-eligible cases.
`app-0015` comes from a **fake institute**: it passes every check until the authority revokes that institute's key with a cut-off (the audit). After that, a re-screen flips it to **INVALID, ISSUER_REVOKED**.

### 5. AI that drafts but never decides
On **/scheme**, draft a scheme from plain English, or use **/issuer/digitise** to read a scanned paper certificate. Every AI draft is schema-checked and must be confirmed by a human. Verification code never calls AI. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

*Issuing (/issuer) and the authority console (/issuer/admin) need a registered wallet, so judges can't use them without our keys. The offline demo below gives you both with one click.*

---

## How it works

| Need | How Mohar does it |
|---|---|
| Who issued it | On-chain issuer registry (root authority lists issuers with a type: institute, revenue office…) **and** a DNS TXT record on the issuer's domain that vouches for its key |
| Not one character changed | Per-field salted Merkle tree (OpenZeppelin StandardMerkleTree); the root is anchored on chain with an EIP-712 issuer signature and a per-signer nonce |
| Still valid now | Revoke / suspend / reinstate with reason codes, expiry, and issuer-key revocation with a time cut-off. Decided on **chain time**, not the browser clock |
| Privacy | Selective disclosure: share single fields; scholarship credentials carry issuer-sealed yes/no flags (these are sealed fields, **not** zero-knowledge proofs) |
| Scale | Batch anchoring: one transaction for a whole class (~540–580 gas per certificate at a batch of 200, measured locally, see [GAS.md](GAS.md)) |
| Lookup | `MHR-XXXX-XXXX-XXXX-C` human code + QR (proof travels in the URL fragment, never sent to a server) |

Repo layout: `packages/contracts` (Solidity + Foundry), `packages/mohar-core` (TypeScript library: issue, verify, scheme, screening; viem), `apps/web` (Next.js 14).

## Run it locally (offline demo)

Prerequisites: Node 20+, pnpm 9, [Foundry](https://getfoundry.sh).

```bash
pnpm install
cd packages/contracts && sh install-deps.sh && cd ../..
pnpm demo:local      # Anvil + deploy + seed every verdict state + scholarship data + web app → opens http://localhost:3000/demo
```

On the local network, `/issuer` and `/issuer/admin` offer one-click demo wallets, so you can issue certificates and run the audit yourself.

## Tests (last runs)

```bash
cd packages/contracts && forge test     # 78 passed: unit, fuzz, invariants, TS<->Solidity golden vectors, hardening
bash packages/contracts/mutate.sh       # 14 hand-written contract mutations, each must turn the suite red
pnpm --filter @mohar/core test          # 151 passed (+12 live Base Sepolia attack tests, run with SEPOLIA=1: 12/12 passed)
pnpm --filter @mohar/web e2e            # Playwright against the real app and chain
```

## Honest limits

- The root authority is the one trusted party (roadmap: multisig). See [SECURITY.md](SECURITY.md).
- The public Base Sepolia RPCs may share infrastructure, so their independence is not proven.
- No legal-compliance claim (DPDP / IT Act). The design minimises data but has not been audited.
- Every claim is graded against a test in [VERIFY.md](VERIFY.md).

## AI tools disclosure

Built with Claude (Anthropic) as the coding agent, phase by phase from `PLAN_V2.md`. All contract logic is covered by tests that were run. In-product AI (Groq) only drafts and never decides a verdict. Details in [AI_DISCLOSURE.md](AI_DISCLOSURE.md).
