# GAS.md: cost of a 200-certificate batch

Measured on **base-sepolia** (chain 84532) at 2026-10-04T13:45:21.922Z. Transaction: `0xf73f6bb2e88d64babc00b52b4d24434137f3d7bca2b3b734668e4828ce09f77c`.

| Measured | Value |
|---|---|
| Gas used (execution) | 108485 |
| Gas per certificate | **542** |
| L2 gas price paid | 6000000 wei |
| L2 execution fee | 0.00000065091 ETH |
| L1 data fee reported by the receipt | 0.000000006712503211 ETH (L1 gas 3039) |

Testnet ETH has no value, so those are not rupees.

## Estimate: the same batch on Base MAINNET (not measured)

| Input | Value | Source |
|---|---|---|
| Base mainnet L2 gas price | 6000000 wei | `eth_gasPrice` on mainnet.base.org, 2026-10-04T13:45:22.561Z |
| L1 base fee / blob base fee | 176519746 / 10863342 wei | L1Block predeploy `0x4200...0015` on Base mainnet, 2026-10-04T13:45:22.561Z |
| ETH/INR | ₹259889 | https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=inr, 2026-10-04T13:45:22.561Z |
| Gas used / tx size implied | 108485 / 189 bytes | measured on base-sepolia |

Estimated fee: 6.511e-7 ETH = **₹0.17** per batch = **₹0.0008 per certificate**.

This is an estimate: fees move with L1 congestion, and the L1 data fee is derived from the testnet transaction size.
