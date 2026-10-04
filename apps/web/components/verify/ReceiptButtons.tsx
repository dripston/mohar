"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { buildReceipt, type ShareMeta, type VerifyResult } from "@mohar/core";
import { Button, Card } from "@/components/ui/primitives";
import { downloadFile } from "@/lib/utils";

/**
 * Verification receipt. Built only from the result on screen, which was just computed from the chain; a result
 * older than ten minutes is refused so a receipt never reports a stale check. It lists fields the holder disclosed
 * and nothing hidden. The receipt hash makes later edits detectable.
 */
export function ReceiptButtons({ result, share }: { result: VerifyResult; share?: ShareMeta }) {
  const [err, setErr] = useState<string>();

  function receipt() {
    try {
      setErr(undefined);
      return buildReceipt(result, share);
    } catch (e) {
      setErr((e as Error).message);
      return undefined;
    }
  }

  async function pdf() {
    const r = receipt();
    if (!r) return;
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    // The built-in fonts only draw Latin-1: anything else becomes "?" here. The JSON receipt keeps the exact text.
    const safe = (t: string) => [...t].map((c) => (c.charCodeAt(0) < 256 && c.charCodeAt(0) >= 32 ? c : "?")).join("");
    let y = 800;
    const line = (t: string, size = 10, f = font) => {
      for (const part of wrap(safe(t), f, size, 500)) {
        if (y < 50) return;
        page.drawText(part, { x: 48, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
        y -= size + 5;
      }
    };
    line("Mohar verification receipt", 18, bold);
    line(`Verdict: ${r.headline} (${r.verdict})`, 13, bold);
    line(`Checked at block ${r.chain.block ?? "?"} on chain ${r.chain.chainId} (${r.chain.blockTime ?? "time unknown"})`);
    line(`Contract: ${r.chain.contract}`);
    if (r.issuer) line(`Issuer: ${r.issuer.name} (${r.issuer.domain})`);
    y -= 6;
    line("Checks", 12, bold);
    for (const c of r.checks) line(`[${c.status}] ${c.label}: ${c.detail}`, 9);
    y -= 6;
    line("Fields the holder chose to show", 12, bold);
    if (r.disclosed.length === 0) line("None (status check only).", 9);
    for (const d of r.disclosed) line(`${d.path}: ${typeof d.value === "string" ? d.value : JSON.stringify(d.value)}`, 9);
    if (r.share) {
      y -= 6;
      line(`Share labels (advisory): purpose ${r.share.purpose ?? "-"}; for ${r.share.recipient ?? "-"}`, 9);
    }
    y -= 6;
    line(r.note, 8);
    line(`Receipt hash: ${r.receiptHash}`, 8, bold);
    downloadFile("mohar-receipt.pdf", await doc.save(), "application/pdf");
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="receipt">
      <span className="text-sm font-medium">Verification receipt</span>
      <Button variant="secondary" size="sm" onClick={() => { const r = receipt(); if (r) downloadFile("mohar-receipt.json", JSON.stringify(r, null, 2), "application/json"); }} data-testid="receipt-json">
        <FileText className="h-4 w-4" aria-hidden /> JSON
      </Button>
      <Button variant="secondary" size="sm" onClick={() => void pdf()} data-testid="receipt-pdf">
        <Download className="h-4 w-4" aria-hidden /> PDF
      </Button>
      <span className="text-xs text-muted">Shows only fields the holder disclosed. Designed for data minimisation.</span>
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
    </Card>
  );
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
