import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { discloseFields, encodePresentation, issuerRegistryAbi, receiptIntact, type Deployment } from "@mohar/core";
import { evidence, fixtures } from "./helpers";
import { SCHEME_DIR, schemeMeta } from "./scheme-setup";

const meta = () => schemeMeta();
const file = (name: string) => path.join(SCHEME_DIR, name);

async function officerCheck(page: Page, bundleName: string) {
  await page.goto("/scheme");
  await page.getByTestId("tab-officer").click();
  await page.getByTestId("officer-file").setInputFiles(file(bundleName));
  const res = page.getByTestId("officer-result");
  await expect(res).toBeVisible({ timeout: 30_000 });
  return res;
}

test.describe.configure({ mode: "serial" });

test.describe("Phase 9: scholarship scene", () => {
  // each planted kind, and what the officer must see
  const CASES: [string, string, Record<string, string>][] = [
    ["good", "ELIGIBLE", { enrolled: "OK", st: "OK", income: "OK" }],
    ["tampered", "INVALID", { income: "TAMPERED" }],
    ["revoked", "INVALID", { st: "REVOKED" }],
    ["suspended", "NOT_ELIGIBLE", { enrolled: "SUSPENDED" }],
    ["expired", "NOT_ELIGIBLE", { enrolled: "EXPIRED" }],
    ["wrong_issuer_type", "NOT_ELIGIBLE", { enrolled: "WRONG_ISSUER_TYPE" }],
    ["missing", "INCOMPLETE", { st: "MISSING" }],
    ["not_eligible_income", "NOT_ELIGIBLE", { income: "FLAG_FALSE" }],
    ["not_eligible_category", "NOT_ELIGIBLE", { st: "FLAG_FALSE" }],
  ];
  for (const [kind, aggregate, codes] of CASES) {
    test(`officer sees ${aggregate} for ${kind}`, async ({ page }) => {
      const name = meta().pick[kind];
      const res = await officerCheck(page, name);
      await expect(res).toHaveAttribute("data-aggregate", aggregate);
      for (const [req, code] of Object.entries(codes)) await expect(page.getByTestId(`req-${req}`)).toHaveAttribute("data-code", code);
      await expect(page.getByTestId("officer-panel")).not.toContainText(/Applicant \d{4}/);
      await evidence(page, `S-${kind}`, `Scholarship bundle: ${kind}`, aggregate, (await res.getAttribute("data-aggregate"))!);
    });
  }

  test("student sees exactly what is shared, and the downloaded bundle hides income, name and address", async ({ page }) => {
    await page.goto("/scheme");
    await page.getByTestId("student-files").setInputFiles([0, 1, 2].map((i) => file(`student-${i}.json`)));
    const preview = page.getByTestId("share-preview");
    await expect(preview).toContainText("flags.income_lte_250000");
    await expect(preview).toContainText("credential.income"); // listed under "stays on your device"
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-bundle").click()]);
    const text = readFileSync(await dl.path(), "utf8");
    expect(text).not.toMatch(/Applicant \d{4}/);
    expect(text).not.toContain("synthetic address");
    const parsed = JSON.parse(text);
    for (const c of parsed.credentials) {
      expect(Object.keys(c.fields)).not.toContain("credential.income");
      expect(Object.keys(c.fields)).not.toContain("recipient.name");
    }
    // the officer accepts the very bundle the student just built
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("officer-file").setInputFiles({ name: "application.mohar", mimeType: "application/json", buffer: Buffer.from(text) });
    await expect(page.getByTestId("officer-result")).toHaveAttribute("data-aggregate", "ELIGIBLE", { timeout: 30_000 });
    await expect(page.getByTestId("share-meta")).toContainText("Demo ST Scholarship");
  });

  test("a bundle with a lying aggregate / extra keys is ignored", async ({ page }) => {
    const b = JSON.parse(readFileSync(file(meta().pick.revoked), "utf8"));
    b.aggregate = "ELIGIBLE";
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("officer-file").setInputFiles({ name: "x.mohar", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(b)) });
    await expect(page.getByTestId("officer-result")).toHaveAttribute("data-aggregate", "INVALID", { timeout: 30_000 });
  });

  test("garbage file gives an error message, not a crash", async ({ page }) => {
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("officer-file").setInputFiles({ name: "x.mohar", mimeType: "application/json", buffer: Buffer.from("{nope") });
    await expect(page.getByTestId("officer-error")).toBeVisible();
  });
});

