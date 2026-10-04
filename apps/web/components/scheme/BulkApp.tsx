"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { DEMO_ST_SCHOLARSHIP, readZip, reportCsv, screenBundles, type ScreenRow, type ScreenSummary } from "@mohar/core";
import { Ambient, Badge, Button, Card, Page, PageHeader } from "@/components/ui/primitives";
import { bulkDeps } from "@/lib/scheme";
import { cn, downloadFile, stripUnsafe } from "@/lib/utils";

const ORDER = ["ELIGIBLE", "NOT_ELIGIBLE", "INVALID", "INCOMPLETE", "UNREACHABLE", "ROW_ERROR"] as const;
const TONE: Record<string, "ok" | "bad" | "warn" | "neutral"> = { ELIGIBLE: "ok", NOT_ELIGIBLE: "warn", INVALID: "bad", INCOMPLETE: "warn", UNREACHABLE: "neutral", ROW_ERROR: "neutral" };

export function BulkApp() {
  const scheme = DEMO_ST_SCHOLARSHIP;
  const [state, setState] = useState<{ busy?: boolean; progress?: [number, number]; rows?: ScreenRow[]; summary?: ScreenSummary; error?: string }>({});
  const [filter, setFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<"name" | "verdict">("verdict");
  const [open, setOpen] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  async function run(f: File | undefined) {
    if (!f) return;
    setState({ busy: true, progress: [0, 0] });
    try {
      const items = readZip(new Uint8Array(await f.arrayBuffer()));
      let last = 0;
      const out = await screenBundles(items, scheme, bulkDeps(), {
        onProgress: (d, t) => {
          const now = Date.now();
          if (d === t || now - last > 120) {
            last = now;
            setState((s) => ({ ...s, progress: [d, t] }));
          }
        },
      });
      setState({ rows: out.rows, summary: out.summary });
    } catch (e) {
      setState({ error: (e as Error).message });
    }
  }

  const shown = useMemo(() => {
    const rows = (state.rows ?? []).filter((r) => filter === "ALL" || r.aggregate === filter);
    return [...rows].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : ORDER.indexOf(a.aggregate) - ORDER.indexOf(b.aggregate) || a.name.localeCompare(b.name)));
  }, [state.rows, filter, sort]);

  const s = state.summary;
  return (
    <Page wide>
      <Ambient />
      <PageHeader
        eyebrow="Demo scheme"
        title="Bulk screening"
        sub="Drop a ZIP of application bundles. You get a shortlist from verdicts and reason codes only: no names, no income, no addresses. Every row is recomputed from the chain."
      />
      <Card className="p-6">
        <input ref={input} type="file" accept=".zip" className="sr-only" data-testid="bulk-file" onChange={(e) => void run(e.target.files?.[0])} />
        <Button onClick={() => input.current?.click()} disabled={state.busy}>
          <FileUp className="h-4 w-4" aria-hidden /> Choose applications.zip
        </Button>
        <p className="mt-3 text-xs text-muted">Limits: 5,000 files, 256 KB each. Larger or malformed files give a row error, never a crash.</p>
        {state.busy && (
          <div className="mt-4" role="status" data-testid="bulk-progress">
            <div className="h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-gold transition-all" style={{ width: `${state.progress && state.progress[1] ? (state.progress[0] / state.progress[1]) * 100 : 5}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{state.progress?.[0] ?? 0} of {state.progress?.[1] ?? 0}</p>
          </div>
        )}
        {state.error && <p role="alert" className="mt-3 text-sm text-bad" data-testid="bulk-error">{stripUnsafe(state.error)}</p>}
      </Card>

      {s && state.rows && (
        <div className="mt-6 space-y-5" data-testid="bulk-result">
          <Card className="p-5">
            <div className="flex flex-wrap gap-3" data-testid="bulk-summary">
              {ORDER.filter((k) => s.counts[k] > 0 || k !== "UNREACHABLE").map((k) => (
                <button key={k} onClick={() => setFilter(filter === k ? "ALL" : k)} className={cn("rounded-xl border px-4 py-2 text-left", filter === k ? "border-ink" : "border-line")} data-testid={`sum-${k}`}>
                  <span className="block text-2xl font-semibold">{s.counts[k]}</span>
                  <span className="text-xs text-muted">{k.replace("_", " ").toLowerCase()}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted" data-testid="bulk-timing">
              {s.total} applications in {(s.ms / 1000).toFixed(1)} s ({s.perSecond.toFixed(0)}/s), judged at block {s.block ?? "?"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSort(sort === "name" ? "verdict" : "name")}>Sort by {sort === "name" ? "verdict" : "name"}</Button>
              <Button variant="secondary" size="sm" onClick={() => downloadFile("screening-report.csv", reportCsv(state.rows!, scheme), "text/csv")} data-testid="bulk-csv">
                <Download className="h-4 w-4" aria-hidden /> Export CSV report
              </Button>
            </div>
          </Card>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm" data-testid="bulk-table">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr><th className="p-3">File</th><th className="p-3">Applicant</th><th className="p-3">Verdict</th><th className="p-3">Failed</th></tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((r) => (
                  <tr key={r.name} className="cursor-pointer border-t border-line hover:bg-raised/50" onClick={() => setOpen(open === r.name ? undefined : r.name)} data-testid="bulk-row" data-verdict={r.aggregate}>
                    <td className="p-3 font-mono text-xs">{stripUnsafe(r.name)}</td>
                    <td className="p-3">{stripUnsafe(r.applicantId ?? "-")}</td>
                    <td className="p-3"><Badge tone={TONE[r.aggregate]}>{r.aggregate}</Badge></td>
                    <td className="p-3 text-xs text-muted">
                      {r.error ? stripUnsafe(r.error) : r.failed.map((f) => `${f}: ${r.codes[f]}`).join(", ") || "-"}
                      {open === r.name && r.result && (
                        <ul className="mt-2 space-y-1 text-ink">
                          {r.result.requirements.map((q) => (
                            <li key={q.id}>{q.pass ? "✓" : "✗"} {q.label} <span className="font-mono text-muted">{q.code}</span></li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 && <p className="p-3 text-xs text-muted">Showing the first 500 of {shown.length}. Filter, or export the CSV for all rows.</p>}
          </Card>
        </div>
      )}
    </Page>
  );
}
