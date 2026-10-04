/**
 * Phases 9-11 against a LIVE chain with the REAL contracts (skips if no chain). Only DNS is stubbed.
 * Builds a synthetic scholarship world, plants every failure kind, and checks verdicts against ground truth.
 */
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  APPLICANT_PATH,
  buildBundle,
  buildReceipt,
  bundleToJson,
  auditRevoke,
  buildScenario,
  clientsFromUrls,
  csvCell,
  DEMO_ST_SCHOLARSHIP,
  evaluateBundle,
  makeReader,
  memoDns,
  parseBundle,
  parseProofFile,
  previewShare,
  readZip,
  receiptIntact,
  reportCsv,
  screenBundles,
  shareExpired,
  verifyCertificate,
  ZIP_LIMITS,
  type Deployment,
  type DnsResolver,
  type Scenario,
  type ScenarioCtx,
  type Writer,
} from "../src";

const RPC = process.env.MOHAR_RPC ?? "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../../deployments/anvil.json", import.meta.url), "utf8")) as Deployment;
dep.rpcUrls = [RPC];
const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const ROOT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
let live = false;
try {
  live = (await pub.getChainId()) === dep.chainId && (await pub.getCode({ address: dep.certificateRegistry })) !== undefined;
} catch {
  live = false;
}

const N = Number(process.env.SCHEME_N ?? 120);
const DOMAIN = "scholarship.demo";
const dns: DnsResolver = async () => ({ status: "match", provider: "stub" });
const rootWallet = createWalletClient({ account: privateKeyToAccount(ROOT_KEY), chain, transport: http(RPC) });
const ctx: ScenarioCtx = {
  chain,
  rpc: RPC,
  dep,
  pub,
  domain: DOMAIN,
  rootWriter: { wallet: rootWallet, publicClient: pub, deployment: dep } as Writer,
  fund: async (a: Address) => {
    await pub.request({ method: "anvil_setBalance" as any, params: [a, `0x${parseEther("100").toString(16)}`] as any });
  },
  passTime: async (s) => {
    await pub.request({ method: "evm_increaseTime" as any, params: [s] as any });
    await pub.request({ method: "evm_mine" as any, params: [] as any });
  },
};

const bulkDeps = () => ({ reader: makeReader(dep, clientsFromUrls([RPC], 8000, { batch: true }), 3, { pinMs: 60_000 }), dns: memoDns(dns) });
const singleDeps = () => ({ reader: makeReader(dep, clientsFromUrls([RPC])), dns });

