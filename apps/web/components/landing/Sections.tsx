"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  EyeOff,
  GraduationCap,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  ScanLine,
  ServerOff,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import type { Verdict } from "@mohar/core";
import { VERDICTS, toneClasses } from "@/components/verify/meta";
import { Eyebrow } from "@/components/ui/primitives";
import { WaxSeal } from "@/components/brand/Seal";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- reveal */

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* --------------------------------------------------------------- marquee */

const ATTACKS: [string, string, boolean][] = [
  ["Grade edited in the PDF", "TAMPERED", true],
  ["Issuer swapped", "UNKNOWN ISSUER", true],
  ["Signature replayed", "REJECTED", true],
  ["Certificate revoked", "REVOKED", true],
  ["Forged PDF, real QR", "TAMPERED", true],
  ["Wrong chain", "WRONG CHAIN", true],
  ["Stolen key, after cutoff", "ISSUER REVOKED", true],
  ["Malformed QR", "MALFORMED", true],
  ["Expired diploma", "EXPIRED", true],
  ["Fake issuer wallet", "UNKNOWN ISSUER", true],
  ["One RPC lies", "QUORUM HOLDS", true],
  ["Field silently dropped", "TAMPERED", true],
  ["Batch member revoked", "REVOKED", true],
  ["Unknown code", "NOT FOUND", true],
];

