"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, FileJson, FileText, Link2, Loader2 } from "lucide-react";
import { fitsQr, proofFileToJson, type ProofFile } from "@mohar/core";
import { Button, Mono } from "@/components/ui/primitives";
import { createCertificatePdf } from "@/lib/pdf";
import { qrDataUrl } from "@/lib/qr";
import { downloadFile } from "@/lib/utils";
import { fieldValue, linkFor, codeOf, loadArchive } from "./lib";
import { CopyButton } from "./IssuerGate";
import { explainError } from "./lib";

export function ArchiveBanner({ identity, saved = true }: { identity: string; saved?: boolean }) {
  const exportArchive = () => {
    const all = loadArchive(identity);
    downloadFile(`mohar-archive-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), "application/json");
  };
  return (
    <div role="note" data-testid="archive-banner" className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
        <p className="text-sm">
          <strong>Keep a backup of your archive.</strong> Each certificate&apos;s secret salts exist only in its proof file and cannot be regenerated. This browser keeps a copy
          {saved ? "" : " (but storing it here failed, so download the files now)"}; export it regularly so you can still revoke or re-issue copies later.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={exportArchive} data-testid="export-archive" className="shrink-0 self-start sm:self-auto">
        <Download className="h-4 w-4" aria-hidden /> Export archive (.json)
      </Button>
    </div>
  );
}

/** Everything the issuer needs after anchoring one certificate. */
export function ResultPanel({ file }: { file: ProofFile }) {
  const link = linkFor(file);
  const code = codeOf(file);
  const [qr, setQr] = useState<string>();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    let live = true;
    if (!fitsQr(link)) {
      setErr("The verify link is too long for a reliable QR code, so only the link and files are offered.");
      return;
    }
    qrDataUrl(link, 360).then((u) => live && setQr(u));
    return () => {
      live = false;
    };
  }, [link]);

  const name = fieldValue(file, "recipient.name").replace(/[^\w.-]+/g, "_") || "certificate";

  const pdf = async () => {
    setPdfBusy(true);
    setErr(undefined);
    try {
      const bytes = await createCertificatePdf(file, link);
      downloadFile(`${name}-${code}.pdf`, bytes as unknown as BlobPart, "application/pdf");
    } catch (e) {
      setErr(explainError(e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div data-testid="result-panel" className="grid gap-5 sm:grid-cols-[auto,1fr]">
      <div className="mx-auto grid place-items-center rounded-xl bg-white p-3 sm:mx-0">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code that opens the verify page for ${code}`} data-testid="qr-image" className="h-44 w-44" />
        ) : (
          <div className="grid h-44 w-44 place-items-center text-muted">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Verification code</p>
          <p className="mt-1 break-all font-mono text-xl font-semibold tracking-wide sm:text-2xl" data-testid="short-code">
            {code}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Verify link</p>
          <a href={link} data-testid="verify-link" target="_blank" rel="noreferrer" className="mt-1 block max-h-16 overflow-hidden break-all text-sm text-seal underline-offset-2 hover:underline">
            <Mono>{link}</Mono>
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={pdf} disabled={pdfBusy} data-testid="download-pdf">
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
            Download PDF
          </Button>
          <Button variant="secondary" data-testid="download-json" onClick={() => downloadFile(`${name}-${code}.mohar.json`, proofFileToJson(file), "application/json")}>
            <FileJson className="h-4 w-4" aria-hidden /> Download JSON
          </Button>
          <CopyButton text={link} label="Copy link" testId="copy-link" className="!h-10 !px-4 !text-sm" />
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-raised hover:text-ink">
            <Link2 className="h-4 w-4" aria-hidden /> Open verify page
          </a>
        </div>
        <p className="text-xs text-muted">The PDF embeds the full proof file, so dropping it on the verifier checks every field. The QR and link prove issuer and status.</p>
        {err && (
          <p role="alert" className="text-sm text-bad">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
