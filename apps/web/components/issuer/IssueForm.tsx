"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, PenLine, RotateCcw } from "lucide-react";
import { anchorSingle, casteDoc, enrolmentDoc, incomeDoc, ISSUER_TYPE_LABEL, prepareCertificate, singleProofFile, type IssuerKind, type ProofFile } from "@mohar/core";
import { Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { deployment } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useIssuer } from "./IssuerContext";
import { CertificatePreview } from "./CertificatePreview";
import { ArchiveBanner, ResultPanel } from "./ResultPanel";
import { StepProgress, type Progress } from "./Steps";
import { buildDoc, codeOf, explainError, linkFor, saveToArchive, validateCert, yieldFrame, type CertInput } from "./lib";
import { qrDataUrl } from "@/lib/qr";

const EMPTY: CertInput = { name: "", email: "", title: "", grade: "", issuedOn: "", expiresOn: "" };

/** Scholarship credential templates (synthetic demo data). Each one names the kind of issuer an officer expects. */
type Template = "generic" | "enrolment" | "caste" | "income";
const TEMPLATES: { id: Template; label: string; hint: string; needs?: IssuerKind; title: string }[] = [
  { id: "generic", label: "Certificate", hint: "Degree, course or award", title: "" },
  { id: "enrolment", label: "Enrolment", hint: "Issued by an institute", needs: "INSTITUTE", title: "Enrolment Certificate (DEMO)" },
  { id: "caste", label: "Caste", hint: "Issued by a revenue office", needs: "REVENUE_OFFICE", title: "Caste Certificate (DEMO)" },
  { id: "income", label: "Income", hint: "Issued by a revenue office", needs: "REVENUE_OFFICE", title: "Income Certificate (DEMO)" },
];
interface Extra {
  applicantId: string;
  instituteId: string;
  course: string;
  year: string;
  active: boolean;
  category: "ST" | "SC" | "OBC" | "GEN";
  officerRank: string;
  income: string;
}
const EXTRA0: Extra = { applicantId: "", instituteId: "", course: "", year: "", active: true, category: "ST", officerRank: "Tahsildar", income: "" };

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
  const [tpl, setTpl] = useState<Template>("generic");
  const [x, setX] = useState<Extra>(EXTRA0);
  const [touched, setTouched] = useState<Partial<Record<keyof CertInput, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [progress, setProgress] = useState<Progress>({ step: null, failed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ProofFile>();
  const [archived, setArchived] = useState(true);
  const [previewQr, setPreviewQr] = useState<string>();

  const tplMeta = TEMPLATES.find((t) => t.id === tpl)!;
  const errors = useMemo((): Record<string, string> => {
    if (tpl === "generic") return validateCert(v) as Record<string, string>;
    const e = validateCert({ ...v, title: tplMeta.title, grade: "" }) as Record<string, string>;
    if (!/^[A-Za-z0-9-]{3,32}$/.test(x.applicantId.trim())) e.applicantId = "Use 3 to 32 letters, digits or dashes, for example APP-0042.";
    if (tpl === "income" && !/^\d{1,9}$/.test(x.income.trim())) e.income = "Enter the annual income in whole rupees, digits only.";
    if (tpl === "enrolment" && !x.course.trim()) e.course = "Enter the course.";
    return e;
  }, [v, x, tpl, tplMeta.title]);
  const showErr = (k: keyof CertInput) => (touched[k] || submitted ? errors[k] : undefined);
  const xErr = (k: string) => (submitted ? errors[k] : undefined);
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
    setX(EXTRA0);
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
      const base = {
        issuer: { address: issuer.identity, domain: issuer.domain, name: issuer.name },
        applicantId: x.applicantId.trim(),
        name: v.name.trim(),
        issuedOn: v.issuedOn.trim(),
        expiresOn: v.expiresOn.trim() || null,
      };
      const doc =
        tpl === "enrolment"
          ? enrolmentDoc(base, { instituteId: x.instituteId.trim() || "-", course: x.course.trim(), year: x.year.trim() || "-", active: x.active })
          : tpl === "caste"
            ? casteDoc(base, { category: x.category, officerRank: x.officerRank.trim() || "-" })
            : tpl === "income"
              ? incomeDoc(base, { income: Number(x.income) })
              : buildDoc(v, issuer);
      const prepared = prepareCertificate(doc as any);
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
      title={tpl === "generic" ? v.title.trim() : tplMeta.title}
      grade={
        tpl === "generic"
          ? v.grade.trim()
          : tpl === "enrolment"
            ? [x.course.trim(), x.year.trim() && `year ${x.year.trim()}`].filter(Boolean).join(", ")
            : tpl === "caste"
              ? `Category ${x.category}`
              : "Income on file (private)"
      }
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
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Credential template">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tpl === t.id}
                disabled={busy || !!result}
                onClick={() => setTpl(t.id)}
                data-testid={`tpl-${t.id}`}
                className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors", tpl === t.id ? "border-gold/60 bg-gold/10" : "border-line bg-bg/30 hover:border-ink/25")}
              >
                <span className="block text-sm font-medium text-ink">{t.label}</span>
                <span className="block text-[0.68rem] leading-tight text-muted">{t.hint}</span>
              </button>
            ))}
          </div>
          {tplMeta.needs && issuer.issuerType !== tplMeta.needs && (
            <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-warn" data-testid="tpl-mismatch">
              You are listed as {ISSUER_TYPE_LABEL[issuer.issuerType].toLowerCase()}. A scholarship officer expects {tplMeta.label.toLowerCase()} credentials from a{" "}
              {ISSUER_TYPE_LABEL[tplMeta.needs].toLowerCase()}, so this one would fail with WRONG_ISSUER_TYPE. You can still issue it.
            </p>
          )}
          <form onSubmit={submit} noValidate className="mt-7 space-y-5" aria-label="Issue one certificate">
            <Field id={`${uid}-name`} label="Recipient name" error={showErr("name")}>
              <Input data-testid="f-recipient-name" autoComplete="off" placeholder="Rehaan Nawaz" {...fieldProps("name", `${uid}-name`)} />
            </Field>
            {tpl !== "generic" && (
              <Field id={`${uid}-app`} label="Applicant ID" error={xErr("applicantId")} hint="A pseudonymous ID the officer sees instead of the name. Use the same ID on all of one student's credentials.">
                <Input id={`${uid}-app`} data-testid="f-applicant-id" autoComplete="off" placeholder="APP-0042" value={x.applicantId} onChange={(e) => setX({ ...x, applicantId: e.target.value })} disabled={busy} />
              </Field>
            )}
            {tpl === "generic" && (
              <>
            <Field id={`${uid}-email`} label="Recipient email" optional error={showErr("email")} hint="Stored inside the certificate file only, never on chain.">
              <Input data-testid="f-recipient-email" type="email" autoComplete="off" placeholder="name@example.com" {...fieldProps("email", `${uid}-email`)} />
            </Field>
            <Field id={`${uid}-title`} label="Credential title" error={showErr("title")}>
              <Input data-testid="f-title" autoComplete="off" placeholder="B.E. in Artificial Intelligence" {...fieldProps("title", `${uid}-title`)} />
            </Field>
            <Field id={`${uid}-grade`} label="Grade" optional error={showErr("grade")} hint="For example 8.34 CGPA or First Class. Holders can hide it when sharing.">
              <Input data-testid="f-grade" autoComplete="off" placeholder="8.34 CGPA" {...fieldProps("grade", `${uid}-grade`)} />
            </Field>
              </>
            )}
            {tpl === "enrolment" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id={`${uid}-course`} label="Course" error={xErr("course")}>
                  <Input id={`${uid}-course`} placeholder="B.Tech" value={x.course} onChange={(e) => setX({ ...x, course: e.target.value })} disabled={busy} />
                </Field>
                <Field id={`${uid}-year`} label="Year" optional>
                  <Input id={`${uid}-year`} placeholder="2" value={x.year} onChange={(e) => setX({ ...x, year: e.target.value })} disabled={busy} />
                </Field>
                <Field id={`${uid}-inst`} label="Institute ID" optional>
                  <Input id={`${uid}-inst`} placeholder="INST-1042" value={x.instituteId} onChange={(e) => setX({ ...x, instituteId: e.target.value })} disabled={busy} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-muted sm:col-span-3">
                  <input type="checkbox" className="accent-[rgb(var(--gold))]" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} disabled={busy} />
                  Enrolment is active (signed as the flag <span className="font-mono text-xs text-ink">enrolment_active</span>)
                </label>
              </div>
            )}
            {tpl === "caste" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`${uid}-cat`} label="Category" hint="ST also sets the signed flag st_category.">
                  <Select id={`${uid}-cat`} value={x.category} onChange={(e) => setX({ ...x, category: e.target.value as Extra["category"] })} disabled={busy}>
                    {(["ST", "SC", "OBC", "GEN"] as const).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field id={`${uid}-rank`} label="Issuing officer rank" optional>
                  <Input id={`${uid}-rank`} value={x.officerRank} onChange={(e) => setX({ ...x, officerRank: e.target.value })} disabled={busy} />
                </Field>
              </div>
            )}
            {tpl === "income" && (
              <Field id={`${uid}-inc`} label="Annual family income (₹)" error={xErr("income")} hint="Stays private. The student shares only the signed flags: income at most ₹2.5 lakh, at most ₹6 lakh (demo thresholds).">
                <Input id={`${uid}-inc`} inputMode="numeric" placeholder="180000" value={x.income} onChange={(e) => setX({ ...x, income: e.target.value })} disabled={busy} />
              </Field>
            )}
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
