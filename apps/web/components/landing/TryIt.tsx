"use client";

import Link from "next/link";
import { ArrowRight, Download, FileArchive, GraduationCap, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { Eyebrow } from "@/components/ui/primitives";
import { deployment } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Reveal } from "./Sections";

type Step = {
  icon: typeof ScanLine;
  title: string;
  role: string;
  todo: string[];
  files?: { label: string; path: string }[];
  open: { label: string; href: string };
  expect: { text: string; tone: "ok" | "bad" | "warn" }[];
};

const TONE = { ok: "border-ok/35 bg-ok/10 text-ok", bad: "border-bad/35 bg-bad/10 text-bad", warn: "border-warn/35 bg-warn/10 text-warn" };

/** Judges' walkthrough: every step works on the live site with no wallet and no install. */
export function TryIt() {
  const net = deployment.network ?? (deployment.chainId === 31337 ? "anvil" : "base-sepolia");
  const s = `/demo/${net}/scholarship`;
  const steps: Step[] = [
    {
      icon: ScanLine,
      title: "Verify a certificate on your own phone",
      role: "Anyone",
      todo: ["Open the demo room on this screen.", "Scan any QR card with your phone camera (mobile data is fine).", "Try Valid, then Tampered, Revoked and Expired."],
      open: { label: "Open the demo room", href: "/demo" },
      expect: [
        { text: "VERIFIED", tone: "ok" },
        { text: "TAMPERED", tone: "bad" },
        { text: "REVOKED", tone: "bad" },
        { text: "EXPIRED", tone: "warn" },
      ],
    },
    {
      icon: GraduationCap,
      title: "Apply as a student, without oversharing",
      role: "Student",
      todo: ["Download Kavya's three sealed certificates.", "On the scholarship page, keep “I'm a student” and drop all three in.", "See what leaves your device and what stays, then click “Download application.mohar”."],
      files: [
        { label: "Enrolment", path: `${s}/student-enrolment.json` },
        { label: "Caste", path: `${s}/student-caste.json` },
        { label: "Income", path: `${s}/student-income.json` },
      ],
      open: { label: "Open scholarship check", href: "/scheme" },
      expect: [{ text: "Only yes/no flags leave · income stays hidden", tone: "ok" }],
    },
    {
      icon: ShieldCheck,
      title: "Decide as the scholarship officer",
      role: "Officer",
      todo: ["Click “I'm an officer” at the top of the scholarship page.", "Drop the application.mohar you just downloaded.", "Then drop the forged one below: its income certificate was edited."],
      files: [{ label: "Forged application", path: `${s}/app-0003.mohar` }],
      open: { label: "Open scholarship check", href: "/scheme" },
      expect: [
        { text: "Yours: ELIGIBLE", tone: "ok" },
        { text: "Forged: INVALID · income TAMPERED", tone: "bad" },
      ],
    },
    {
      icon: FileArchive,
      title: "Screen a whole district's batch",
      role: "Officer, at scale",
      todo: ["Download the batch of 27 applications.", "Drop the ZIP on the bulk screen. Every seal is checked in your browser.", "Filter by verdict, open a row for its reason, export CSV. Look for app-0015: a fake institute."],
      files: [{ label: "applications.zip", path: `${s}/applications.zip` }],
      open: { label: "Open bulk screen", href: "/bulk" },
      expect: [
        { text: "Eligible / not eligible / invalid, each with a reason", tone: "ok" },
        { text: "app-0015 flips to ISSUER_REVOKED once the audit revokes its institute", tone: "warn" },
      ],
    },
  ];

  return (
    <section id="try" className="relative scroll-mt-24 py-20 sm:py-28" aria-labelledby="try-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <Eyebrow tone="seal">Try it yourself · about 3 minutes</Eyebrow>
          <h2 id="try-h" className="mt-5 max-w-3xl font-serif text-3xl leading-[1.05] tracking-tight sm:text-5xl">
            No wallet. No install. <span className="italic text-muted">Everything checks against the live chain.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            Follow the four steps in order. Each one tells you which file to download, where to drop it and what you should see. All data is synthetic and every issuer is labelled DEMO. Contracts run on Base Sepolia.
          </p>
        </Reveal>

        <ol className="mt-12 grid gap-5 lg:grid-cols-2">
          {steps.map((st, i) => (
            <Reveal key={st.title} delay={i * 0.06}>
              <li className="glass flex h-full flex-col rounded-3xl p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink font-serif text-xl text-bg">{i + 1}</span>
                  <div>
                    <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                      <st.icon className="h-3.5 w-3.5" aria-hidden /> {st.role}
                    </p>
                    <h3 className="mt-1 font-serif text-2xl leading-tight">{st.title}</h3>
                  </div>
                </div>

                <ul className="mt-5 space-y-2 text-sm leading-relaxed text-muted">
                  {st.todo.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>

                {st.files && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {st.files.map((f) => (
                      <a
                        key={f.path}
                        href={f.path}
                        download
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface/70 px-3.5 text-sm font-medium transition hover:border-ink/25 hover:bg-raised"
                      >
                        <Download className="h-4 w-4" aria-hidden /> {f.label}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">You should see</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {st.expect.map((e) => (
                      <span key={e.text} className={cn("rounded-full border px-3 py-1 text-xs font-medium", TONE[e.tone])}>
                        {e.text}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  <Link
                    href={st.open.href}
                    target="_blank"
                    className="group inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-bg transition hover:bg-white"
                  >
                    {st.open.label}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Sparkles className="h-4 w-4 text-gold" aria-hidden />
            Bonus: on the scholarship page, let AI draft a scheme's rules from plain English. You confirm every requirement. AI never decides a verdict.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
