import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { evidence, verdictOf } from "./helpers";

async function connect(page: Page) {
  await page.goto("/issuer");
  await page.getByTestId("connect-dev-issuer").click();
  await expect(page.getByTestId("role-badge")).toContainText("Acharya");
}

test.describe.configure({ mode: "serial" });

// One browser context for the whole file: the issuer archive (salts!) lives in localStorage, like a real session.
let ctx: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
});
test.afterAll(async () => {
  await ctx.close();
});

let verifyLink = "";
let studentName = "";

test("I1 issuer signs and anchors a certificate on chain, gets PDF + QR + link", async () => {
  await connect(page);
  studentName = `E2E Student ${Date.now().toString().slice(-6)}`;
  await page.getByTestId("f-recipient-name").fill(studentName);
  await page.getByTestId("f-recipient-email").fill("student@example.com");
  await page.getByTestId("f-title").fill("M.Tech Distributed Systems");
  await page.getByTestId("f-grade").fill("9.1");
  await page.getByTestId("f-issued-on").fill("2028-06-01");
  await page.getByTestId("sign-anchor").click();

  await expect(page.getByTestId("step-confirmed")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  for (const s of ["hashing", "signing", "pending"]) await expect(page.getByTestId(`step-${s}`)).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("short-code")).toContainText("MHR-");
  await expect(page.getByTestId("qr-image")).toBeVisible();
  verifyLink = (await page.getByTestId("verify-link").getAttribute("href"))!;
  expect(verifyLink).toContain("/verify/MHR-");

  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await evidence(page, "I1-issue-single", "Issuer signs (EIP-712) and anchors one certificate", "confirmed", "confirmed");
});

test("I2 the freshly issued certificate verifies from its own QR link", async () => {
  await page.goto(verifyLink);
  expect(await verdictOf(page)).toBe("VERIFIED");
});

test("I3 suspend, reinstate, then revoke from the registry dashboard; verifier follows each change", async () => {
  await connect(page);
  await page.getByRole("link", { name: "Registry", exact: true }).click();
  await page.getByTestId("registry-search").fill(studentName);
  const row = page.locator('[data-testid^="row-0x"]').first();
  await expect(row).toBeVisible();
  const id = (await row.getAttribute("data-testid"))!.replace("row-", "");

  await page.getByTestId(`action-suspend-${id}`).click();
  await expect(row).toHaveAttribute("data-state", "Suspended", { timeout: 40_000 });
  const p2 = await ctx.newPage();
  await p2.goto(verifyLink);
  expect(await verdictOf(p2)).toBe("SUSPENDED");

  await page.getByTestId(`action-reinstate-${id}`).click();
  await expect(row).toHaveAttribute("data-state", "Active", { timeout: 40_000 });
  await p2.reload();
  expect(await verdictOf(p2)).toBe("VERIFIED");

  await page.getByTestId(`action-revoke-${id}`).click();
  await page.getByTestId("reason-select").selectOption("2");
  await page.getByTestId("confirm-revoke").click();
  await expect(row).toHaveAttribute("data-state", "Revoked", { timeout: 40_000 });
  await p2.reload();
  const v = await verdictOf(p2);
  await expect(p2.getByTestId("check-5")).toContainText("Issued in error");
  await evidence(p2, "I3-revoke-flow", "Revoke from dashboard, rescan shows REVOKED + reason", "REVOKED", v);
  expect(v).toBe("REVOKED");
  // revocation is terminal: no reinstate action offered
  await expect(page.getByTestId(`action-reinstate-${id}`)).toHaveCount(0);
});

test("I4 bulk CSV: 40 certificates in ONE transaction, gas per certificate shown", async () => {
  await connect(page);
  await page.getByRole("link", { name: "Bulk issue", exact: true }).click();
  const rows = ["recipient_name,recipient_email,title,grade,issued_on,expires_on"];
  const stamp = Date.now().toString().slice(-6);
  for (let i = 0; i < 40; i++) rows.push(`Bulk Student ${stamp}-${i},b${i}@example.com,Diploma in Data Science,${(6 + (i % 4)).toFixed(1)},2028-06-01,`);
  rows[5] = `Bad Row,not-an-email,,,31-02-2028,`; // one invalid row must be flagged, not silently accepted
  await page.getByTestId("bulk-file").setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) });
  await expect(page.getByTestId("bulk-table")).toBeVisible();
  await expect(page.getByTestId("bulk-invalid")).not.toHaveText(/^0/);
  await evidence(page, "I4a-bulk-validation", "Bulk CSV: invalid row highlighted before anchoring", "flagged", "flagged");

  // fix the table inline: drop the bad row (row 5), leaving 39 valid ones
  await page.getByRole("button", { name: "Remove row 5" }).first().click();
  await expect(page.getByTestId("bulk-valid")).toContainText("39");
  await page.getByTestId("bulk-anchor").click();
  await expect(page.getByTestId("bulk-result")).toBeVisible({ timeout: 90_000 });
  const gas = Number((await page.getByTestId("gas-per-cert").textContent())!.replace(/[^0-9.]/g, ""));
  expect(gas).toBeGreaterThan(0);
  expect(gas).toBeLessThan(5000);
  await evidence(page, "I4b-bulk-anchored", "39 certificates anchored in one transaction", "anchored", "anchored");
});
