"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { validateSchemeDraft, type Scheme } from "@mohar/core";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { stripUnsafe } from "@/lib/utils";

/**
 * AI-assisted checklist drafting. The model only proposes JSON. The officer reads and edits it, and nothing is used
 * until they press Confirm. The draft is validated against the scheme schema first. The model never sees a
 * certificate and never decides a verdict: the cryptographic checks do that, afterwards, on the confirmed checklist.
 */
export function SchemeDrafter({ active, onConfirm }: { active: Scheme; onConfirm: (s: Scheme | undefined) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);

  async function propose() {
    setBusy(true);
    setError(undefined);
    setDraft("");
    setWarnings([]);
    try {
      const res = await fetch("/api/ai/scheme", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const j = (await res.json()) as { draft?: string; error?: string };
      if (!res.ok || !j.draft) throw new Error(j.error ?? `HTTP ${res.status}`);
      const v = validateSchemeDraft(j.draft);
      if (!v.ok) throw new Error(v.error);
      setDraft(JSON.stringify(v.scheme, null, 2));
      setWarnings(v.warnings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    // the officer may have edited the text: validate again, exactly what will be used
    const v = validateSchemeDraft(draft);
    if (!v.ok) return setError(v.error);
    setError(undefined);
    setWarnings(v.warnings);
    onConfirm({ ...v.scheme, name: `${v.scheme.name} (AI-drafted, officer-confirmed)` });
  }

  return (
    <Card className="p-6" data-testid="scheme-drafter">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4 text-gold" aria-hidden /> Draft a checklist from scheme text <Badge tone="gold">AI-assisted</Badge>
      </p>
      <p className="mt-1 text-sm text-muted">
        Paste the scheme's eligibility text. An AI proposes a checklist; you edit it and confirm. Only the pasted text is sent (no certificates, no personal data). The AI never decides a verdict.
      </p>
      <textarea className="mt-3 h-28 w-full rounded-xl border border-line bg-bg/60 p-3 text-sm" placeholder="e.g. Applicant must belong to a Scheduled Tribe, be enrolled in a recognised institute, and have family income up to Rs 2.5 lakh." maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} data-testid="draft-text" />
      <Button className="mt-3" variant="secondary" disabled={busy || text.trim().length < 10} onClick={() => void propose()} data-testid="draft-propose">
        {busy ? "Drafting…" : "Propose checklist"}
      </Button>
      {error && <p role="alert" className="mt-3 text-sm text-bad" data-testid="draft-error">{stripUnsafe(error)}</p>}
      {draft && (
        <div className="mt-4" data-testid="draft-review">
          <p className="text-sm font-medium">Review and edit. Not used until you confirm.</p>
          <textarea className="mt-2 h-64 w-full rounded-xl border border-line bg-bg/60 p-3 font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="draft-json" />
          {warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-warn" data-testid="draft-warning">{stripUnsafe(w)}</p>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={confirm} data-testid="draft-confirm">Confirm and use this checklist</Button>
            <Button variant="ghost" onClick={() => { setDraft(""); onConfirm(undefined); }}>Discard</Button>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted" data-testid="active-scheme">Checking against: {stripUnsafe(active.name)}</p>
    </Card>
  );
}
