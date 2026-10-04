#!/usr/bin/env bash
# Deploys Mohar v2 to Base Sepolia. The key is read from the environment ONLY; it is never written to disk or printed.
#
#   export PRIVATE_KEY=0x<funded deployer>        # becomes the ROOT AUTHORITY (demo: plays the ministry)
#   export ETHERSCAN_API_KEY=<key>                # optional: BaseScan source verification (Etherscan v2 key works)
#   export DEMO_ISSUER=0x<address>                # optional: pre-register one demo issuer
#   bash scripts/deploy-sepolia.sh
#
# Rehearsal vs real: it is the same command. Run it once as a rehearsal, then run it again for the real deployment
# (each run overwrites deployments/base-sepolia.json with the new addresses).
set -euo pipefail
cd "$(dirname "$0")/../packages/contracts"
export PATH="$PATH:$HOME/.foundry/bin:/c/Users/rehaan/.foundry/bin"

: "${PRIVATE_KEY:?Set PRIVATE_KEY (funded Base Sepolia key) in the environment}"
RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"
export NETWORK=base-sepolia

ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
CHAIN=$(cast chain-id --rpc-url "$RPC")
BAL=$(cast balance "$ADDR" --rpc-url "$RPC" --ether)
echo "deployer $ADDR   chain $CHAIN   balance $BAL ETH"
[ "$CHAIN" = "84532" ] || { echo "ERROR: $RPC is chain $CHAIN, expected 84532 (Base Sepolia)"; exit 1; }
if [ "$(echo "$BAL < 0.005" | bc -l 2>/dev/null || echo 0)" = "1" ]; then echo "WARNING: balance under 0.005 ETH; get more from a Base Sepolia faucet"; fi

VERIFY=()
if [ -n "${ETHERSCAN_API_KEY:-}" ]; then VERIFY=(--verify --verifier etherscan --chain 84532 --etherscan-api-key "$ETHERSCAN_API_KEY"); fi

forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast "${VERIFY[@]}" -vv
echo
cat ../../deployments/base-sepolia.json
