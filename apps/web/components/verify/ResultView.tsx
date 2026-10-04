"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FileCheck2, FileUp, Hash, Info, Layers, Link2, RefreshCw, RotateCcw, ScanSearch } from "lucide-react";
import type { Mode, VerifyResult } from "@mohar/core";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { deployment } from "@/lib/config";
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
      <Card className="relative overflow-hidden rounded-3xl p-6 sm:p-9">
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="h-full w-1/3 animate-[marquee_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-gold to-transparent" />
        </div>
        <div className="flex items-center gap-5">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center">
            <span className="absolute inset-0 animate-ping-slow rounded-full bg-gold/20" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </div>
        <p className="mt-6 text-sm text-muted" aria-hidden>
          Verifying <span className="text-ink">{what}</span>: asking independent providers to read the chain…
        </p>
      </Card>
      <ChecklistSkeleton />
    </div>
  );
}

const GLOW: Record<string, string> = {
  ok: "from-ok/25",
  warn: "from-warn/20",
  bad: "from-bad/25",
  neutral: "from-muted/10",
};

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
    result.verdict === "CANNOT_REACH_CHAIN" && result.unreachable === "split"
      ? "The independent providers gave different answers and none had a majority, so we are not giving a verdict. This is not a sign the certificate is bad. Wait a few seconds and retry."
      : isCodeMode && result.verdict === "NOT_FOUND"
        ? result.headline === "This code is ambiguous"
          ? "More than one certificate shares this code, so a code alone cannot say which one you hold. Open the certificate's full link or upload its file."
          : "No single-issued certificate on chain has this code. Batch certificates cannot be found by code alone."
        : meta.sub;
  const p = result.providers;
  const providerNote =
    p && p.asked > 1 && result.verdict !== "CANNOT_REACH_CHAIN" && (p.degraded || p.stale > 0 || p.down > 0 || p.dissent > 0)
      ? p.degraded
        ? `Only ${p.agreed} of ${p.asked} chain providers could vouch for this answer (${p.down} unreachable, ${p.stale} behind, ${p.dissent} disagreed). Treat it with extra care and retry.`
        : `${p.agreed} of ${p.asked} chain providers agree. ${[p.down ? `${p.down} unreachable` : "", p.stale ? `${p.stale} behind` : "", p.dissent ? `${p.dissent} disagreed` : ""].filter(Boolean).join(", ")}.`
      : null;
  const ct = result.chainTime;
  const chainLagMin = ct ? Math.round((result.verifiedAt - ct.timestamp) / 60) : 0;
  const stalledNote =
    ct && deployment.chainId !== 31337 && chainLagMin > 10
      ? `The latest block the providers could give us is ${chainLagMin} minutes old, so the network or these providers may be stalled. Status and expiry were judged at that block.`
      : null;
  const hasFields = !!result.fields && result.fields.length > 0;

  return (
    <div className="space-y-5">
      <motion.section
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        data-testid="verdict"
        data-verdict={result.verdict}
        data-mode={result.mode}
        aria-label={`Verdict: ${result.headline}`}
        className={cn("relative overflow-hidden rounded-3xl border p-6 sm:p-9", tone.box)}
      >
        <div aria-hidden className={cn("pointer-events-none absolute -left-20 -top-28 h-80 w-80 rounded-full bg-gradient-to-br to-transparent blur-3xl", GLOW[meta.tone])} />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-current opacity-[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -right-4 -top-4 h-32 w-32 rounded-full border border-current opacity-[0.06]" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <motion.span
            initial={reduce ? false : { scale: 0.3, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 14, delay: reduce ? 0 : 0.15 }}
            className={cn("relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl sm:h-20 sm:w-20", tone.solid, tone.glow)}
          >
            <Icon className="h-9 w-9 sm:h-11 sm:w-11" aria-hidden strokeWidth={2.2} />
          </motion.span>
          <div className="min-w-0">
            <p className={cn("text-xs font-bold uppercase tracking-[0.22em]", tone.text)} data-testid="verdict-label">
              {meta.label}
            </p>
            <h2 className="mt-1.5 break-words font-serif text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl" data-testid="verdict-headline">
              {result.headline}
            </h2>
          </div>
        </div>

        <p className="relative mt-5 max-w-2xl text-[0.95rem] leading-relaxed text-ink/85">{sub}</p>
        {statusDetail && (
          <p className="relative mt-3 inline-block rounded-xl border border-line bg-bg/60 px-3.5 py-2 text-sm font-medium text-ink" data-testid="verdict-detail">
            {statusDetail}
          </p>
        )}

        {result.issuer && (
          <dl className="relative mt-6 grid gap-x-8 gap-y-4 border-t border-line/80 pt-5 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Issuer</dt>
              <dd className="mt-1 font-serif text-xl leading-tight text-ink" data-testid="issuer-name">
                {result.issuer.name}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Domain</dt>
              <dd className="mt-1 break-all text-ink">{result.issuer.domain}</dd>
            </div>
            {result.code && (
              <div className="min-w-0">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Verification code</dt>
                <dd className="mt-1 break-all font-mono text-[0.85rem] text-ink" data-testid="result-code">
                  {result.code}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          <span
            data-testid="mode-chip"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg/60 px-3 py-1 text-xs font-medium text-ink"
          >
            <ModeIcon className="h-3.5 w-3.5" aria-hidden />
            {mode.label}
          </span>
          <span className="text-xs text-muted">{mode.hint}</span>
        </div>

        {result.verdict === "CANNOT_REACH_CHAIN" && (
          <div className="relative mt-5 flex flex-wrap gap-3">
            <Button onClick={onRetry} data-testid="verify-retry">
              <RefreshCw className="h-4 w-4" aria-hidden /> Retry
            </Button>
            <p className="self-center text-xs text-muted">
              Asked {result.providers?.asked ?? 0} provider{result.providers?.asked === 1 ? "" : "s"}, {result.providers?.answered ?? 0} answered, {result.providers?.agreed ?? 0} agreed.
            </p>
          </div>
        )}
      </motion.section>

      {showUploadCta && (
        <Card className="flex flex-col gap-4 border-gold/30 p-5 sm:flex-row sm:items-center" data-testid="link-cta">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
            <ScanSearch className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">Issuer and status verified. Upload the certificate file to verify its contents.</p>
            <p className="mt-1 text-sm text-muted">
              A link or QR proves who issued a certificate, not that the printed name and grade are unaltered. Drop the PDF or proof file to check every field.
            </p>
          </div>
          <Button variant="secondary" onClick={onUpload} data-testid="link-cta-upload" className="shrink-0">
            <FileUp className="h-4 w-4" aria-hidden /> Choose file
          </Button>
        </Card>
      )}

      {isCodeMode && (
        <Card className="flex gap-3 p-5" data-testid="code-note">
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

      {(providerNote || stalledNote) && (
        <Card className="flex gap-3 border-warn/30 p-5" data-testid="provider-note">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p className="text-sm leading-relaxed text-ink">{providerNote ?? stalledNote}</p>
        </Card>
      )}

      {result.note && (
        <Card className="flex gap-3 border-warn/30 p-5" data-testid="result-note">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p className="text-sm leading-relaxed text-ink">{result.note}</p>
        </Card>
      )}

      <div className={cn("grid gap-5", hasFields && showChecks && "2xl:grid-cols-2")}>
        {showChecks && (
          <section aria-label="Trust checklist" className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
              Five-point trust check <span className="hairline flex-1" />
            </h3>
            <Checklist checks={result.checks} />
          </section>
        )}
        {hasFields && (
          <div className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
              Field-by-field proof <span className="hairline flex-1" />
            </h3>
            <FieldsCard fields={result.fields!} hidden={result.hiddenFields} />
          </div>
        )}
      </div>

      {showPanel && <IndependentPanel result={result} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
        <p className="text-xs text-muted">
          {ct ? (
            <span data-testid="chain-time">
              Read at block {ct.block}, chain time {new Date(ct.timestamp * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Expiry and status are judged on the chain's clock, not yours.
            </span>
          ) : (
            <>Checked {new Date(result.verifiedAt * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</>
          )}{" "}
          Read directly from the chain in your browser, never through our servers.
        </p>
        <Button variant="secondary" size="sm" onClick={onReset} data-testid="verify-reset">
          <RotateCcw className="h-4 w-4" aria-hidden /> Verify another
        </Button>
      </div>
    </div>
  );
}
