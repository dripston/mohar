"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Download, ExternalLink, FileArchive, GraduationCap, Landmark, MonitorPlay, ScanLine, ShieldCheck, Type } from "lucide-react";
import { Ambient, Badge, Button, Card, Eyebrow, Page } from "@/components/ui/primitives";
import { VERDICTS, toneClasses } from "@/components/verify/meta";
import { AGG, TONE_CLASS } from "@/components/scheme/labels";
import { deployment } from "@/lib/config";
import { cn, shortHex } from "@/lib/utils";
import { useBigText } from "./BigText";
import type { Aggregate, Verdict } from "@mohar/core";

interface SeedIndex {
  network: string;
  generatedAt?: string;
  entries: { id: string; label: string; expected: string; actual: string; code: string; link?: string }[];
}
interface SchemeIndex {
  network: string;
  generatedAt: string;
  domain: string;
  total: number;
  issuers: { institute: string; revenueOffice: string; fakeInstitute: string };
  auditCutoff: number;
  studentFiles: string[];
  samples: Record<string, { file: string; expected: Aggregate; codes: Record<string, string> }>;
  counts: Record<string, number>;
  countsAfterAudit: Record<string, number>;
}

const KIND_LABEL: Record<string, string> = {
  good: "Genuine, qualifies",
  tampered: "Forged income flag",
  revoked: "Caste certificate revoked",
  suspended: "Enrolment suspended",
  expired: "Enrolment expired",
  fake_institute: "From the fake institute",
  wrong_issuer_type: "Enrolment from a revenue office",
  missing: "Caste certificate missing",
  not_eligible_income: "Income above the limit",
  not_eligible_category: "Not ST category",
};

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

const SCRIPT = [
  ["0:00", "Hook", "830 of 1,572 audited institutions alleged fake or non-operational. ₹144 crore. Say “alleged”."],
  ["0:30", "Issue", "Authority lists an institute and a revenue office. Each seals a credential for one student."],
  ["1:15", "Apply", "Student loads three files, sees what leaves and what stays, downloads one bundle."],
  ["2:00", "Forge", "Officer drops the forged-flag bundle: INVALID, income TAMPERED. Then a fake issuer: rejected."],
  ["2:45", "Audit", "Bulk screen the ZIP. Authority revokes the fake institute with a cut-off. Re-screen: rows flip red."],
  ["3:45", "Trustless", "Judge scans a QR on their own phone, mobile data. Live VERIFIED. No Mohar server involved."],
  ["4:15", "Close", "Test counts, attack matrix on Sepolia, honest limits. Hand over SECURITY.md."],
];

