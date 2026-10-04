import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface Fixture {
  file: any;
  link: string;
}
export interface Fixtures {
  origin: string;
  gasPerCert: number;
  good: Fixture;
  revoked: Fixture;
  suspended: Fixture;
  expired: Fixture;
  batchGood: Fixture;
  batchRevoked: Fixture;
  preCutoff: Fixture;
  postCutoff: Fixture;
}

export const fixtures = (): Fixtures => JSON.parse(readFileSync(path.join(process.cwd(), "e2e/.fixtures.json"), "utf8"));

const EVIDENCE = path.join(process.cwd(), "..", "..", "docs", "evidence");
const ROWS = path.join(process.cwd(), "test-results", "e2e-matrix.json");

export interface Row {
  id: string;
  attack: string;
  expected: string;
  actual: string;
  pass: boolean;
  screenshot?: string;
}

/** Take a screenshot into docs/evidence and append a row to the e2e matrix that TESTING.md is built from. */
export async function evidence(page: Page, id: string, attack: string, expected: string, actual: string) {
  mkdirSync(EVIDENCE, { recursive: true });
  const shot = `${id}.png`;
  await page.screenshot({ path: path.join(EVIDENCE, shot), fullPage: true });
  mkdirSync(path.dirname(ROWS), { recursive: true });
  const rows: Row[] = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, "utf8")) : [];
  const next = rows.filter((r) => r.id !== id);
  next.push({ id, attack, expected, actual, pass: expected === actual, screenshot: `docs/evidence/${shot}` });
  writeFileSync(ROWS, JSON.stringify(next, null, 2));
}

export async function verdictOf(page: Page): Promise<string> {
  const v = page.getByTestId("verdict");
  await expect(v).toBeVisible();
  // wait for the "verifying…" state to finish
  await expect(v).not.toHaveAttribute("data-verdict", "");
  return (await v.getAttribute("data-verdict"))!;
}

export async function submitFile(page: Page, name: string, content: string | Buffer, mime = "application/json") {
  await page.goto("/verify");
  await page.getByTestId("verify-file").setInputFiles({ name, mimeType: mime, buffer: Buffer.from(content) });
}

export const jsonOf = (f: any) => JSON.stringify(f, null, 2);

export function tamperedCopy(f: any, path: string, value: unknown) {
  const c = structuredClone(f);
  c.fields[path].value = JSON.stringify(value);
  return c;
}

export function attach(info: TestInfo, name: string, body: string) {
  return info.attach(name, { body, contentType: "text/plain" });
}
