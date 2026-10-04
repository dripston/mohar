# Mohar

**Blockchain certificate issuing and verification.** Algothon'26, PS ALG-BC-01.

Every certificate carries proof of three things anyone can check in seconds, without trusting us:
**who issued it**, **that not one character changed**, and **that it is still valid right now**.
Students can share only the fields they choose. A university issues a thousand certificates for the price of one transaction.

> No personal data on chain, ever. Only salted hashes, roots, issuer addresses, status and timestamps.

## What is real

Everything below runs against a real EVM chain with the real contracts. Nothing on the verification path is mocked or served from a database; the chain is the source of truth. The one simulated piece is DNS on the *local* network (the UI labels it `local-demo-zone`); on a real network the verifier uses DNS-over-HTTPS.

| Must have | How Mohar does it |
|---|---|
| Issuer workflow | Accredited-issuer registry, DNS domain proof, single issue, bulk CSV issue, dashboard, revoke / suspend / reinstate |
| Unique verification ID | `certId = keccak256(documentRoot)` plus a human code `MHR-XXXX-XXXX-XXXX-C` (60 bits + check symbol) |
| QR / link verification | QR carries a small header + Merkle path in the URL fragment (never sent to a server) |
| Public verification page | Live 5-point checklist read from the chain; tamper view names the exact field |
| Status / revocation | Reason codes, timestamps, suspend/reinstate, expiry, issuer-key revocation with a time cutoff, key rotation |
| Integrity | Per-field salted Merkle tree: detects *and pinpoints* tampering, enables selective disclosure |
| Bonus: origin | EIP-712 issuer signature, on-chain issuer registry, DNS TXT domain binding |

Read next: [PLAN.md](PLAN.md) (design), [RESEARCH.md](RESEARCH.md) (prior art), [ARCHITECTURE.md](ARCHITECTURE.md) (decision log), [TESTING.md](TESTING.md) (attack matrix with results).

## Run it

Prerequisites: Node 20+, pnpm 9, [Foundry](https://getfoundry.sh) (`forge`, `anvil`).

```bash
pnpm install
cd packages/contracts && sh install-deps.sh && cd ../..   # forge-std + OpenZeppelin

# 1. fresh local chain + deploy (Windows PowerShell)
powershell -File scripts/dev-chain.ps1
#    non-Windows: anvil & ; cd packages/contracts && PRIVATE_KEY=0xac09...ff80 NETWORK=anvil \
#                 DEMO_ISSUER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
#                 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# 2. app
pnpm --filter @mohar/web dev        # http://localhost:3000
```

Demo wallets (local network only): "Use demo issuer wallet" on `/issuer`, "Use demo authority wallet" on `/issuer/admin`.

### Tests

```bash
cd packages/contracts && forge test                  # 51 tests: unit, fuzz (1000 runs), invariants, TS<->Solidity cross-checks
pnpm --filter @mohar/core test                       # 37 unit + golden-vector tests, plus the live-chain attack matrix (needs the local chain)
pnpm --filter @mohar/web e2e                         # Playwright against the real app + chain
pnpm --filter @mohar/core vectors                    # regenerate cross-language vectors
```

### Deploy to Base Sepolia

```bash
cd packages/contracts
PRIVATE_KEY=0x<funded key> NETWORK=base-sepolia \
  forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
# then run the web app with NEXT_PUBLIC_NETWORK=base-sepolia and NEXT_PUBLIC_DEPLOYMENT_JSON=$(cat deployments/base-sepolia.json)
```

No testnet deployment is checked in: that needs a funded key, which only you hold. Local Anvil is the verified path and the demo-day fallback.

## AI tools disclosure

Built with Claude (Anthropic) as the coding agent, working phase by phase from `PLAN.md`, with sub-agents used for UI work. All contract logic is covered by tests that were run, and the cryptography is cross-checked between TypeScript and Solidity.

## Limitations and roadmap

See the end of [ARCHITECTURE.md](ARCHITECTURE.md): the root authority is a trust point (roadmap: multisig/DAO), status is enumerable by ID (roadmap: per-batch bitstrings), a typed code for a batch certificate needs the link or file, and salts must be archived by issuers.