export function DemoRoom() {
  const net = deployment.network ?? (deployment.chainId === 31337 ? "anvil" : "base-sepolia");
  const base = `/demo/${net}`;
  const [seed, setSeed] = useState<SeedIndex>();
  const [scheme, setScheme] = useState<SchemeIndex>();
  const [loaded, setLoaded] = useState(false);
  const [big, setBig] = useBigText();

  useEffect(() => {
    void Promise.all([getJson<SeedIndex>(`${base}/seed/index.json`), getJson<SchemeIndex>(`${base}/scholarship/index.json`)]).then(([a, b]) => {
      setSeed(a);
      setScheme(b);
      setLoaded(true);
    });
  }, [base]);

  return (
    <Page wide>
      <Ambient tone="gold" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <header className="max-w-3xl">
          <Eyebrow>Demo room · {net}</Eyebrow>
          <h1 className="mt-3 font-serif text-[2.6rem] leading-[1] tracking-tight sm:text-6xl">
            Everything for a <span className="text-gradient italic">five-minute demo.</span>
          </h1>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
            Real certificates on {deployment.chainId === 31337 ? "the local chain" : "Base Sepolia"} in every verdict state, sample scholarship applications, and the
            run sheet. All people and issuers are synthetic and labelled demo.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          <Button variant={big ? "primary" : "secondary"} onClick={() => setBig(!big)} aria-pressed={big} data-testid="big-text">
            <Type className="h-4 w-4" aria-hidden /> Projector text {big ? "on" : "off"}
          </Button>
          <span className="self-center text-xs text-muted">Alt+B anywhere</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- live certificates */}
      <section className="mt-12" aria-labelledby="certs-h">
        <div className="flex items-end justify-between gap-4">
          <h2 id="certs-h" className="font-serif text-3xl">
            Scan these with any phone
          </h2>
          {seed?.generatedAt && <p className="text-xs text-muted">seeded {new Date(seed.generatedAt).toLocaleString("en-IN")}</p>}
        </div>
        {!loaded ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : !seed ? (
          <Card className="mt-4 p-5 text-sm text-muted">
            No seeded certificates are published for this network yet. Run <span className="font-mono text-ink">pnpm --filter @mohar/core seed</span> then{" "}
            <span className="font-mono text-ink">node scripts/publish-seed.mjs</span>.
          </Card>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="demo-certs">
            {seed.entries.map((e) => {
              const v = VERDICTS[e.expected as Verdict];
              const t = v ? toneClasses[v.tone] : undefined;
              const isFile = e.id === "tampered";
              return (
                <li key={e.id} className="glass flex flex-col rounded-3xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-mono text-[0.65rem] font-semibold tracking-wider", t?.text)}>{e.expected}</span>
                    {v && (
                      <span className={cn("grid h-7 w-7 place-items-center rounded-lg", t?.solid)}>
                        <v.icon className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-snug">{e.label}</p>
                  <div className="mt-3 overflow-hidden rounded-2xl bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${base}/seed/${e.id}.png`} alt={`QR code for the ${e.label.toLowerCase()} certificate`} className="aspect-square w-full" loading="lazy" />
                  </div>
                  <p className="mt-2 truncate font-mono text-[0.68rem] text-muted">{e.code}</p>
                  <div className="mt-3 flex gap-2">
                    {isFile ? (
                      <a href={`${base}/seed/${e.id}.mohar.json`} download className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-xs hover:border-ink/25">
                        <Download className="h-3.5 w-3.5" aria-hidden /> Forged file
                      </a>
                    ) : (
                      e.link && (
                        <a href={e.link.replace(/^https?:\/\/[^/]+/, "")} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-xs hover:border-ink/25">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
                        </a>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">The forged card is a file: drop it on the verify page. Its QR points at the genuine certificate, which is the point.</p>
      </section>

      {/* ---------------------------------------------------------- scholarship */}
      <section className="mt-16" aria-labelledby="sch-h">
        <h2 id="sch-h" className="font-serif text-3xl">
          Scholarship scene
        </h2>
        {!loaded ? null : !scheme ? (
          <Card className="mt-4 p-5 text-sm text-muted">
            No scholarship samples for this network yet. Run <span className="font-mono text-ink">pnpm --filter @mohar/core scheme-seed</span> with this network.
          </Card>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <Card className="rounded-3xl p-5 sm:p-7">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Officer: drop any of these on the officer screen</p>
              <ul className="mt-4 divide-y divide-line" data-testid="demo-samples">
                {Object.entries(scheme.samples).map(([kind, s]) => {
                  const tone = TONE_CLASS[AGG[s.expected].tone];
                  return (
                    <li key={kind} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-sm">{KIND_LABEL[kind] ?? kind}</span>
                        <span className="block font-mono text-[0.68rem] text-muted">{s.file}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[0.62rem]", tone.soft, tone.text)}>{s.expected}</span>
                        <a href={`${base}/scholarship/${s.file}`} download className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:border-ink/25" aria-label={`Download ${s.file}`}>
                          <Download className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/scheme" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-bg hover:bg-white">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Officer screen
                </Link>
              </div>
            </Card>
            <div className="space-y-6">
              <Card className="rounded-3xl p-5 sm:p-7">
                <p className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Student: one applicant's full certificates
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scheme.studentFiles.map((f) => (
                    <a key={f} href={`${base}/scholarship/${f}`} download className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs hover:border-ink/25">
                      <Download className="h-3.5 w-3.5" aria-hidden /> {f.replace("student-", "").replace(".json", "")}
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">Load all three on the student tab to build a bundle.</p>
              </Card>
              <Card className="rounded-3xl p-5 sm:p-7">
                <p className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  <FileArchive className="h-3.5 w-3.5" aria-hidden /> Bulk: all {scheme.total} applications
                </p>
                <a href={`${base}/scholarship/applications.zip`} download className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-bg hover:bg-white">
                  <Download className="h-4 w-4" aria-hidden /> applications.zip
                </a>
                <p className="mt-3 text-xs text-muted">
                  Expected now: {Object.entries(scheme.counts).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(" · ")}.
                </p>
              </Card>
              <Card className="rounded-3xl border-bad/25 p-5 sm:p-7">
                <p className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-bad">
                  <Landmark className="h-3.5 w-3.5" aria-hidden /> The audit (authority console)
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Revoke key <span className="font-mono text-ink">{shortHex(scheme.issuers.fakeInstitute, 8, 6)}</span> (Demo Fake Institute) effective{" "}
                  <span className="font-mono text-ink">{new Date(scheme.auditCutoff * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>, then re-screen the ZIP.
                </p>
                <p className="mt-2 text-xs text-muted">
                  Expected after: {Object.entries(scheme.countsAfterAudit).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(" · ")}. It can only be done once on
                  this network: revocation cannot be undone.
                </p>
                <Link href="/issuer/admin" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline">
                  Open the authority console <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Card>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- run sheet */}
      <section className="mt-16" aria-labelledby="run-h">
        <h2 id="run-h" className="flex items-center gap-2 font-serif text-3xl">
          <MonitorPlay className="h-6 w-6 text-gold" aria-hidden /> Run sheet
        </h2>
        <ol className="mt-5 grid gap-2">
          {SCRIPT.map(([t, k, v]) => (
            <li key={k} className="glass grid grid-cols-[4rem_7rem_1fr] items-baseline gap-3 rounded-2xl px-4 py-3 text-sm">
              <span className="font-mono text-xs text-gold">{t}</span>
              <span className="font-medium">{k}</span>
              <span className="text-muted">{v}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-muted">
          <Badge>
            <ScanLine className="h-3 w-3" aria-hidden /> Fallback if Wi-Fi dies: <span className="font-mono">pnpm demo:local</span>
          </Badge>
          <Badge>Contracts {shortHex(deployment.certificateRegistry)} · {shortHex(deployment.issuerRegistry)}</Badge>
        </div>
      </section>
    </Page>
  );
}
