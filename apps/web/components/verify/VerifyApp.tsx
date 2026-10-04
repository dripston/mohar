"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Camera, FileUp, Link2, Loader2, Lock, ServerOff, ShieldCheck, UploadCloud } from "lucide-react";
import { parseProofFile, parseShortCode, parseVerifyInput, type ProofFile, type VerifyResult } from "@mohar/core";
import { Ambient, Button, Card, Input, Label, Page } from "@/components/ui/primitives";
import { extractProofFromPdf } from "@/lib/pdf";
import { verify, verifyCode } from "@/lib/verifier";
import { cn } from "@/lib/utils";
import { ResultSkeleton, ResultView, type ShownResult } from "./ResultView";
import { ScanDialog } from "./ScanDialog";

const MAX_FILE = 5 * 1024 * 1024;

function malformed(message: string): ShownResult {
  return {
    verdict: "MALFORMED",
    mode: "link",
    headline: "We could not read that",
    checks: ([1, 2, 3, 4, 5] as const).map((id) => ({ id, label: "", status: "skip" as const, detail: "Not run" })),
    verifiedAt: Math.floor(Date.now() / 1000),
    note: message,
  };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type State =
  | { phase: "idle" }
  | { phase: "loading"; what: string }
  | { phase: "done"; result: ShownResult };

export function VerifyApp({ initialCode }: { initialCode?: string }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const lastJob = useRef<(() => Promise<ShownResult>) | null>(null);
  const lastWhat = useRef("the certificate");
  const started = useRef(false);

  const execute = useCallback(
    async (what: string, job: () => Promise<ShownResult>) => {
      const id = ++runId.current;
      lastJob.current = job;
      lastWhat.current = what;
      setState({ phase: "loading", what });
      let result: ShownResult;
      try {
        result = await job();
      } catch (e) {
        result = malformed(`Something went wrong while verifying: ${errText(e)}`);
      }
      if (id !== runId.current) return;
      setState({ phase: "done", result });
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
      );
    },
    [reduce],
  );

  const runFile = useCallback(
    (file: ProofFile, what: string, expectCode?: string) =>
      execute(what, async () => {
        const r: ShownResult = await verify({ file });
        return withCodeNote(r, expectCode);
      }),
    [execute],
  );

  const runText = useCallback(
    (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      let parsed: ReturnType<typeof parseVerifyInput>;
      try {
        parsed = parseVerifyInput(input);
      } catch (e) {
        setState({
          phase: "done",
          result: malformed(
            `The link's data could not be decoded (${errText(e)}). It may have been cut short when copied. Try copying the whole link again, or upload the certificate file.`,
          ),
        });
        return;
      }
      if (parsed.presentation) {
        void runFile(parsed.presentation, "the shared certificate", parsed.code);
        return;
      }
      if (parsed.header) {
        const header = parsed.header;
        void execute("the certificate link", async () => withCodeNote(await verify({ header }), parsed.code));
        return;
      }
      const codeText = parsed.code ?? input;
      const code = parseShortCode(codeText);
      if (!code.ok) {
        setState({
          phase: "done",
          result: malformed(
            `${code.reason} Paste a full verification link, or a code that looks like MHR-7F3K-92QD-X4MP-C.`,
          ),
        });
        return;
      }
      void execute(`code ${code.code}`, async () => {
        const r = await verifyCode(code.bytes8);
        return { ...r, code: r.code ?? code.code };
      });
    },
    [execute, runFile],
  );

  const runUploaded = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      if (file.size > MAX_FILE) {
        setState({ phase: "done", result: malformed("That file is larger than 5 MB. A Mohar certificate is far smaller.") });
        return;
      }
      setState({ phase: "loading", what: file.name });
      let proof: ProofFile;
      try {
        if (name.endsWith(".pdf") || file.type === "application/pdf") {
          proof = await extractProofFromPdf(await file.arrayBuffer());
        } else if (name.endsWith(".json") || file.type === "application/json") {
          proof = parseProofFile(await file.text());
        } else {
          throw new Error("Only a certificate PDF or a .json proof file can be checked.");
        }
      } catch (e) {
        const m = errText(e);
        setState({
          phase: "done",
          result: malformed(
            m.includes("no embedded")
              ? "This PDF does not contain a Mohar proof file, so its contents cannot be checked. If it came from the issuer, ask them for the original file. If you have its QR code, scan it to check the issuer and status."
              : `${m.replace(/^malformed proof file: /, "The proof file is not valid: ")}`,
          ),
        });
        return;
      }
      void runFile(proof, file.name);
    },
    [runFile],
  );

  // deep link: /verify/[code]#fragment. The fragment is read in the browser only and never sent anywhere.
  useEffect(() => {
    if (started.current) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!initialCode && !hash) return;
    started.current = true;
    const code = initialCode ? decodeURIComponent(initialCode) : "";
    runText(`${code}${hash}`);
  }, [initialCode, runText]);

  const retry = () => {
    const job = lastJob.current;
    if (job) void execute(lastWhat.current, job);
  };
  const reset = () => {
    runId.current++;
    setState({ phase: "idle" });
    setText("");
    if (typeof window !== "undefined" && window.location.pathname !== "/verify") window.history.replaceState(null, "", "/verify");
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const busy = state.phase === "loading";

  return (
    <Page wide className="lg:pt-36">
      <Ambient tone="ok" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        {/* console */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <header>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden /> Public verification · no account
            </p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.95] tracking-tight text-ink sm:text-6xl">
              Is this certificate <span className="italic text-gradient">real?</span>
            </h1>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
              Checked against the blockchain from your browser. Scan the QR, paste the link or code, or drop in the file.
            </p>
          </header>

          <Card className="mt-7 p-4 sm:p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runText(text);
              }}
            >
              <Label htmlFor="verify-input">Link or verification code</Label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input
                  id="verify-input"
                  data-testid="verify-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="MHR-7F3K-92QD-X4MP-C or a link"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  className="h-12 pl-10 font-mono text-[0.88rem]"
                />
              </div>
              <Button type="submit" variant="seal" size="lg" disabled={busy || !text.trim()} data-testid="verify-submit" className="mt-3 w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                {busy ? "Checking the chain" : "Verify"}
                {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden />}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted" aria-hidden>
              <span className="hairline flex-1" /> or <span className="hairline flex-1" />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div
                role="button"
                tabIndex={0}
                data-testid="verify-drop"
                data-dragging={dragging ? "true" : "false"}
                aria-label="Drop a certificate PDF or proof file here, or press Enter to choose a file"
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void runUploaded(f);
                }}
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-6 text-center transition-all",
                  dragging ? "scale-[1.02] border-gold bg-gold/10" : "border-line bg-bg/40 hover:border-gold/50 hover:bg-gold/[0.04]",
                )}
              >
                <UploadCloud className={cn("h-6 w-6 transition-transform group-hover:-translate-y-0.5", dragging ? "text-gold" : "text-muted")} aria-hidden />
                <p className="text-sm font-medium text-ink">{dragging ? "Release to verify" : "Drop PDF or .json"}</p>
                <p className="text-[0.7rem] text-muted">Checks every field</p>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  data-testid="verify-file"
                  accept=".pdf,.json,application/pdf,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void runUploaded(f);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setScanning(true)}
                data-testid="verify-scan"
                className="group flex w-28 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-raised/60 text-sm font-medium text-ink transition hover:border-ink/25 hover:bg-raised"
              >
                <span className="relative grid h-10 w-10 place-items-center rounded-lg border border-line bg-bg/60">
                  <Camera className="h-5 w-5" aria-hidden />
                  <span className="absolute inset-x-1 top-1/2 h-px bg-ok/80 opacity-0 shadow-[0_0_8px_rgb(52_211_153)] transition-opacity group-hover:animate-scan group-hover:opacity-100" />
                </span>
                Scan QR
              </button>
            </div>
          </Card>

          <ul className="mt-5 hidden space-y-2.5 text-xs text-muted lg:block">
            <li className="flex items-center gap-2">
              <ServerOff className="h-3.5 w-3.5 text-gold" aria-hidden /> Reads the chain directly. Works if our servers vanish.
            </li>
            <li className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-gold" aria-hidden /> Link data stays in your browser, never uploaded.
            </li>
          </ul>
        </div>

        {/* result */}
        <div ref={resultRef} aria-live="polite" aria-atomic="false" className="min-w-0 scroll-mt-24" data-testid="verify-result-region">
          {state.phase === "loading" && <ResultSkeleton what={state.what} />}
          {state.phase === "done" && (
            <ResultView result={state.result} onRetry={retry} onUpload={() => fileRef.current?.click()} onReset={reset} />
          )}
          {state.phase === "idle" && <EmptyState />}
        </div>
      </div>

      {scanning && (
        <ScanDialog
          onClose={() => setScanning(false)}
          onResult={(t) => {
            setScanning(false);
            setText(t);
            runText(t);
          }}
        />
      )}
    </Page>
  );
}


