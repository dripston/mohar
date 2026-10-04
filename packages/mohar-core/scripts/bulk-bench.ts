/**
 * Seeds N synthetic applications (with planted failures) and times the bulk screener at several concurrency levels.
 *   N=1000 pnpm --filter @mohar/core bench          (Anvil, needs the local chain)
 * Writes docs/bulk-timings.json. Timings are from THIS machine and THIS node: say so when quoting them.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { auditRevoke, buildScenario, clientsFromUrls, DEMO_ST_SCHOLARSHIP, makeReader, memoDns, screenBundles, type Deployment, type DnsResolver, type ScenarioCtx, type Writer } from "../src";

const RPC = process.env.MOHAR_RPC ?? "http://127.0.0.1:8545";
const N = Number(process.env.N ?? 1000);
const dep = JSON.parse(readFileSync(new URL("../../../deployments/anvil.json", import.meta.url), "utf8")) as Deployment;
const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
const rootWallet = createWalletClient({ account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), chain, transport: http(RPC) });
const ctx: ScenarioCtx = {
  chain, rpc: RPC, dep, pub, domain: "scholarship.demo",
  rootWriter: { wallet: rootWallet, publicClient: pub, deployment: dep } as Writer,
  fund: async (a: Address) => { await pub.request({ method: "anvil_setBalance" as any, params: [a, `0x${parseEther("100").toString(16)}`] as any }); },
  passTime: async (s) => { await pub.request({ method: "evm_increaseTime" as any, params: [s] as any }); await pub.request({ method: "evm_mine" as any, params: [] as any }); },
};
const dns: DnsResolver = async () => ({ status: "match", provider: "stub" });

const t0 = Date.now();
const sc = await buildScenario(ctx, N, 25);
await ctx.passTime(900);
const seedMs = Date.now() - t0;
console.log(`seeded ${N} in ${seedMs} ms`);
const items = sc.bundles.map((b) => ({ name: b.name, bundle: b.bundle }));
const runs: any[] = [];
for (const concurrency of [8, 24, 64, 128]) {
  const deps = { reader: makeReader(dep, clientsFromUrls([RPC], 20000, { batch: true }), 3, { pinMs: 300_000 }), dns: memoDns(dns) };
  const { summary, rows } = await screenBundles(items, DEMO_ST_SCHOLARSHIP, deps, { concurrency });
  const wrong = rows.filter((r) => r.aggregate !== sc.truth[r.name]!.aggregate).length;
  runs.push({ concurrency, ms: summary.ms, perSecond: Math.round(summary.perSecond), counts: summary.counts, wrong });
  console.log(JSON.stringify(runs.at(-1)));
}
const before = runs.at(-1)!.counts.INVALID;
await auditRevoke(ctx, sc.fakeInstituteKey, sc.startedAt);
const deps = { reader: makeReader(dep, clientsFromUrls([RPC], 20000, { batch: true }), 3, { pinMs: 300_000 }), dns: memoDns(dns) };
const a0 = Date.now();
const after = await screenBundles(items, DEMO_ST_SCHOLARSHIP, deps, { concurrency: 64 });
const audit = { invalidBefore: before, invalidAfter: after.summary.counts.INVALID, rescreenMs: Date.now() - a0 };
console.log(JSON.stringify(audit));
mkdirSync(new URL("../../../docs", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../../../docs/bulk-timings.json", import.meta.url),
  JSON.stringify({ when: new Date().toISOString(), network: "anvil (local, 1 provider)", machine: `${cpus()[0]?.model} x${cpus().length}`, n: N, seedMs, runs, audit }, null, 2),
);
