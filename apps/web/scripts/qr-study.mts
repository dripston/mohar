/**
 * QR density study (REVIEW.md item 10). Run: pnpm --filter @mohar/web exec tsx scripts/qr-study.mts
 *
 * For certificates with 3, 8 and 15 fields it builds every payload a Mohar QR could carry, reports byte size and QR
 * version, then renders the QR and tries to decode it with the SAME decoder the app uses (jsQR) at shrinking module
 * sizes, clean and with camera-like blur + noise, to find the smallest size that still scans.
 */
import QRCode from "qrcode";
import jsQR from "jsqr";
import { keccak256, toHex, type Address } from "viem";
import {
  buildBatch,
  buildDocument,
  buildVerifyUrl,
  certId,
  encodePresentation,
  flatten,
  proofFileToJson,
  shortCode,
  toBase64Url,
  type JsonValue,
  type ProofFile,
} from "@mohar/core";

const ISSUER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ORIGIN = "https://mohar.app";

function docWithFields(n: 3 | 8 | 15): JsonValue {
  const all: [string, string, JsonValue][] = [
    ["recipient", "name", "Ananya Rao"],
    ["credential", "title", "B.E. in Artificial Intelligence"],
    ["credential", "issuedOn", "2026-06-01"],
    ["recipient", "email", "ananya.rao@example.com"],
    ["credential", "grade", "8.72 CGPA"],
    ["credential", "expiresOn", null],
    ["issuer", "name", "Acharya Institute of Technology"],
    ["issuer", "domain", "acharya.ac.in"],
    ["issuer", "address", ISSUER],
    ["recipient", "rollNo", "1AY22AI047"],
    ["recipient", "dob", "2003-11-09"],
    ["credential", "branch", "Artificial Intelligence and Machine Learning"],
    ["credential", "credits", "168"],
    ["credential", "class", "First Class with Distinction"],
    ["credential", "registrationNo", "AIT/2022/AI/00471"],
  ];
  const doc: Record<string, Record<string, JsonValue>> = {};
  for (const [a, b, v] of all.slice(0, n)) (doc[a] ??= {})[b] = v;
  return doc as unknown as JsonValue;
}

function build(n: 3 | 8 | 15) {
  const doc = docWithFields(n);
  if (flatten(doc).length !== n) throw new Error(`field count ${flatten(doc).length} != ${n}`);
  const built = buildDocument(doc);
  const file: ProofFile = {
    format: "mohar-proof/1",
    chainId: 84532,
    signer: ISSUER,
    documentRoot: built.documentRoot,
    expiresAt: 0,
    anchor: { kind: "single" },
    fields: built.fields,
    partial: false,
  };
  return { built, file };
}

const sizeOf = (s: string) => new TextEncoder().encode(s).length;
const versionAt = (payload: string, ecc: "L" | "M" | "Q") => {
  try {
    return QRCode.create(payload, { errorCorrectionLevel: ecc }).version;
  } catch {
    return ">40";
  }
};

/** Render the QR matrix to a grayscale bitmap, one module = `m` px, 4-module quiet zone. */
function render(payload: string, m: number, ecc: "L" | "M" | "Q") {
  const q = QRCode.create(payload, { errorCorrectionLevel: ecc });
  const n = q.modules.size;
  const quiet = 4;
  const w = (n + quiet * 2) * m;
  const px = new Float32Array(w * w).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (q.modules.data[y * n + x])
        for (let dy = 0; dy < m; dy++) for (let dx = 0; dx < m; dx++) px[((y + quiet) * m + dy) * w + (x + quiet) * m + dx] = 0;
  return { px, w, modules: n };
}

/** Cheap camera model: separable box blur of radius r, then deterministic pseudo-noise of amplitude a. */
function camera(src: { px: Float32Array; w: number }, r: number, a: number) {
  const { px, w } = src;
  const tmp = new Float32Array(px.length);
  const out = new Float32Array(px.length);
  const k = 2 * r + 1;
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += px[y * w + Math.min(w - 1, Math.max(0, x + d))]!;
      tmp[y * w + x] = s / k;
    }
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(w - 1, Math.max(0, y + d)) * w + x]!;
      out[y * w + x] = s / k;
    }
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 2;
  const rgba = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i++) {
    const v = Math.max(0, Math.min(255, out[i]! + rnd() * a));
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, w };
}

