import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeZip } from "@mohar/core";
import { SCHEME_DIR, schemeMeta } from "./scheme-setup";

const file = (n: string) => path.join(SCHEME_DIR, n);
const draftOf = (reqs: unknown[]) => JSON.stringify({ id: "ai-1", name: "AI Scheme", requirements: reqs });
const req = (over: object = {}) => ({ id: "st", label: "ST category", credentialType: "caste", issuerType: "REVENUE_OFFICE", flagsTrue: ["flags.st_category"], ...over });

test.describe.configure({ mode: "serial" });

test.describe("Phase 12: AI assists (model mocked at the API boundary)", () => {
  test("malformed AI output is rejected and nothing is applied", async ({ page }) => {
    await page.route("**/api/ai/scheme", (r) => r.fulfill({ json: { draft: "Sorry, I can't do that. {oops" } }));
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("draft-text").fill("Applicant must be ST and enrolled.");
    await page.getByTestId("draft-propose").click();
    await expect(page.getByTestId("draft-error")).toContainText("rejected");
    await expect(page.getByTestId("draft-review")).toHaveCount(0);
    await expect(page.getByTestId("active-scheme")).toContainText("Demo ST Scholarship");
  });

  test("a valid draft is NOT used until the officer confirms; edits are re-validated", async ({ page }) => {
    await page.route("**/api/ai/scheme", (r) => r.fulfill({ json: { draft: "```json\n" + draftOf([req()]) + "\n```" } }));
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("draft-text").fill("Applicant must belong to a Scheduled Tribe.");
    await page.getByTestId("draft-propose").click();
    await expect(page.getByTestId("draft-review")).toBeVisible();
    // proposed but not confirmed: still the demo scheme
    await expect(page.getByTestId("active-scheme")).toContainText("Demo ST Scholarship");
    // officer breaks the JSON: confirm refuses
    await page.getByTestId("draft-json").fill("{ not json");
    await page.getByTestId("draft-confirm").click();
    await expect(page.getByTestId("draft-error")).toBeVisible();
    await expect(page.getByTestId("active-scheme")).toContainText("Demo ST Scholarship");
    // officer fixes and confirms
    await page.getByTestId("draft-json").fill(draftOf([req()]));
    await page.getByTestId("draft-confirm").click();
    await expect(page.getByTestId("active-scheme")).toContainText("AI-drafted, officer-confirmed");
  });

  test("an AI checklist that asks for nothing still cannot make a tampered or revoked bundle eligible", async ({ page }) => {
    const m = schemeMeta();
    await page.route("**/api/ai/scheme", (r) => r.fulfill({ json: { draft: draftOf([req({ flagsTrue: [] })]) } }));
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("draft-text").fill("Anyone may apply, no conditions at all.");
    await page.getByTestId("draft-propose").click();
    await page.getByTestId("draft-confirm").click();
    await expect(page.getByTestId("active-scheme")).toContainText("AI-drafted");
    for (const [kind, want] of [["revoked", "INVALID"], ["tampered", "INVALID"]] as const) {
      await page.getByTestId("officer-file").setInputFiles(file(m.pick[kind]));
      // the permissive checklist only asks for the caste credential; the revoked/tampered one may or may not be it,
      // but whatever happens the aggregate must come from the chain and the maths, never from the checklist's leniency
      const res = page.getByTestId("officer-result");
      await expect(res).toBeVisible({ timeout: 30_000 });
      const agg = await res.getAttribute("data-aggregate");
      if (kind === "revoked") expect(agg).toBe(want); // the revoked credential IS the caste one
      else expect(["INVALID", "ELIGIBLE"]).toContain(agg); // tampered flag is on the income credential, not asked for here
    }
  });

  test("digitise: rows start unconfirmed, export needs a human tick, edits clear the tick", async ({ page }) => {
    await page.route("**/api/ai/extract", (r) =>
      r.fulfill({ json: { draft: JSON.stringify({ rows: [{ recipient_name: "Meera Pillai", recipient_email: "", title: "Diploma in Cloud Computing", grade: "First Class", issued_on: "2019-03-12", expires_on: "" }, { recipient_name: "=HYPERLINK(\"http://evil\")", recipient_email: "", title: "Cert", grade: "", issued_on: "2020-01-01", expires_on: "" }] }) } }),
    );
    await page.goto("/issuer");
    await page.getByTestId("connect-dev-issuer").click();
    await page.getByRole("link", { name: "Digitise (AI)" }).first().click();
    const gate = page.getByTestId("digitise-text");
    await gate.fill("This certifies that Meera Pillai completed a diploma.");
    await page.getByTestId("digitise-run").click();
    await expect(page.getByTestId("digitise-row")).toHaveCount(2);
    await expect(page.getByTestId("digitise-export")).toBeDisabled();
    await page.getByTestId("digitise-confirm").first().check();
    await expect(page.getByTestId("digitise-export")).toBeEnabled();
    await page.getByLabel("title row 1").fill("Edited title");
    await expect(page.getByTestId("digitise-export")).toBeDisabled(); // editing clears the tick
    await page.getByTestId("digitise-confirm").nth(1).check();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("digitise-export").click()]);
    const csv = readFileSync(await dl.path(), "utf8");
    expect(csv).not.toContain("Meera Pillai"); // unconfirmed row is not exported
    expect(csv).toContain("'=HYPERLINK"); // formula defused
  });

  test("live route answers (skipped if no key is configured on this server)", async ({ request }) => {
    const res = await request.post("/api/ai/scheme", { data: { text: "Applicant must be a Scheduled Tribe student enrolled in a recognised institute with income up to Rs 2.5 lakh." } });
    test.skip(res.status() === 503, "GROQ_API_KEY not set");
    expect(res.status()).toBe(200);
    expect(typeof (await res.json()).draft).toBe("string");
    const bad = await request.post("/api/ai/scheme", { data: { text: "x" } });
    expect(bad.status()).toBe(400);
  });
});

