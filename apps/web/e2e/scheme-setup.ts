/** Seeds a small synthetic scholarship world on the live chain for the scheme / bulk / receipt specs. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildScenario, bundleToJson, proofFileToJson, makeZip, type Deployment, type ScenarioCtx, type Writer } from "@mohar/core";

const RPC = process.env.MOHAR_RPC ?? "http://127.0.0.1:8545";
export const SCHEME_DIR = path.join(process.cwd(), "e2e/.scheme");

export async function seedScheme(n = 36) {
  const dep = JSON.parse(readFileSync(path.join(process.cwd(), "../../deployments/anvil.json"), "utf8")) as Deployment;
  const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const root = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const rootWallet = createWalletClient({ account: root, chain, transport: http(RPC) });
  const ctx: ScenarioCtx = {
    chain,
    rpc: RPC,
    dep,
    pub: pub as any,
    domain: "scholarship.demo",
    rootWriter: { wallet: rootWallet, publicClient: pub, deployment: dep } as Writer,
    fund: async (a: Address) => {
      await pub.request({ method: "anvil_setBalance" as any, params: [a, `0x${parseEther("100").toString(16)}`] as any });
    },
    passTime: async (s) => {
      await pub.request({ method: "evm_increaseTime" as any, params: [s] as any });
      await pub.request({ method: "evm_mine" as any, params: [] as any });
    },
  };
  const sc = await buildScenario(ctx, n, 4);
  await ctx.passTime(900);
  mkdirSync(SCHEME_DIR, { recursive: true });
  const files: Record<string, string> = {};
  for (const b of sc.bundles) {
    writeFileSync(path.join(SCHEME_DIR, b.name), bundleToJson(b.bundle));
    files[b.name] = bundleToJson(b.bundle);
  }
  // hostile / broken entries ride along in the zip to prove they become row errors
  files["broken.mohar"] = "{not json";
  files["=cmd-injection.json"] = JSON.stringify({ format: "nope" });
  writeFileSync(path.join(SCHEME_DIR, "applications.zip"), makeZip(files));
  sc.fullGood[0]!.files.forEach((f, i) => writeFileSync(path.join(SCHEME_DIR, `student-${i}.json`), proofFileToJson(f)));
  const lookup = (kind: string) => Object.entries(sc.truth).find(([, t]) => t.kind === kind)![0];
  writeFileSync(
    path.join(SCHEME_DIR, "meta.json"),
    JSON.stringify({ truth: sc.truth, truthAfterAudit: sc.truthAfterAudit, fakeInstituteKey: sc.fakeInstituteKey, pick: Object.fromEntries(["good", "tampered", "revoked", "suspended", "expired", "fake_institute", "wrong_issuer_type", "missing", "not_eligible_income", "not_eligible_category"].map((k) => [k, lookup(k)])), total: n }, null, 2),
  );
}

export const schemeMeta = () => JSON.parse(readFileSync(path.join(SCHEME_DIR, "meta.json"), "utf8"));
