// Publishes the certificates made by `pnpm --filter @mohar/core seed` to the web app's demo room.
//   node scripts/publish-seed.mjs            (reads SEED.md + docs/seed/, writes apps/web/public/demo/<network>/seed/)
// Only public, synthetic demo data is copied: links, QR images and proof files the seed already wrote.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const md = readFileSync(path.join(root, "SEED.md"), "utf8");
const network = /on \*\*([a-z-]+)\*\*/.exec(md)?.[1];
if (!network) throw new Error("SEED.md does not say which network it was generated on");
const generatedAt = /at (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(md)?.[1];
const out = path.join(root, "apps/web/public/demo", network, "seed");
mkdirSync(out, { recursive: true });

const entries = [];
for (const line of md.split("\n")) {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length < 8 || !cells[6]?.includes("seed/")) continue;
  const [, label, expected, actual, code, link, qr, file] = cells;
  const id = /seed\/([a-z-]+)\.png/.exec(qr)?.[1] ?? /seed\/([a-z-]+)\.mohar/.exec(file)?.[1];
  const url = /\((https?:\/\/[^)]+)\)/.exec(link)?.[1];
  if (!id) continue;
  for (const f of [`${id}.png`, `${id}.mohar.json`]) {
    const src = path.join(root, "docs/seed", f);
    if (existsSync(src)) copyFileSync(src, path.join(out, f));
  }
  entries.push({ id, label, expected: expected.replace(/`/g, ""), actual: actual.replace(/[`✅❌ ]/g, ""), code, link: url });
}
writeFileSync(path.join(out, "index.json"), JSON.stringify({ network, generatedAt, entries }, null, 2));
console.log(`published ${entries.length} certificates to ${out}`);
