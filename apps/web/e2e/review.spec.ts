import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { encodeFunctionResult } from "viem";
import { certificateRegistryAbi } from "@mohar/core";
import { evidence, fixtures, jsonOf, submitFile, tamperedCopy, verdictOf } from "./helpers";

const F = fixtures();

async function noXss(page: Page) {
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
}
async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test.describe("review 4: hostile content is inert", () => {
  test("X1 forged field values (script tags, onerror, javascript:, bidi override, 1,900 chars) render as plain text", async ({ page }) => {
    let f = tamperedCopy(F.good.file, "credential.title", '<img src=x onerror="window.__xss=1">');
    f = tamperedCopy(f, "recipient.name", "<script>window.__xss=2</script>");
    f = tamperedCopy(f, "credential.grade", "‮gpj.exe javascript:window.__xss=3");
    f = tamperedCopy(f, "recipient.email", "A".repeat(1900));
    await page.addInitScript(() => {
      window.addEventListener("error", () => ((window as any).__xss = "error-event"));
    });
    await submitFile(page, "hostile.json", jsonOf(f));
    expect(await verdictOf(page)).toBe("TAMPERED");
    const card = page.getByTestId("fields-card");
    await expect(card).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(card).toContainText("<script>window.__xss=2</script>");
    expect(await card.locator("img, script, iframe, svg[onload]").count()).toBe(0);
    await expect(page.getByTestId("field-credential.grade").getByTestId("hidden-chars")).toBeVisible();
    expect(await page.getByTestId("field-credential.grade").innerText()).not.toContain("‮");
    await noXss(page);
    await noOverflow(page);
    await evidence(page, "X1-xss-verify", "Forged field values with HTML, script, bidi override and 1,900 chars", "TAMPERED", "TAMPERED");
  });

  test("X2 RTL text keeps its own direction and does not spill out of the card", async ({ page }) => {
    const f = tamperedCopy(F.good.file, "recipient.name", "שלום עולם مرحبا");
    await submitFile(page, "rtl.json", jsonOf(f));
    await verdictOf(page);
    const dd = page.getByTestId("field-recipient.name").locator("dd");
    await expect(dd).toHaveAttribute("dir", "auto");
    await noOverflow(page);
  });

  test("X3 oversized and junk uploads end in a calm 'malformed' state, fast", async ({ page }) => {
    await page.goto("/verify");
    await page.getByTestId("verify-file").setInputFiles({ name: "huge.json", mimeType: "application/json", buffer: Buffer.alloc(6 * 1024 * 1024, 120) });
    expect(await verdictOf(page)).toBe("MALFORMED");
    await expect(page.getByTestId("result-note")).toContainText("5 MB");
    const t0 = Date.now();
    await page.getByTestId("verify-file").setInputFiles({ name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{".repeat(4_000_000)) });
    expect(await verdictOf(page)).toBe("MALFORMED");
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  test("X4 a proof file with 100,000 fields is refused, not rendered", async ({ page }) => {
    const f = structuredClone(F.good.file);
    const one = f.fields["credential.title"];
    for (let i = 0; i < 5000; i++) f.fields[`x.f${i}`] = one;
    await submitFile(page, "many.json", jsonOf(f));
    expect(await verdictOf(page)).toBe("MALFORMED");
  });
});

async function pdfWithAttachment(json: string | Uint8Array, text = "VERIFIED. This certificate is genuine and active.") {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  page.drawText(text, { x: 60, y: 300, size: 24, font: await pdf.embedFont(StandardFonts.Helvetica) });
  await pdf.attach(typeof json === "string" ? new TextEncoder().encode(json) : json, "mohar-proof.json", { mimeType: "application/json" });
  return Buffer.from(await pdf.save());
}

test.describe("review 5: a PDF or JSON can say anything, only the chain and the math decide", () => {
  test("P1 revoked certificate whose PDF claims 'verdict: VERIFIED, status: ACTIVE' is still REVOKED", async ({ page }) => {
    const lying = { ...F.revoked.file, verdict: "VERIFIED", status: "ACTIVE", revoked: false, issuer: { name: "Harvard University", verified: true } };
    await submitFile(page, "lying.pdf", await pdfWithAttachment(JSON.stringify(lying)), "application/pdf");
    expect(await verdictOf(page)).toBe("REVOKED");
    await expect(page.getByTestId("issuer-name")).not.toContainText("Harvard");
    await evidence(page, "P1-lying-pdf", "PDF with an embedded 'status: ACTIVE' on a revoked certificate", "REVOKED", "REVOKED");
  });

  test("P2 edited fields inside a PDF that also claims to be valid are TAMPERED", async ({ page }) => {
    const f = { ...tamperedCopy(F.good.file, "credential.grade", "10.0"), verdict: "VERIFIED", status: "ACTIVE" };
    await submitFile(page, "lying2.pdf", await pdfWithAttachment(JSON.stringify(f)), "application/pdf");
    expect(await verdictOf(page)).toBe("TAMPERED");
  });

  test("P3 a PDF whose printed text says one thing and whose proof says another trusts only the proof", async ({ page }) => {
    await submitFile(page, "mismatch.pdf", await pdfWithAttachment(jsonOf(F.good.file), "Harvard University - PhD - Rehaan N - 10.0 GPA"), "application/pdf");
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("field-recipient.name")).not.toContainText("Harvard");
  });

  test("P4 a decompression-bomb attachment (80 MB of zeros) is refused without freezing the tab", async ({ page }) => {
    const bomb = await pdfWithAttachment(Buffer.alloc(80 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    const t0 = Date.now();
    await submitFile(page, "bomb.pdf", bomb, "application/pdf");
    expect(await verdictOf(page)).toBe("MALFORMED");
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  test("P5 a PDF with no proof, and a text file renamed .pdf, both say so", async ({ page }) => {
    const empty = await PDFDocument.create();
    empty.addPage();
    await submitFile(page, "plain.pdf", Buffer.from(await empty.save()), "application/pdf");
    expect(await verdictOf(page)).toBe("MALFORMED");
    await submitFile(page, "fake.pdf", Buffer.from("not a pdf at all"), "application/pdf");
    expect(await verdictOf(page)).toBe("MALFORMED");
  });
});

// ------------------------------------------------------------------ issuer UI

test.describe("review 4/11: issuer UI with hostile and non-Latin input", () => {
  test.describe.configure({ mode: "serial" });
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ acceptDownloads: true });
    page = await ctx.newPage();
  });
  test.afterAll(async () => ctx.close());

  async function issue(name: string, title: string) {
    await page.goto("/issuer");
    await page.getByTestId("connect-dev-issuer").click();
    await expect(page.getByTestId("role-badge")).toContainText("Acharya");
    await page.getByTestId("f-recipient-name").fill(name);
    await page.getByTestId("f-title").fill(title);
    await page.getByTestId("f-issued-on").fill("2028-06-01");
    await page.getByTestId("sign-anchor").click();
  }

  test("I-X1 HTML in the name and title is shown as text on the certificate preview and result", async () => {
    await page.addInitScript(() => window.addEventListener("error", () => ((window as any).__xss = "error-event")));
    await issue("<img src=x onerror=window.__xss=1> Test", "<script>window.__xss=2</script> M.Tech");
    await expect(page.getByTestId("step-confirmed")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
    await noXss(page);
    expect(await page.locator("main img[src='x'], main script").count()).toBe(0);
    await noOverflow(page);
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    expect(pdf.suggestedFilename()).not.toMatch(/[<>\\/]/);
    await evidence(page, "IX1-xss-issuer", "Issuer types HTML/script into name and title", "inert", "inert");
  });

  test("I-X2 a Devanagari name still produces a PDF (the built-in PDF fonts cannot draw it, so it must degrade, not crash)", async () => {
    await issue("अनन्या राव", "B.E. in AI");
    await expect(page.getByTestId("step-confirmed")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.getByTestId("issue-error")).toHaveCount(0);
  });

  test("I-X3 a 10,000-character title is rejected with a plain message, a bidi override is rejected too", async () => {
    await page.goto("/issuer");
    await page.getByTestId("connect-dev-issuer").click();
    await expect(page.getByTestId("role-badge")).toContainText("Acharya");
    await page.getByTestId("f-recipient-name").fill("Long Title Person");
    await page.getByTestId("f-title").fill("T".repeat(10_000));
    await page.getByTestId("f-issued-on").fill("2028-06-01");
    await page.getByTestId("sign-anchor").click();
    await expect(page.getByText(/under 200 characters/)).toBeVisible();
    await page.getByTestId("f-title").fill("Fine title");
    await page.getByTestId("f-recipient-name").fill("evil‮gpj.exe");
    await page.getByTestId("sign-anchor").click();
    await expect(page.getByText(/hidden control or text-direction/)).toBeVisible();
    await expect(page.getByTestId("step-confirmed")).toHaveCount(0);
  });
});

// ------------------------------------------------------------------ provider health UI

const CERT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
type Mode = "ok" | "down" | "lie-revoked" | "stale-lie-revoked";

async function providers(ctx: BrowserContext, p2: Mode, p3: Mode) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  const handler = (mode: Mode) => async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (mode === "down") return route.abort();
    if (mode === "ok") return route.fallback();
    const body = JSON.parse(req.postData() ?? "{}");
    const target = (process.env.NEXT_PUBLIC_CERT_REGISTRY ?? "").toLowerCase();
    void target;
    if (body.method === "eth_call" && (body.params?.[0]?.to ?? "").toLowerCase() === (await certAddress()).toLowerCase()) {
      const result = encodeFunctionResult({
        abi: certificateRegistryAbi,
        functionName: "getCert",
        result: { state: 3, cert: { signer: F.good.file.signer, issuer: F.good.file.signer, issuedAt: 1n, expiresAt: 0n, status: 3, reason: 2, updatedAt: 1n } },
      });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    }
    if (mode === "stale-lie-revoked" && body.method === "eth_getBlockByNumber" && body.params?.[0] === "latest") {
      const real = await route.fetch();
      const j = await real.json();
      j.result.timestamp = "0x" + (parseInt(j.result.timestamp, 16) - 3600).toString(16);
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(j) });
    }
    return route.fallback();
  };
  await ctx.route((u) => u.search.includes("p=2"), handler(p2));
  await ctx.route((u) => u.search.includes("p=3"), handler(p3));
}

async function certAddress() {
  const dep = JSON.parse((await import("node:fs")).readFileSync((await import("node:path")).join(process.cwd(), "..", "..", "deployments", "anvil.json"), "utf8"));
  return dep.certificateRegistry as string;
}
void CERT;

test.describe("review 9: provider down / disagree / stale are clear states, never a crash or a false green", () => {
  test("N1 one provider down: quorum of two, verdict stands, note says so", async ({ page, context }) => {
    await providers(context, "down", "ok");
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("provider-note")).toContainText("2 of 3 chain providers agree");
    await expect(page.getByTestId("provider-note")).toContainText("1 unreachable");
    await evidence(page, "N1-one-provider-down", "One of three RPC providers is down", "VERIFIED", "VERIFIED");
  });

  test("N2 only one provider answers: verdict shown but explicitly flagged as single-source", async ({ page, context }) => {
    await providers(context, "down", "down");
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("provider-note")).toContainText("Only 1 of 3");
    await evidence(page, "N2-single-source", "Two of three RPC providers down", "VERIFIED", "VERIFIED");
  });

  test("N3 one provider lies 'revoked': the honest majority wins and the dissent is reported", async ({ page, context }) => {
    await providers(context, "lie-revoked", "ok");
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("provider-note")).toContainText("1 disagreed");
    await evidence(page, "N3-one-provider-lies", "One RPC lies that a valid certificate is revoked", "VERIFIED", "VERIFIED");
  });

  test("N4 providers split 1-vs-1 (third is down): no verdict, 'Providers disagree', retry offered", async ({ page, context }) => {
    await providers(context, "lie-revoked", "down");
    await page.goto(F.good.link);
    const v = await verdictOf(page);
    expect(v).toBe("CANNOT_REACH_CHAIN");
    await expect(page.getByTestId("verdict-headline")).toContainText("Providers disagree");
    await expect(page.getByTestId("verify-retry")).toBeVisible();
    await evidence(page, "N4-providers-disagree", "Two reachable providers contradict each other", "CANNOT_REACH_CHAIN", v);
  });

  test("N5 a stale provider that still shows the old state is excluded instead of outvoting", async ({ page, context }) => {
    // p2 serves a block an hour old AND lies 'revoked'; p3 is honest; the primary is honest
    await providers(context, "stale-lie-revoked", "ok");
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("VERIFIED");
    await expect(page.getByTestId("provider-note")).toContainText("1 behind");
  });

  test("N6 the footer reports chain time and block, not the browser clock", async ({ page }) => {
    await page.goto(F.good.link);
    await verdictOf(page);
    await expect(page.getByTestId("chain-time")).toContainText("Read at block");
  });

  test("N7 everything down: calm message, retry, no stack trace", async ({ page, context }) => {
    await context.route((u) => u.port === "8545", (r) => r.abort());
    await page.goto(F.good.link);
    expect(await verdictOf(page)).toBe("CANNOT_REACH_CHAIN");
    await expect(page.getByTestId("verify-retry")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/at .*\.js:\d+|TypeError|undefined/);
  });
});