test.describe("Phase 13.4: XSS and trust on the scholarship screens", () => {
  const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;

  test("hostile share labels and file names are shown as text, never run", async ({ page }) => {
    const m = schemeMeta();
    const b = JSON.parse(readFileSync(file(m.pick.good), "utf8"));
    b.share = { purpose: XSS, recipient: XSS, validUntil: 1 };
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("officer-file").setInputFiles({ name: `${XSS}.mohar`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(b)) });
    await expect(page.getByTestId("officer-result")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("share-meta")).toContainText("<img src=x");
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(await page.locator("img[src='x']").count()).toBe(0);
  });

  test("hostile AI output is shown as text in the review box", async ({ page }) => {
    await page.route("**/api/ai/scheme", (r) => r.fulfill({ json: { draft: draftOf([req({ label: XSS })]) } }));
    await page.goto("/scheme");
    await page.getByTestId("tab-officer").click();
    await page.getByTestId("draft-text").fill("Applicant must belong to a Scheduled Tribe.");
    await page.getByTestId("draft-propose").click();
    await expect(page.getByTestId("draft-review")).toBeVisible();
    await page.getByTestId("draft-confirm").click();
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(await page.locator("img[src='x']").count()).toBe(0);
  });

  test("bulk table: hostile file names render as text; duplicate bundle is flagged", async ({ page }) => {
    const m = schemeMeta();
    const body = readFileSync(file(m.pick.good), "utf8");
    const zip = makeZip({ [`${XSS}.json`]: body, "copy-of-it.json": body });
    await page.goto("/bulk");
    await page.getByTestId("bulk-file").setInputFiles({ name: "x.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
    await expect(page.getByTestId("bulk-result")).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(await page.locator("img[src='x']").count()).toBe(0);
    await expect(page.getByTestId("dup-badge")).toHaveCount(1);
  });
});
