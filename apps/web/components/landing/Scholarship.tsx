"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, EyeOff, Landmark, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Eyebrow } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Reveal } from "./Sections";

const STEPS = [
  { icon: Landmark, k: "Authority", v: "lists each institute and revenue office on chain, with its type and who vouched for it" },
  { icon: Building2, k: "Issuers", v: "use AI to digitise legacy paper records, then seal enrolment and income certificates on chain" },
  { icon: Wallet, k: "Student", v: "shares one bundle with only the flags the scheme asks for. No name, no income figure, no address" },
  { icon: ShieldCheck, k: "Officer", v: "drafts scheme rules from legal text using AI, then screens a thousand applications at once" },
];

// 120 synthetic applications. Indices in FAKE belong to one institute that an audit later revokes.
const N = 120;
const FAKE = new Set([7, 19, 23, 41, 58, 66, 77, 90, 104, 113]);
const NOT_ELIGIBLE = new Set([3, 30, 52, 71, 99]);
const INVALID = new Set([12, 85]);

/** The audit scene in miniature: same applications, new chain state, the fake institute's students turn red. */
function AuditGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-120px" });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setPhase(2);
    setPhase(0);
    const a = setTimeout(() => setPhase(1), 400);
    const b = setTimeout(() => setPhase(2), 2600);
    return () => [a, b].forEach(clearTimeout);
  }, [inView, reduce]);
  const flagged = phase === 2 ? FAKE.size + INVALID.size : INVALID.size;
  return (
    <div ref={ref} className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Bulk screen · 120 synthetic applications</p>
          <p className="mt-1 font-serif text-2xl leading-tight">{phase < 2 ? "Before the audit" : "After the authority revokes one institute"}</p>
        </div>
        <div className="text-right">
          <p className={cn("font-serif text-4xl tabular-nums leading-none transition-colors duration-500", phase === 2 ? "text-bad" : "text-ink")}>{flagged}</p>
          <p className="text-xs text-muted">flagged invalid</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5 sm:grid-cols-[repeat(20,minmax(0,1fr))]" aria-hidden>
        {Array.from({ length: N }, (_, i) => {
          const fake = FAKE.has(i);
          const color =
            phase === 0
              ? "bg-raised"
              : INVALID.has(i) || (fake && phase === 2)
                ? "bg-bad shadow-[0_0_12px_rgb(248_96_86/0.6)]"
                : NOT_ELIGIBLE.has(i)
                  ? "bg-warn/70"
                  : "bg-ok/70";
          return (
            <motion.span
              key={i}
              className={cn("aspect-square rounded-[4px] transition-colors duration-500", color)}
              style={{ transitionDelay: phase === 1 ? `${(i % 20) * 18}ms` : fake && phase === 2 ? `${[...FAKE].indexOf(i) * 90}ms` : "0ms" }}
              animate={fake && phase === 2 && !reduce ? { scale: [1, 1.35, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, delay: fake ? [...FAKE].indexOf(i) * 0.09 : 0 }}
            />
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok/70" /> eligible</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warn/70" /> not eligible</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-bad" /> invalid</span>
      </div>
      <p className="sr-only">
        Animation: 120 applications are screened. After the authority revokes one institute with a cut-off date, the ten applications that used its enrolment
        certificates turn invalid, with no file re-uploaded.
      </p>
    </div>
  );
}

export function Scholarship() {
  return (
    <section className="relative py-24 sm:py-32" aria-labelledby="scholar-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
          <Reveal>
            <Eyebrow tone="seal">Why this matters</Eyebrow>
            <p className="mt-6 font-serif text-[5.5rem] leading-[0.85] tracking-tight text-ink sm:text-[8rem]">
              830<span className="text-muted">/</span>
              <span className="text-muted">1,572</span>
            </p>
            <h2 id="scholar-h" className="mt-5 max-w-xl font-serif text-3xl leading-[1.05] tracking-tight sm:text-4xl">
              institutions in one scholarship audit were <span className="italic text-seal">alleged</span> to be non-operational, fake or partly fake.
            </h2>
            <p className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-muted">
              About ₹144 crore of scholarship money went to them between 2017-18 and 2021-22, according to a CBI case registered in August 2023. The money
              followed paper: enrolment letters and certificates nobody could check at scale.
            </p>
            <p className="mt-3 text-xs text-muted/80">Figures as alleged in the FIR and reported in Parliament. Mohar's demo uses synthetic people and demo issuers only.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/scheme" className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-sm font-medium text-bg transition hover:bg-white">
                Try the officer screen <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
              <Link href="/bulk" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface/70 px-6 text-sm font-medium transition hover:border-ink/25">
                Screen a thousand
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <AuditGrid />
          </Reveal>
        </div>

        <ol className="mt-20 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.k} delay={i * 0.06}>
              <li className="glass relative h-full rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-raised text-gold">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="font-mono text-xs text-muted">0{i + 1}</span>
                </div>
                <p className="mt-6 font-serif text-3xl leading-none">{s.k}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{s.v}</p>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-gold/40 bg-gold/5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-ink/90">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>
                <span className="font-semibold text-gold">AI strictly for administration.</span> Officers use LLMs to translate legal texts into JSON checklists, and issuers use OCR+LLMs to digitize legacy paper. The AI never touches the cryptography or decides a verification verdict.
              </span>
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-line bg-surface/40 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-muted">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>
                <span className="text-ink">Honest limits.</span> Income and caste flags are signed by the issuer, not zero-knowledge proofs. Mohar cannot tell if
                a genuine institute enrols a fake student, and it cannot stop a valid bundle being handed in twice; it flags duplicates. It is designed for data
                minimisation and claims no legal compliance.
              </span>
            </p>
            <Link href="/demo" className="shrink-0 text-sm font-medium text-gold underline-offset-4 hover:underline">
              Open the demo room →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
