#!/usr/bin/env bash
# ONE COMMAND offline fallback (macOS/Linux/Git Bash): fresh local chain + contracts + seeded demo data + the web app.
#   bash scripts/demo-local.sh
# Needs Foundry (anvil, forge) and pnpm. No internet, no wallet, no API keys. Everything is LOCAL and DEMO.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:$HOME/.foundry/bin"

pkill anvil 2>/dev/null || true
anvil --port 8545 > /tmp/mohar-anvil.log 2>&1 &
for _ in $(seq 1 40); do
  curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null && break
  sleep 0.25
done

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil #0, public test key
export NETWORK=anvil DEMO_ISSUER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
(cd packages/contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast >/dev/null)

export DOMAIN=demo.mohar.local APP_ORIGIN=http://localhost:3000
pnpm --filter @mohar/core seed

export NEXT_PUBLIC_NETWORK=anvil NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
export NEXT_PUBLIC_DEV_DNS_JSON='{"demo.mohar.local":["*"]}'
echo "open http://localhost:3000/verify  (links in SEED.md, QR images in docs/seed/)"
pnpm --filter @mohar/web dev
