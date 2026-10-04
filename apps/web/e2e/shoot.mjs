// Dev helper: full-page screenshots of a route at laptop and phone widths.
// node e2e/shoot.mjs /verify out-dir [waitMs]
import { chromium } from "@playwright/test";

const [route = "/", out = "shots", wait = "2500"] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
for (const [name, vp] of [
  ["laptop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(Number(wait));
  // scroll through so whileInView sections reveal
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const slug = route.replace(/[^\w]+/g, "_") || "home";
  await page.screenshot({ path: `${out}/${slug}-${name}.png`, fullPage: true });
  console.log(name, "overflow", overflow);
  await page.close();
}
await browser.close();
