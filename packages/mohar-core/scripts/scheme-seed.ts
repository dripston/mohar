/**
 * Seeds the scholarship scene (synthetic) on a network and publishes sample files for the web app's demo room.
 *   NETWORK=anvil        DOMAIN=demo.mohar.local         PRIVATE_KEY=0xac09... pnpm --filter @mohar/core scheme-seed
 *   NETWORK=base-sepolia DOMAIN=mohar-demo.duckdns.org   PRIVATE_KEY=<root key>  pnpm --filter @mohar/core scheme-seed
 * With PRINT_ONLY=1 it only creates/prints the three issuer identities, so the DNS TXT record can list them first:
 *   mohar-issuer=<institute>,<revenue office>,<fake institute>[,<other identities>]
 * Output: apps/web/public/demo/<network>/scholarship/ (bundles, applications.zip, a student's full files, index.json).
 * Issuer keys are kept in the git-ignored .seed-keys.<network>.scheme.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, nonceManager, parseEther, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildScenario, bundleToJson, makeZip, proofFileToJson, type Deployment, type ScenarioCtx, type Writer } from "../src";

const NETWORK = process.env.NETWORK ?? "anvil";
const anvil = NETWORK === "anvil";
const KEY = process.env.PRIVATE_KEY as Hex | undefined;
const DOMAIN = process.env.DOMAIN ?? (anvil ? "demo.mohar.local" : undefined);
const N = Number(process.env.N ?? 27);
if (!DOMAIN) throw new Error("set DOMAIN (the domain whose TXT record lists the demo issuers)");

const dep = JSON.parse(readFileSync(new URL(`../../../deployments/${NETWORK}.json`, import.meta.url), "utf8")) as Deployment;
const RPC = process.env.RPC_URL ?? (anvil ? "http://127.0.0.1:8545" : "https://sepolia.base.org");
const chain = defineChain({ id: dep.chainId, name: NETWORK, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

const KEYS_FILE = new URL(`../.seed-keys.${NETWORK}.scheme.json`, import.meta.url);
const keys: { institute: Hex; revenue: Hex; fake: Hex } = existsSync(KEYS_FILE)
  ? JSON.parse(readFileSync(KEYS_FILE, "utf8"))
  : { institute: generatePrivateKey(), revenue: generatePrivateKey(), fake: generatePrivateKey() };
writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
const ids = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, privateKeyToAccount(v).address])) as Record<keyof typeof keys, Address>;
console.log(`issuer identities for ${DOMAIN}:\n  institute ${ids.institute}\n  revenue   ${ids.revenue}\n  fake      ${ids.fake}`);
console.log(`TXT value: mohar-issuer=${ids.institute},${ids.revenue},${ids.fake}`);
if (process.env.PRINT_ONLY === "1") process.exit(0);
if (!KEY) throw new Error("set PRIVATE_KEY (the root authority key) in the environment");

const pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
const root = privateKeyToAccount(KEY, { nonceManager });
const rootWallet = createWalletClient({ account: root, chain, transport: http(RPC) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
console.log(`network ${NETWORK}, root ${root.address}, balance ${formatEther(await pub.getBalance({ address: root.address }))} ETH`);

const ctx: ScenarioCtx = {
  chain,
  rpc: RPC,
  dep,
  pub,
  domain: DOMAIN,
  rootWriter: { wallet: rootWallet, publicClient: pub, deployment: dep } as Writer,
  fund: async (a) => {
    if (anvil) {
      await pub.request({ method: "anvil_setBalance" as any, params: [a, `0x${parseEther("100").toString(16)}`] as any });
      return;
    }
    if ((await pub.getBalance({ address: a })) >= parseEther("0.0006")) return;
    const hash = await rootWallet.sendTransaction({ to: a, value: parseEther("0.0012"), chain } as any);
    await pub.waitForTransactionReceipt({ hash });
    await sleep(4000);
  },
  passTime: async (s) => {
    if (anvil) {
      await pub.request({ method: "evm_increaseTime" as any, params: [s] as any });
      await pub.request({ method: "evm_mine" as any, params: [] as any });
    } else {
      console.log(`waiting ${s}s of real chain time for the planted 'expired' items…`);
      await sleep(s * 1000);
    }
  },
  settle: anvil ? undefined : () => sleep(4000),
};

const t0 = Date.now();
const sc = await buildScenario(ctx, N, 3, keys);
await ctx.passTime(660);
console.log(`issued ${N} applications in ${Math.round((Date.now() - t0) / 1000)} s`);

const out = new URL(`../../../apps/web/public/demo/${NETWORK}/scholarship/`, import.meta.url);
mkdirSync(out, { recursive: true });
const zip: Record<string, string> = {};
for (const b of sc.bundles) {
  writeFileSync(new URL(b.name, out), bundleToJson(b.bundle));
  zip[b.name] = bundleToJson(b.bundle);
}
writeFileSync(new URL("applications.zip", out), makeZip(zip));
const student = sc.fullGood[0]!;
const studentFiles = ["enrolment", "caste", "income"].map((t, i) => {
  const name = `student-${t}.json`;
  writeFileSync(new URL(name, out), proofFileToJson(student.files[i]!));
  return name;
});
const samples = Object.entries(sc.truth).reduce<Record<string, { file: string; expected: string; codes: Record<string, string> }>>((acc, [file, t]) => {
  if (!acc[t.kind]) acc[t.kind] = { file, expected: t.aggregate, codes: t.codes };
  return acc;
}, {});
writeFileSync(
  new URL("index.json", out),
  JSON.stringify(
    {
      network: NETWORK,
      chainId: dep.chainId,
      generatedAt: new Date().toISOString(),
      domain: DOMAIN,
      total: N,
      issuers: { institute: ids.institute, revenueOffice: ids.revenue, fakeInstitute: ids.fake },
      auditCutoff: sc.startedAt,
      studentApplicant: student.name,
      studentFiles,
      samples,
      counts: Object.values(sc.truth).reduce<Record<string, number>>((a, t) => ((a[t.aggregate] = (a[t.aggregate] ?? 0) + 1), a), {}),
      countsAfterAudit: Object.values(sc.truthAfterAudit).reduce<Record<string, number>>((a, t) => ((a[t.aggregate] = (a[t.aggregate] ?? 0) + 1), a), {}),
    },
    null,
    2,
  ),
);
console.log(`wrote ${out.pathname}`);
