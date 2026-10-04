import { createWalletClient, http, nonceManager, type Address, type Chain, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anchorBatch, batchProofFiles, prepareBatch, revokeCert, suspendCert, type CertRef, type PreparedCert, type Writer } from "./issue";
import { issuerRegistryAbi } from "./abi.generated";
import type { Deployment } from "./chain";
import { buildBatch } from "./merkle";
import type { PreparedBatch } from "./issue";
import { buildBundle, casteDoc, DEMO_ST_SCHOLARSHIP, enrolmentDoc, incomeDoc, type Aggregate, type Bundle, type ReasonCode, type TemplateBase } from "./scheme";
import type { ProofFile } from "./types";

/**
 * Synthetic scholarship world for demos, seeding and tests. Everything is made up: names are "Applicant 0001",
 * institutes and offices are labelled demo, incomes are random numbers.
 */

export interface ScenarioCtx {
  chain: Chain;
  rpc: string;
  dep: Deployment;
  pub: PublicClient;
  rootWriter: Writer;
  /** give a fresh account gas money (anvil_setBalance locally, a transfer on a testnet) */
  fund: (to: Address) => Promise<void>;
  /** make time pass on chain: warp on Anvil, sleep on a testnet */
  passTime: (secs: number) => Promise<void>;
  domain: string;
  /** testnets: let load-balanced RPC nodes catch up after each transaction (no-op on Anvil) */
  settle?: () => Promise<void>;
}

export type BadKind = "tampered" | "revoked" | "suspended" | "expired" | "fake_institute" | "wrong_issuer_type" | "missing" | "not_eligible_income" | "not_eligible_category";

export interface Truth {
  aggregate: Aggregate;
  /** requirement id -> expected reason code */
  codes: Record<string, ReasonCode>;
  kind: BadKind | "good";
}

export interface Scenario {
  bundles: { name: string; bundle: Bundle }[];
  truth: Record<string, Truth>;
  /** ground truth if the fake institute is revoked (the audit scene) */
  truthAfterAudit: Record<string, Truth>;
  fakeInstituteKey: Address;
  startedAt: number;
  keys: Record<string, Hex>;
  /** complete (undisclosed) credential files of the first good applicants, for the "student builds a bundle" scene */
  fullGood: { name: string; files: ProofFile[] }[];
}

const KINDS: BadKind[] = ["tampered", "revoked", "suspended", "expired", "fake_institute", "wrong_issuer_type", "missing", "not_eligible_income", "not_eligible_category"];
const GOOD: Truth = { aggregate: "ELIGIBLE", codes: { enrolled: "OK", st: "OK", income: "OK" }, kind: "good" };

async function actor(ctx: ScenarioCtx, name: string, type: 1 | 2, source: string, given?: Hex) {
  const key = given ?? generatePrivateKey();
  const account = privateKeyToAccount(key, { nonceManager });
  const known = (await ctx.pub.readContract({ address: ctx.dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "identityOf", args: [account.address] })) as Address;
  const wallet = createWalletClient({ account, chain: ctx.chain, transport: http(ctx.rpc) });
  const w: Writer = { wallet, publicClient: ctx.pub, deployment: ctx.dep };
  await ctx.fund(account.address);
  if (!/^0x0{40}$/.test(known)) return { key, account, w, name }; // already listed (a re-run with the same keys)
  const hash = await ctx.rootWriter.wallet.writeContract({
    address: ctx.dep.issuerRegistry,
    abi: issuerRegistryAbi,
    functionName: "registerIssuer",
    args: [account.address, ctx.domain, name, true, type, source],
    chain: ctx.chain,
  } as any);
  await ctx.pub.waitForTransactionReceipt({ hash });
  await ctx.settle?.();
  return { key, account, w, name };
}

const pad = (i: number) => String(i + 1).padStart(4, "0");

/**
 * Issue `n` applications (3 credentials each) in 3 batches + 2 for the planted wrong-issuer and fake-institute items.
 * Every `badEvery`-th application is planted with one of the failure kinds (round robin), the rest are good.
 */
