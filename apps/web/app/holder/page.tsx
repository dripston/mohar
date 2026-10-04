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
import { Badge, Button, Card, Mono } from "@/components/ui/primitives";
import { APP_ORIGIN } from "@/lib/config";
import { extractProofFromPdf, createCertificatePdf } from "@/lib/pdf";
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
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (f: File) => {
    setError(undefined);
    setQr(undefined);
    setLink(undefined);
    try {
      const parsed = f.name.toLowerCase().endsWith(".pdf") ? await extractProofFromPdf(await f.arrayBuffer()) : parseProofFile(await f.text());
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
    const presentation: ProofFile = { ...file, fields: discloseFields(file.fields, [...reveal]), partial: hiddenCount > 0 };
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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Your certificate, your disclosure</h1>
        <p className="mt-2 text-muted">
          Open the certificate file your institution gave you, choose which fields to reveal, and share a link or QR. Hidden fields stay hidden and the certificate still verifies.
        </p>
      </header>

      {!file && (
        <Card
          className="border-dashed p-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void load(f);
          }}
        >
          <FileUp className="mx-auto mb-3 text-seal" size={30} aria-hidden />
          <p className="font-medium">Drop your certificate PDF or proof file here</p>
          <p className="mt-1 text-sm text-muted">Everything stays in your browser.</p>
          <Button className="mt-5" onClick={() => input.current?.click()} data-testid="holder-pick">
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
            <p role="alert" className="mx-auto mt-4 max-w-md rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
        </Card>
      )}

      {file && (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Certificate</p>
                <p className="font-serif text-xl font-semibold">{parseValue(file.fields["credential.title"]?.value ?? '""')}</p>
                <Mono className="text-muted">{code}</Mono>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(undefined)}>
                Use another file
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Choose what to reveal</h2>
              <span data-testid="hidden-count">
                <Badge tone={hiddenCount ? "seal" : "neutral"}>
                  {hiddenCount ? <EyeOff size={12} /> : <Check size={12} />} {hiddenCount} hidden
                </Badge>
              </span>
            </div>
            <div className="space-y-5">
              {groups.map(([group, ps]) => (
                <fieldset key={group}>
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{group}</legend>
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {ps.map((p) => {
                      const on = reveal.has(p);
                      return (
                        <label key={p} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-raised">
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
                            className="h-4 w-4 accent-[rgb(var(--seal))]"
                          />
                          <span className="w-32 shrink-0 text-sm text-muted">{LABEL(p)}</span>
                          <span className={cn("min-w-0 flex-1 truncate text-sm", !on && "select-none text-muted/60 line-through decoration-muted/40")}>
                            {on ? parseValue(file.fields[p]!.value) : "hidden from the recipient of your link"}
                          </span>
                          {!on && <Lock size={14} className="text-muted" aria-hidden />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <Button className="mt-6" size="lg" onClick={generate} data-testid="generate-share">
              Create share link
            </Button>
          </Card>
        </>
      )}

      {file && link && (
        <Card className="p-6" data-testid="share-result">
          <h2 className="font-serif text-xl font-semibold">Share</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-[auto,1fr]">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code for the share link" width={180} height={180} className="rounded-lg border border-line bg-white p-2" data-testid="share-qr" />
            ) : (
              <p className="max-w-[180px] text-sm text-muted">This disclosure is too large for a scannable QR. Share the link, or send the file below.</p>
            )}
            <div className="min-w-0 space-y-3">
              <Mono className="block max-h-24 overflow-auto rounded-lg bg-raised p-2 text-muted" data-testid="share-link">
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
                  className="inline-flex h-8 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-raised"
                >
                  <Linkedin size={14} /> Add to LinkedIn
                </a>
              </div>
            </div>
          </div>
          {hiddenCount === 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () =>
                  file &&
                  downloadFile(
                    `${code}.pdf`,
                    await createCertificatePdf(file, buildVerifyUrl(APP_ORIGIN, code, { chainId: file.chainId, signer: file.signer, documentRoot: file.documentRoot, expiresAt: file.expiresAt, anchor: file.anchor })),
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
  );
}