/** If the link's printed code disagrees with the data it carries, say so rather than silently trusting either. */
function withCodeNote(r: VerifyResult, expectCode?: string): ShownResult {
  if (!expectCode || !r.code) return r;
  const norm = (s: string) => s.replace(/[-\s]/g, "").toUpperCase();
  const typed = parseShortCode(expectCode);
  if (typed.ok && norm(typed.code) !== norm(r.code)) {
    return {
      ...r,
      note: `The code in this link (${typed.code}) is different from the certificate it carries (${r.code}). The code is only a label, so this verdict is for the certificate inside the link. Be cautious: the link may have been edited.`,
    };
  }
  return r;
}

function EmptyState() {
  const items = [
    { icon: ServerOff, title: "No server in the loop", body: "Your browser asks the blockchain directly, through independent providers that must agree." },
    { icon: Lock, title: "Private by design", body: "Whatever a link carries stays in your browser. Nothing is uploaded, ever." },
    { icon: FileUp, title: "Two depths of proof", body: "A link or QR proves issuer and status. The file also proves every field is untouched." },
  ];
  const checks = ["Issuer accredited", "Domain vouches", "Signature valid", "Root anchored", "Status live"];
  return (
    <div data-testid="verify-empty" className="space-y-4">
      <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_1.1fr]">
          {/* a certificate silhouette being scanned */}
          <div aria-hidden className="relative mx-auto aspect-[1.35] w-full max-w-[300px] overflow-hidden rounded-lg border border-line bg-raised/60 p-4">
            <div className="h-full rounded border border-dashed border-line/90 p-4">
              <div className="mx-auto h-2 w-1/2 rounded bg-line" />
              <div className="mx-auto mt-2 h-1.5 w-1/4 rounded bg-line/70" />
              <div className="mx-auto mt-6 h-4 w-2/3 rounded bg-line" />
              <div className="mx-auto mt-3 h-2 w-1/2 rounded bg-line/70" />
              <div className="mt-6 flex items-end justify-between">
                <div className="h-1.5 w-1/4 rounded bg-line/70" />
                <div className="h-9 w-9 rounded-full bg-seal/30" />
                <div className="h-9 w-9 rounded bg-line/70" />
              </div>
            </div>
            <div className="absolute inset-x-0 h-12 animate-scan bg-gradient-to-b from-transparent via-ok/20 to-transparent">
              <div className="absolute inset-x-0 top-1/2 h-px bg-ok shadow-[0_0_12px_rgb(52_211_153)]" />
            </div>
          </div>
          <div>
            <p className="font-serif text-3xl leading-tight sm:text-4xl">Awaiting a certificate</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Give us a link, code, QR or file. These five checks run in order, against the chain:</p>
            <ol className="mt-5 space-y-2">
              {checks.map((c, i) => (
                <li key={c} className="flex items-center gap-3 text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-line font-mono text-[0.65rem] text-muted">{i + 1}</span>
                  <span className="text-ink/80">{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map(({ icon: I, title, body }) => (
          <div key={title} className="glass rounded-2xl p-5">
            <I className="h-5 w-5 text-gold" aria-hidden />
            <p className="mt-4 font-serif text-xl text-ink">{title}</p>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
