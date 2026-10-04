"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Check,
  Download,
  EyeOff,
  FileCheck2,
  GraduationCap,
  Landmark,
  Lock,
  RotateCcw,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Wallet,
  X,
} from "lucide-react";
import {
  buildBundle,
  bundleToJson,
  DEMO_ST_SCHOLARSHIP,
  evaluateBundle,
  parseBundle,
  parseProofFile,
  previewShare,
  shareExpired,
  type Bundle,
  type ProofFile,
  type Scheme,
  type SchemeResult,
} from "@mohar/core";
import { Ambient, Badge, Button, Card, Eyebrow, Input, Label, Page } from "@/components/ui/primitives";
import { DropZone } from "@/components/ui/DropZone";
import { SchemeDrafter } from "./SchemeDrafter";
import { SampleFiles } from "./SampleFiles";
import { AGG, CODE_TEXT, TONE_CLASS, TYPE_META, isFlag, labelOf } from "./labels";
import { singleDeps } from "@/lib/scheme";
import { cn, downloadFile, formatDate, stripUnsafe } from "@/lib/utils";

const SCENE = [
  { icon: Landmark, k: "Authority", v: "lists institutes and revenue offices" },
  { icon: Building2, k: "Issuers", v: "seal enrolment, caste and income" },
  { icon: Wallet, k: "Student", v: "shares only what the scheme needs" },
  { icon: ShieldCheck, k: "Officer", v: "checks it all against the chain" },
];

