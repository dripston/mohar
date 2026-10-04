"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Camera, FileUp, Link2, Lock, ServerOff, ShieldCheck, UploadCloud } from "lucide-react";
import { parseProofFile, parseShortCode, parseVerifyInput, type ProofFile, type VerifyResult } from "@mohar/core";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { extractProofFromPdf } from "@/lib/pdf";
import { verify, verifyCode } from "@/lib/verifier";
import { cn } from "@/lib/utils";
import { ResultSkeleton, ResultView, type ShownResult } from "./ResultView";
import { ScanDialog } from "./ScanDialog";

const MAX_FILE = 20 * 1024 * 1024;

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
        setState({ phase: "done", result: malformed("That file is larger than 20 MB. A Mohar certificate is far smaller.") });
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
    <div className="mx-auto w-full max-w-3xl">
      <header className="pb-6 pt-2 sm:pb-8 sm:pt-6">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-seal" aria-hidden /> Public verification. No account needed.
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-[1.08] text-ink sm:text-5xl">Is this certificate real?</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
          Check any Mohar certificate against the blockchain in seconds. Scan its QR code, paste its link or code, or drop in the file.
        </p>
      </header>

      <Card className="p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runText(text);
          }}
        >
          <Label htmlFor="verify-input">Link or verification code</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                id="verify-input"
                data-testid="verify-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="MHR-7F3K-92QD-X4MP-C or a verify link"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                className="h-12 pl-10 font-mono text-[0.9rem]"
              />
            </div>
            <Button type="submit" size="lg" disabled={busy || !text.trim()} data-testid="verify-submit" className="sm:w-36">
              Verify <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
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
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              dragging ? "border-seal bg-seal/10" : "border-line bg-raised hover:border-ink/40",
            )}
          >
            <UploadCloud className={cn("h-7 w-7", dragging ? "text-seal" : "text-muted")} aria-hidden />
            <p className="text-sm font-medium text-ink">{dragging ? "Release to verify" : "Drop the certificate PDF or .json file"}</p>
            <p className="text-xs text-muted">Checks every field, not just the issuer. Or tap to choose a file.</p>
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

          <Button
            variant="secondary"
            size="lg"
            onClick={() => setScanning(true)}
            data-testid="verify-scan"
            className="h-auto min-h-12 flex-col gap-1 py-4 sm:w-40"
          >
            <Camera className="h-6 w-6" aria-hidden />
            <span>Scan QR</span>
          </Button>
        </div>
      </Card>

      <div ref={resultRef} aria-live="polite" aria-atomic="false" className="scroll-mt-20 pt-6" data-testid="verify-result-region">
        {state.phase === "loading" && <ResultSkeleton what={state.what} />}
        {state.phase === "done" && (
          <ResultView result={state.result} onRetry={retry} onUpload={() => fileRef.current?.click()} onReset={reset} />
        )}
        {state.phase === "idle" && <EmptyState />}
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
    </div>
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
    { icon: ServerOff, title: "No server in the loop", body: "Your browser asks the blockchain directly. It still works if our website goes down." },
    { icon: Lock, title: "Private by design", body: "The data in a link stays in your browser. It is never uploaded anywhere." },
    { icon: FileUp, title: "Two depths of proof", body: "A link proves issuer and status. The file also proves every field is untouched." },
  ];
  return (
    <div data-testid="verify-empty" className="grid gap-3 sm:grid-cols-3">
      {items.map(({ icon: I, title, body }) => (
        <div key={title} className="rounded-2xl border border-line bg-surface/60 p-4">
          <I className="h-5 w-5 text-seal" aria-hidden />
          <p className="mt-3 font-serif text-lg text-ink">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        </div>
      ))}
    </div>
  );
}
