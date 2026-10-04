/**
 * Seeds one certificate in every verdict state, a tampered file, and a revoked batch member, then writes SEED.md with
 * verify links, QR images and the verdict each one actually produced.
 *
 *   NETWORK=anvil          PRIVATE_KEY=0xac09... pnpm --filter @mohar/core seed
 *   NETWORK=base-sepolia   PRIVATE_KEY=0x<funded deployer = root authority> DOMAIN=<domain with the TXT record> \
 *                          APP_ORIGIN=https://<your app> pnpm --filter @mohar/core seed
 *
 * The deployer key is read from the environment only and never written anywhere. Issuer keys for the demo
 * institutions are generated once and kept in .seed-keys.json (git-ignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import QRCode from "qrcode";
import {
  anchorBatch,
  anchorSingle,
  batchProofFiles,
  buildVerifyUrl,
  certId,
  clientsFromUrls,
  issuerRegistryAbi,
  makeDohResolver,
  makeReader,
  prepareBatch,
  prepareCertificate,
  proofFileToJson,
  recordId,
  revokeCert,
  shortCode,
  singleProofFile,
  suspendCert,
  verifyCertificate,
  type Deployment,
  type DnsResolver,
  type ProofFile,
  type Writer,
} from "../src";

const NETWORK = process.env.NETWORK ?? "anvil";
const DEPLOYER = process.env.PRIVATE_KEY as Hex | undefined;
if (!DEPLOYER) throw new Error("Set PRIVATE_KEY (the root authority / deployer) in the environment.");
const dep = JSON.parse(readFileSync(new URL(`../../../deployments/${NETWORK}.json`, import.meta.url), "utf8")) as Deployment;
const RPCS =
  process.env.RPC_URLS?.split(",") ??
  (NETWORK === "anvil"
    ? ["http://127.0.0.1:8545"]
    : ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"]);
const DOMAIN = process.env.DOMAIN ?? "acharya.ac.in";
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const chain = defineChain({ id: dep.chainId, name: NETWORK, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: RPCS } } });
const pub = createPublicClient({ chain, transport: http(RPCS[0]) }) as PublicClient;
const root = privateKeyToAccount(DEPLOYER);
const rootWallet = createWalletClient({ account: root, chain, transport: http(RPCS[0]) });

const KEYS_FILE = new URL(`../.seed-keys.${NETWORK}.json`, import.meta.url);
const keys: Record<string, Hex> = existsSync(KEYS_FILE) ? JSON.parse(readFileSync(KEYS_FILE, "utf8")) : {};
const keyFor = (name: string) => (keys[name] ??= generatePrivateKey());

const wait = (hash: Hex) => pub.waitForTransactionReceipt({ hash });
async function rootTx(functionName: string, args: unknown[]) {
  const hash = await rootWallet.writeContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName, args, chain } as any);
  const r = await wait(hash);
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}
async function ensureIssuer(name: string, display: string, type: number, source: string) {
  const account = privateKeyToAccount(keyFor(name));
  const balance = await pub.getBalance({ address: account.address });
  const want = NETWORK === "anvil" ? parseEther("10") : parseEther("0.002");
  if (balance < want / 2n) await wait(await rootWallet.sendTransaction({ to: account.address, value: want, chain } as any));
  const known = (await pub.readContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "identityOf", args: [account.address] })) as Address;
  if (/^0x0{40}$/.test(known)) await rootTx("registerIssuer", [account.address, DOMAIN, display, true, type, source]);
  const w: Writer = { wallet: createWalletClient({ account, chain, transport: http(RPCS[0]) }), publicClient: pub, deployment: dep };
  return { account, w, name: display };
}

const doc = (issuer: { address: Address }, issuerName: string, recipient: string, over: Record<string, unknown> = {}) => ({
  version: "mohar/1",
  issuer: { address: issuer.address, domain: DOMAIN, name: issuerName },
  recipient: { name: recipient },
  credential: { title: "Demo Certificate (synthetic data)", grade: "A", issuedOn: "2026-06-01", expiresOn: null, ...over },
});

const dns: DnsResolver =
  NETWORK === "anvil"
    ? async (domain, identity) => ({ status: "match", provider: "seed-stub", demo: true }) // the web app has its own labelled demo zone
    : makeDohResolver();
const verify = (file: ProofFile) => verifyCertificate({ file }, { reader: makeReader(dep, clientsFromUrls(RPCS)), dns });

async function chainNow() {
  return Number((await pub.getBlock()).timestamp);
}

async function main() {
  console.log(`network ${NETWORK} (chain ${dep.chainId}), root ${root.address}, balance ${formatEther(await pub.getBalance({ address: root.address }))} ETH`);
  const A = await ensureIssuer("institute", "Demo Institute (demo)", 1, "Demo list (not a real accreditation)");
  const X = await ensureIssuer("compromised", "Demo College (key later revoked)", 1, "Demo list (not a real accreditation)");

  const entries: { id: string; label: string; expected: string; file: ProofFile; note?: string }[] = [];
  const issue = async (who: typeof A, recipient: string, over: Record<string, unknown> = {}, expiresAt?: number) => {
    const p = prepareCertificate(doc(who.account, who.name, recipient, over) as any);
    if (expiresAt) p.expiresAt = expiresAt;
    const { txHash } = await anchorSingle(who.w, p);
    return singleProofFile(dep, who.account.address, p, txHash);
  };

  const good = await issue(A, "Asha Verma");
  entries.push({ id: "verified", label: "Valid certificate", expected: "VERIFIED", file: good });

  const revoked = await issue(A, "Ravi Kumar");
  await revokeCert(A.w, { kind: "single", rid: recordId(A.account.address, revoked.documentRoot) }, 2);
  entries.push({ id: "revoked", label: "Revoked (issued in error)", expected: "REVOKED", file: revoked });

  const suspended = await issue(A, "Sunita Rao");
  await suspendCert(A.w, { kind: "single", rid: recordId(A.account.address, suspended.documentRoot) });
  entries.push({ id: "suspended", label: "Suspended", expected: "SUSPENDED", file: suspended });

  const expiring = await issue(A, "Esha Nair", {}, (await chainNow()) + 45);
  entries.push({ id: "expired", label: "Expired", expected: "EXPIRED", file: expiring });

  const stolen = await issue(X, "Imran Ali");
  const issuedAt = Number((await pub.readContract({ address: dep.certificateRegistry, abi: (await import("../src")).certificateRegistryAbi, functionName: "getCert", args: [recordId(X.account.address, stolen.documentRoot)] })).cert.issuedAt);
  await rootTx("revokeIssuer", [X.account.address, BigInt(issuedAt), 1]);
  entries.push({ id: "issuer-revoked", label: "Issuer key revoked from before this certificate was issued", expected: "ISSUER_REVOKED", file: stolen });

  const forged = structuredClone(good);
  forged.fields["credential.grade"]!.value = JSON.stringify("A+");
  entries.push({ id: "tampered", label: "Tampered file (grade edited A to A+)", expected: "TAMPERED", file: forged });

  const batch = prepareBatch(["Batch One", "Batch Two", "Batch Three", "Batch Four", "Batch Five"].map((n) => doc(A.account, A.name, n, { title: "Demo Batch Certificate (synthetic data)" }) as any));
  const { txHash, gasPerCert } = await anchorBatch(A.w, batch);
  const bfiles = batchProofFiles(dep, A.account.address, batch, txHash);
  const bt = bfiles[2]!.anchor as Extract<ProofFile["anchor"], { kind: "batch" }>;
  await revokeCert(A.w, { kind: "batch", identity: A.account.address, batchRoot: bt.batchRoot, documentRoot: bfiles[2]!.documentRoot, expiresAt: 0, proof: bt.proof }, 3);
  entries.push({ id: "batch-valid", label: "Batch member (valid)", expected: "VERIFIED", file: bfiles[1]! });
  entries.push({ id: "batch-revoked", label: "Batch member (revoked, siblings unaffected)", expected: "REVOKED", file: bfiles[2]! });

  // wait for the short-lived certificate to expire on CHAIN time
  if (NETWORK === "anvil") {
    // a dev chain only moves time when it mines, so move it
    await pub.request({ method: "evm_increaseTime" as any, params: [60] as any });
    await pub.request({ method: "evm_mine" as any, params: [] as any });
  }
  while ((await chainNow()) <= expiring.expiresAt) await new Promise((r) => setTimeout(r, 2000));

  mkdirSync(new URL("../../../docs/seed/", import.meta.url), { recursive: true });
  const rows: string[] = [];
  let bad = 0;
  for (const e of entries) {
    const r = await verify(e.file);
    const link = buildVerifyUrl(ORIGIN, shortCode(certId(e.file.documentRoot)), {
      chainId: e.file.chainId,
      signer: e.file.signer,
      documentRoot: e.file.documentRoot,
      expiresAt: e.file.expiresAt,
      anchor: e.file.anchor,
    });
    const png = `docs/seed/${e.id}.png`;
    await QRCode.toFile(new URL(`../../../${png}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), link, { errorCorrectionLevel: "M", margin: 2, width: 420 });
    writeFileSync(new URL(`../../../docs/seed/${e.id}.mohar.json`, import.meta.url), proofFileToJson(e.file));
    const ok = r.verdict === e.expected;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "FAIL"} ${e.id.padEnd(16)} expected ${e.expected.padEnd(16)} got ${r.verdict}`);
    rows.push(`| ${e.label} | \`${e.expected}\` | \`${r.verdict}\` ${ok ? "✅" : "❌"} | ${shortCode(certId(e.file.documentRoot))} | [open](${link}) | ![](${png}) | [file](docs/seed/${e.id}.mohar.json) |`);
  }

  const md = `# SEED.md: one certificate in every verdict state

Generated by \`pnpm --filter @mohar/core seed\` on **${NETWORK}** (chain ${dep.chainId}) at ${new Date().toISOString()}.
All data is synthetic. Issuers are labelled demo and are **not** real accreditations.

- Certificate registry: \`${dep.certificateRegistry}\`
- Issuer registry: \`${dep.issuerRegistry}\`
- Demo issuer domain: \`${DOMAIN}\` (expects TXT \`mohar-issuer=${A.account.address}\`)
- Demo institute identity: \`${A.account.address}\`
- Demo "compromised" college identity: \`${X.account.address}\`
- Batch of 5 anchored in one transaction: ${Math.round(gasPerCert)} gas per certificate (this batch size)

| What it is | Expected | Actual | Code | Link | QR | Proof file |
|---|---|---|---|---|---|---|
${rows.join("\n")}

The "Tampered" row is a *file*: upload \`docs/seed/tampered.mohar.json\` on the verify page (its QR would point at the genuine certificate).
`;
  writeFileSync(new URL("../../../SEED.md", import.meta.url), md);
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  console.log(bad ? `\n${bad} state(s) did not match` : "\nall states match. wrote SEED.md");
  if (bad) process.exitCode = 1;
}
main();
