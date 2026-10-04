import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  PDFHexString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { LIMITS, boundedUnzlib, certId, parseProofFile, proofFileToJson, shortCode, type ProofFile } from "@mohar/core";
import { qrDataUrl } from "./qr";
import { stripUnsafe } from "./utils";

const ATTACHMENT = "mohar-proof.json";

/** Invisible controls and bidi overrides never reach a page: they can make a name read differently from what was signed. */

const plain = (file: ProofFile, path: string): string => {
  const f = file.fields[path];
  if (!f) return "";
  try {
    const v = JSON.parse(f.value);
    return v === null ? "" : stripUnsafe(String(v));
  } catch {
    return stripUnsafe(f.value);
  }
};

/**
 * The 14 built-in PDF fonts only draw Latin-1 text and THROW on anything else (Devanagari, Arabic, emoji...), which
 * would make an Indian name impossible to print. Replace what the font cannot draw with "?" and shrink / truncate
 * to the page so a 10,000-character value cannot run off the sheet. The complete, exact text always travels in the
 * embedded proof file, which is what the verifier actually checks.
 */
export function fitText(font: { widthOfTextAtSize(t: string, s: number): number }, text: string, size: number, maxWidth: number) {
  let t = [...text]
    .map((ch) => {
      try {
        font.widthOfTextAtSize(ch, size);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
  let s = size;
  while (s > 9 && font.widthOfTextAtSize(t, s) > maxWidth) s -= 1;
  if (font.widthOfTextAtSize(t, s) > maxWidth) {
    while (t.length > 1 && font.widthOfTextAtSize(t + "...", s) > maxWidth) t = t.slice(0, -1);
    t += "...";
  }
  return { text: t, size: s };
}

/**
 * A printable certificate. The QR holds the verify link (link mode). The complete proof file, with every field,
 * salt and Merkle path, is embedded as a PDF attachment, so dropping the PDF on the verifier runs full-proof mode.
 */
export async function createCertificatePdf(file: ProofFile, verifyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${plain(file, "credential.title")} - ${plain(file, "recipient.name")}`.slice(0, 200));
  pdf.setSubject("Mohar blockchain-anchored certificate");
  pdf.setKeywords([shortCode(certId(file.documentRoot))]);
  pdf.setProducer("Mohar");
  const page = pdf.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.08, 0.07, 0.06);
  const seal = rgb(0.69, 0.14, 0.11);
  const gold = rgb(0.62, 0.5, 0.24);
  const center = (raw: string, y: number, size: number, font = serif, color = ink) => {
    const fit = fitText(font, raw, size, width - 140);
    page.drawText(fit.text, { x: (width - font.widthOfTextAtSize(fit.text, fit.size)) / 2, y, size: fit.size, font, color });
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.99, 0.98, 0.95) });
  page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: gold, borderWidth: 2.5 });
  page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: gold, borderWidth: 0.6 });

  center(plain(file, "issuer.name").toUpperCase(), height - 92, 20, serifBold);
  center(plain(file, "issuer.domain"), height - 112, 10, mono, rgb(0.4, 0.37, 0.33));
  center("CERTIFICATE OF ACHIEVEMENT", height - 160, 13, serif, seal);
  center("This is to certify that", height - 205, 14, serifItalic);
  center(plain(file, "recipient.name"), height - 255, 38, serifBold);
  center("has been awarded", height - 292, 14, serifItalic);
  center(plain(file, "credential.title"), height - 335, 26, serif);
  const grade = plain(file, "credential.grade");
  if (grade) center(`Grade: ${grade}`, height - 368, 13, serif);
  center(`Issued on ${plain(file, "credential.issuedOn")}`, height - 392, 12, serif, rgb(0.3, 0.28, 0.25));
  const exp = plain(file, "credential.expiresOn");
  if (exp) center(`Valid until ${exp}`, height - 410, 11, serif, rgb(0.3, 0.28, 0.25));

  // QR + code
  const qr = await pdf.embedPng(await qrDataUrl(verifyUrl, 420));
  page.drawImage(qr, { x: width - 190, y: 62, width: 118, height: 118 });
  page.drawText("Scan to verify", { x: width - 178, y: 48, size: 9, font: serifItalic, color: ink });
  page.drawText(shortCode(certId(file.documentRoot)), { x: 60, y: 62, size: 10, font: mono, color: ink });
  page.drawText("Anchored on-chain. Verification needs no account and no trust in the issuer's website.", {
    x: 60,
    y: 46,
    size: 8,
    font: serifItalic,
    color: rgb(0.4, 0.37, 0.33),
  });
  // simple seal
  page.drawCircle({ x: width / 2, y: 98, size: 34, borderColor: seal, borderWidth: 2.5 });
  page.drawCircle({ x: width / 2, y: 98, size: 27, borderColor: seal, borderWidth: 0.8 });
  const m = "MOHAR";
  page.drawText(m, { x: width / 2 - serifBold.widthOfTextAtSize(m, 12) / 2, y: 94, size: 12, font: serifBold, color: seal });

  await pdf.attach(new TextEncoder().encode(proofFileToJson(file)), ATTACHMENT, {
    mimeType: "application/json",
    description: "Mohar proof file: fields, salts and Merkle paths",
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  return pdf.save();
}

/** Read the embedded proof file out of a certificate PDF. Throws if absent or malformed. */
export async function extractProofFromPdf(bytes: ArrayBuffer | Uint8Array): Promise<ProofFile> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const names = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embedded = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const list = embedded?.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (!list) throw new Error("This PDF has no embedded Mohar proof file.");
  for (let i = 0; i + 1 < list.size(); i += 2) {
    const label = list.lookup(i);
    const name = label instanceof PDFString || label instanceof PDFHexString ? label.decodeText() : "";
    if (name !== ATTACHMENT) continue;
    const spec = list.lookup(i + 1, PDFDict);
    const ef = spec.lookup(PDFName.of("EF"), PDFDict);
    const stream = ef.lookup(PDFName.of("F"));
    if (!(stream instanceof PDFRawStream)) throw new Error("Embedded proof is unreadable.");
    // never inflate an attachment without a ceiling: a FlateDecode stream can expand a thousand-fold
    const filter = stream.dict.lookup(PDFName.of("Filter"));
    const raw = stream.getContents();
    let data: Uint8Array;
    if (!filter) data = raw;
    else if (filter instanceof PDFName && filter.decodeText() === "FlateDecode") data = boundedUnzlib(raw, LIMITS.maxFileBytes);
    else throw new Error("Embedded proof uses an unsupported encoding.");
    if (data.length > LIMITS.maxFileBytes) throw new Error("Embedded proof is too large.");
    return parseProofFile(new TextDecoder().decode(data));
  }
  throw new Error("This PDF has no embedded Mohar proof file.");
}
