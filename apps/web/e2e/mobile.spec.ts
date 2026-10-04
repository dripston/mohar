import { expect, test } from "@playwright/test";
import { evidence, fixtures, verdictOf } from "./helpers";

const F = fixtures();

test("M1 the verify flow works at phone width with no horizontal scroll", async ({ page }) => {
  await page.goto(F.good.link);
  expect(await verdictOf(page)).toBe("VERIFIED");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("check-5")).toBeVisible();
  await evidence(page, "M1-mobile-verified", "Phone-width verify (Pixel 7)", "VERIFIED", "VERIFIED");
});

test("M2 tamper view is readable on a phone", async ({ page }) => {
  await page.goto(F.revoked.link);
  expect(await verdictOf(page)).toBe("REVOKED");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await evidence(page, "M2-mobile-revoked", "Phone-width revoked state (Pixel 7)", "REVOKED", "REVOKED");
});
