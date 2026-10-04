import { defineChain } from "viem";
import type { Deployment } from "@mohar/core";
import anvil from "../../../deployments/anvil.json";

/**
 * One place that says which chain and which contracts the app talks to.
 * NEXT_PUBLIC_NETWORK = "anvil" (default, local demo/e2e) | "base-sepolia" (after `forge script ... --broadcast`).
 * Public RPC endpoints are tried in order and must agree (see @mohar/core makeReader).
 */
const NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? "anvil";

const RPCS: Record<string, string[]> = {
  anvil: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"],
  // Free public endpoints change over time: confirm each one answers before a demo.
  "base-sepolia": [
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.drpc.org",
  ],
};

const EXPLORERS: Record<string, string | undefined> = {
  anvil: undefined,
  "base-sepolia": "https://sepolia.basescan.org",
};

function load(): Deployment {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_JSON) {
    return { ...(JSON.parse(process.env.NEXT_PUBLIC_DEPLOYMENT_JSON) as Deployment) };
  }
  if (NETWORK !== "anvil") {
    throw new Error(
      `No deployment for "${NETWORK}". Deploy with packages/contracts/script/Deploy.s.sol and set NEXT_PUBLIC_DEPLOYMENT_JSON.`,
    );
  }
  return anvil as unknown as Deployment;
}

export const deployment: Deployment = {
  ...load(),
  rpcUrls: RPCS[NETWORK] ?? RPCS.anvil!,
  explorer: EXPLORERS[NETWORK],
};

export const chain = defineChain({
  id: deployment.chainId,
  name: NETWORK === "anvil" ? "Local Anvil" : "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: deployment.rpcUrls! } },
  blockExplorers: deployment.explorer ? { default: { name: "Explorer", url: deployment.explorer } } : undefined,
});

export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";

/** Local demo only: anvil's well-known test keys. Never set on a real network. */
export const DEV_WALLET_ENABLED = NETWORK === "anvil";
export const DEV_ISSUER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // anvil #1
export const DEV_ROOT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const; // anvil #0

export const explorerTx = (hash: string) => (deployment.explorer ? `${deployment.explorer}/tx/${hash}` : undefined);
export const explorerAddr = (a: string) => (deployment.explorer ? `${deployment.explorer}/address/${a}` : undefined);
