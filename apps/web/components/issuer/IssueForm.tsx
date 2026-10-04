"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, PenLine, RotateCcw } from "lucide-react";
import { anchorSingle, prepareCertificate, singleProofFile, type ProofFile } from "@mohar/core";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { deployment } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useIssuer } from "./IssuerContext";
import { CertificatePreview } from "./CertificatePreview";
import { ArchiveBanner, ResultPanel } from "./ResultPanel";
import { StepProgress, type Progress } from "./Steps";
import { buildDoc, codeOf, explainError, linkFor, saveToArchive, validateCert, yieldFrame, type CertInput } from "./lib";
import { qrDataUrl } from "@/lib/qr";

const EMPTY: CertInput = { name: "", email: "", title: "", grade: "", issuedOn: "", expiresOn: "" };

function Field({ id, label, hint, error, optional, children }: { id: string; label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal text-muted/80">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function IssueForm() {
  const { issuer, writer, address } = useIssuer();
  const reduce = useReducedMotion();
  const uid = useId();
  const [v, setV] = useState<CertInput>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof CertInput, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [progress, setProgress] = useState<Progress>({ step: null, failed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ProofFile>();
  const [archived, setArchived] = useState(true);
  const [previewQr, setPreviewQr] = useState<string>();

  const errors = useMemo(() => validateCert(v), [v]);
  const showErr = (k: keyof CertInput) => (touched[k] || submitted ? errors[k] : undefined);
  const set = (k: keyof CertInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const blur = (k: keyof CertInput) => () => setTouched((t) => ({ ...t, [k]: true }));
  const fieldProps = (k: keyof CertInput, id: string) => ({
    id,
    value: v[k],
    onChange: set(k),
    onBlur: blur(k),
    "aria-invalid": showErr(k) ? true : undefined,
    "aria-describedby": showErr(k) ? `${id}-err` : `${id}-hint`,
    disabled: busy,
  });

  useEffect(() => {
    if (!result) return setPreviewQr(undefined);
    qrDataUrl(linkFor(result), 200).then(setPreviewQr);
  }, [result]);

  if (!issuer) return null;

  const reset = () => {
    setV(EMPTY);
    setTouched({});
    setSubmitted(false);
    setProgress({ step: null, failed: false });
    setResult(undefined);
    setError(undefined);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(undefined);
    if (Object.keys(errors).length > 0 || !writer) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    setBusy(true);
    let current: Progress = { step: "hashing", failed: false };
    setProgress(current);
    const upd = (p: Partial<Progress>) => setProgress((current = { ...current, ...p }));
    try {
      await yieldFrame();
      const prepared = prepareCertificate(buildDoc(v, issuer) as any);
      const out = await anchorSingle(writer, prepared, (step, detail) => {
        upd({ step, txHash: step === "pending" || step === "confirmed" ? detail : current.txHash });
      });
      const file = singleProofFile(deployment, out.signer, prepared, out.txHash);
      setArchived(saveToArchive(issuer.identity, [file]));
      setResult(file);
    } catch (err) {
      upd({ failed: true });
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  };

  const started = progress.step !== null;
  const preview = (
    <CertificatePreview
      issuerName={issuer.name}
      issuerDomain={issuer.domain}
      recipient={v.name.trim()}
      title={v.title.trim()}
      grade={v.grade.trim()}
      issuedOn={v.issuedOn}
      expiresOn={v.expiresOn}
      code={result ? codeOf(result) : undefined}
      qr={previewQr}
    />
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr),minmax(0,1.15fr)] xl:gap-8">
        <Card className="rounded-3xl p-5 sm:p-8">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">Single issuance</p>
          <h1 className="mt-2 font-serif text-4xl leading-[1] tracking-tight sm:text-5xl">Issue a certificate</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Issuing as <strong className="text-ink">{issuer.name}</strong>. Fields are salted and hashed in your browser; only the Merkle root reaches the chain, never personal data.
          </p>
          <form onSubmit={submit} noValidate className="mt-7 space-y-5" aria-label="Issue one certificate">
            <Field id={`${uid}-name`} label="Recipient name" error={showErr("name")}>
              <Input data-testid="f-recipient-name" autoComplete="off" placeholder="Rehaan Nawaz" {...fieldProps("name", `${uid}-name`)} />
            </Field>
            <Field id={`${uid}-email`} label="Recipient email" optional error={showErr("email")} hint="Stored inside the certificate file only, never on chain.">
              <Input data-testid="f-recipient-email" type="email" autoComplete="off" placeholder="name@example.com" {...fieldProps("email", `${uid}-email`)} />
            </Field>
            <Field id={`${uid}-title`} label="Credential title" error={showErr("title")}>
              <Input data-testid="f-title" autoComplete="off" placeholder="B.E. in Artificial Intelligence" {...fieldProps("title", `${uid}-title`)} />
            </Field>
            <Field id={`${uid}-grade`} label="Grade" optional error={showErr("grade")} hint="For example 8.34 CGPA or First Class. Holders can hide it when sharing.">
              <Input data-testid="f-grade" autoComplete="off" placeholder="8.34 CGPA" {...fieldProps("grade", `${uid}-grade`)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${uid}-issued`} label="Issued on" error={showErr("issuedOn")}>
                <Input data-testid="f-issued-on" type="date" {...fieldProps("issuedOn", `${uid}-issued`)} />
              </Field>
              <Field id={`${uid}-expires`} label="Expires on" optional error={showErr("expiresOn")} hint="Leave blank if it never expires.">
                <Input data-testid="f-expires-on" type="date" {...fieldProps("expiresOn", `${uid}-expires`)} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" variant="seal" size="lg" disabled={busy || !!result} data-testid="sign-anchor" className="w-full sm:w-auto sm:min-w-[220px]">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <PenLine className="h-5 w-5" aria-hidden />}
                {busy ? "Working" : "Sign & Anchor"}
              </Button>
              {submitted && Object.keys(errors).length > 0 && !busy && (
                <p role="alert" className="text-sm text-bad">
                  Fix the highlighted fields to continue.
                </p>
              )}
            </div>
          </form>
        </Card>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="mb-3 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-gold/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
            </span>
            Live preview
          </p>
          {preview}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(started || error) && (
          <motion.div
            key="progress"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <Card className="rounded-3xl p-5 sm:p-7" data-testid="progress-card">
              <h2 className="mb-5 font-serif text-3xl leading-tight">Sign &amp; anchor</h2>
              <StepProgress progress={progress} />
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
        {result && (
          <motion.div
            key="result"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="space-y-4"
          >
            <Card className={cn("relative overflow-hidden rounded-3xl border-ok/30 p-5 sm:p-8")}>
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-ok/15 blur-3xl" />
              <div className="relative mb-6 flex items-center gap-3 text-ok">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok text-bg shadow-[0_0_40px_-6px_rgb(52_211_153/0.7)]">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </span>
                <h2 className="font-serif text-4xl leading-none text-ink">Sealed on chain</h2>
              </div>
              <ResultPanel file={result} />
              <div className="relative mt-6 border-t border-line pt-5">
                <Button variant="secondary" onClick={reset} data-testid="issue-another">
                  <RotateCcw className="h-4 w-4" aria-hidden /> Issue another
                </Button>
              </div>
            </Card>
            <ArchiveBanner identity={issuer.identity} saved={archived} />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">{address}</span>
    </div>
  );
}
