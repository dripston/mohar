/**
 * Phase 8.7: measure the real cost of anchoring a 200-certificate batch and convert it to rupees.
 *
 *   NETWORK=base-sepolia PRIVATE_KEY=0x<root authority> pnpm --filter @mohar/core gas
 *
 * Writes GAS.md. What is MEASURED: gas used, and on an OP-stack chain the L1 data fee the receipt reports.
 * What is an ESTIMATE: the rupee figure for Base MAINNET, because testnet ETH is worthless and the testnet L1 fee is not
 * the mainnet one. The estimate re-prices the measured transaction with live Base mainnet values and the ETH/INR rate,
 * each stamped with its source and time.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther, parseAbi, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anchorBatch, issuerRegistryAbi, prepareBatch, type Deployment, type Writer } from "../src";

const NETWORK = process.env.NETWORK ?? "base-sepolia";
const N = Number(process.env.BATCH ?? 200);
const KEY = process.env.PRIVATE_KEY as Hex | undefined;
if (!KEY) throw new Error("Set PRIVATE_KEY (the root authority) in the environment.");
const dep = JSON.parse(readFileSync(new URL(`../../../deployments/${NETWORK}.json`, import.meta.url), "utf8")) as Deployment;
const RPCS = process.env.RPC_URLS?.split(",") ?? (NETWORK === "anvil" ? ["http://127.0.0.1:8545"] : ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"]);
const chain = defineChain({ id: dep.chainId, name: NETWORK, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: RPCS } } });
const pub = createPublicClient({ chain, transport: http(RPCS[0]) }) as PublicClient;
const root = createWalletClient({ account: privateKeyToAccount(KEY), chain, transport: http(RPCS[0]) });

async function mainnetFacts() {
  const rpc = createPublicClient({ transport: http("https://mainnet.base.org") });
  const oracle = "0x4200000000000000000000000000000000000015" as const; // L1Block predeploy
  const abi = parseAbi([
    "function basefee() view returns (uint256)",
    "function blobBaseFee() view returns (uint256)",
    "function baseFeeScalar() view returns (uint32)",
    "function blobBaseFeeScalar() view returns (uint32)",
  ]);
  const [l2GasPrice, l1BaseFee, blobBaseFee, bfs, bbfs] = await Promise.all([
    rpc.getGasPrice(),
    rpc.readContract({ address: oracle, abi, functionName: "basefee" }),
    rpc.readContract({ address: oracle, abi, functionName: "blobBaseFee" }),
    rpc.readContract({ address: oracle, abi, functionName: "baseFeeScalar" }),
    rpc.readContract({ address: oracle, abi, functionName: "blobBaseFeeScalar" }),
  ]);
  return { l2GasPrice, l1BaseFee, blobBaseFee, bfs: BigInt(bfs), bbfs: BigInt(bbfs) };
}

async function ethInr() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=inr";
  const r = await fetch(url);
  const j = (await r.json()) as { ethereum: { inr: number } };
  return { inr: j.ethereum.inr, source: url, at: new Date().toISOString() };
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const want = parseEther(NETWORK === "anvil" ? "10" : "0.003");
  await pub.waitForTransactionReceipt({ hash: await root.sendTransaction({ to: account.address, value: want, chain } as any) });
  await pub.waitForTransactionReceipt({
    hash: await root.writeContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "registerIssuer", args: [account.address, "gas-test.example", "Gas Test Issuer (demo)", true, 0, "gas measurement"], chain } as any),
  });
  const w: Writer = { wallet: createWalletClient({ account, chain, transport: http(RPCS[0]) }), publicClient: pub, deployment: dep };
  const docs = Array.from({ length: N }, (_, i) => ({
    version: "mohar/1",
    issuer: { address: account.address, domain: "gas-test.example", name: "Gas Test Issuer (demo)" },
    recipient: { name: `Gas Test ${i}` },
    credential: { title: "Gas measurement certificate", grade: "A", issuedOn: "2026-06-01", expiresOn: null },
  })) as any[];
  const b = prepareBatch(docs);
  const { txHash, gasUsed, gasPerCert } = await anchorBatch(w, b);
  const raw: any = await pub.request({ method: "eth_getTransactionReceipt", params: [txHash] } as any);
  const hex = (x?: string) => (x ? BigInt(x) : 0n);
  const l2Price = hex(raw.effectiveGasPrice);
  const l2Fee = gasUsed * l2Price;
  const l1Fee = hex(raw.l1Fee);
  const l1GasUsed = hex(raw.l1GasUsed);
  console.log(`batch of ${N}: gasUsed ${gasUsed}, per cert ${Math.round(gasPerCert)}, l2 fee ${formatEther(l2Fee)} ETH, l1 fee ${formatEther(l1Fee)} ETH`);

  let md = `# GAS.md: cost of a ${N}-certificate batch

Measured on **${NETWORK}** (chain ${dep.chainId}) at ${new Date().toISOString()}. Transaction: \`${txHash}\`.

| Measured | Value |
|---|---|
| Gas used (execution) | ${gasUsed.toString()} |
| Gas per certificate | **${Math.round(gasPerCert)}** |
| L2 gas price paid | ${l2Price.toString()} wei |
| L2 execution fee | ${formatEther(l2Fee)} ETH |
| L1 data fee reported by the receipt | ${l1Fee > 0n ? `${formatEther(l1Fee)} ETH (L1 gas ${l1GasUsed})` : "n/a on this chain"} |

Testnet ETH has no value, so those are not rupees.
`;
  if (NETWORK !== "anvil") {
    try {
      const [m, fx] = await Promise.all([mainnetFacts(), ethInr()]);
      // Ecotone L1 fee re-priced with live mainnet values: (16*baseFeeScalar*l1BaseFee + blobBaseFeeScalar*blobBaseFee) * size / (16*1e6)
      const size = l1GasUsed / 16n; // compressed tx size implied by the receipt (l1GasUsed ~ 16 * size)
      const l1Main = ((16n * m.bfs * m.l1BaseFee + m.bbfs * m.blobBaseFee) * size) / (16n * 1_000_000n);
      const l2Main = gasUsed * m.l2GasPrice;
      const totalEth = Number(formatEther(l2Main + l1Main));
      const inr = totalEth * fx.inr;
      md += `
## Estimate: the same batch on Base MAINNET (not measured)

| Input | Value | Source |
|---|---|---|
| Base mainnet L2 gas price | ${m.l2GasPrice.toString()} wei | \`eth_gasPrice\` on mainnet.base.org, ${fx.at} |
| L1 base fee / blob base fee | ${m.l1BaseFee.toString()} / ${m.blobBaseFee.toString()} wei | L1Block predeploy \`0x4200...0015\` on Base mainnet, ${fx.at} |
| ETH/INR | ₹${fx.inr} | ${fx.source}, ${fx.at} |
| Gas used / tx size implied | ${gasUsed} / ${size} bytes | measured on ${NETWORK} |

Estimated fee: ${totalEth.toExponential(3)} ETH = **₹${inr.toFixed(2)}** per batch = **₹${(inr / N).toFixed(4)} per certificate**.

This is an estimate: fees move with L1 congestion, and the L1 data fee is derived from the testnet transaction size.
`;
    } catch (e) {
      md += `\nCould not fetch mainnet prices or the exchange rate (${(e as Error).message}); rupee figure not computed.\n`;
    }
  }
  writeFileSync(new URL("../../../GAS.md", import.meta.url), md);
  console.log("wrote GAS.md");
}
main();
