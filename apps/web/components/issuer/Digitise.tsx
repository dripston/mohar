"use client";

import { useRef, useState } from "react";
import { Download, ScanText } from "lucide-react";
import { validateExtractedRows, type ExtractedRow } from "@mohar/core";
import { Badge, Button, Card, Input, Page, PageHeader } from "@/components/ui/primitives";
import { CSV_COLUMNS, csvEscape } from "./csv";
import { downloadFile, stripUnsafe } from "@/lib/utils";

type Row = ExtractedRow & { ok: boolean };

/**
 * Legacy digitisation (AI-assisted, DRAFT ONLY). OCR/LLM reads typed text or a scan; every row is shown editable and
 * nothing leaves this page until a human has ticked that row. This page never signs or anchors anything: it produces a
 * CSV for the normal Bulk issue flow, where the issuer still previews and signs.
 */
export function Digitise() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>();
  const img = useRef<HTMLInputElement>(null);

  async function call(body: object) {
    setBusy(true);
    setError(undefined);
    setRows([]);
    try {
      const res = await fetch("/api/ai/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json()) as { draft?: string; error?: string };
      if (!res.ok || !j.draft) throw new Error(j.error ?? `HTTP ${res.status}`);
      const v = validateExtractedRows(j.draft);
      if (!v.ok) throw new Error(v.error);
      setRows(v.rows.map((r) => ({ ...r, ok: false })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickImage(f: File | undefined) {
    if (!f) return;
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("could not read the image"));
      r.readAsDataURL(f);
    });
    void call({ image: url });
  }

  const set = (i: number, k: keyof ExtractedRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, ok: false } : r)));
  const confirmed = rows.filter((r) => r.ok);

  function exportCsv() {
    const lines = [CSV_COLUMNS.join(","), ...confirmed.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","))];
    downloadFile("confirmed-certificates.csv", lines.join("\n") + "\n", "text/csv");
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="AI-assisted · draft only"
        title="Digitise paper certificates"
        sub="Upload a scan or paste text. An AI lists what is printed; you check and correct every row, tick it, and export a CSV for Bulk issue. Nothing is signed or anchored here. The AI never decides what is valid."
      />
      <Card className="p-6">
        <input ref={img} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="digitise-image" onChange={(e) => void pickImage(e.target.files?.[0])} />
        <Button variant="secondary" onClick={() => img.current?.click()} disabled={busy}>
          <ScanText className="h-4 w-4" aria-hidden /> Upload a scan (PNG/JPEG, up to 4 MB)
        </Button>
        <p className="mt-4 text-sm text-muted">or paste the typed text of one or more certificates:</p>
        <textarea className="mt-2 h-28 w-full rounded-xl border border-line bg-bg/60 p-3 text-sm" maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} data-testid="digitise-text" />
        <Button className="mt-3" disabled={busy || text.trim().length < 10} onClick={() => void call({ text })} data-testid="digitise-run">
          {busy ? "Reading…" : "Extract rows"}
        </Button>
        {error && <p role="alert" className="mt-3 text-sm text-bad" data-testid="digitise-error">{stripUnsafe(error)}</p>}
      </Card>
      {rows.length > 0 && (
        <Card className="mt-6 overflow-x-auto p-4" data-testid="digitise-rows">
          <p className="mb-3 text-sm"><Badge tone="warn">draft</Badge> Check every row against the paper. Editing a row clears its tick.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>{["Name", "Email", "Title", "Grade", "Issued", "Expires", "Confirmed"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line" data-testid="digitise-row">
                  {CSV_COLUMNS.map((c) => (
                    <td key={c} className="p-1"><Input aria-label={`${c} row ${i + 1}`} value={r[c]} onChange={(e) => set(i, c, e.target.value)} /></td>
                  ))}
                  <td className="p-2 text-center">
                    <input type="checkbox" aria-label={`Confirm row ${i + 1}`} checked={r.ok} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} data-testid="digitise-confirm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mt-4" disabled={confirmed.length === 0} onClick={exportCsv} data-testid="digitise-export">
            <Download className="h-4 w-4" aria-hidden /> Export {confirmed.length} confirmed row{confirmed.length === 1 ? "" : "s"} as CSV
          </Button>
          <p className="mt-2 text-xs text-muted">Then open Bulk issue and upload this CSV. You still preview and sign there.</p>
        </Card>
      )}
    </Page>
  );
}
