"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FileUp, Hash, Info, Link2, RefreshCw, RotateCcw, ScanSearch, Layers, FileCheck2 } from "lucide-react";
import type { Mode, VerifyResult } from "@mohar/core";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Checklist, ChecklistSkeleton } from "./Checklist";
import { FieldsCard } from "./FieldsCard";
import { IndependentPanel } from "./IndependentPanel";
import { MODES, VERDICTS, toneClasses } from "./meta";

export type ShownResult = VerifyResult & { needsLink?: boolean; note?: string };

const MODE_ICON: Record<Mode, typeof Link2> = { link: Link2, full: FileCheck2, partial: Layers, code: Hash };

export function ResultSkeleton({ what }: { what: string }) {
  return (
    <div data-testid="verify-loading" className="space-y-5" role="status">
      <span className="sr-only">Verifying {what} against the blockchain</span>
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-3/4" />
          </div>
        </div>
        <Skeleton className="mt-5 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <p className="mt-5 text-sm text-muted" aria-hidden>
          Verifying {what}: asking independent providers to read the chain…
        </p>
      </Card>
      <ChecklistSkeleton />
    </div>
  );
}

export function ResultView({
  result,
  onRetry,
  onUpload,
  onReset,
}: {
  result: ShownResult;
  onRetry: () => void;
  onUpload: () => void;
  onReset: () => void;
}) {
  const reduce = useReducedMotion();
  const meta = VERDICTS[result.verdict];
  const tone = toneClasses[meta.tone];
  const Icon = meta.icon;
  const mode = MODES[result.mode];
  const ModeIcon = MODE_ICON[result.mode];
  const isCodeMode = result.mode === "code";
  const showUploadCta =
    result.mode === "link" && !["MALFORMED", "CANNOT_REACH_CHAIN", "WRONG_CHAIN"].includes(result.verdict);
  const showChecks = result.verdict !== "MALFORMED";
  const showPanel = result.verdict !== "MALFORMED";
  const statusDetail =
    result.verdict === "REVOKED" || result.verdict === "SUSPENDED" || result.verdict === "EXPIRED" ? result.checks[4]?.detail : undefined;
  const sub =
    isCodeMode && result.verdict === "NOT_FOUND"
      ? "No single-issued certificate on chain has this code. Batch certificates cannot be found by code alone."
      : meta.sub;

  return (
    <div className="space-y-5">
      <motion.section
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
        data-testid="verdict"
        data-verdict={result.verdict}
        data-mode={result.mode}
        aria-label={`Verdict: ${result.headline}`}
        className={cn("rounded-2xl border-2 p-5 sm:p-7", tone.box)}
      >
        <div className="flex items-start gap-4">
          <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", tone.solid)}>
            <Icon className="h-8 w-8" aria-hidden strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className={cn("text-xs font-semibold uppercase tracking-[0.16em]", tone.text)} data-testid="verdict-label">
              {meta.label}
            </p>
            <h2 className="mt-1 break-words font-serif text-3xl leading-tight text-ink sm:text-4xl" data-testid="verdict-headline">
              {result.headline}
            </h2>
          </div>
        </div>

        <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/90">{sub}</p>
        {statusDetail && (
          <p className="mt-2 rounded-lg bg-surface/70 px-3 py-2 text-sm font-medium text-ink" data-testid="verdict-detail">
            {statusDetail}
          </p>
        )}

        {result.issuer && (
          <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-line/70 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Issuer</dt>
              <dd className="font-serif text-lg text-ink" data-testid="issuer-name">
                {result.issuer.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Domain</dt>
              <dd className="break-all text-ink">{result.issuer.domain}</dd>
            </div>
            {result.code && (
              <div>
                <dt className="text-xs text-muted">Verification code</dt>
                <dd className="break-all font-mono text-[0.85rem] text-ink" data-testid="result-code">
                  {result.code}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span
            data-testid="mode-chip"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink"
          >
            <ModeIcon className="h-3.5 w-3.5" aria-hidden />
            {mode.label}
          </span>
          <span className="text-xs text-muted">{mode.hint}</span>
        </div>

        {result.verdict === "CANNOT_REACH_CHAIN" && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={onRetry} data-testid="verify-retry">
              <RefreshCw className="h-4 w-4" aria-hidden /> Retry
            </Button>
            <p className="self-center text-xs text-muted">
              Asked {result.providers?.asked ?? 0} provider{result.providers?.asked === 1 ? "" : "s"}, {result.providers?.agreed ?? 0} agreed.
            </p>
          </div>
        )}
      </motion.section>

      {showUploadCta && (
        <Card className="flex flex-col gap-3 border-seal/40 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="link-cta">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-seal/12 text-seal">
            <ScanSearch className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">Issuer and status verified. Upload the certificate file to verify its contents.</p>
            <p className="mt-1 text-sm text-muted">
              A link or QR code proves who issued a certificate, not that the printed name and grade are unaltered. Drop the PDF or proof
              file to check every field.
            </p>
          </div>
          <Button variant="secondary" onClick={onUpload} data-testid="link-cta-upload" className="shrink-0">
            <FileUp className="h-4 w-4" aria-hidden /> Choose file
          </Button>
        </Card>
      )}

      {isCodeMode && (
        <Card className="flex gap-3 p-4 sm:p-5" data-testid="code-note">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div className="text-sm leading-relaxed text-muted">
            <p className="font-medium text-ink">A code identifies a certificate. It cannot prove what the document says.</p>
            <p className="mt-1">
              {result.needsLink
                ? "Batch-issued certificates are not individually listed on chain, so a code alone cannot find them. Open the certificate's full link, scan its QR code, or upload the file instead."
                : "For the full picture, open the certificate's link or upload its PDF or proof file."}
            </p>
          </div>
        </Card>
      )}

      {result.note && (
        <Card className="flex gap-3 p-4" data-testid="result-note">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p className="text-sm leading-relaxed text-ink">{result.note}</p>
        </Card>
      )}

      {showChecks && (
        <section aria-label="Trust checklist">
          <h3 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Five-point trust check</h3>
          <Checklist checks={result.checks} />
        </section>
      )}

      {result.fields && result.fields.length > 0 && <FieldsCard fields={result.fields} hidden={result.hiddenFields} />}

      {showPanel && <IndependentPanel result={result} />}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted">
          Checked {new Date(result.verifiedAt * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Read directly
          from the chain in your browser, never through our servers.
        </p>
        <Button variant="ghost" size="sm" onClick={onReset} data-testid="verify-reset">
          <RotateCcw className="h-4 w-4" aria-hidden /> Verify another
        </Button>
      </div>
    </div>
  );
}
