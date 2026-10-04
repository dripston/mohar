"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ArrowRight, BadgeCheck, Fingerprint, Globe, Link2, ShieldCheck, Timer } from "lucide-react";
import { CertificatePreview } from "@/components/issuer/CertificatePreview";
import { cn } from "@/lib/utils";

const HUD = [
  { icon: ShieldCheck, k: "Issuer", v: "Ministry-listed institute", pos: "lg:-left-10 lg:top-[7%]" },
  { icon: Globe, k: "Domain", v: "acharya.ac.in vouches", pos: "lg:-right-4 xl:-right-8 lg:top-[19%]" },
  { icon: Fingerprint, k: "Signature", v: "EIP-712 · matches", pos: "lg:-left-12 lg:top-[50%]" },
  { icon: Link2, k: "Root", v: "Anchored · batch root", pos: "lg:-right-4 xl:-right-10 lg:top-[62%]" },
  { icon: Timer, k: "Status", v: "Not revoked right now", pos: "lg:-left-6 lg:bottom-[-4%]" },
];

const WORDS_1 = ["₹144", "crore", "lost", "to"];
const WORDS_2 = ["fake", "institutes."];

function Word({ w, i, italic }: { w: string; i: number; italic?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
      <motion.span
        className={cn("inline-block", italic && "text-gradient pr-[0.08em] italic")}
        initial={reduce ? false : { y: "110%", rotate: 4 }}
        animate={{ y: "0%", rotate: 0 }}
        transition={{ delay: 0.08 * i + 0.1, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        {w}
      </motion.span>
      &nbsp;
    </span>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 140, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 140, damping: 18 });
  const glare = useTransform([mx, my] as never, ([x, y]: number[]) => `radial-gradient(600px circle at ${(x! + 0.5) * 100}% ${(y! + 0.5) * 100}%, rgba(255,255,255,0.35), transparent 45%)`);
  const [lit, setLit] = useState(0);

  // the HUD checks tick on one by one after the seal lands
  useEffect(() => {
    if (reduce) return setLit(HUD.length + 1);
    const timers = HUD.map((_, i) => setTimeout(() => setLit(i + 1), 1500 + i * 420));
    timers.push(setTimeout(() => setLit(HUD.length + 1), 1500 + HUD.length * 420 + 200));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = stage.current!.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <section className="relative isolate overflow-hidden pt-28 sm:pt-36" aria-labelledby="hero-h">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
        <div className="absolute left-[8%] top-[-10%] h-[520px] w-[520px] rounded-full bg-seal/25 blur-[140px]" />
        <div className="absolute right-[2%] top-[18%] h-[460px] w-[460px] rounded-full bg-gold/15 blur-[140px]" />
        <svg viewBox="0 0 800 800" className="absolute -right-[260px] top-[-120px] h-[900px] w-[900px] animate-spin-slow opacity-[0.07]">
          <defs>
            <path id="hero-ring" d="M400,400 m-330,0 a330,330 0 1,1 660,0 a330,330 0 1,1 -660,0" />
          </defs>
          <text fontSize="30" letterSpacing="14" fill="rgb(245 241 233)" fontFamily="var(--font-mono)">
            <textPath href="#hero-ring">
              KECCAK256 · MERKLE ROOT · EIP-712 · ANCHORED · VERIFIED · KECCAK256 · MERKLE ROOT · EIP-712 ·
            </textPath>
          </text>
          <circle cx="400" cy="400" r="290" fill="none" stroke="rgb(245 241 233)" strokeDasharray="2 10" />
        </svg>
      </div>

      <div className="mx-auto grid max-w-[1320px] items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10">
        <div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3 text-xs text-muted backdrop-blur"
          >
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-ok/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-ok" /></span>
            Live on Base Sepolia · screen scholarship applications without personal data
          </motion.div>

          <h1 id="hero-h" className="mt-6 font-serif text-[3.4rem] leading-[0.92] tracking-[-0.02em] sm:text-7xl xl:text-[6.6rem]">
            {WORDS_1.map((w, i) => (
              <Word key={w} w={w} i={i} />
            ))}
            <br />
            {WORDS_2.map((w, i) => (
              <Word key={w} w={w} i={i + WORDS_1.length} italic />
            ))}
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted"
          >
            Scholarship money follows paper that nobody checks at scale. Mohar puts <span className="text-ink">issuer accreditation</span>,{" "}
            <span className="text-ink">tamper-proof credentials</span>, and <span className="text-ink">live revocation</span> on chain.
            A scheme officer screens a thousand applications without seeing a single name or income.
            When an audit finds a fake institute, one revocation flips every credential it ever issued.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.7 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/scheme"
              className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#ff6a52] to-[#d6331f] px-7 text-base font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_18px_40px_-12px_rgb(240_74_56/0.75)] transition hover:brightness-110"
            >
              Screen applications
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/verify"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface/70 px-7 text-base font-medium backdrop-blur transition hover:border-ink/25 hover:bg-raised"
            >
              Verify a credential
            </Link>
          </motion.div>

          <motion.dl
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="mt-12 grid max-w-xl grid-cols-3 gap-6 border-t border-line/70 pt-6"
          >
            {[
              ["1,000", "applications screened, zero false flags"],
              ["542", "gas per credential on Base Sepolia"],
              ["0", "servers in the verify path"],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-serif text-3xl text-ink sm:text-4xl">{n}</dd>
                <dd className="mt-1 text-xs text-muted">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* certificate stage */}
        <div
          ref={stage}
          onPointerMove={onMove}
          onPointerLeave={() => {
            mx.set(0);
            my.set(0);
          }}
          className="relative mx-auto w-full max-w-[640px] [perspective:1400px] lg:py-10"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 50, rotateX: 25 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          >
            <motion.div style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative">
              <CertificatePreview
                issuerName="Acharya Institute of Technology"
                issuerDomain="acharya.ac.in"
                recipient="Ananya Rao"
                title="Enrolment Certificate · B.E. AI & ML"
                grade="Year 3 · Active"
                issuedOn="2026-07-15"
                expiresOn=""
                code="MHR-Y5R9-A42P-SZC2-E"
                seal="stamp"
                stampDelay={0.9}
              />
              {!reduce && <motion.div aria-hidden style={{ background: glare }} className="pointer-events-none absolute inset-0 rounded-[6px] mix-blend-soft-light" />}
            </motion.div>
          </motion.div>

          {/* HUD: floating checks around the paper on laptops, a compact strip on phones */}
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:mt-0 lg:block" aria-label="Live checks">
            {HUD.map((h, i) => {
              const on = lit > i;
              return (
                <motion.li
                  key={h.k}
                  initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                  animate={on ? { opacity: 1, scale: 1 } : { opacity: 0.35, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={cn(
                    "glass flex items-center gap-2.5 rounded-xl px-3 py-2 lg:absolute lg:animate-float lg:shadow-2xl",
                    h.pos,
                    i === 4 && "col-span-2 sm:col-span-1",
                  )}
                  style={{ animationDelay: `${i * -1.3}s` }}
                >
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-ok/15 text-ok" : "bg-raised text-muted")}>
                    <h.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">{h.k}</span>
                    <span className="block truncate text-[0.8rem] text-ink">{h.v}</span>
                  </span>
                </motion.li>
              );
            })}
          </ul>

          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={lit > HUD.length ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="absolute -top-3 right-3 z-10 flex items-center gap-2 rounded-full border border-ok/40 bg-[#062d20]/90 px-4 py-2 text-sm font-semibold text-ok shadow-[0_10px_40px_-10px_rgb(52_211_153/0.7)] backdrop-blur lg:right-10 lg:top-2"
            aria-hidden={lit <= HUD.length}
          >
            <BadgeCheck className="h-5 w-5" aria-hidden /> Eligible · all checks passed
          </motion.div>
        </div>
      </div>
    </section>
  );
}
