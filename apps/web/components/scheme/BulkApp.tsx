"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronRight, Download, FileArchive, Gauge, Timer } from "lucide-react";
import { DEMO_ST_SCHOLARSHIP, readZip, reportCsv, screenBundles, type ScreenRow, type ScreenSummary } from "@mohar/core";
import { Ambient, Badge, Button, Card, Eyebrow, Page } from "@/components/ui/primitives";
import { DropZone } from "@/components/ui/DropZone";
import { CODE_TEXT } from "./labels";
import { SampleFiles } from "./SampleFiles";
import { bulkDeps } from "@/lib/scheme";
import { cn, downloadFile, stripUnsafe } from "@/lib/utils";

const ORDER = ["ELIGIBLE", "NOT_ELIGIBLE", "INVALID", "INCOMPLETE", "UNREACHABLE", "ROW_ERROR"] as const;
type Key = (typeof ORDER)[number];
const META: Record<Key, { label: string; bar: string; text: string; tone: "ok" | "bad" | "warn" | "neutral" }> = {
  ELIGIBLE: { label: "Eligible", bar: "bg-ok", text: "text-ok", tone: "ok" },
  NOT_ELIGIBLE: { label: "Not eligible", bar: "bg-warn", text: "text-warn", tone: "warn" },
  INVALID: { label: "Invalid", bar: "bg-bad", text: "text-bad", tone: "bad" },
  INCOMPLETE: { label: "Incomplete", bar: "bg-warn/60", text: "text-warn", tone: "warn" },
  UNREACHABLE: { label: "No verdict", bar: "bg-muted", text: "text-muted", tone: "neutral" },
  ROW_ERROR: { label: "Unreadable", bar: "bg-muted/50", text: "text-muted", tone: "neutral" },
};

