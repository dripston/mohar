"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, FileStack, Layers, Loader2, PauseCircle, PlayCircle, RefreshCw, Search } from "lucide-react";
import { reasonText, reinstateCert, revokeCert, suspendCert, type CertState, type ChainCert, type ProofFile } from "@mohar/core";
import { Badge, Button, Card, Input, Mono, Select, Skeleton } from "@/components/ui/primitives";
import { newReader } from "@/lib/verifier";
import { cn, formatDate } from "@/lib/utils";
import { useIssuer } from "./IssuerContext";
import { Modal } from "./Modal";
import { ArchiveBanner } from "./ResultPanel";
import { REASON_OPTIONS, codeOf, explainError, fieldValue, loadArchive, refFor, ridOf } from "./lib";

type Row = { file: ProofFile; id: `0x${string}` };
type Status = ChainCert | { error: string };
const isErr = (s: Status | undefined): s is { error: string } => !!s && "error" in s;

const TONE: Record<CertState, "ok" | "bad" | "warn" | "neutral"> = {
  Active: "ok",
  Suspended: "warn",
  Revoked: "bad",
  Expired: "neutral",
  IssuerRevoked: "bad",
  NotFound: "neutral",
};
const LABEL: Record<CertState, string> = {
  Active: "Active",
  Suspended: "Suspended",
  Revoked: "Revoked",
  Expired: "Expired",
  IssuerRevoked: "Issuer key revoked",
  NotFound: "Not found",
};
const FILTERS = ["all", "Active", "Suspended", "Revoked", "Expired", "IssuerRevoked"] as const;
const DAY = 86400;

function Tile({ label, value, tone, bar }: { label: string; value: number | string; tone?: string; bar: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-px", bar)} />
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={cn("mt-2 font-serif text-5xl leading-none tabular-nums", tone)}>{value}</p>
    </Card>
  );
}