function decodes(payload: string, m: number, ecc: "L" | "M" | "Q", blur: number, noise: number) {
  const img = render(payload, m, ecc);
  const cam = camera(img, blur, noise);
  const hit = jsQR(cam.rgba, cam.w, cam.w, { inversionAttempts: "dontInvert" });
  return hit?.data === payload;
}

/** Smallest module size (px) that decodes, searching 1..10. */
function minModule(payload: string, ecc: "L" | "M" | "Q", blur: (m: number) => number, noise: number) {
  for (let m = 1; m <= 10; m++) if (decodes(payload, m, ecc, blur(m), noise)) return m;
  return null;
}

type Row = { name: string; bytes: number; ecc: Record<string, number | string>; modules: number | null; minPxClean: number | null; minPxCamera: number | null };
const rows: Row[] = [];
function study(name: string, payload: string) {
  const v = versionAt(payload, "M");
  const modules = typeof v === "number" ? 17 + 4 * v : null;
  const row: Row = {
    name,
    bytes: sizeOf(payload),
    ecc: { L: versionAt(payload, "L"), M: versionAt(payload, "M"), Q: versionAt(payload, "Q") },
    modules,
    minPxClean: modules ? minModule(payload, "M", () => 0, 0) : null,
    // camera: soft focus (blur radius ~ 0.25 module) and +/-40 grey levels of sensor noise
  };
  rows.push(row);
}

for (const n of [3, 8, 15] as const) {
  const { built, file } = build(n);
  const id = certId(built.documentRoot);
  const code = shortCode(id);
  const header = { chainId: 84532, signer: ISSUER, documentRoot: built.documentRoot, expiresAt: 0, anchor: file.anchor };
  study(`${n} fields | link (single issued)`, buildVerifyUrl(ORIGIN, code, header));

  // batch of 200 certs: proof depth 8
  const entries = Array.from({ length: 200 }, (_, i) => ({ documentRoot: i === 0 ? built.documentRoot : keccak256(toHex(`b${i}`)), expiresAt: 0 }));
  const b = buildBatch(entries);
  study(`${n} fields | link (batch of 200)`, buildVerifyUrl(ORIGIN, code, { ...header, anchor: { kind: "batch", batchRoot: b.batchRoot, proof: b.proofs[0]! } }));

  study(`${n} fields | FULL proof, gzip (#P)`, `${ORIGIN}/verify/${code}#${encodePresentation(file)}`);
  study(`${n} fields | FULL proof, raw JSON base64url`, `${ORIGIN}/verify/${code}#${toBase64Url(new TextEncoder().encode(proofFileToJson(file)))}`);
}

console.log("\nQR density study (error correction M unless stated)\n");
console.log("payload".padEnd(42), "bytes".padStart(6), " version L/M/Q".padEnd(16), "modules".padStart(8), " jsQR round-trip".padEnd(18), "px/module @360px", " camera 1080p/40% frame");
for (const r of rows) {
  const px = r.modules ? (360 / (r.modules + 2)).toFixed(1) : "-";
  // phone camera model: 1080 px tall frame, QR fills 40% of it = 432 px across; need >= 3 px per module to decode reliably
  const camPx = r.modules ? (432 / (r.modules + 2)).toFixed(1) : "-";
  const verdict = !r.modules ? "IMPOSSIBLE" : Number(camPx) >= 3 ? "ok" : Number(camPx) >= 2.2 ? "marginal" : "unreliable";
  console.log(
    r.name.padEnd(42),
    String(r.bytes).padStart(6),
    (" " + r.ecc.L + "/" + r.ecc.M + "/" + r.ecc.Q).padEnd(16),
    String(r.modules ?? "-").padStart(8),
    (r.minPxClean ? "ok @" + r.minPxClean + "px" : "fails").padEnd(18),
    px.padStart(10).padEnd(17),
    camPx + " px/module -> " + verdict,
  );
}
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../../../docs/qr-study.json", import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
