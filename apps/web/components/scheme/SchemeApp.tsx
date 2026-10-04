"use client";

import { useRef, useState } from "react";
import { Check, FileUp, ShieldCheck, X } from "lucide-react";
import {
  buildBundle,
  bundleToJson,
  DEMO_ST_SCHOLARSHIP,
  evaluateBundle,
  parseBundle,
  parseProofFile,
  previewShare,
  shareExpired,
  type Aggregate,
  type Bundle,
  type ProofFile,
  type SchemeResult,
} from "@mohar/core";
import { Ambient, Badge, Button, Card, Input, Label, Page, PageHeader } from "@/components/ui/primitives";
import { singleDeps } from "@/lib/scheme";
import { cn, downloadFile, stripUnsafe } from "@/lib/utils";

const AGG: Record<Aggregate, { label: string; tone: "ok" | "bad" | "warn" | "neutral"; text: string }> = {
  ELIGIBLE: { label: "Eligible", tone: "ok", text: "Every requirement is met by a credential that checked out on chain." },
  NOT_ELIGIBLE: { label: "Not eligible", tone: "warn", text: "The credentials are genuine but one or more requirements are not met." },
  INVALID: { label: "Invalid", tone: "bad", text: "A credential is tampered, revoked, from a revoked issuer, or not on chain." },
  INCOMPLETE: { label: "Incomplete", tone: "warn", text: "A required credential is missing from the bundle." },
  UNREACHABLE: { label: "Cannot reach chain", tone: "neutral", text: "No verdict: the chain providers could not be reached or disagreed. Retry." },
};

export function SchemeApp() {
  const [tab, setTab] = useState<"student" | "officer">("student");
  return (
    <Page>
      <Ambient />
      <PageHeader
        eyebrow="Demo scheme"
        title="Scholarship check"
        sub="Synthetic people, demo issuers, a demo scheme. Flags such as income_lte_250000 are issuer-attested salted leaves inside the normal Merkle tree. They are not zero knowledge."
      />
      <div className="mb-6 flex gap-2" role="tablist">
        {(["student", "officer"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} data-testid={`tab-${t}`}>
            {t === "student" ? "Student: build a bundle" : "Officer: check a bundle"}
          </Button>
        ))}
      </div>
      {tab === "student" ? <Student /> : <Officer />}
    </Page>
  );
}

