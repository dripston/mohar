#!/usr/bin/env sh
# Vendored Solidity deps are not committed. Run once from packages/contracts:
set -e
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0
mv ../../lib/* lib/ 2>/dev/null || true