function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    setMs(0);
    const id = setInterval(() => setMs(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}

export function BulkApp() {
  const reduce = useReducedMotion();
  const scheme = DEMO_ST_SCHOLARSHIP;
  const [state, setState] = useState<{ busy?: boolean; progress?: [number, number]; rows?: ScreenRow[]; summary?: ScreenSummary; error?: string; file?: string }>({});
  const [previous, setPrevious] = useState<{ summary: ScreenSummary; rows: ScreenRow[]; file?: string }>();
  const [filter, setFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<"name" | "verdict">("verdict");
  const [open, setOpen] = useState<string>();
  const elapsed = useElapsed(!!state.busy);
  const last = useRef(0);

  async function run(f: File | undefined) {
    if (!f) return;
    if (state.summary && state.rows) setPrevious({ summary: state.summary, rows: state.rows, file: state.file });
    setFilter("ALL");
    setOpen(undefined);
    setState({ busy: true, progress: [0, 0], file: f.name });
    try {
      const items = readZip(new Uint8Array(await f.arrayBuffer()));
      const out = await screenBundles(items, scheme, bulkDeps(), {
        onProgress: (d, t) => {
          const now = performance.now();
          if (d === t || now - last.current > 80) {
            last.current = now;
            setState((s) => ({ ...s, progress: [d, t] }));
          }
        },
      });
      setState({ rows: out.rows, summary: out.summary, file: f.name });
    } catch (e) {
      setState({ error: (e as Error).message, file: f.name });
    }
  }

  const changed = useMemo(() => {
    if (!previous || !state.rows) return new Set<string>();
    const before = new Map(previous.rows.map((r) => [r.name, r.aggregate]));
    return new Set(state.rows.filter((r) => before.has(r.name) && before.get(r.name) !== r.aggregate).map((r) => r.name));
  }, [previous, state.rows]);

  const shown = useMemo(() => {
    const rows = (state.rows ?? []).filter((r) => (filter === "ALL" ? true : filter === "CHANGED" ? changed.has(r.name) : r.aggregate === filter));
    return [...rows].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : ORDER.indexOf(a.aggregate) - ORDER.indexOf(b.aggregate) || a.name.localeCompare(b.name)));
  }, [state.rows, filter, sort, changed]);

  const s = state.summary;
  const [done, total] = state.progress ?? [0, 0];
  const visible = ORDER.filter((k) => (s ? s.counts[k] > 0 || ["ELIGIBLE", "NOT_ELIGIBLE", "INVALID", "INCOMPLETE"].includes(k) : false));

  return (
    <Page wide>
      <Ambient tone="seal" />
      <header className="max-w-3xl">
        <Eyebrow tone="seal">Scheme office · bulk screening</Eyebrow>
        <h1 className="mt-3 font-serif text-[2.6rem] leading-[1] tracking-tight sm:text-6xl">
          A thousand applications. <span className="text-gradient italic">One shortlist.</span>
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          Drop a ZIP of application bundles. Every credential in every file is checked against the blockchain at one pinned block. You see verdicts and reason
          codes, never names, incomes or addresses.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="rounded-3xl p-5 sm:p-7">
          <DropZone
            accept=".zip"
            testId="bulk-file"
            disabled={state.busy}
            onFiles={(f) => void run(f[0])}
            icon={<FileArchive className="h-6 w-6" aria-hidden />}
            title={state.busy ? "Screening…" : previous || s ? "Drop the next ZIP to re-screen" : "Drop applications.zip"}
            hint="Up to 5,000 files of 256 KB each. A broken or oversized file becomes a row error, never a crash."
          />
          <SampleFiles kind="bulk" />
          {state.error && (
            <p role="alert" className="mt-3 text-sm text-bad" data-testid="bulk-error">
              {stripUnsafe(state.error)}
            </p>
          )}
        </Card>

        <Card className="flex flex-col justify-center rounded-3xl p-5 sm:p-7" aria-live="polite">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                <Timer className="h-3 w-3" aria-hidden /> Elapsed
              </p>
              <p className="mt-1 font-mono text-4xl tabular-nums text-ink">{((state.busy ? elapsed : s?.ms ?? 0) / 1000).toFixed(1)}s</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                <Gauge className="h-3 w-3" aria-hidden /> Throughput
              </p>
              <p className="mt-1 font-mono text-4xl tabular-nums text-ink">
                {state.busy ? (elapsed > 300 ? Math.round(done / (elapsed / 1000)) : 0) : s ? Math.round(s.perSecond) : 0}
                <span className="ml-1 text-base text-muted">/s</span>
              </p>
            </div>
          </div>
          <div className="mt-5" data-testid={state.busy ? "bulk-progress" : undefined} role={state.busy ? "status" : undefined}>
            <div className="h-2 overflow-hidden rounded-full bg-raised">
              <motion.div className="h-full bg-gradient-to-r from-gold to-seal" animate={{ width: `${state.busy ? (total ? (done / total) * 100 : 3) : s ? 100 : 0}%` }} transition={{ ease: "linear", duration: 0.15 }} />
            </div>
            <p className="mt-2 font-mono text-xs text-muted">{state.busy ? `${done} of ${total || "…"}` : s ? `${s.total} screened · block ${s.block ?? "?"}` : "Waiting for a ZIP"}</p>
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {s && state.rows && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-6" data-testid="bulk-result">
            <Card className="rounded-3xl p-5 sm:p-7">
              <div className="flex h-3 overflow-hidden rounded-full bg-raised" aria-hidden>
                {ORDER.map((k) =>
                  s.counts[k] ? (
                    <motion.div key={k} className={META[k].bar} initial={{ width: 0 }} animate={{ width: `${(s.counts[k] / s.total) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                  ) : null,
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="bulk-summary">
                {visible.map((k) => {
                  const delta = previous ? s.counts[k] - previous.summary.counts[k] : 0;
                  return (
                    <button
                      key={k}
                      onClick={() => setFilter(filter === k ? "ALL" : k)}
                      aria-pressed={filter === k}
                      className={cn("rounded-2xl border p-4 text-left transition-colors", filter === k ? "border-ink/60 bg-raised" : "border-line hover:border-ink/25")}
                      data-testid={`sum-${k}`}
                    >
                      <span className={cn("block font-serif text-4xl leading-none tabular-nums", META[k].text)}>{s.counts[k]}</span>
                      <span className="mt-2 flex items-center justify-between text-xs text-muted">
                        {META[k].label}
                        {delta !== 0 && (
                          <span className={cn("flex items-center font-mono", delta > 0 && k !== "ELIGIBLE" ? "text-bad" : "text-ok")}>
                            {delta > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
                            {Math.abs(delta)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-muted" data-testid="bulk-timing">
                {s.total} applications in {(s.ms / 1000).toFixed(1)} s ({s.perSecond.toFixed(0)}/s), judged at block {s.block ?? "?"}.
                {s.duplicates > 0 && ` ${s.duplicates} duplicate applicant id${s.duplicates === 1 ? "" : "s"} (copied or replayed bundles).`}
              </p>
            </Card>

            {previous && changed.size > 0 && (
              <motion.div initial={reduce ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="flex flex-col gap-3 rounded-3xl border-bad/30 bg-bad/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="bulk-changed">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-bad">Changed since the last screen</p>
                    <p className="mt-1 font-serif text-3xl leading-tight">
                      {changed.size} application{changed.size === 1 ? "" : "s"} flipped
                    </p>
                    <p className="mt-1 text-sm text-muted">Same files, new chain state. If the authority revoked an institute, every certificate it issued after the cut-off date now fails.</p>
                  </div>
                  <Button variant={filter === "CHANGED" ? "primary" : "secondary"} onClick={() => setFilter(filter === "CHANGED" ? "ALL" : "CHANGED")}>
                    {filter === "CHANGED" ? "Show all" : "Show only these"}
                  </Button>
                </Card>
              </motion.div>
            )}

            <Card className="overflow-hidden rounded-3xl p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <p className="text-sm text-muted">
                  {shown.length} row{shown.length === 1 ? "" : "s"}
                  {filter !== "ALL" && (
                    <button className="ml-2 text-gold underline-offset-2 hover:underline" onClick={() => setFilter("ALL")}>
                      clear filter
                    </button>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setSort(sort === "name" ? "verdict" : "name")}>
                    Sort by {sort === "name" ? "verdict" : "file name"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => downloadFile("screening-report.csv", reportCsv(state.rows!, scheme), "text/csv")} data-testid="bulk-csv">
                    <Download className="h-4 w-4" aria-hidden /> CSV report
                  </Button>
                </div>
              </div>
              <div className="max-h-[640px] overflow-auto">
                <table className="w-full text-sm" data-testid="bulk-table">
                  <thead className="sticky top-0 z-10 bg-surface/95 text-left text-[0.62rem] uppercase tracking-[0.16em] text-muted backdrop-blur">
                    <tr>
                      <th className="px-5 py-3 font-semibold">File</th>
                      <th className="px-3 py-3 font-semibold">Applicant</th>
                      <th className="px-3 py-3 font-semibold">Verdict</th>
                      <th className="px-3 py-3 font-semibold">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 500).map((r) => (
                      <Fragment key={r.name}>
                        <tr
                          className={cn("cursor-pointer border-t border-line transition-colors hover:bg-raised/50", changed.has(r.name) && "bg-bad/[0.06]")}
                          onClick={() => setOpen(open === r.name ? undefined : r.name)}
                          data-testid="bulk-row"
                          data-verdict={r.aggregate}
                        >
                          <td className="px-5 py-3 font-mono text-xs">{stripUnsafe(r.name)}</td>
                          <td className="px-3 py-3 font-mono text-xs">{stripUnsafe(r.applicantId ?? "-")}</td>
                          <td className="px-3 py-3">
                            <Badge tone={META[r.aggregate].tone}>{META[r.aggregate].label}</Badge>
                            {r.duplicateOf && (
                              <span data-testid="dup-badge">
                                <Badge tone="warn" className="ml-1">
                                  duplicate of {stripUnsafe(r.duplicateOf)}
                                </Badge>
                              </span>
                            )}
                            {changed.has(r.name) && <span className="ml-1 text-[0.65rem] font-semibold uppercase tracking-wider text-bad">changed</span>}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted">
                            <span className="flex items-center justify-between gap-2">
                              {r.error ? stripUnsafe(r.error) : r.failed.map((f) => `${f}: ${CODE_TEXT[r.codes[f]!] ?? r.codes[f]}`).join(" · ") || "All requirements met"}
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open === r.name && "rotate-90")} aria-hidden />
                            </span>
                          </td>
                        </tr>
                        {open === r.name && r.result && (
                          <tr className="bg-bg/40">
                            <td colSpan={4} className="px-5 pb-4 pt-1">
                              <ul className="grid gap-2 sm:grid-cols-3">
                                {r.result.requirements.map((q) => (
                                  <li key={q.id} className={cn("rounded-xl border px-3 py-2 text-xs", q.pass ? "border-ok/25" : "border-bad/25")}>
                                    <span className={q.pass ? "text-ok" : "text-bad"}>{q.pass ? "✓" : "✗"}</span> {stripUnsafe(q.label)}
                                    <span className="mt-0.5 block font-mono text-muted">
                                      {q.code} · {stripUnsafe(q.detail)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown.length > 500 && <p className="border-t border-line px-5 py-3 text-xs text-muted">Showing the first 500 of {shown.length}. Filter, or export the CSV for every row.</p>}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