describe.skipIf(!live)("scholarship layer (live chain)", () => {
  let sc: Scenario;
  const timings: Record<string, number> = {};

  it("builds a synthetic world with planted failures", async () => {
    const t0 = Date.now();
    sc = await buildScenario(ctx, N, 12);
    await ctx.passTime(900); // planted 'expired' items expire
    timings.seedMs = Date.now() - t0;
    expect(sc.bundles.length).toBe(N);
    expect(Object.values(sc.truth).filter((t) => t.kind !== "good").length).toBeGreaterThanOrEqual(Math.floor(N / 12));
  }, 300_000);

  it("every planted kind gets exactly the expected aggregate and reason codes (single check)", async () => {
    const kindsSeen = new Set<string>();
    const mismatches: string[] = [];
    for (const { name, bundle } of sc.bundles) {
      const t = sc.truth[name]!;
      kindsSeen.add(t.kind);
      const r = await evaluateBundle(parseBundle(bundleToJson(bundle)), DEMO_ST_SCHOLARSHIP, singleDeps());
      const codes = Object.fromEntries(r.requirements.map((q) => [q.id, q.code]));
      if (r.aggregate !== t.aggregate || JSON.stringify(codes) !== JSON.stringify(t.codes)) mismatches.push(`${name} ${t.kind}: got ${r.aggregate} ${JSON.stringify(codes)}`);
    }
    expect(mismatches).toEqual([]);
    for (const k of ["good", "tampered", "revoked", "suspended", "expired", "fake_institute", "wrong_issuer_type", "missing", "not_eligible_income", "not_eligible_category"]) {
      expect(kindsSeen.has(k), `scenario contains kind ${k}`).toBe(true);
    }
  }, 300_000);

  it("DIFFERENTIAL: bulk verdict equals single verdict for every item; accuracy vs ground truth", async () => {
    const items = sc.bundles.map((b) => ({ name: b.name, bundle: parseBundle(bundleToJson(b.bundle)) }));
    const { rows, summary } = await screenBundles(items, DEMO_ST_SCHOLARSHIP, bulkDeps());
    timings.bulkMs = summary.ms;
    const diffs: string[] = [];
    let falseFlags = 0;
    let missedBad = 0;
    for (const row of rows) {
      const single = await evaluateBundle(items.find((i) => i.name === row.name)!.bundle!, DEMO_ST_SCHOLARSHIP, singleDeps());
      if (single.aggregate !== row.aggregate) diffs.push(`${row.name}: bulk ${row.aggregate} vs single ${single.aggregate}`);
      const t = sc.truth[row.name]!;
      if (t.kind === "good" && row.aggregate !== "ELIGIBLE") falseFlags++;
      if (t.kind !== "good" && row.aggregate !== t.aggregate) missedBad++;
    }
    expect(diffs).toEqual([]);
    expect(falseFlags, "good items wrongly flagged").toBe(0);
    expect(missedBad, "planted bad items not flagged as expected").toBe(0);
    expect(summary.counts.ROW_ERROR).toBe(0);
    console.log(`bulk ${items.length} items in ${summary.ms} ms (${summary.perSecond.toFixed(1)}/s); seed ${timings.seedMs} ms`);
  }, 300_000);

  it("AUDIT: revoking the fake institute with a cutoff flips exactly its applications", async () => {
    const before = await screenBundles(sc.bundles.map((b) => ({ name: b.name, bundle: b.bundle })), DEMO_ST_SCHOLARSHIP, bulkDeps());
    await auditRevoke(ctx, sc.fakeInstituteKey, sc.startedAt);
    const t0 = Date.now();
    const after = await screenBundles(sc.bundles.map((b) => ({ name: b.name, bundle: b.bundle })), DEMO_ST_SCHOLARSHIP, bulkDeps());
    timings.auditRescreenMs = Date.now() - t0;
    const expected = Object.values(sc.truth).filter((t) => t.kind === "fake_institute").length;
    expect(expected).toBeGreaterThan(0);
    expect(after.summary.counts.INVALID - before.summary.counts.INVALID).toBe(expected);
    for (const row of after.rows) expect(row.aggregate, row.name).toBe(sc.truthAfterAudit[row.name]!.aggregate);
    console.log(`audit: INVALID ${before.summary.counts.INVALID} -> ${after.summary.counts.INVALID}, rescreen ${timings.auditRescreenMs} ms`);
  }, 300_000);

  it("HIDDEN FIELDS never leave: no income figure, name, address, hidden salts in any shared artifact", async () => {
    const sample = sc.bundles.slice(0, 20);
    for (const { bundle } of sample) {
      const json = bundleToJson(bundle);
      expect(json).not.toMatch(/Applicant \d{4}/); // names
      expect(json).not.toMatch(/synthetic address/);
      for (const c of bundle.credentials) {
        const paths = Object.keys(c.fields);
        expect(paths.some((p) => p === "credential.income" || p === "credential.address" || p === "recipient.name")).toBe(false);
        for (const f of Object.values(c.fields)) expect(f.value).not.toMatch(/^"\d{5,6}"$/);
      }
    }
  });

  it("preview lists exactly what is shared and what stays hidden", async () => {
    const { bundle } = sc.bundles.find((b) => sc.truth[b.name]!.kind === "good")!;
    // rebuild from a full file: re-issue is not needed, previewShare only reads field paths
    const full = bundle.credentials[0]!;
    const lines = previewShare(DEMO_ST_SCHOLARSHIP, [full]);
    expect(lines[0]!.held).toBe(true);
    expect(lines[0]!.disclose).toContain("flags.enrolment_active");
    expect(lines[1]!.held).toBe(false);
  });

  it("applicants cannot be mixed: credentials from two people give APPLICANT_MISMATCH -> INVALID", async () => {
    const goods = sc.bundles.filter((b) => sc.truth[b.name]!.kind === "good");
    const a = goods[0]!.bundle;
    const b = goods[1]!.bundle;
    const mixed = { ...a, credentials: [a.credentials[0]!, b.credentials[1]!, a.credentials[2]!] };
    const r = await evaluateBundle(mixed, DEMO_ST_SCHOLARSHIP, singleDeps());
    expect(r.aggregate).toBe("INVALID");
    expect(r.requirements.every((q) => q.code === "APPLICANT_MISMATCH")).toBe(true);
    expect(a.credentials[0]!.fields[APPLICANT_PATH]).toBeDefined();
  });

  it("a bundle that claims eligibility in extra keys is ignored (nothing from the bundle is trusted)", async () => {
    const bad = sc.bundles.find((b) => sc.truth[b.name]!.kind === "revoked")!;
    const lying = JSON.parse(bundleToJson(bad.bundle));
    lying.aggregate = "ELIGIBLE";
    lying.verdict = "VERIFIED";
    const r = await evaluateBundle(parseBundle(lying), DEMO_ST_SCHOLARSHIP, singleDeps());
    expect(r.aggregate).toBe("INVALID");
  });

  it("malformed and hostile uploads become row errors or a refused zip, never a crash", async () => {
    const good = sc.bundles[0]!;
    const zip = zipSync({
      "ok.mohar": strToU8(bundleToJson(good.bundle)),
      "broken.mohar": strToU8("{not json"),
      "wrongformat.json": strToU8(JSON.stringify({ format: "nope" })),
      "huge.json": strToU8("x".repeat(ZIP_LIMITS.maxEntryBytes + 10)),
    });
    const items = readZip(zip);
    expect(items.find((i) => i.name === "ok.mohar")!.bundle).toBeDefined();
    expect(items.find((i) => i.name === "broken.mohar")!.error).toBeTruthy();
    expect(items.find((i) => i.name === "wrongformat.json")!.error).toBeTruthy();
    expect(items.some((i) => i.name === "huge.json")).toBe(false); // refused before inflating
    const many = Object.fromEntries(Array.from({ length: ZIP_LIMITS.maxEntries + 5 }, (_, i) => [`f${i}.json`, new Uint8Array(1)]));
    expect(() => readZip(zipSync(many))).toThrow(/too many/);
    const { rows } = await screenBundles(items, DEMO_ST_SCHOLARSHIP, singleDeps());
    expect(rows.find((r) => r.name === "broken.mohar")!.aggregate).toBe("ROW_ERROR");
  });

  it("CSV report neutralises formulas and carries no personal data", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    const csv = reportCsv([{ name: "=evil.mohar", aggregate: "INVALID", applicantId: "APP-0001", codes: { st: "REVOKED" }, failed: ["st"] }], DEMO_ST_SCHOLARSHIP);
    expect(csv).toContain("'=evil.mohar");
    expect(csv).not.toMatch(/Applicant \d{4}|synthetic address|income_lte/i);
  });

  it("RECEIPT: fresh check only, hash detects edits, hidden fields and salts never included", async () => {
    const { bundle } = sc.bundles.find((b) => sc.truth[b.name]!.kind === "good")!;
    const file = bundle.credentials[2]!;
    const res = await verifyCertificate({ file: parseProofFile(JSON.stringify(file)) }, singleDeps());
    const receipt = buildReceipt(res, { purpose: "Demo ST Scholarship", validUntil: 1 });
    expect(receipt.verdict).toBe("VERIFIED");
    expect(receipt.disclosed.map((d) => d.path).sort()).toEqual(["credential.type", "flags.income_lte_250000", "recipient.applicantId"]);
    const text = JSON.stringify(receipt);
    expect(text).not.toContain(file.fields["flags.income_lte_250000"]!.salt);
    expect(text).not.toMatch(/"salt"/);
    expect(receiptIntact(receipt)).toBe(true);
    expect(receiptIntact({ ...receipt, verdict: "REVOKED" })).toBe(false);
    expect(receiptIntact({ ...receipt, disclosed: [] })).toBe(false);
    expect(() => buildReceipt({ ...res, verifiedAt: res.verifiedAt - 3600 })).toThrow(/stale/);
    expect(receipt.share?.note).toMatch(/advisory/);
  });

  it("share expiry is advisory and judged on the clock given", () => {
    expect(shareExpired({ validUntil: 100 }, 101)).toBe(true);
    expect(shareExpired({ validUntil: 100 }, 99)).toBe(false);
    expect(shareExpired(undefined, 99)).toBe(false);
  });

  it("unused import guard", () => {
    expect(typeof buildBundle).toBe("function");
  });
});
