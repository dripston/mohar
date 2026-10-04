import { expect, test } from "@playwright/test";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { evidence } from "./helpers";

test("A1 authority accredits a new issuer, then revokes its key with a cutoff", async ({ page }) => {
  const addr = privateKeyToAddress(generatePrivateKey());
  await page.goto("/issuer/admin");
  await page.getByTestId("connect-dev-root").click();
  await expect(page.getByTestId("admin-role")).toContainText("Root authority");

  await page.getByTestId("admin-register-address").fill(addr);
  await page.getByTestId("admin-register-domain").fill("e2e-university.edu");
  await page.getByTestId("admin-register-name").fill("E2E University");
  await page.getByTestId("admin-register-submit").click();
  await expect(page.getByTestId("admin-msg")).toContainText("Issuer registered");
  const row = page.getByTestId(`issuer-${addr.toLowerCase()}`);
  await expect(row).toContainText("E2E University");
  await expect(row).toContainText("Active");
  await evidence(page, "A1-accredit-issuer", "Authority accredits an issuer on chain", "Active", "Active");

  const when = new Date(Date.now() - 3600_000).toISOString().slice(0, 16);
  await page.getByTestId("admin-revoke-key").fill(addr);
  await page.getByTestId("admin-revoke-when").fill(when);
  await page.getByTestId("admin-revoke-reason").selectOption("1");
  await page.getByTestId("admin-revoke-submit").click();
  await expect(page.getByTestId("admin-msg")).toContainText("Key revoked");
  await expect(row).toContainText("Revoked from");
  await evidence(page, "A2-revoke-key-cutoff", "Authority revokes a key from a past moment", "Revoked", "Revoked");
});