test.describe("Phase 10: bulk screening and the audit scene", () => {
  test("bulk screen matches ground truth, row errors do not crash, CSV is formula-safe", async ({ page }) => {
    const m = meta();
    await page.goto("/bulk");
    await page.getByTestId("bulk-file").setInputFiles(file("applications.zip"));
    await expect(page.getByTestId("bulk-result")).toBeVisible({ timeout: 60_000 });
    const expected: Record<string, number> = { ELIGIBLE: 0, NOT_ELIGIBLE: 0, INVALID: 0, INCOMPLETE: 0, UNREACHABLE: 0, ROW_ERROR: 2 };
    for (const t of Object.values(m.truth) as any[]) expected[t.aggregate]!++;
    for (const [k, v] of Object.entries(expected).filter(([k, v]) => k !== "UNREACHABLE" || v > 0)) await expect(page.getByTestId(`sum-${k}`)).toContainText(String(v));
    await expect(page.getByTestId("bulk-timing")).toContainText(`${m.total + 2} applications`);
    // every row verdict equals the ground truth
    const rows = page.getByTestId("bulk-row");
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const name = (await rows.nth(i).locator("td").first().innerText()).trim();
      const verdict = await rows.nth(i).getAttribute("data-verdict");
      if (m.truth[name]) expect(verdict, name).toBe(m.truth[name].aggregate);
      else expect(verdict).toBe("ROW_ERROR");
    }
    await evidence(page, "B-bulk", "Bulk screen vs ground truth", "match", "match");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bulk-csv").click()]);
    const csv = readFileSync(await dl.path(), "utf8");
    expect(csv).toContain("'=cmd-injection.json");
    expect(csv).not.toMatch(/Applicant \d{4}|synthetic address/);
  });

  test("audit: the authority revokes the fake institute with a cutoff; the next screen shows the change", async ({ page }) => {
    const m = meta();
    const dep = JSON.parse(readFileSync(path.join(process.cwd(), "../../deployments/anvil.json"), "utf8")) as Deployment;
    const chain = defineChain({ id: dep.chainId, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
    const pub = createPublicClient({ chain, transport: http() });
    const root = createWalletClient({ account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), chain, transport: http() });
    const fakeName = m.pick.fake_institute;
    // before: the fake institute's applicant looks fine
    expect(await (await officerCheck(page, fakeName)).getAttribute("data-aggregate")).toBe("ELIGIBLE");
    const hash = await root.writeContract({ address: dep.issuerRegistry, abi: issuerRegistryAbi, functionName: "revokeIssuer", args: [m.fakeInstituteKey, BigInt(1), 3], chain } as any);
    await pub.waitForTransactionReceipt({ hash });
    // after: ISSUER_REVOKED
    const res = await officerCheck(page, fakeName);
    await expect(res).toHaveAttribute("data-aggregate", "INVALID");
    await expect(page.getByTestId("req-enrolled")).toHaveAttribute("data-code", "ISSUER_REVOKED");
    await evidence(page, "S-issuer-revoked", "Institute revoked by the authority: its applicant flips", "INVALID", (await res.getAttribute("data-aggregate"))!);
    // bulk rescreen counts it
    await page.goto("/bulk");
    await page.getByTestId("bulk-file").setInputFiles(file("applications.zip"));
    await expect(page.getByTestId("bulk-result")).toBeVisible({ timeout: 60_000 });
    const expectedInvalid = Object.values(m.truthAfterAudit as Record<string, any>).filter((t) => t.aggregate === "INVALID").length;
    await expect(page.getByTestId("sum-INVALID")).toContainText(String(expectedInvalid));
  });
});

test.describe("Phase 11: privacy receipt", () => {
  test("receipt lists disclosed fields only, hash detects edits", async ({ page }) => {
    const f = fixtures();
    await page.goto("/verify");
    await page.getByTestId("verify-input").fill(f.good.link);
    await page.getByTestId("verify-submit").click();
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-verdict", "VERIFIED", { timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("receipt-json").click()]);
    const r = JSON.parse(readFileSync(await dl.path(), "utf8"));
    expect(r.verdict).toBe("VERIFIED");
    expect(r.chain.block).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/"salt"|rehaan|@example\.com/i); // link mode: no fields were disclosed
    expect(r.disclosed).toEqual([]);
    expect(receiptIntact(r)).toBe(true);
    expect(receiptIntact({ ...r, verdict: "REVOKED" })).toBe(false);
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("receipt-pdf").click()]);
    expect(readFileSync(await pdf.path()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("advisory share labels are shown and an expired share warns", async ({ page }) => {
    const f = fixtures();
    const full = f.good.file;
    const share = { purpose: "Bank KYC (test)", recipient: "Demo Bank", validUntil: 1000 };
    const pres = { ...full, fields: discloseFields(full.fields, ["credential.title"]), partial: true, share };
    await page.goto("/verify");
    await page.getByTestId("verify-input").fill(`http://localhost:3100/verify/${f.good.link.split("/verify/")[1]!.split("#")[0]}#${encodePresentation(pres)}`);
    await page.getByTestId("verify-submit").click();
    await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("share-meta")).toContainText("Bank KYC (test)");
    await expect(page.getByTestId("share-expired")).toBeVisible();
    await expect(page.getByTestId("share-meta")).toContainText("cannot be enforced");
  });

  test("verification sends nothing to our server: only RPC and DNS-over-HTTPS requests", async ({ page, context }) => {
    const f = fixtures();
    await page.goto("/verify");
    await page.waitForLoadState("networkidle");
    const seen: string[] = [];
    const allowed = (u: URL) => u.origin === "http://127.0.0.1:8545" || ["cloudflare-dns.com", "dns.google"].includes(u.hostname);
    // from here on, anything that is not RPC or DoH is blocked; a verdict must still arrive
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      seen.push(`${route.request().method()} ${u.origin}${u.pathname}`);
      if (allowed(u)) return route.continue();
      return route.abort();
    });
    await page.getByTestId("verify-input").fill(f.good.link);
    await page.getByTestId("verify-submit").click();
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-verdict", "VERIFIED", { timeout: 30_000 });
    expect(seen.filter((s) => s.includes("localhost:3100")), "no request reached the app server").toEqual([]);
    expect(seen.length).toBeGreaterThan(0);
    expect(readdirSync(SCHEME_DIR).length).toBeGreaterThan(0);
  });
});
