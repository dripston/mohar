"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import JSZip from "jszip";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, PackageOpen, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { anchorBatch, batchProofFiles, buildBatch, prepareCertificate, proofFileToJson, type PreparedBatch, type PreparedCert, type ProofFile } from "@mohar/core";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { deployment } from "@/lib/config";
import { createCertificatePdf } from "@/lib/pdf";
import { cn, downloadFile } from "@/lib/utils";
import { useIssuer } from "./IssuerContext";
import { ArchiveBanner } from "./ResultPanel";
import { StepProgress, type Progress } from "./Steps";
import { TEMPLATE_CSV, csvEscape, decodeCsvBytes, rowIssues, rowsFromCsv, type BulkRow } from "./csv";
import { buildDoc, certIdOf, codeOf, explainError, fieldValue, linkFor, saveToArchive, validateCert, yieldFrame, type CertErrors } from "./lib";

export const MAX_BATCH = 1000;
const PAGE = 50;

const COLS: { k: keyof BulkRow & string; label: string; type?: string; w: string }[] = [
  { k: "name", label: "Recipient", w: "md:min-w-[9rem]" },
  { k: "email", label: "Email", w: "md:min-w-[9rem]" },
  { k: "title", label: "Title", w: "md:min-w-[10rem]" },
  { k: "grade", label: "Grade", w: "md:min-w-[5rem]" },
  { k: "issuedOn", label: "Issued on", w: "md:min-w-[7.5rem]" },
  { k: "expiresOn", label: "Expires on", w: "md:min-w-[7.5rem]" },
];