function Student() {
  const [held, setHeld] = useState<ProofFile[]>([]);
  const [error, setError] = useState<string>();
  const [purpose, setPurpose] = useState("Demo ST Scholarship application");
  const [recipient, setRecipient] = useState("Demo Scholarship Office");
  const [days, setDays] = useState("7");
  const input = useRef<HTMLInputElement>(null);
  const scheme = DEMO_ST_SCHOLARSHIP;
  const lines = previewShare(scheme, held);

  async function add(files: FileList | null) {
    if (!files) return;
    setError(undefined);
    try {
      const next = [...held];
      for (const f of Array.from(files)) {
        const p = parseProofFile(await f.text());
        if (p.partial) throw new Error(`${f.name} is already a partial copy. Use your original certificate file.`);
        next.push(p);
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
  }

  return (
    <div className="space-y-5" data-testid="student-panel">
      <Card className="p-6">
        <p className="font-medium">1. Add your credentials</p>
        <p className="mt-1 text-sm text-muted">Your enrolment, caste and income certificate files. They stay on this device.</p>
        <input ref={input} type="file" multiple accept=".json,.mohar" className="sr-only" data-testid="student-files" onChange={(e) => void add(e.target.files)} />
        <Button className="mt-4" variant="secondary" onClick={() => input.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden /> Add certificate files
        </Button>
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
        <p className="mt-3 text-sm text-muted">{held.length} credential{held.length === 1 ? "" : "s"} loaded.</p>
      </Card>

      <Card className="p-6">
        <p className="font-medium">2. See exactly what will be shared for {scheme.name}</p>
        <ul className="mt-4 space-y-4" data-testid="share-preview">
          {lines.map((l) => (
            <li key={l.requirement} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{l.requirement}</span>
                <Badge tone={l.held ? "ok" : "warn"}>{l.held ? "credential found" : "missing"}</Badge>
              </div>
              {l.held && (
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-ok">Shared</p>
                    <ul className="mt-1 space-y-0.5 font-mono">{l.disclose.map((p) => <li key={p}>{stripUnsafe(p)}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-muted">Stays on your device</p>
                    <ul className="mt-1 space-y-0.5 font-mono text-muted">{l.hidden.map((p) => <li key={p}>{stripUnsafe(p)}</li>)}</ul>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <p className="font-medium">3. Label the share, then download</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="pp">Purpose</Label><Input id="pp" value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} /></div>
          <div><Label htmlFor="rc">Recipient</Label><Input id="rc" value={recipient} maxLength={120} onChange={(e) => setRecipient(e.target.value)} /></div>
          <div><Label htmlFor="dy">Advisory expiry (days)</Label><Input id="dy" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        </div>
        <p className="mt-3 text-xs text-muted">Purpose and expiry are advisory. A copied file carries them along, so they warn the officer but cannot stop reuse.</p>
        <p className="mt-2 text-xs text-muted">A bundle is a .mohar file, not a QR code: three credentials with proofs are far larger than a scannable QR. QR stays for single credentials.</p>
        <Button className="mt-5" size="lg" disabled={held.length === 0} onClick={download} data-testid="download-bundle">
          Download application.mohar
        </Button>
      </Card>
    </div>
  );
}

function Officer() {
  const [state, setState] = useState<{ busy: boolean; result?: SchemeResult; bundle?: Bundle; error?: string }>({ busy: false });
  const input = useRef<HTMLInputElement>(null);
  const scheme = DEMO_ST_SCHOLARSHIP;

  async function run(f: File | undefined) {
    if (!f) return;
    setState({ busy: true });
    try {
      const bundle = parseBundle(await f.text());
      const result = await evaluateBundle(bundle, scheme, singleDeps());
      setState({ busy: false, result, bundle });
    } catch (e) {
      setState({ busy: false, error: (e as Error).message });
    }
  }

  const r = state.result;
  const agg = r ? AGG[r.aggregate] : undefined;
  const expired = state.bundle && r ? shareExpired(state.bundle.share, r.chainTime?.timestamp ?? Math.floor(Date.now() / 1000)) : false;

  return (
    <div className="space-y-5" data-testid="officer-panel">
      <Card className="p-6">
        <p className="font-medium">{scheme.name} <Badge tone="gold">demo limits</Badge></p>
        <p className="mt-1 text-sm text-muted">Drop an application bundle. Every check is recomputed from the chain; nothing in the file is believed.</p>
        <input ref={input} type="file" accept=".json,.mohar" className="sr-only" data-testid="officer-file" onChange={(e) => void run(e.target.files?.[0])} />
        <Button className="mt-4" onClick={() => input.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden /> Choose application.mohar
        </Button>
      </Card>
      {state.busy && <p role="status" className="text-sm text-muted">Checking against the chain…</p>}
      {state.error && <p role="alert" className="text-sm text-bad" data-testid="officer-error">{stripUnsafe(state.error)}</p>}
      {r && agg && (
        <Card className="p-6" data-testid="officer-result" data-aggregate={r.aggregate}>
          <div className="flex flex-wrap items-center gap-3">
            <ShieldCheck className="h-6 w-6" aria-hidden />
            <h2 className="font-serif text-3xl" data-testid="aggregate">{agg.label}</h2>
            <Badge tone={agg.tone}>{r.aggregate}</Badge>
            {r.applicantId && <Badge>{stripUnsafe(r.applicantId)}</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted">{agg.text}</p>
          {r.degraded && <p className="mt-2 text-sm text-warn">Single source: fewer than two chain providers agreed on this answer.</p>}
          {state.bundle?.share && (
            <p className="mt-3 text-xs text-muted" data-testid="share-meta">
              Shared for: {stripUnsafe(state.bundle.share.purpose ?? "-")} · to {stripUnsafe(state.bundle.share.recipient ?? "-")}
              {expired && <span className="ml-2 font-semibold text-warn" data-testid="share-expired">Advisory expiry has passed. Ask for a fresh share.</span>}
            </p>
          )}
          <ul className="mt-5 divide-y divide-line" data-testid="checklist">
            {r.requirements.map((q) => (
              <li key={q.id} className="flex items-start gap-3 py-3" data-testid={`req-${q.id}`} data-code={q.code}>
                <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", q.pass ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad")}>
                  {q.pass ? <Check className="h-4 w-4" aria-label="pass" /> : <X className="h-4 w-4" aria-label="fail" />}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{q.label}</p>
                  <p className="text-xs text-muted"><span className="font-mono">{q.code}</span> · {stripUnsafe(q.detail)}{q.issuerName ? ` · ${stripUnsafe(q.issuerName)}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">No income figure or address was shared, so none can be shown. Checked at block {r.chainTime?.block ?? "?"}.</p>
        </Card>
      )}
    </div>
  );
}