export function AttackMarquee() {
  const row = (items: typeof ATTACKS, reverse?: boolean) => (
    <div className="mask-fade-x flex overflow-hidden">
      <div className={cn("flex shrink-0 gap-3 pr-3", reverse ? "animate-marquee-slow [animation-direction:reverse]" : "animate-marquee")}>
        {[...items, ...items].map(([a, v], i) => (
          <span key={i} className="flex shrink-0 items-center gap-3 rounded-full border border-line bg-surface/70 py-2 pl-4 pr-2 text-sm">
            <span className="text-muted">{a}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted/60" aria-hidden />
            <span className="rounded-full bg-bad/10 px-2.5 py-0.5 font-mono text-[0.68rem] font-semibold tracking-wide text-bad">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <section aria-label="Attacks Mohar catches" className="relative border-y border-line/60 bg-surface/30 py-6">
      <p className="sr-only">Every one of these attacks is caught in the test suite against a live chain.</p>
      <div className="space-y-3" aria-hidden>
        {row(ATTACKS.slice(0, 7))}
        {row(ATTACKS.slice(7), true)}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- pillars */

function Tile({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("glass group relative overflow-hidden rounded-3xl p-6 transition-colors duration-500 hover:border-ink/15 sm:p-8", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold/10 opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100"
      />
      {children}
    </div>
  );
}

function TileHead({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-xs text-gold">{n}</p>
      <h3 className="mt-3 font-serif text-3xl leading-tight tracking-tight sm:text-[2.1rem]">{title}</h3>
      <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function Pillars() {
  return (
    <section className="py-24 sm:py-32" aria-labelledby="pillars-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <Eyebrow>Three questions, answered by math</Eyebrow>
          <h2 id="pillars-h" className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            A verdict you don&apos;t have to <span className="italic text-gold">take on faith.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-6 [&>*]:min-w-0">
          <Reveal className="lg:col-span-3">
            <Tile className="h-full">
              <TileHead
                n="01 · WHO"
                title="Who issued it?"
                body="The signing key is accredited in an on-chain registry, and the institution's own domain publishes a DNS record naming that key. Two independent roots of trust."
              />
              <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[0.72rem]">
                {[
                  ["0x7099…79C8", "key"],
                  ["IssuerRegistry", "accredited"],
                  ["acharya.ac.in TXT", "vouches"],
                ].map(([a, b], i) => (
                  <span key={a} className="flex items-center gap-2">
                    <span className="rounded-lg border border-line bg-bg/60 px-2.5 py-1.5">
                      <span className="text-ink">{a}</span> <span className="text-ok">· {b}</span>
                    </span>
                    {i < 2 && <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden />}
                  </span>
                ))}
              </div>
            </Tile>
          </Reveal>

          <Reveal className="lg:col-span-3" delay={0.08}>
            <Tile className="h-full">
              <TileHead
                n="02 · WHAT"
                title="Was anything changed?"
                body="Every field is salted and hashed into a Merkle tree. Edit a single character and Mohar tells you exactly which field was forged."
              />
              <div className="mt-8 space-y-1.5 font-mono text-[0.72rem]">
                {[
                  ["recipient.name", "Ananya Rao", true],
                  ["credential.title", "Income Certificate", true],
                  ["flag.income_lte_250000", "true", false],
                ].map(([k, v, ok]) => (
                  <div key={k as string} className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2", ok ? "border-line bg-bg/50" : "border-bad/50 bg-bad/10")}>
                    <span className="truncate text-muted">{k}</span>
                    <span className={cn("flex items-center gap-1.5 truncate", ok ? "text-ink" : "text-bad")}>
                      {v} {ok ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                  </div>
                ))}
              </div>
            </Tile>
          </Reveal>

          <Reveal className="lg:col-span-2" delay={0.04}>
            <Tile className="h-full">
              <TileHead n="03 · NOW" title="Is it valid right now?" body="Revoked, suspended, expired: read live from the chain, with the reason and the date." />
              <div className="mt-8 flex items-center gap-1.5">
                {[
                  ["Active", "bg-ok"],
                  ["Suspended", "bg-warn"],
                  ["Active", "bg-ok"],
                  ["Revoked", "bg-bad"],
                ].map(([s, c], i) => (
                  <div key={i} className="flex-1">
                    <div className={cn("h-1.5 rounded-full", c)} />
                    <p className="mt-2 text-[0.65rem] text-muted">{s}</p>
                  </div>
                ))}
              </div>
            </Tile>
          </Reveal>

          <Reveal className="lg:col-span-2" delay={0.1}>
            <Tile className="h-full">
              <TileHead n="04 · PRIVACY" title="Share only what you choose" body="Holders hide their income or address. What they reveal still verifies." />
              <div className="mt-8 space-y-1.5 text-[0.8rem]">
                <div className="flex items-center justify-between rounded-lg border border-line bg-bg/50 px-3 py-2">
                  <span className="text-muted">Eligibility</span>
                  <span>Under ₹2.5 Lakh (True)</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 text-muted">
                  <span className="flex items-center gap-1.5">
                    <EyeOff className="h-3.5 w-3.5" aria-hidden /> Exact income
                  </span>
                  <span className="flex items-center gap-1.5 blur-[3px]">₹1,80,000</span>
                </div>
              </div>
            </Tile>
          </Reveal>

          <Reveal className="lg:col-span-2" delay={0.16}>
            <Tile className="h-full">
              <TileHead n="05 · SCALE" title="1,000 certificates, one transaction" body="A batch anchors a single root. Each certificate carries its own short proof." />
              <div className="mt-8 flex h-20 items-end gap-1.5" aria-hidden>
                {[100, 62, 38, 22, 12, 6, 3.5].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 * i, duration: 0.7, ease: "easeOut" }}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-gold/30 to-gold"
                  />
                ))}
              </div>
              <p className="mt-2 text-[0.68rem] text-muted">Gas per certificate as the batch grows: about 580 at 200 certificates.</p>
            </Tile>
          </Reveal>

          <Reveal className="lg:col-span-6" delay={0.05}>
            <Tile className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center [&>*]:min-w-0">
              <TileHead
                n="06 · INDEPENDENCE"
                title="Works even if we disappear."
                body="Verification runs in your browser and reads the chain through independent providers that must agree. Don't trust the page? Every result comes with the exact command to check it yourself."
              />
              <div className="overflow-hidden rounded-2xl border border-line bg-[#050506]">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 flex items-center gap-1.5 text-xs text-muted">
                    <Terminal className="h-3.5 w-3.5" aria-hidden /> your machine, no Mohar involved
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[0.72rem] leading-relaxed sm:text-[0.8rem]">
                  <code>
                    <span className="text-muted">$</span> <span className="text-gold">cast call</span> 0xe7f1…0512 <span className="text-ok">&quot;getCert(bytes32)&quot;</span> 0x3fa9…c21e \{"\n"}
                    {"    "}--rpc-url $RPC{"\n"}
                    <span className="text-muted">→</span> <span className="text-ink">1</span> <span className="text-muted"># state: 1 = Active</span>
                  </code>
                </pre>
              </div>
            </Tile>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ stats */

function Count({ to, suffix = "", prefix = "" }: { to: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, to, reduce]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {v.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

export function Stats() {
  const items = [
    { n: 1000, label: "applications screened", sub: "bulk verdict equal to the single check on every one, 0 false flags" },
    { n: 542, label: "gas per certificate", sub: "measured on Base Sepolia in a 200-certificate batch" },
    { n: 78, label: "contract tests", sub: "unit, 1,000-run fuzz, invariants and a hostile pass" },
    { n: 0, label: "personal data on chain", sub: "only a 32-byte root ever leaves the browser" },
  ];
  return (
    <section className="border-y border-line/60 bg-surface/30" aria-label="By the numbers">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <div key={it.label} className={cn("px-5 py-12 sm:px-8 lg:py-16", i % 2 === 1 && "border-l border-line/60", i >= 2 && "border-t border-line/60 lg:border-t-0", i === 2 && "lg:border-l")}>
            <p className="font-serif text-6xl tracking-tight text-ink sm:text-7xl">
              <Count to={it.n} />
            </p>
            <p className="mt-3 text-sm font-medium text-ink">{it.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{it.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- verdicts */

const ORDER: Verdict[] = [
  "VERIFIED",
  "VERIFIED_DOMAIN_UNCHECKED",
  "REVOKED",
  "SUSPENDED",
  "EXPIRED",
  "TAMPERED",
  "UNKNOWN_ISSUER",
  "ISSUER_REVOKED",
  "NOT_FOUND",
  "WRONG_CHAIN",
  "CANNOT_REACH_CHAIN",
  "MALFORMED",
];

export function Verdicts() {
  return (
    <section id="verdicts" className="scroll-mt-24 py-24 sm:py-32" aria-labelledby="verdicts-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow tone="seal">Twelve precise verdicts</Eyebrow>
            <h2 id="verdicts-h" className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Not just <span className="italic">&ldquo;invalid&rdquo;.</span>
            </h2>
          </div>
          <p className="max-w-lg text-lg leading-relaxed text-muted lg:justify-self-end">
            A revoked institute, a forged income flag and an unreachable network are different problems. Mohar names each one, and never confuses
            &ldquo;could not check&rdquo; with &ldquo;fake&rdquo;.
          </p>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER.map((v, i) => {
            const m = VERDICTS[v];
            const t = toneClasses[m.tone];
            return (
              <Reveal key={v} delay={(i % 4) * 0.05}>
                <div className="glass group h-full rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-10 w-10 place-items-center rounded-xl", t.solid)}>
                      <m.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className={cn("font-mono text-[0.68rem] font-semibold tracking-wider", t.text)}>{v}</span>
                  </div>
                  <p className="mt-4 font-serif text-2xl leading-tight">{m.label}</p>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-muted">{m.sub}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- personas */

const PERSONAS = [
  {
    href: "/scheme",
    icon: ShieldCheck,
    who: "Scholarship offices",
    title: "Screen",
    body: "Draft criteria with AI, then check a ZIP of a thousand applications against the chain. Ticks and reason codes, never names or incomes.",
    cta: "Open the officer screen",
  },
  {
    href: "/verify",
    icon: ScanLine,
    who: "Employers & admissions",
    title: "Verify",
    body: "Scan a QR, paste a link or drop the PDF. A clear verdict and a five-point checklist in seconds. No account.",
    cta: "Open the verifier",
  },
  {
    href: "/issuer",
    icon: Building2,
    who: "Universities & academies",
    title: "Issue",
    body: "Digitise paper records with AI, or sign a thousand from a CSV. One transaction, PDFs with embedded proofs, a live registry dashboard.",
    cta: "Open the issuer portal",
  },
  {
    href: "/holder",
    icon: GraduationCap,
    who: "Students & graduates",
    title: "Share",
    body: "Open your certificate, hide the fields you want private, and share a link or QR that still verifies.",
    cta: "Open the holder studio",
  },
  {
    href: "/issuer/admin",
    icon: Landmark,
    who: "Accreditation bodies",
    title: "Govern",
    body: "Accredit issuers, rotate keys, and revoke a stolen key from the moment it leaked without erasing honest history.",
    cta: "Open the authority console",
  },
];

export function Personas() {
  return (
    <section className="py-24 sm:py-32" aria-labelledby="personas-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <Eyebrow>One protocol, five doors</Eyebrow>
          <h2 id="personas-h" className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Built for everyone <span className="italic text-gold">who touches a certificate.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PERSONAS.map((p, i) => (
            <Reveal key={p.href} delay={i * 0.06}>
              <Link
                href={p.href}
                className="glass group relative flex h-full flex-col overflow-hidden rounded-3xl p-7 transition duration-500 hover:-translate-y-1 hover:border-gold/40"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -bottom-24 h-48 bg-gradient-to-t from-seal/25 to-transparent opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-100"
                />
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-raised text-gold">
                    <p.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                </div>
                <p className="mt-8 text-xs font-medium uppercase tracking-[0.16em] text-muted">{p.who}</p>
                <p className="mt-2 font-serif text-4xl tracking-tight 2xl:text-5xl">{p.title}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.body}</p>
                <p className="mt-6 text-sm font-medium text-ink">{p.cta} →</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- final cta */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-40" aria-labelledby="cta-h">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-seal/20 blur-[160px]" />
      </div>
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <Reveal>
          <div className="relative mx-auto h-36 w-36 sm:h-44 sm:w-44">
            <WaxSeal className="h-full w-full animate-[spin_60s_linear_infinite]" />
          </div>
          <h2 id="cta-h" className="mt-10 font-serif text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            Holding a certificate?
            <br />
            <span className="italic text-gradient">Know in three seconds.</span>
          </h2>
          <div className="mx-auto mt-10 flex max-w-xl flex-col gap-3 sm:flex-row">
            <Link
              href="/verify"
              className="group flex h-14 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface/80 px-5 text-left text-muted backdrop-blur transition hover:border-gold/50"
            >
              <ScanLine className="h-5 w-5 shrink-0 text-gold" aria-hidden />
              <span className="truncate font-mono text-sm">MHR-7F3K-92QD-X4MP-C</span>
            </Link>
            <Link
              href="/verify"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink px-7 font-medium text-bg transition hover:bg-white"
            >
              Verify <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <ServerOff className="h-3.5 w-3.5" aria-hidden /> No server in the loop
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Link data never uploaded
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Quorum of RPC providers
            </span>
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> EIP-712 signatures
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" aria-hidden /> Merkle batches
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