export async function buildScenario(ctx: ScenarioCtx, n: number, badEvery = 25, keys: { institute?: Hex; revenue?: Hex; fake?: Hex } = {}): Promise<Scenario> {
  const startedAt = Number((await ctx.pub.getBlock()).timestamp);
  const A = "Ministry of Demo Affairs (demo)";
  const inst = await actor(ctx, "Demo Institute of Technology (demo)", 1, A, keys.institute);
  const rev = await actor(ctx, "Demo Revenue Office (demo)", 2, A, keys.revenue);
  const fake = await actor(ctx, "Demo Fake Institute (demo)", 1, A, keys.fake);
  const issuerOf = (a: Awaited<ReturnType<typeof actor>>) => ({ address: a.account.address, domain: ctx.domain, name: a.name });
  const mk = (a: typeof inst, i: number): TemplateBase => ({ issuer: issuerOf(a), applicantId: `APP-${pad(i)}`, name: `Applicant ${pad(i)}`, issuedOn: "2026-07-01", expiresOn: null });

  const kindOf = (i: number): BadKind | "good" => (badEvery > 0 && i % badEvery === badEvery - 1 ? KINDS[Math.floor(i / badEvery) % KINDS.length]! : "good");
  const chainNow = startedAt + 5;
  const soon = chainNow + 600; // "expired" items die ~ 10 min after issue; passTime moves chain time past this

  // per issuer, collect the documents + remember where each applicant's credential sits
  const docs = { inst: [] as any[], rev: [] as any[], fake: [] as any[], wrong: [] as any[] };
  const slots: Record<string, { pool: keyof typeof docs; idx: number; type: "enrolment" | "caste" | "income" }> = {};
  const push = (pool: keyof typeof docs, doc: any, key: string, type: "enrolment" | "caste" | "income") => {
    docs[pool].push(doc);
    slots[key] = { pool, idx: docs[pool].length - 1, type };
  };
  const expiryOverride = new Map<string, number>(); // slot key -> unix expiry
  const expiryByPool = (pool: string) => new Map([...expiryOverride].filter(([k]) => slots[k]?.pool === pool).map(([k, v]) => [slots[k]!.idx, v] as const));
  for (let i = 0; i < n; i++) {
    const k = kindOf(i);
    const base = mk(inst, i);
    const rb = mk(rev, i);
    const income = k === "not_eligible_income" || k === "tampered" ? 400000 : 90000 + ((i * 7919) % 150000);
    const category = k === "not_eligible_category" ? "GEN" : "ST";
    const enrolBase = k === "fake_institute" ? mk(fake, i) : k === "wrong_issuer_type" ? mk(rev, i) : base;
    const enrol = enrolmentDoc(enrolBase, { instituteId: `INST-${1000 + (i % 40)}`, course: "B.Tech (demo)", year: "2", active: true });
    push(k === "fake_institute" ? "fake" : k === "wrong_issuer_type" ? "wrong" : "inst", enrol, `e${i}`, "enrolment");
    push("rev", casteDoc(rb, { category: category as any, officerRank: "Tahsildar (demo)" }), `c${i}`, "caste");
    push("rev", incomeDoc(rb, { income }), `i${i}`, "income");
    if (k === "expired") expiryOverride.set(`e${i}`, soon);
  }

  // prepare + anchor each pool as one batch
  const keyToFile = new Map<string, { file: ProofFile; ref: CertRef; w: Writer }>();
  const writers = { inst: inst.w, rev: rev.w, fake: fake.w, wrong: rev.w };
  for (const pool of Object.keys(docs) as (keyof typeof docs)[]) {
    if (!docs[pool].length) continue;
    const prepared = prepareBatch(docs[pool]);
    const over = expiryByPool(pool);
    prepared.certs.forEach((c: PreparedCert, idx) => {
      if (over.has(idx)) c.expiresAt = over.get(idx)!;
    });
    // expiry sits inside each batch leaf, so rebuild the tree after overriding
    const b2 = rebuild(prepared);
    const w = writers[pool];
    const res = await anchorBatch(w, b2);
    await ctx.settle?.();
    const files = batchProofFiles(ctx.dep, w.wallet.account.address, b2, res.txHash);
    for (const [key, s] of Object.entries(slots)) {
      if (s.pool !== pool) continue;
      const file = files[s.idx]!;
      keyToFile.set(key, {
        file,
        w,
        ref: { kind: "batch", identity: w.wallet.account.address, batchRoot: b2.batchRoot, documentRoot: file.documentRoot, expiresAt: file.expiresAt, proof: (file.anchor as any).proof },
      });
    }
  }

  const bundles: Scenario["bundles"] = [];
  const truth: Scenario["truth"] = {};
  const after: Scenario["truth"] = {};
  const ok = { ...GOOD.codes };
  for (let i = 0; i < n; i++) {
    const k = kindOf(i);
    const name = `app-${pad(i)}.mohar`;
    const e = keyToFile.get(`e${i}`)!;
    const c = keyToFile.get(`c${i}`)!;
    const inc = keyToFile.get(`i${i}`)!;
    let held = [e.file, c.file, inc.file];
    let t: Truth = { ...GOOD, kind: k };
    switch (k) {
      case "revoked":
        await revokeCert(c.w, c.ref, 2);
        await ctx.settle?.();
        t = { aggregate: "INVALID", codes: { ...ok, st: "REVOKED" }, kind: k };
        break;
      case "suspended":
        await suspendCert(e.w, e.ref);
        await ctx.settle?.();
        t = { aggregate: "NOT_ELIGIBLE", codes: { ...ok, enrolled: "SUSPENDED" }, kind: k };
        break;
      case "expired":
        t = { aggregate: "NOT_ELIGIBLE", codes: { ...ok, enrolled: "EXPIRED" }, kind: k };
        break;
      case "fake_institute":
        t = { aggregate: "ELIGIBLE", codes: ok, kind: k }; // looks fine until the audit revokes the institute
        break;
      case "wrong_issuer_type":
        t = { aggregate: "NOT_ELIGIBLE", codes: { ...ok, enrolled: "WRONG_ISSUER_TYPE" }, kind: k };
        break;
      case "missing":
        held = [e.file, inc.file];
        t = { aggregate: "INCOMPLETE", codes: { ...ok, st: "MISSING" }, kind: k };
        break;
      case "not_eligible_income":
        t = { aggregate: "NOT_ELIGIBLE", codes: { ...ok, income: "FLAG_FALSE" }, kind: k };
        break;
      case "not_eligible_category":
        t = { aggregate: "NOT_ELIGIBLE", codes: { ...ok, st: "FLAG_FALSE" }, kind: k };
        break;
    }
    const bundle = buildBundle(DEMO_ST_SCHOLARSHIP, held, { purpose: "Demo ST Scholarship application", recipient: "Demo Scholarship Office" });
    if (k === "tampered") {
      // a student flips the issuer-attested "income ≤ 2.5 lakh" flag to true on a truthful 'false' certificate
      const incomeFile = bundle.credentials.find((f) => f.fields["flags.income_lte_250000"])!;
      incomeFile.fields["flags.income_lte_250000"] = { ...incomeFile.fields["flags.income_lte_250000"]!, value: "true" };
      // make the underlying cert one that really says false, so the lie is meaningful
      t = { aggregate: "INVALID", codes: { ...ok, income: "TAMPERED" }, kind: k };
    }
    bundles.push({ name, bundle });
    truth[name] = t;
    after[name] = k === "fake_institute" ? { aggregate: "INVALID", codes: { ...ok, enrolled: "ISSUER_REVOKED" }, kind: k } : t;
  }
  const fullGood: Scenario["fullGood"] = [];
  for (let i = 0; i < n && fullGood.length < 2; i++) {
    if (kindOf(i) === "good") fullGood.push({ name: `app-${pad(i)}`, files: [keyToFile.get(`e${i}`)!.file, keyToFile.get(`c${i}`)!.file, keyToFile.get(`i${i}`)!.file] });
  }
  return {
    fullGood,
    bundles,
    truth,
    truthAfterAudit: after,
    fakeInstituteKey: fake.account.address,
    startedAt,
    keys: { institute: inst.key, revenue: rev.key, fake: fake.key },
  };
}

function rebuild(p: PreparedBatch): PreparedBatch {
  const { batchRoot, proofs } = buildBatch(p.certs.map((c) => ({ documentRoot: c.built.documentRoot, expiresAt: c.expiresAt })));
  return { batchRoot, certs: p.certs, proofs };
}

/** The audit: the authority revokes the fake institute's key from `effectiveFrom` (default: before the scenario began). */
export async function auditRevoke(ctx: ScenarioCtx, key: Address, effectiveFrom: number) {
  const hash = await ctx.rootWriter.wallet.writeContract({
    address: ctx.dep.issuerRegistry,
    abi: issuerRegistryAbi,
    functionName: "revokeIssuer",
    args: [key, BigInt(effectiveFrom), 3],
    chain: ctx.chain,
  } as any);
  await ctx.pub.waitForTransactionReceipt({ hash });
}
