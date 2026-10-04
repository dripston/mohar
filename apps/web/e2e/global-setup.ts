/**
 * Seeds the live chain with one certificate in every lifecycle state and writes them to e2e/.fixtures.json.
 * Everything is a real transaction against the real contracts: nothing is mocked.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anchorBatch,
  anchorSingle,
  batchProofFiles,
  buildVerifyUrl,
  certId,
  recordId,
  certificateRegistryAbi,
  issuerRegistryAbi,
  prepareBatch,
  prepareCertificate,
  revokeCert,
  shortCode,
  singleProofFile,
  suspendCert,
  type Deployment,
  type ProofFile,
  type Writer,
} from "@mohar/core";

const RPC = process.env.MOHAR_RPC ?? "http://127.0.0.1:8545";
const ORIGIN = "http://localhost:3100";
const dep = JSON.parse(readFileSync(path.join(process.cwd(), "../../deployments/anvil.json"), "utf8")) as Deployment;
const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const ROOT = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
// anvil #1 is the demo issuer baked into the app's local DNS zone (acharya.ac.in)
const ISSUER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const docFor = (issuer: Address, name: string, over: Record<string, unknown> = {}) => ({
  version: "mohar/1",
  issuer: { address: issuer, domain: "acharya.ac.in", name: "Acharya Institute" },
  recipient: { name, email: `${name.split(" ")[0]!.toLowerCase()}@example.com` },
  credential: { title: "B.E. AI Engineering", grade: "8.34", issuedOn: "2028-06-01", expiresOn: null, ...over },
});

import { seedScheme } from "./scheme-setup";

export default async function globalSetup() {
  const code = await pub.getCode({ address: dep.certificateRegistry });
  if (!code || code === "0x") throw new Error("No contracts on the local chain. Run: powershell -File scripts/dev-chain.ps1");

  await seedScheme();

  // Reuse fixtures if they still exist on this very chain (a fresh chain invalidates them and re-seeds).
  try {
    const old = JSON.parse(readFileSync(path.join(process.cwd(), "e2e/.fixtures.json"), "utf8"));
    const c = (await pub.readContract({ address: dep.certificateRegistry, abi: certificateRegistryAbi, functionName: "getCert", args: [recordId(ISSUER.address, old.good.file.documentRoot)] })) as { state: number };
    if (c.state !== 0) return;
  } catch {
    /* no fixtures yet: seed */
  }

  const w: Writer = { wallet: createWalletClient({ account: ISSUER, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
  const link = (f: ProofFile) =>
    buildVerifyUrl(ORIGIN, shortCode(certId(f.documentRoot)), { chainId: f.chainId, signer: f.signer, documentRoot: f.documentRoot, expiresAt: f.expiresAt, anchor: f.anchor });

  const single = async (name: string, over: Record<string, unknown> = {}, expiresAt?: number) => {
    const p = prepareCertificate(docFor(ISSUER.address, name, over) as any);
    if (expiresAt) p.expiresAt = expiresAt;
    const { txHash } = await anchorSingle(w, p);
    return singleProofFile(dep, ISSUER.address, p, txHash);
  };
  const stamp = Date.now().toString().slice(-6);

  const good = await single(`Aarav Good ${stamp}`);
  const revoked = await single(`Riya Revoked ${stamp}`);
  await revokeCert(w, { kind: "single", rid: recordId(ISSUER.address, revoked.documentRoot) }, 2);
  const suspended = await single(`Sana Suspended ${stamp}`);
  await suspendCert(w, { kind: "single", rid: recordId(ISSUER.address, suspended.documentRoot) });
  const nearExpiry = await single(`Eshan Expiring ${stamp}`, {}, Number((await pub.getBlock()).timestamp) + 45);

  const batch = prepareBatch(Array.from({ length: 12 }, (_, i) => docFor(ISSUER.address, `Batch Student ${i} ${stamp}`, { title: "Diploma in Data Science" }) as any));
  const { txHash, gasPerCert } = await anchorBatch(w, batch);
  const batchFiles = batchProofFiles(dep, ISSUER.address, batch, txHash);
  const batchRevoked = batchFiles[2]!;
  await revokeCert(w, { kind: "batch", identity: ISSUER.address, batchRoot: (batchRevoked.anchor as any).batchRoot, documentRoot: batchRevoked.documentRoot, expiresAt: batchRevoked.expiresAt, proof: (batchRevoked.anchor as any).proof }, 3);

  // an issuer that is accredited, then revoked from a moment between two of its certificates
  const stolenAcct = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"); // anvil #2, needs a FRESH chain per run
  await pub.request({ method: "anvil_setBalance" as any, params: [stolenAcct.address, `0x${parseEther("10").toString(16)}`] as any });
  const rootWallet = createWalletClient({ account: ROOT, chain, transport: http(RPC) });
  await pub.waitForTransactionReceipt({
    hash: await rootWallet.writeContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "registerIssuer", args: [stolenAcct.address, "acharya.ac.in", "Acharya Institute", true], chain }),
  });
  const sw: Writer = { wallet: createWalletClient({ account: stolenAcct, chain, transport: http(RPC) }), publicClient: pub, deployment: dep };
  const sp1 = prepareCertificate(docFor(stolenAcct.address, `Pre Cutoff ${stamp}`) as any);
  await anchorSingle(sw, sp1);
  const preCutoff = singleProofFile(dep, stolenAcct.address, sp1);
  await pub.request({ method: "evm_increaseTime" as any, params: [60] as any });
  await pub.request({ method: "evm_mine" as any, params: [] as any });
  const cutoff = Number((await pub.getBlock()).timestamp);
  await pub.request({ method: "evm_increaseTime" as any, params: [60] as any });
  await pub.request({ method: "evm_mine" as any, params: [] as any });
  const sp2 = prepareCertificate(docFor(stolenAcct.address, `Post Cutoff ${stamp}`) as any);
  await anchorSingle(sw, sp2);
  const postCutoff = singleProofFile(dep, stolenAcct.address, sp2);
  await pub.waitForTransactionReceipt({
    hash: await rootWallet.writeContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "revokeIssuer", args: [stolenAcct.address, BigInt(cutoff), 1], chain }),
  });

  // wait for the near-expiry certificate to expire on chain time
  await pub.request({ method: "evm_increaseTime" as any, params: [120] as any });
  await pub.request({ method: "evm_mine" as any, params: [] as any });

  mkdirSync(path.join(process.cwd(), "e2e"), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), "e2e/.fixtures.json"),
    JSON.stringify(
      {
        origin: ORIGIN,
        gasPerCert,
        good: { file: good, link: link(good) },
        revoked: { file: revoked, link: link(revoked) },
        suspended: { file: suspended, link: link(suspended) },
        expired: { file: nearExpiry, link: link(nearExpiry) },
        batchGood: { file: batchFiles[0]!, link: link(batchFiles[0]!) },
        batchRevoked: { file: batchRevoked, link: link(batchRevoked) },
        preCutoff: { file: preCutoff, link: link(preCutoff) },
        postCutoff: { file: postCutoff, link: link(postCutoff) },
      },
      null,
      2,
    ),
  );
}