export function SchemeApp() {
  const [tab, setTab] = useState<"student" | "officer">("student");
  return (
    <Page>
      <Ambient tone="gold" />
      <header className="max-w-3xl">
        <Eyebrow>Scholarship check · demo scheme</Eyebrow>
        <h1 className="mt-3 font-serif text-[2.6rem] leading-[1] tracking-tight sm:text-6xl">
          Prove you qualify. <span className="text-gradient italic">Show nothing else.</span>
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          A student proves enrolment, ST status and income under a limit without revealing their name, income figure or address. The officer gets ticks that are
          recomputed from the blockchain, not taken from the file. People, issuers and limits here are synthetic.
        </p>
      </header>

      <ol className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="The scene">
        {SCENE.map((s, i) => (
          <li key={s.k} className="glass relative flex items-start gap-3 rounded-2xl p-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-raised text-gold">
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                {i + 1} · {s.k}
              </span>
              <span className="mt-0.5 block text-[0.82rem] text-ink">{s.v}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 inline-flex rounded-2xl border border-line bg-surface/70 p-1" role="tablist" aria-label="Who are you">
        {(["student", "officer"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            className={cn("relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors sm:px-5", tab === t ? "text-bg" : "text-muted hover:text-ink")}
          >
            {tab === t && <motion.span layoutId="scheme-tab" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative flex items-center gap-2">
              {t === "student" ? <GraduationCap className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              {t === "student" ? "I'm a student" : "I'm an officer"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === "student" ? <Student /> : <Officer />}</div>
    </Page>
  );
}

// ------------------------------------------------------------------ student

function StepTitle({ n, children, sub }: { n: number; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 font-mono text-xs text-gold">{n}</span>
      <div>
        <h2 className="font-serif text-2xl leading-tight">{children}</h2>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function Student() {
  const [held, setHeld] = useState<ProofFile[]>([]);
  const [error, setError] = useState<string>();
  const [purpose, setPurpose] = useState("Demo ST Scholarship application");
  const [recipient, setRecipient] = useState("Demo Scholarship Office");
  const [days, setDays] = useState("7");
  const [done, setDone] = useState(false);
  const scheme = DEMO_ST_SCHOLARSHIP;
  const lines = previewShare(scheme, held);
  const sharedCount = lines.reduce((n, l) => n + (l.held ? l.disclose.length : 0), 0);
  const hiddenCount = lines.reduce((n, l) => n + l.hidden.length, 0);

  async function add(files: File[]) {
    setError(undefined);
    setDone(false);
    try {
      const next = [...held];
      for (const f of files) {
        const p = parseProofFile(await f.text());
        if (p.partial) throw new Error(`${f.name} is already a partial copy. Use your original certificate file.`);
        if (!next.some((h) => h.documentRoot === p.documentRoot)) next.push(p);
      }
      setHeld(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function download() {
    const d = Number(days);
    const validUntil = d > 0 ? Math.floor(Date.now() / 1000) + d * 86400 : undefined;
    const b = buildBundle(scheme, held, { purpose: purpose.trim() || undefined, recipient: recipient.trim() || undefined, validUntil });
    downloadFile("application.mohar", bundleToJson(b), "application/json");
    setDone(true);
  }

  return (
    <div className="space-y-6" data-testid="student-panel">
      <Card className="rounded-3xl p-5 sm:p-7">
        <StepTitle n={1} sub="Your enrolment, caste and income certificate files. They are read in this browser and never uploaded.">
          Add your credentials
        </StepTitle>
        <SampleFiles kind="student" />
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <DropZone compact multiple accept=".json,.mohar" testId="student-files" onFiles={(f) => void add(f)} title="Drop certificate files here" hint="or click to choose. Use the complete files your issuers gave you." />
          <div className="grid gap-2 sm:grid-cols-3">
            {(["enrolment", "caste", "income"] as const).map((t) => {
              const f = held.find((h) => h.fields["credential.type"]?.value === JSON.stringify(t));
              return (
                <div key={t} className={cn("flex flex-col justify-between rounded-2xl border p-4 transition-colors", f ? "border-ok/30 bg-ok/[0.06]" : "border-line bg-bg/30")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">{TYPE_META[t].issuer}</span>
                    {f ? <Check className="h-4 w-4 text-ok" aria-label="loaded" /> : <span className="h-2 w-2 rounded-full bg-line" aria-hidden />}
                  </div>
                  <p className="mt-3 font-serif text-xl leading-none">{TYPE_META[t].label}</p>
                  <p className="mt-1 text-xs text-muted">{f ? "Loaded" : "Not added yet"}</p>
                </div>
              );
            })}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </Card>

      <Card className="rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <StepTitle n={2} sub={`Exactly what ${scheme.name} will receive, before anything leaves this device.`}>
            See what leaves, and what stays
          </StepTitle>
          {held.length > 0 && (
            <div className="flex gap-2 text-xs">
              <Badge tone="ok">{sharedCount} shared</Badge>
              <Badge>
                <Lock className="h-3 w-3" aria-hidden /> {hiddenCount} kept private
              </Badge>
            </div>
          )}
        </div>
        <ul className="mt-6 space-y-3" data-testid="share-preview">
          {lines.map((l) => (
            <li key={l.requirement} className="overflow-hidden rounded-2xl border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-raised/40 px-4 py-3">
                <span className="text-sm font-medium">{l.requirement}</span>
                <Badge tone={l.held ? "ok" : "warn"}>{l.held ? `${TYPE_META[l.credentialType].label} credential` : "missing"}</Badge>
              </div>
              {l.held ? (
                <div className="grid sm:grid-cols-2">
                  <div className="p-4">
                    <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ok">
                      <Send className="h-3 w-3" aria-hidden /> Leaves your device
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {l.disclose.map((p) => (
                        <li key={p} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="flex items-center gap-1.5">
                            {isFlag(p) && <span className="rounded bg-gold/15 px-1 text-[0.6rem] font-semibold uppercase tracking-wider text-gold">flag</span>}
                            {labelOf(p)}
                          </span>
                          <span className="truncate font-mono text-[0.68rem] text-muted">{stripUnsafe(p)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-t border-line bg-bg/40 p-4 sm:border-l sm:border-t-0">
                    <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                      <EyeOff className="h-3 w-3" aria-hidden /> Stays on your device
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {l.hidden.map((p) => (
                        <li key={p} className="flex items-center justify-between gap-3 text-sm text-muted">
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="inline-block h-2.5 w-14 rounded-sm bg-muted/25" />
                            {labelOf(p)}
                          </span>
                          <span className="truncate font-mono text-[0.68rem] text-muted/70">{stripUnsafe(p)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">Add your {TYPE_META[l.credentialType].label.toLowerCase()} certificate. Without it the officer will see the application as incomplete.</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Flags like “income at most ₹2.5 lakh” are signed by the issuer inside the certificate. The officer trusts the issuer that the flag is true, and learns
          nothing else. This is attested disclosure, not zero knowledge.
        </p>
      </Card>

      <Card className="rounded-3xl p-5 sm:p-7">
        <StepTitle n={3} sub="Labels travel with the file and warn the officer. A copied file keeps them, so they are advisory, not locks.">
          Label the share and download it
        </StepTitle>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="pp">Purpose</Label>
            <Input id="pp" value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rc">For</Label>
            <Input id="rc" value={recipient} maxLength={120} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dy">Advisory expiry, days</Label>
            <Input id="dy" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button size="lg" variant="seal" disabled={held.length === 0} onClick={download} data-testid="download-bundle">
            <Download className="h-5 w-5" aria-hidden /> Download application.mohar
          </Button>
          <AnimatePresence>
            {done && (
              <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm text-ok">
                <Check className="h-4 w-4" aria-hidden /> Saved. Hand this file to the scholarship office.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-xs text-muted">A bundle is a file, not a QR code: three credentials with their proofs are too large for a QR a phone can read reliably. QR stays for single certificates.</p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ officer

function Officer() {
  const reduce = useReducedMotion();
  const [custom, setCustom] = useState<Scheme>();
  const [state, setState] = useState<{ busy: boolean; result?: SchemeResult; bundle?: Bundle; error?: string; name?: string }>({ busy: false });
  const scheme = custom ?? DEMO_ST_SCHOLARSHIP;

  async function run(f: File | undefined) {
    if (!f) return;
    setState({ busy: true, name: f.name });
    try {
      const bundle = parseBundle(await f.text());
      const result = await evaluateBundle(bundle, scheme, singleDeps());
      setState({ busy: false, result, bundle, name: f.name });
    } catch (e) {
      setState({ busy: false, error: (e as Error).message });
    }
  }

  const r = state.result;
  const agg = r ? AGG[r.aggregate] : undefined;
  const tone = agg ? TONE_CLASS[agg.tone] : undefined;
  const expired = state.bundle && r ? shareExpired(state.bundle.share, r.chainTime?.timestamp ?? Math.floor(Date.now() / 1000)) : false;
  const Icon = r?.aggregate === "ELIGIBLE" ? ShieldCheck : r?.aggregate === "INVALID" ? ShieldAlert : ShieldQuestion;
  const passed = r ? r.requirements.filter((q) => q.pass).length : 0;

  return (
    <div className="space-y-6" data-testid="officer-panel">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Checking against</p>
              <h2 className="mt-1 font-serif text-2xl leading-tight">{stripUnsafe(scheme.name)}</h2>
            </div>
            <Badge tone="gold">demo limits</Badge>
          </div>
          <ol className="mt-4 space-y-2">
            {scheme.requirements.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 rounded-xl border border-line bg-bg/30 px-3 py-2.5 text-sm">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block text-ink">{stripUnsafe(q.label)}</span>
                  <span className="block text-xs text-muted">
                    {q.credentialType} credential from a {q.issuerType.toLowerCase().replace("_", " ")}
                    {q.flagsTrue.length ? ` · ${q.flagsTrue.map(labelOf).join(", ")}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Plus, for every credential: accredited issuer, not revoked, not suspended, not expired, issuer key valid when it was issued.</p>
        </Card>
        <Card className="flex flex-col rounded-3xl p-5 sm:p-7">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Application</p>
          <h2 className="mt-1 font-serif text-2xl leading-tight">Drop the student's bundle</h2>
          <div className="mt-4 flex-1">
            <DropZone
              accept=".json,.mohar"
              testId="officer-file"
              onFiles={(f) => void run(f[0])}
              disabled={state.busy}
              icon={<ScrollText className="h-6 w-6" aria-hidden />}
              title={state.busy ? "Checking against the chain…" : "application.mohar"}
              hint="Every check is recomputed from the blockchain. Nothing written inside the file is believed."
            />
          </div>
          <SampleFiles kind="officer" />
        </Card>
      </div>

      <SchemeDrafter
        active={scheme}
        onConfirm={(s) => {
          setCustom(s);
          setState({ busy: false });
        }}
      />

      {state.busy && (
        <Card className="relative overflow-hidden rounded-3xl p-6" role="status">
          <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="h-full w-1/3 animate-[marquee_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-gold to-transparent" />
          </div>
          <p className="text-sm text-muted">Reading each credential from independent providers and recomputing every proof…</p>
        </Card>
      )}
      {state.error && (
        <Card className="rounded-3xl border-bad/30 p-5" role="alert" data-testid="officer-error">
          <p className="font-medium text-bad">This file could not be read as an application bundle.</p>
          <p className="mt-1 text-sm text-muted">{stripUnsafe(state.error)}</p>
        </Card>
      )}

      <AnimatePresence mode="wait">
        {r && agg && tone && (
          <motion.section
            key={`${state.name}-${r.aggregate}`}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
            data-testid="officer-result"
            data-aggregate={r.aggregate}
          >
            <div className={cn("relative overflow-hidden rounded-3xl border p-6 sm:p-9", tone.border, tone.soft)}>
              <div aria-hidden className={cn("pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-gradient-to-br to-transparent blur-3xl", tone.glow)} />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                <motion.span
                  initial={reduce ? false : { scale: 0.3, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                  className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-bg sm:h-20 sm:w-20", tone.bg)}
                >
                  <Icon className="h-9 w-9 sm:h-11 sm:w-11" aria-hidden strokeWidth={2.2} />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-bold uppercase tracking-[0.22em]", tone.text)}>{r.aggregate.replace("_", " ")}</p>
                  <h2 className="mt-1 font-serif text-4xl leading-[1.02] tracking-tight sm:text-5xl" data-testid="aggregate">
                    {agg.label}
                  </h2>
                  <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink/85">{agg.text}</p>
                </div>
                <dl className="flex shrink-0 flex-row gap-6 sm:flex-col sm:items-end sm:gap-2 sm:text-right">
                  <div>
                    <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">Applicant</dt>
                    <dd className="font-mono text-sm text-ink">{r.applicantId ? stripUnsafe(r.applicantId) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">Requirements</dt>
                    <dd className="font-mono text-sm text-ink">
                      {passed} / {r.requirements.length} met
                    </dd>
                  </div>
                </dl>
              </div>
              {(r.degraded || state.bundle?.share) && (
                <div className="relative mt-6 flex flex-col gap-2 border-t border-line/70 pt-4 text-xs">
                  {r.degraded && <p className="text-warn">Single source: fewer than two chain providers agreed on this answer. Retry before acting on it.</p>}
                  {state.bundle?.share && (
                    <p className="text-muted" data-testid="share-meta">
                      Shared for <span className="text-ink">{stripUnsafe(state.bundle.share.purpose ?? "unspecified purpose")}</span> · to{" "}
                      <span className="text-ink">{stripUnsafe(state.bundle.share.recipient ?? "unspecified")}</span>
                      {state.bundle.share.validUntil ? ` · advisory expiry ${formatDate(state.bundle.share.validUntil)}` : ""}
                      {expired && (
                        <span className="ml-2 font-semibold text-warn" data-testid="share-expired">
                          The advisory expiry has passed. Ask for a fresh share.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            <ul className="grid gap-3 md:grid-cols-3" data-testid="checklist">
              {r.requirements.map((q, i) => (
                <motion.li
                  key={q.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  data-testid={`req-${q.id}`}
                  data-code={q.code}
                  className={cn("rounded-2xl border p-4", q.pass ? "border-ok/25 bg-ok/[0.05]" : "border-bad/25 bg-bad/[0.05]")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full", q.pass ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad")}>
                      {q.pass ? <Check className="h-4 w-4" aria-label="met" /> : <X className="h-4 w-4" aria-label="not met" />}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[0.62rem]", q.pass ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>{q.code}</span>
                  </div>
                  <p className="mt-3 font-medium leading-snug">{stripUnsafe(q.label)}</p>
                  <p className={cn("mt-1 text-sm", q.pass ? "text-ok" : "text-bad")}>{CODE_TEXT[q.code]}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{stripUnsafe(q.detail)}</p>
                  {q.issuerName && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      <FileCheck2 className="h-3 w-3" aria-hidden /> {stripUnsafe(q.issuerName)}
                    </p>
                  )}
                </motion.li>
              ))}
            </ul>

            <Card className="flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-muted">
                <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
                Not in the bundle, so not on this screen: name, income figure, address, caste details.
              </p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted">block {r.chainTime?.block ?? "?"}</span>
                <Button variant="secondary" size="sm" onClick={() => setState({ busy: false })}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Next application
                </Button>
              </div>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      {!r && !state.busy && !state.error && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ArrowRight className="h-4 w-4" aria-hidden /> No bundle yet? Build one on the student tab, or download a sample from the demo page.
        </p>
      )}
    </div>
  );
}
