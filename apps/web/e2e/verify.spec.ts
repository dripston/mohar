import { expect, test } from "@playwright/test";
import { createCertificatePdf } from "../lib/pdf";
import { encodeLinkHeader, toBase64Url } from "@mohar/core";
import { evidence, fixtures, jsonOf, submitFile, tamperedCopy, verdictOf } from "./helpers";

const F = fixtures();

test.describe("every verdict state, driven through the real UI against the real chain", () => {
  test("E1 genuine certificate (file)", async ({ page }) => {
    await submitFile(page, "good.json", jsonOf(F.good.file));
    expect(await verdictOf(page)).toBe("VERIFIED");
    for (const n of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`check-${n}`)).toHaveAttribute("data-status", "pass");
    await expect(page.getByTestId("independent-panel")).toBeVisible();
    await evidence(page, "E1-verified-full", "Genuine certificate, full proof file", "VERIFIED", "VERIFIED");
  });

  test("E2 genuine certificate via QR link (link mode) labels what it did not check", async ({ page }) => {
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-mode", "link");
    await expect(page.getByTestId("check-4")).toHaveAttribute("data-status", "warn");
    await evidence(page, "E2-verified-link", "Genuine certificate, QR link only", "VERIFIED", "VERIFIED");
  });

  test("E3 tampered grade is pinpointed", async ({ page }) => {
    await submitFile(page, "forged.json", jsonOf(tamperedCopy(F.good.file, "credential.grade", "9.8")));
    const v = await verdictOf(page);
    await expect(page.getByTestId("field-credential.grade")).toHaveAttribute("data-ok", "false");
    await expect(page.getByTestId("field-recipient.name")).toHaveAttribute("data-ok", "true");
    await evidence(page, "E3-tampered", "Grade edited 8.34 -> 9.8", "TAMPERED", v);
    expect(v).toBe("TAMPERED");
  });

  test("E4 forged PDF with a real QR", async ({ page }) => {
    const forged = tamperedCopy(F.good.file, "recipient.name", "Someone Else");
    const pdf = await createCertificatePdf(forged, F.good.link);
    await submitFile(page, "forged.pdf", Buffer.from(pdf), "application/pdf");
    const v = await verdictOf(page);
    await evidence(page, "E4-forged-pdf", "Forged PDF: real QR on edited content", "TAMPERED", v);
    expect(v).toBe("TAMPERED");
  });

  test("E5 genuine PDF verifies from the embedded proof", async ({ page }) => {
    const pdf = await createCertificatePdf(F.good.file, F.good.link);
    await submitFile(page, "good.pdf", Buffer.from(pdf), "application/pdf");
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-mode", "full");
  });

  test("E6 revoked shows reason and date", async ({ page }) => {
    await page.goto(F.revoked.link);
    const v = await verdictOf(page);
    await expect(page.getByTestId("check-5")).toContainText("Issued in error");
    await evidence(page, "E6-revoked", "Revoked (issued in error)", "REVOKED", v);
    expect(v).toBe("REVOKED");
  });

  test("E7 suspended", async ({ page }) => {
    await page.goto(F.suspended.link);
    const v = await verdictOf(page);
    await evidence(page, "E7-suspended", "Suspended", "SUSPENDED", v);
    expect(v).toBe("SUSPENDED");
  });

  test("E8 expired", async ({ page }) => {
    await page.goto(F.expired.link);
    const v = await verdictOf(page);
    await evidence(page, "E8-expired", "Expired", "EXPIRED", v);
    expect(v).toBe("EXPIRED");
  });

  test("E9 issuer revoked with a cutoff: before stays valid, after is invalid", async ({ page }) => {
    await page.goto(F.preCutoff.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await evidence(page, "E9a-issuer-cutoff-before", "Issuer key revoked: certificate issued BEFORE cutoff", "VERIFIED", "VERIFIED");
    await page.goto(F.postCutoff.link);
    const v = await verdictOf(page);
    await evidence(page, "E9b-issuer-cutoff-after", "Issuer key revoked: certificate issued AFTER cutoff", "ISSUER_REVOKED", v);
    expect(v).toBe("ISSUER_REVOKED");
  });

  test("E10 batch member verifies, a revoked batch member does not, via link and file", async ({ page }) => {
    await page.goto(F.batchGood.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await submitFile(page, "batch.json", jsonOf(F.batchGood.file));
    expect(await verdictOf(page)).toBe("VERIFIED");
    await page.goto(F.batchRevoked.link);
    const v = await verdictOf(page);
    await evidence(page, "E10-batch-revoked", "One certificate in a batch revoked", "REVOKED", v);
    expect(v).toBe("REVOKED");
  });

  test("E11 unknown ID", async ({ page }) => {
    const h = F.good.file;
    const header = encodeLinkHeader({ chainId: h.chainId, signer: h.signer, documentRoot: ("0x" + "ab".repeat(32)) as `0x${string}`, expiresAt: 0, anchor: { kind: "single" } });
    await page.goto(`/verify/MHR-0000-0000-0000-0#${toBase64Url(header)}`);
    const v = await verdictOf(page);
    await evidence(page, "E11-unknown-id", "Unknown certificate ID", "NOT_FOUND", v);
    expect(v).toBe("NOT_FOUND");
  });

  test("E12 wrong chain", async ({ page }) => {
    const c = structuredClone(F.good.file);
    c.chainId = 1;
    await submitFile(page, "wrongchain.json", jsonOf(c));
    const v = await verdictOf(page);
    await evidence(page, "E12-wrong-chain", "Certificate for another chain", "WRONG_CHAIN", v);
    expect(v).toBe("WRONG_CHAIN");
  });

  test("E13 malformed QR and malformed file never crash", async ({ page }) => {
    await page.goto("/verify/MHR-AAAA-BBBB-CCCC-D#!!!not-base64!!!");
    const v = await verdictOf(page);
    await evidence(page, "E13-malformed-qr", "Malformed QR fragment", "MALFORMED", v);
    expect(v).toBe("MALFORMED");
    await submitFile(page, "junk.json", '{"hello":"world"}');
    expect(await verdictOf(page)).toBe("MALFORMED");
  });

  test("E14 selective disclosure hides the grade and still verifies as partial", async ({ page }) => {
    await page.goto("/holder");
    await page.getByTestId("holder-file").setInputFiles({ name: "good.json", mimeType: "application/json", buffer: Buffer.from(jsonOf(F.good.file)) });
    await page.getByTestId("reveal-credential.grade").uncheck();
    await page.getByTestId("reveal-recipient.email").uncheck();
    await page.getByTestId("generate-share").click();
    const link = (await page.getByTestId("share-link").textContent())!.trim();
    await page.goto(link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-mode", "partial");
    await expect(page.getByTestId("field-credential.grade")).toHaveCount(0);
    await evidence(page, "E14-selective-disclosure", "Holder hides grade and email, shares new link", "VERIFIED", "VERIFIED");
  });

  test("E15 trustless: with the app server unreachable, verification still completes in the browser", async ({ page, context }) => {
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    // "kill the backend": from now on every request to our own origin fails. Chain RPC (a different origin) is untouched.
    await context.route(/localhost:3100/, (r) => r.abort());
    await page.getByTestId("verify-input").fill(F.revoked.link);
    await page.getByTestId("verify-submit").click();
    await expect(page.getByTestId("verdict")).toHaveAttribute("data-verdict", "REVOKED");
    await evidence(page, "E15-server-dead", "Our server unreachable, verification continues", "REVOKED", "REVOKED");
  });
});
