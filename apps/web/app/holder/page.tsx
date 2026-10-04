"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Copy, EyeOff, FileUp, Download, Linkedin, Lock } from "lucide-react";
import {
  COUNT_PATH,
  buildVerifyUrl,
  certId,
  discloseFields,
  encodePresentation,
  fitsQr,
  parseProofFile,
  proofFileToJson,
  shortCode,
  type ProofFile,
} from "@mohar/core";
import { Ambient, Badge, Button, Card, Mono, Page, PageHeader } from "@/components/ui/primitives";
import { APP_ORIGIN } from "@/lib/config";
import { qrDataUrl } from "@/lib/qr";
import { cn, downloadFile } from "@/lib/utils";

const SECTION_ORDER = ["recipient", "credential", "issuer", "version"];
const LABEL = (p: string) => p.replace(/^(recipient|credential|issuer)\./, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const SENSITIVE = /grade|email|roll|phone|dob|address\b/i;

function parseValue(v: string) {
  try {
    const x = JSON.parse(v);
    return x === null ? "-" : String(x);
  } catch {
    return v;
  }
}

export default function HolderPage() {
  const [file, setFile] = useState<ProofFile>();
  const [error, setError] = useState<string>();
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [link, setLink] = useState<string>();
  const [purpose, setPurpose] = useState("");
  const [forWho, setForWho] = useState("");
  const [days, setDays] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (f: File) => {
    setError(undefined);
    setQr(undefined);
    setLink(undefined);
    try {
      const parsed = f.name.toLowerCase().endsWith(".pdf") ? await (await import("@/lib/pdf")).extractProofFromPdf(await f.arrayBuffer()) : parseProofFile(await f.text());
      if (parsed.partial) throw new Error("This is already a partial copy. Open your original, complete certificate file to choose what to share.");
      setFile(parsed);
      setReveal(new Set(Object.keys(parsed.fields).filter((p) => p !== COUNT_PATH && !SENSITIVE.test(p))));
    } catch (e) {
      setFile(undefined);
      setError((e as Error).message);
    }
  }, []);

  const paths = useMemo(() => (file ? Object.keys(file.fields).filter((p) => p !== COUNT_PATH).sort() : []), [file]);
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const p of paths) {
      const k = p.includes(".") ? p.split(".")[0]! : "document";
      g.set(k, [...(g.get(k) ?? []), p]);
    }
    return [...g.entries()].sort((a, b) => (SECTION_ORDER.indexOf(a[0]) + 99) % 99 - (SECTION_ORDER.indexOf(b[0]) + 99) % 99);
  }, [paths]);

  const code = file ? shortCode(certId(file.documentRoot)) : "";
  const hiddenCount = paths.length - reveal.size;

  async function generate() {
    if (!file) return;
    const d = Number(days);
    const share = purpose.trim() || forWho.trim() || d > 0
      ? { purpose: purpose.trim() || undefined, recipient: forWho.trim() || undefined, validUntil: d > 0 ? Math.floor(Date.now() / 1000) + d * 86400 : undefined }
      : undefined;
    const presentation: ProofFile = { ...file, fields: discloseFields(file.fields, [...reveal]), partial: hiddenCount > 0, ...(share ? { share } : {}) };
    const url = `${APP_ORIGIN}/verify/${code}#${encodePresentation(presentation)}`;
    setLink(url);
    setQr(fitsQr(url) ? await qrDataUrl(url, 360) : undefined);
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(undefined), 1600);
    } catch {
      /* clipboard unavailable: the link is selectable on screen */
    }
  }

  const linkedIn = file
    ? "https://www.linkedin.com/profile/add?" +
      new URLSearchParams({
        startTask: "CERTIFICATION_NAME",
        name: parseValue(file.fields["credential.title"]?.value ?? '""'),
        organizationName: parseValue(file.fields["issuer.name"]?.value ?? '""'),
        certUrl: buildVerifyUrl(APP_ORIGIN, code, { chainId: file.chainId, signer: file.signer, documentRoot: file.documentRoot, expiresAt: file.expiresAt, anchor: file.anchor }),
        certId: code,
      }).toString()
    : "#";

  const shown = paths.filter((p) => reveal.has(p));

  return (
    <Page wide>
      <Ambient tone="seal" />
      <PageHeader
        eyebrow="Holder studio"
        title={
          <>
            Your certificate. <span className="italic text-gradient">Your rules.</span>
          </>
        }
        sub="Open the file your institution gave you, choose which fields to reveal, and share a link or QR. Hidden fields stay hidden, and what you show still verifies against the chain."
      />

      {!file && (
        <div
          className="glass mt-10 rounded-3xl p-3 sm:p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void load(f);
          }}
        >
          <div className="relative grid place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-bg/40 px-6 py-16 text-center sm:py-24">
            <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-line bg-raised shadow-[0_0_50px_-10px_rgb(240_74_56/0.5)]">
              <FileUp className="h-8 w-8 text-seal" aria-hidden />
            </span>
            <p className="relative mt-5 font-serif text-4xl">Drop your certificate here</p>
            <p className="relative mt-2 text-sm text-muted">PDF or .mohar.json. Everything stays in your browser.</p>
            <Button className="relative mt-7" size="lg" onClick={() => input.current?.click()} data-testid="holder-pick">
              Choose file
            </Button>
            <input
              ref={input}
              type="file"
              accept=".pdf,.json,application/json,application/pdf"
              className="sr-only"
              data-testid="holder-file"
              onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])}
            />
            {error && (
              <p role="alert" className="relative mx-auto mt-5 max-w-md rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {file && (
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
          {/* chooser */}
          <Card className="rounded-3xl p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">Certificate</p>
                <p className="mt-1 font-serif text-3xl leading-tight">{parseValue(file.fields["credential.title"]?.value ?? '""')}</p>
                <Mono className="text-muted">{code}</Mono>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(undefined)}>
                Use another file
              </Button>
            </div>

            <div className="mb-4 mt-6 flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl">Choose what to reveal</h2>
              <span data-testid="hidden-count">
                <Badge tone={hiddenCount ? "seal" : "neutral"}>
                  {hiddenCount ? <EyeOff size={12} /> : <Check size={12} />} {hiddenCount} hidden
                </Badge>
              </span>
            </div>
            <div className="space-y-5">
              {groups.map(([group, ps]) => (
                <fieldset key={group}>
                  <legend className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gold">{group}</legend>
                  <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-bg/30">
                    {ps.map((p) => {
                      const on = reveal.has(p);
                      return (
                        <label key={p} className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-raised/50">
                          <input
                            type="checkbox"
                            checked={on}
                            data-testid={`reveal-${p}`}
                            onChange={() => {
                              const n = new Set(reveal);
                              on ? n.delete(p) : n.add(p);
                              setReveal(n);
                              setLink(undefined);
                              setQr(undefined);
                            }}
                            className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-line bg-raised transition-colors before:absolute before:left-0.5 before:top-1/2 before:h-3.5 before:w-3.5 before:-translate-y-1/2 before:rounded-full before:bg-muted before:transition-all checked:border-ok/50 checked:bg-ok/25 checked:before:translate-x-4 checked:before:bg-ok"
                          />
                          <span className="w-28 shrink-0 text-sm text-muted sm:w-32">{LABEL(p)}</span>
                          <span className={cn("min-w-0 flex-1 truncate text-sm", on ? "text-ink" : "select-none text-muted/60")}>
                            {on ? parseValue(file.fields[p]!.value) : "hidden from the recipient"}
                          </span>
                          {!on && <Lock size={14} className="shrink-0 text-muted" aria-hidden />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>

          {/* what they see */}
          <div className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <Card className="relative overflow-hidden rounded-3xl p-5 sm:p-7">
              <p className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
                <span className="h-2 w-2 rounded-full bg-ok" /> What the verifier will see
              </p>
              <div className="paper-texture mt-4 rounded-xl p-5 text-[#1c1814] shadow-paper">
                <dl className="space-y-2.5">
                  {shown.map((p) => (
                    <div key={p} className="flex items-baseline justify-between gap-4 border-b border-[#a8843f]/25 pb-2 last:border-0">
                      <dt className="shrink-0 text-xs text-[#7a705f]">{LABEL(p)}</dt>
                      <dd className="min-w-0 truncate text-right font-cert text-sm">{parseValue(file.fields[p]!.value)}</dd>
                    </div>
                  ))}
                  {paths
                    .filter((p) => !reveal.has(p))
                    .map((p) => (
                      <div key={p} className="flex items-center justify-between gap-4 border-b border-[#a8843f]/25 pb-2 last:border-0">
                        <dt className="flex shrink-0 items-center gap-1.5 text-xs text-[#7a705f]">
                          <Lock className="h-3 w-3" aria-hidden /> {LABEL(p)}
                        </dt>
                        <dd className="h-3 w-24 rounded-sm bg-[#1c1814]/85" aria-label="hidden" />
                      </div>
                    ))}
                </dl>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="share-labels">
                <input className="h-10 rounded-xl border border-line bg-bg/60 px-3 text-sm" placeholder="Purpose (optional)" maxLength={120} value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="share-purpose" />
                <input className="h-10 rounded-xl border border-line bg-bg/60 px-3 text-sm" placeholder="For (optional)" maxLength={120} value={forWho} onChange={(e) => setForWho(e.target.value)} data-testid="share-for" />
                <input className="h-10 rounded-xl border border-line bg-bg/60 px-3 text-sm" placeholder="Advisory expiry, days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} data-testid="share-days" />
              </div>
              <p className="mt-2 text-xs text-muted">Purpose and expiry are advisory labels. A copied link keeps them, so they warn but cannot stop reuse.</p>
              <Button variant="seal" className="mt-5 w-full" size="lg" onClick={generate} data-testid="generate-share">
                Create share link
              </Button>
            </Card>

            {link && (
              <Card className="rounded-3xl p-5 sm:p-7" data-testid="share-result">
                <h2 className="font-serif text-3xl">Share</h2>
                <div className="mt-5 grid gap-5 sm:grid-cols-[auto,1fr]">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR code for the share link" width={168} height={168} className="rounded-2xl bg-white p-2.5" data-testid="share-qr" />
                  ) : (
                    <p className="max-w-[180px] text-sm text-muted">This disclosure is too large for a scannable QR. Share the link, or send the file below.</p>
                  )}
                  <div className="min-w-0 space-y-3">
                    <Mono className="block max-h-24 overflow-auto rounded-xl border border-line bg-bg/60 p-2.5 text-muted" data-testid="share-link">
                      {link}
                    </Mono>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => copy(link, "link")} data-testid="copy-share-link">
                        {copied === "link" ? <Check size={14} /> : <Copy size={14} />} Copy link
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => file && downloadFile(`${code}.partial.json`, proofFileToJson({ ...file, fields: discloseFields(file.fields, [...reveal]), partial: hiddenCount > 0 }), "application/json")}
                      >
                        <Download size={14} /> Download this disclosure
                      </Button>
                      <a
                        href={linkedIn}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-2 rounded-xl border border-line bg-raised/70 px-3 text-[0.8rem] font-medium hover:bg-raised"
                      >
                        <Linkedin size={14} /> Add to LinkedIn
                      </a>
                    </div>
                  </div>
                </div>
                {hiddenCount === 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () =>
                        file &&
                        downloadFile(
                          `${code}.pdf`,
                          await (await import("@/lib/pdf")).createCertificatePdf(file, buildVerifyUrl(APP_ORIGIN, code, { chainId: file.chainId, signer: file.signer, documentRoot: file.documentRoot, expiresAt: file.expiresAt, anchor: file.anchor })),
                          "application/pdf",
                        )
                      }
                    >
                      <Download size={14} /> Download PDF
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
