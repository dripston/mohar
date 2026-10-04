"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ExternalLink, Fingerprint, Loader2, PenLine, Radio, ShieldCheck } from "lucide-react";
import type { IssueStep } from "@mohar/core";
import { Mono } from "@/components/ui/primitives";
import { explorerTx } from "@/lib/config";
import { cn, shortHex } from "@/lib/utils";

export type StepState = "idle" | "active" | "done" | "error";
export interface Progress {
  /** null = nothing started */
  step: IssueStep | null;
  failed: boolean;
  detail?: string;
  txHash?: string;
}

const ORDER: IssueStep[] = ["hashing", "signing", "pending", "confirmed"];
const META: Record<IssueStep, { label: string; hint: string; icon: typeof Check }> = {
  hashing: { label: "Hashing", hint: "Salting every field and building the Merkle tree", icon: Fingerprint },
  signing: { label: "Signing", hint: "Your wallet signs the root (EIP-712)", icon: PenLine },
  pending: { label: "Pending", hint: "Waiting for the transaction to be mined", icon: Radio },
  confirmed: { label: "Confirmed", hint: "Anchored on chain", icon: ShieldCheck },
};

export function stateOf(p: Progress, s: IssueStep): StepState {
  if (!p.step) return "idle";
  const c = ORDER.indexOf(p.step);
  const i = ORDER.indexOf(s);
  if (p.failed) return i < c ? "done" : i === c ? "error" : "idle";
  if (p.step === "confirmed") return "done";
  return i < c ? "done" : i === c ? "active" : "idle";
}

export function StepProgress({ progress, hashingNote }: { progress: Progress; hashingNote?: string }) {
  const reduce = useReducedMotion();
  const live = progress.step ? (progress.failed ? "Failed at " : progress.step === "confirmed" ? "" : "Now: ") + META[progress.step].label : "";
  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
      <ol className="relative grid gap-3 sm:grid-cols-4">
        {ORDER.map((s) => {
          const st = stateOf(progress, s);
          const Icon = META[s].icon;
          return (
            <li
              key={s}
              data-testid={`step-${s}`}
              data-state={st}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 transition-all duration-500",
                st === "idle" && "border-line bg-bg/40 text-muted",
                st === "active" && "border-gold/50 bg-gold/[0.07] text-ink shadow-[0_0_40px_-12px_rgb(221_182_104/0.6)]",
                st === "done" && "border-ok/35 bg-ok/[0.06] text-ink",
                st === "error" && "border-bad/50 bg-bad/[0.08] text-ink",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                    st === "idle" && "bg-raised text-muted",
                    st === "active" && "bg-gold text-bg",
                    st === "done" && "bg-ok text-bg",
                    st === "error" && "bg-bad text-bg",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={st}
                      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={reduce ? undefined : { scale: 0.4, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="grid place-items-center"
                    >
                      {st === "done" ? (
                        <Check className="h-4 w-4" aria-hidden />
                      ) : st === "active" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : st === "error" ? (
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                      ) : (
                        <Icon className="h-4 w-4" aria-hidden />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="text-sm font-semibold">{META[s].label}</span>
              </div>
              {st === "active" && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"><span className="block h-full w-1/2 animate-[marquee_1s_linear_infinite] bg-gradient-to-r from-transparent via-gold to-transparent" /></span>}
              <p className="mt-2 text-xs leading-relaxed text-muted">{s === "hashing" && hashingNote ? hashingNote : META[s].hint}</p>
            </li>
          );
        })}
      </ol>
      {progress.txHash && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted" data-testid="tx-hash">
          Transaction <Mono title={progress.txHash}>{shortHex(progress.txHash, 10, 8)}</Mono>
          {explorerTx(progress.txHash) && (
            <a
              href={explorerTx(progress.txHash)}
              target="_blank"
              rel="noreferrer"
              data-testid="tx-link"
              className="inline-flex items-center gap-1 font-medium text-gold underline-offset-2 hover:underline"
            >
              View on explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </p>
      )}
    </div>
  );
}