interface Done {
  files: ProofFile[];
  txHash: string;
  gasUsed: bigint;
  gasPerCert: number;
  saved: boolean;
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "certificate";

export function Bulk() {
  const { issuer, writer } = useIssuer();
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<BulkRow[]>();
  const [fileName, setFileName] = useState<string>();
  const [fileErr, setFileErr] = useState<string>();
  const [drag, setDrag] = useState(false);
  const [onlyBad, setOnlyBad] = useState(false);
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<Progress>({ step: null, failed: false });
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Done>();
  const [zip, setZip] = useState<{ n: number; total: number; stage: string } | null>(null);
  const [zipErr, setZipErr] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const errors = useMemo<CertErrors[]>(() => {
    const rs = rows ?? [];
    const issues = rowIssues(rs);
    return rs.map((r, i) => {
      const e = validateCert(r);
      for (const k of Object.keys(e) as (keyof CertErrors)[]) if (e[k] === undefined) delete e[k];
      if (issues[i] && !e.name) e.name = issues[i];
      return e;
    });
  }, [rows]);
  const invalid = errors.filter((e) => Object.keys(e).length > 0).length;
  const valid = (rows?.length ?? 0) - invalid;

  const ingest = useCallback(async (f: File | undefined) => {
    if (!f) return;
    setFileErr(undefined);
    if (f.size > 8 * 1024 * 1024) return setFileErr("That file is larger than 8 MB. Split it into smaller CSV files.");
    try {
      const dec = decodeCsvBytes(await f.arrayBuffer());
      if ("error" in dec) return setFileErr(dec.error);
      const res = rowsFromCsv(dec.text);
      if ("error" in res) return setFileErr(res.error);
      setRows(res.rows);
      setFileName(f.name);
      setPage(0);
      setOnlyBad(false);
    } catch {
      setFileErr("Could not read that file. Make sure it is a plain CSV (UTF-8).");
    }
  }, []);

  if (!issuer) return null;

  const patch = (key: number, k: string, v: string) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const remove = (key: number) => setRows((rs) => rs?.filter((r) => r.key !== key));

  const reset = () => {
    setRows(undefined);
    setFileName(undefined);
    setDone(undefined);
    setProgress({ step: null, failed: false });
    setError(undefined);
    setZip(null);
    setZipErr(undefined);
  };

  const anchor = async () => {
    if (!rows || !writer || invalid > 0 || rows.length > MAX_BATCH) return;
    setBusy(true);
    setError(undefined);
    let current: Progress = { step: "hashing", failed: false };
    setProgress(current);
    const upd = (p: Partial<Progress>) => setProgress((current = { ...current, ...p }));
    try {
      const certs: PreparedCert[] = [];
      for (let i = 0; i < rows.length; i++) {
        certs.push(prepareCertificate(buildDoc(rows[i]!, issuer) as any));
        if (i % 20 === 19) {
          setNote(`Hashing ${i + 1} of ${rows.length}`);
          await yieldFrame();
        }
      }
      setNote(`Hashed ${rows.length} certificates`);
      const { batchRoot, proofs } = buildBatch(certs.map((c) => ({ documentRoot: c.built.documentRoot, expiresAt: c.expiresAt })));
      const batch: PreparedBatch = { batchRoot, certs, proofs };
      const out = await anchorBatch(writer, batch, (step, detail) => upd({ step, txHash: step === "pending" || step === "confirmed" ? detail : current.txHash }));
      const files = batchProofFiles(deployment, out.signer, batch, out.txHash);
      const saved = saveToArchive(issuer.identity, files);
      setDone({ files, txHash: out.txHash, gasUsed: out.gasUsed, gasPerCert: out.gasPerCert, saved });
    } catch (e) {
      upd({ failed: true });
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  const buildZip = async () => {
    if (!done) return;
    setZipErr(undefined);
    const total = done.files.length;
    setZip({ n: 0, total, stage: "Rendering certificates" });
    try {
      const z = new JSZip();
      const manifest = ["short_code,recipient_name,recipient_email,title,grade,issued_on,expires_on,verify_link,pdf_file,json_file,cert_id"];
      const used = new Set<string>();
      for (let i = 0; i < total; i++) {
        const f = done.files[i]!;
        const code = codeOf(f);
        let base = `${slug(fieldValue(f, "recipient.name"))}-${code}`;
        while (used.has(base)) base += "_";
        used.add(base);
        const link = linkFor(f);
        z.file(`certificates/${base}.pdf`, await createCertificatePdf(f, link));
        z.file(`proofs/${base}.mohar.json`, proofFileToJson(f));
        manifest.push(
          [code, fieldValue(f, "recipient.name"), fieldValue(f, "recipient.email"), fieldValue(f, "credential.title"), fieldValue(f, "credential.grade"), fieldValue(f, "credential.issuedOn"), fieldValue(f, "credential.expiresOn"), link, `certificates/${base}.pdf`, `proofs/${base}.mohar.json`, certIdOf(f)]
            .map(csvEscape)
            .join(","),
        );
        if (i % 3 === 2 || i === total - 1) {
          setZip({ n: i + 1, total, stage: "Rendering certificates" });
          await yieldFrame();
        }
      }
      z.file("manifest.csv", manifest.join("\n"));
      setZip({ n: total, total, stage: "Compressing" });
      await yieldFrame();
      const blob = await z.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });
      downloadFile(`mohar-batch-${done.files.length}-certificates.zip`, blob, "application/zip");
      setZip(null);
    } catch (e) {
      setZip(null);
      setZipErr(explainError(e));
    }
  };

  const view = (rows ?? []).map((r, i) => ({ r, e: errors[i]!, i })).filter((x) => !onlyBad || Object.keys(x.e).length > 0);
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = view.slice(cur * PAGE, cur * PAGE + PAGE);
  const tooMany = (rows?.length ?? 0) > MAX_BATCH;
  const n = rows?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">One root · one transaction</p>
        <h1 className="mt-2 font-serif text-4xl leading-none tracking-tight sm:text-5xl">Bulk issuance</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
          Upload a CSV and anchor every certificate with a single transaction. One Merkle root covers the whole batch, so the cost per certificate drops as the batch grows.
        </p>
      </div>

      {!rows && !done && (
        <Card className="rounded-3xl p-3 sm:p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void ingest(e.dataTransfer.files[0]);
            }}
            className={cn("relative grid place-items-center gap-3 overflow-hidden rounded-2xl border border-dashed p-8 text-center transition-all sm:p-16", drag ? "scale-[1.01] border-gold bg-gold/[0.07]" : "border-line bg-bg/40")}
          >
            <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-line bg-raised shadow-[0_0_50px_-10px_rgb(221_182_104/0.5)]">
              <UploadCloud className="h-8 w-8 text-gold" aria-hidden />
            </span>
            <p className="relative mt-2 font-serif text-4xl">Drop your CSV here</p>
            <p className="relative max-w-md text-sm text-muted">
              Columns: <span className="font-mono text-xs">recipient_name, recipient_email, title, grade, issued_on, expires_on</span>. Dates look like 2026-06-01. Email, grade and expires_on may be empty.
            </p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" data-testid="bulk-file" aria-label="Upload CSV file" onChange={(e) => void ingest(e.target.files?.[0])} />
            <div className="relative mt-2 flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden /> Choose CSV file
              </Button>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV + "\n")}`}
                download="mohar-bulk-template.csv"
                data-testid="bulk-template"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-raised/70 px-4 text-sm font-medium hover:bg-raised"
              >
                <Download className="h-4 w-4" aria-hidden /> Download template
              </a>
            </div>
          </div>
          <div aria-live="assertive">
            {fileErr && (
              <p role="alert" data-testid="bulk-file-error" className="mt-4 flex items-start gap-2 rounded-xl bg-bad/10 p-3 text-sm text-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {fileErr}
              </p>
            )}
          </div>
        </Card>
      )}

      {rows && !done && (
        <Card className="overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fileName}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm" data-testid="bulk-counts" aria-live="polite">
                <Badge tone="ok" className="tabular-nums">
                  <span data-testid="bulk-valid">{valid}</span> valid
                </Badge>
                <Badge tone={invalid ? "bad" : "neutral"} className="tabular-nums">
                  <span data-testid="bulk-invalid">{invalid}</span> need fixing
                </Badge>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyBad}
                  onChange={(e) => {
                    setOnlyBad(e.target.checked);
                    setPage(0);
                  }}
                  className="h-4 w-4 accent-[rgb(var(--seal))]"
                />
                Only rows to fix
              </label>
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Start over
              </Button>
            </div>
          </div>

          {tooMany && (
            <p role="alert" className="border-b border-line bg-warn/10 p-3 text-sm text-warn" data-testid="bulk-too-many">
              This file has {n} rows. One batch holds at most {MAX_BATCH}; remove {n - MAX_BATCH} rows or split the file, then upload again.
            </p>
          )}

          <table data-testid="bulk-table" className="block w-full text-left text-sm md:table">
            <thead className="hidden border-b border-line bg-bg/40 text-[0.65rem] uppercase tracking-[0.16em] text-muted md:table-header-group">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                {COLS.map((c) => (
                  <th key={c.k} className="px-2 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {slice.map(({ r, e, i }) => {
                const bad = Object.keys(e).length > 0;
                return (
                  <tr key={r.key} data-testid={`bulk-row-${i}`} data-valid={!bad} className={cn("block border-b border-line p-3 md:table-row md:p-0", bad && "bg-bad/5")}>
                    <td className="block px-1 py-1 text-xs tabular-nums text-muted md:table-cell md:px-3 md:py-1.5">
                      <span className="md:hidden">Row </span>
                      {i + 1}
                    </td>
                    {COLS.map((c) => {
                      const err = e[c.k as keyof CertErrors];
                      const id = `bulk-${r.key}-${c.k}`;
                      return (
                        <td key={c.k} className="block px-1 py-1 md:table-cell md:px-1.5 md:py-1.5 md:align-top">
                          <label htmlFor={id} className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted md:sr-only">
                            {c.label}
                          </label>
                          <input
                            id={id}
                            value={r[c.k] as string}
                            onChange={(ev) => patch(r.key, c.k, ev.target.value)}
                            aria-invalid={err ? true : undefined}
                            aria-describedby={err ? `${id}-e` : undefined}
                            disabled={busy}
                            placeholder={c.k === "issuedOn" || c.k === "expiresOn" ? "YYYY-MM-DD" : undefined}
                            className={cn(
                              "h-9 w-full rounded-lg border bg-bg/50 px-2 text-sm text-ink placeholder:text-muted/50 focus:border-gold/60 focus:outline-none",
                              c.w,
                              err ? "border-bad bg-bad/10" : "border-line",
                            )}
                          />
                          {err && (
                            <p id={`${id}-e`} className="mt-0.5 max-w-[16rem] text-[11px] leading-tight text-bad">
                              {err}
                            </p>
                          )}
                        </td>
                      );
                    })}
                    <td className="block px-1 py-1 md:table-cell md:px-2 md:py-1.5 md:align-top">
                      <button
                        type="button"
                        onClick={() => remove(r.key)}
                        disabled={busy}
                        aria-label={`Remove row ${i + 1}`}
                        className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-bad disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {slice.length === 0 && (
                <tr className="block md:table-row">
                  <td colSpan={8} className="block p-8 text-center text-muted md:table-cell">
                    {n === 0 ? "No rows left in this batch." : "No rows need fixing."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line p-3 text-sm">
              <Button variant="secondary" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                Previous
              </Button>
              <span className="text-muted tabular-nums">
                Page {cur + 1} of {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
                Next
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line bg-bg/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-sm text-muted">
              {invalid > 0 ? `Fix the ${invalid} highlighted row${invalid > 1 ? "s" : ""} (or remove them) to continue.` : n === 0 ? "Add rows by uploading another file." : "All rows are valid. One signature, one transaction."}
            </p>
            <Button variant="seal" size="lg" disabled={busy || invalid > 0 || n === 0 || tooMany} onClick={anchor} data-testid="bulk-anchor" className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <PackageOpen className="h-5 w-5" aria-hidden />}
              Sign & Anchor {n} certificate{n === 1 ? "" : "s"} in 1 transaction
            </Button>
          </div>
        </Card>
      )}

      <AnimatePresence initial={false}>
        {(progress.step || error) && (
          <motion.div key="p" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Card className="rounded-3xl p-5 sm:p-7" data-testid="progress-card">
              <h2 className="mb-5 font-serif text-3xl leading-tight">Sign &amp; anchor</h2>
              <StepProgress progress={progress} hashingNote={note} />
              <div aria-live="assertive">
                {error && (
                  <div role="alert" data-testid="issue-error" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
                    {error}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {done && (
          <motion.div key="d" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="space-y-4">
            <Card className="relative overflow-hidden rounded-3xl border-ok/30 p-5 sm:p-8" data-testid="bulk-result">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-ok/15 blur-3xl" />
              <div className="relative mb-6 flex items-center gap-3 text-ok">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok text-bg shadow-[0_0_40px_-6px_rgb(52_211_153/0.7)]">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </span>
                <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
                  {done.files.length} certificates anchored in 1 transaction
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-line bg-bg/50 p-5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Certificates</p>
                  <p className="mt-2 font-serif text-5xl leading-none tabular-nums" data-testid="bulk-count">
                    {done.files.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-bg/50 p-5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Total gas used</p>
                  <p className="mt-2 font-serif text-5xl leading-none tabular-nums" data-testid="gas-used">
                    {done.gasUsed.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="rounded-2xl border border-gold/40 bg-gold/[0.07] p-5 shadow-[0_0_50px_-20px_rgb(221_182_104/0.6)]">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-gold">Gas per certificate</p>
                  <p className="mt-2 font-serif text-5xl leading-none tabular-nums text-gold" data-testid="gas-per-cert">
                    {Math.round(done.gasPerCert).toLocaleString("en-US")}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={buildZip} disabled={!!zip} data-testid="bulk-zip">
                  {zip ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
                  {zip ? "Preparing ZIP" : "Download ZIP (PDFs, JSON, manifest.csv)"}
                </Button>
                <Link href="/issuer/dashboard" className="inline-flex h-12 items-center rounded-xl border border-line bg-raised/70 px-5 text-sm font-medium hover:bg-raised">
                  Open registry
                </Link>
                <Button variant="ghost" onClick={reset} disabled={!!zip}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Issue another batch
                </Button>
              </div>
              <div aria-live="polite" className="mt-4">
                {zip && (
                  <div data-testid="zip-progress">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{zip.stage}</span>
                      <span className="tabular-nums">
                        {zip.n} / {zip.total}
                      </span>
                    </div>
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={zip.total} aria-valuenow={zip.n} aria-label="ZIP preparation" className="h-2 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-gradient-to-r from-gold to-seal transition-[width] duration-150" style={{ width: `${(zip.n / zip.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                {zipErr && (
                  <p role="alert" className="text-sm text-bad">
                    {zipErr}
                  </p>
                )}
              </div>
              <div className="mt-4">
                <StepProgress progress={progress} hashingNote={note} />
              </div>
            </Card>
            <ArchiveBanner identity={issuer.identity} saved={done.saved} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