export function Dashboard() {
  const { issuer, writer } = useIssuer();
  const identity = issuer?.identity;
  const [rows, setRows] = useState<Row[]>();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [target, setTarget] = useState<Row>();
  const [reason, setReason] = useState(2);
  const [modalErr, setModalErr] = useState<string>();
  const runId = useRef(0);

  const load = useCallback(() => {
    if (!identity) return;
    setRows(loadArchive(identity).map((file) => ({ file, id: ridOf(file, identity) })));
  }, [identity]);

  useEffect(() => {
    load();
    window.addEventListener("mohar-archive", load);
    return () => window.removeEventListener("mohar-archive", load);
  }, [load]);

  const refreshAll = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    const run = ++runId.current;
    setLoading(true);
    const reader = newReader();
    const queue = [...rows];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        if (run !== runId.current) return;
        let s: Status;
        try {
          s = r.file.anchor.kind === "single" ? await reader.getCert(r.id) : await reader.getBatchCert(identity!, r.file.anchor.batchRoot, r.file.documentRoot, r.file.expiresAt, r.file.anchor.proof);
        } catch (e) {
          s = { error: explainError(e) };
        }
        setStatus((p) => ({ ...p, [r.id]: s }));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (run === runId.current) setLoading(false);
  }, [rows]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const refreshOne = async (r: Row) => {
    const reader = newReader();
    try {
      const s = r.file.anchor.kind === "single" ? await reader.getCert(r.id) : await reader.getBatchCert(identity!, r.file.anchor.batchRoot, r.file.documentRoot, r.file.expiresAt, r.file.anchor.proof);
      setStatus((p) => ({ ...p, [r.id]: s }));
    } catch (e) {
      setStatus((p) => ({ ...p, [r.id]: { error: explainError(e) } }));
    }
  };

  const act = async (r: Row, kind: "revoke" | "suspend" | "reinstate", why?: number) => {
    if (!writer) return false;
    setRowErr((p) => ({ ...p, [r.id]: "" }));
    setPending((p) => ({ ...p, [r.id]: kind === "revoke" ? "Revoking" : kind === "suspend" ? "Suspending" : "Reinstating" }));
    try {
      const ref = refFor(r.file, identity!);
      if (kind === "revoke") await revokeCert(writer, ref, why ?? 5);
      else if (kind === "suspend") await suspendCert(writer, ref);
      else await reinstateCert(writer, ref);
      await refreshOne(r);
      return true;
    } catch (e) {
      setRowErr((p) => ({ ...p, [r.id]: explainError(e) }));
      return false;
    } finally {
      setPending((p) => {
        const n = { ...p };
        delete n[r.id];
        return n;
      });
    }
  };

  const now = Math.floor(Date.now() / 1000);
  const stateOf = (r: Row): CertState | undefined => {
    const s = status[r.id];
    return s && !isErr(s) ? s.state : undefined;
  };

  const stats = useMemo(() => {
    const all = rows ?? [];
    let active = 0, revoked = 0, expiring = 0;
    for (const r of all) {
      const s = status[r.id];
      if (!s || isErr(s)) continue;
      if (s.state === "Active") {
        active++;
        if (s.expiresAt > 0 && s.expiresAt - now <= 30 * DAY) expiring++;
      }
      if (s.state === "Revoked") revoked++;
    }
    return { issued: all.length, active, revoked, expiring };
  }, [rows, status, now]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter !== "all" && stateOf(r) !== filter) return false;
      if (!needle) return true;
      return [fieldValue(r.file, "recipient.name"), fieldValue(r.file, "credential.title"), codeOf(r.file), r.id].some((x) => x.toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filter, status]);

  if (!issuer) return null;

  const canRevoke = (s?: CertState) => s === "Active" || s === "Suspended" || s === "Expired";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">Live from the chain</p>
          <h1 className="mt-2 font-serif text-4xl leading-none tracking-tight sm:text-5xl">Registry</h1>
          <p className="mt-3 text-sm text-muted">Everything {issuer.name} has issued from this browser, with its live status read from the chain.</p>
        </div>
        <Button variant="secondary" onClick={() => void refreshAll()} disabled={loading || !rows?.length} data-testid="refresh-all">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Refresh status
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="summary-tiles">
        <Tile label="Issued" value={stats.issued} bar="bg-gradient-to-r from-transparent via-gold to-transparent" />
        <Tile label="Active" value={stats.active} tone="text-ok" bar="bg-gradient-to-r from-transparent via-ok to-transparent" />
        <Tile label="Revoked" value={stats.revoked} tone={stats.revoked ? "text-bad" : undefined} bar="bg-gradient-to-r from-transparent via-bad to-transparent" />
        <Tile label="Expiring in 30 days" value={stats.expiring} tone={stats.expiring ? "text-warn" : undefined} bar="bg-gradient-to-r from-transparent via-warn to-transparent" />
      </div>

      {rows === undefined ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="grid place-items-center gap-3 rounded-3xl p-12 text-center" data-testid="registry-empty">
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-line bg-raised"><FileStack className="h-8 w-8 text-gold" aria-hidden /></span>
          <h2 className="mt-2 font-serif text-3xl">Nothing issued from this browser yet</h2>
          <p className="max-w-md text-sm text-muted">
            Certificates you issue appear here with their live on-chain status. If you issued from another browser, import is not needed: use the verify page with any file you kept.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/issuer" className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm font-medium text-bg hover:bg-white">
              Issue a certificate
            </Link>
            <Link href="/issuer/bulk" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium">
              <Layers className="h-4 w-4" aria-hidden /> Bulk issue
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search by name, title or code" placeholder="Search name, title or MHR code" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} data-testid="registry-search" />
            </div>
            <Select
              aria-label="Filter by status"
              data-testid="registry-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="sm:w-56"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === "all" ? "All statuses" : f === "IssuerRevoked" ? "Issuer key revoked" : f}
                </option>
              ))}
            </Select>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {shown.length} of {rows.length} certificates shown
          </p>

          <Card className="overflow-hidden rounded-3xl">
            <table data-testid="registry-table" className="block w-full text-left text-sm md:table">
              <thead className="hidden border-b border-line bg-bg/40 text-[0.65rem] uppercase tracking-[0.16em] text-muted md:table-header-group">
                <tr>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {shown.map((r) => {
                  const s = status[r.id];
                  const st = s && !isErr(s) ? s : undefined;
                  const busy = pending[r.id];
                  const exp = st ? st.expiresAt : r.file.expiresAt;
                  return (
                    <tr key={r.id} data-testid={`row-${r.id}`} data-state={st?.state ?? "loading"} className="block border-b border-line/70 p-4 transition-colors last:border-0 hover:bg-raised/40 md:table-row md:p-0">
                      <td className="block py-1 md:table-cell md:px-4 md:py-3">
                        <p className="font-serif text-lg leading-tight text-ink">{fieldValue(r.file, "recipient.name")}</p>
                        <p className="text-xs text-muted">{fieldValue(r.file, "credential.title")}</p>
                      </td>
                      <td className="block py-1 md:table-cell md:px-4 md:py-3">
                        <Mono className="block text-ink/85">{codeOf(r.file)}</Mono>
                        <Badge className="mt-1">{r.file.anchor.kind === "single" ? "Single" : "Batch"}</Badge>
                      </td>
                      <td className="block py-1 md:table-cell md:px-4 md:py-3">
                        <span className="text-xs uppercase text-muted md:hidden">Issued </span>
                        {st && st.issuedAt ? formatDate(st.issuedAt) : fieldValue(r.file, "credential.issuedOn")}
                      </td>
                      <td className="block py-1 md:table-cell md:px-4 md:py-3">
                        <span className="text-xs uppercase text-muted md:hidden">Expires </span>
                        {exp ? formatDate(exp) : "Never"}
                      </td>
                      <td className="block py-1 md:table-cell md:px-4 md:py-3" aria-live="polite">
                        {busy ? (
                          <span data-testid={`pending-${r.id}`}>
                            <Badge tone="warn">
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {busy}
                            </Badge>
                          </span>
                        ) : st ? (
                          <>
                            <span data-testid={`state-${r.id}`}>
                              <Badge tone={TONE[st.state]}>{LABEL[st.state]}</Badge>
                            </span>
                            {st.state === "Revoked" && <p className="mt-1 text-xs text-muted">{reasonText(st.reason)}</p>}
                          </>
                        ) : isErr(s) ? (
                          <Badge tone="warn" className="max-w-full !whitespace-normal">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> Unavailable
                          </Badge>
                        ) : (
                          <Skeleton className="h-5 w-20" />
                        )}
                      </td>
                      <td className="block py-1 md:table-cell md:px-4 md:py-3 md:text-right">
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {st?.state === "Active" && (
                            <Button size="sm" variant="secondary" disabled={!!busy} data-testid={`action-suspend-${r.id}`} onClick={() => act(r, "suspend")}>
                              <PauseCircle className="h-4 w-4" aria-hidden /> Suspend
                            </Button>
                          )}
                          {st?.state === "Suspended" && (
                            <Button size="sm" variant="secondary" disabled={!!busy} data-testid={`action-reinstate-${r.id}`} onClick={() => act(r, "reinstate")}>
                              <PlayCircle className="h-4 w-4" aria-hidden /> Reinstate
                            </Button>
                          )}
                          {canRevoke(st?.state) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="text-bad"
                              disabled={!!busy}
                              data-testid={`action-revoke-${r.id}`}
                              onClick={() => {
                                setModalErr(undefined);
                                setReason(2);
                                setTarget(r);
                              }}
                            >
                              <Ban className="h-4 w-4" aria-hidden /> Revoke
                            </Button>
                          )}
                        </div>
                        {(rowErr[r.id] || isErr(s)) && (
                          <p role="alert" data-testid={`error-${r.id}`} className="mt-2 max-w-xs text-xs text-bad md:ml-auto">
                            {rowErr[r.id] || (isErr(s) ? s.error : "")}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr className="block md:table-row">
                    <td colSpan={6} className="block p-8 text-center text-muted md:table-cell">
                      No certificates match this search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <ArchiveBanner identity={issuer.identity} />
        </>
      )}

      {target && (
        <Modal title="Revoke certificate" onClose={() => setTarget(undefined)} testId="revoke-dialog">
          <p className="text-sm">
            Revoke <strong>{fieldValue(target.file, "credential.title")}</strong> issued to <strong>{fieldValue(target.file, "recipient.name")}</strong>?
          </p>
          <p className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-3.5 text-sm text-bad">
            <strong>Revocation is permanent.</strong> The certificate can never be valid again. If you only need to pause it, close this and use <strong>Suspend</strong>, which you can undo with
            Reinstate.
          </p>
          <label htmlFor="revoke-reason" className="mb-1 mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
            Reason (recorded on chain)
          </label>
          <Select
            id="revoke-reason"
            data-testid="reason-select"
            data-autofocus
            value={reason}
            onChange={(e) => setReason(Number(e.target.value))}
          >
            {REASON_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code} {o.label}
              </option>
            ))}
          </Select>
          <div aria-live="assertive">
            {modalErr && (
              <p role="alert" className="mt-3 text-sm text-bad">
                {modalErr}
              </p>
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setTarget(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-revoke"
              disabled={!!pending[target.id]}
              onClick={async () => {
                setModalErr(undefined);
                const ok = await act(target, "revoke", reason);
                if (ok) setTarget(undefined);
                else setModalErr("Revocation failed. See the message on the row, then try again.");
              }}
            >
              {pending[target.id] ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
              Revoke permanently
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
