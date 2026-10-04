"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Terminal } from "lucide-react";
import type { VerifyResult } from "@mohar/core";
import { Card, Mono } from "@/components/ui/primitives";
import { deployment, explorerAddr, explorerTx } from "@/lib/config";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

function Row({
  label,
  value,
  href,
  copy = true,
  testid,
}: {
  label: string;
  value: string;
  href?: string;
  copy?: boolean;
  testid?: string;
}) {
  return (
    <div className="py-2.5" data-testid={testid}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 flex items-start gap-2">
        <Mono className="min-w-0 flex-1 text-[0.8rem] leading-relaxed text-ink">{value}</Mono>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${label} in the block explorer`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
        {copy && <CopyButton value={value} label={label} />}
      </dd>
    </div>
  );
}

export function IndependentPanel({ result }: { result: VerifyResult }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // open by default on desktop, collapsed on phones so the verdict stays above the fold
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, []);

  const ind = result.independent ?? {
    chainId: deployment.chainId,
    contract: deployment.certificateRegistry,
    issuerRegistry: deployment.issuerRegistry,
    certId: result.certId,
  };
  const rpc = deployment.rpcUrls?.[0] ?? "<your-rpc-url>";
  const hasExplorer = Boolean(deployment.explorer);
  const batch = ind.batchRoot && ind.proof;
  const expiresAt = result.cert?.expiresAt ?? 0;

  const cast = batch
    ? `cast call ${ind.contract} \\\n  "getBatchCert(bytes32,bytes32,uint64,bytes32[])" \\\n  ${ind.batchRoot} \\\n  ${ind.documentRoot} \\\n  ${expiresAt} \\\n  "[${ind.proof!.join(",")}]" \\\n  --rpc-url ${rpc}`
    : ind.certId
      ? `cast call ${ind.contract} \\\n  "getCert(bytes32)" ${ind.certId} \\\n  --rpc-url ${rpc}`
      : null;

  const p = result.providers;

  return (
    <Card className="overflow-hidden" data-testid="independent-panel" data-open={open ? "true" : "false"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="independent-body"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        <Terminal className="h-4 w-4 shrink-0 text-seal" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Verify independently</span>
          <span className="block text-xs text-muted">Do not take our word for it. Re-check the chain yourself.</span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id="independent-body" className="border-t border-line px-4 pb-4">
          <dl className="divide-y divide-line">
            <Row label="Chain ID" value={String(ind.chainId)} copy={false} />
            <Row label="Certificate registry contract" value={ind.contract} href={explorerAddr(ind.contract)} />
            <Row label="Issuer registry contract" value={ind.issuerRegistry} href={explorerAddr(ind.issuerRegistry)} />
            {ind.certId && <Row label="Certificate ID (certId)" value={ind.certId} testid="ind-certid" />}
            {result.code && <Row label="Short code" value={result.code} />}
            {ind.documentRoot && <Row label="Document root" value={ind.documentRoot} />}
            {ind.batchRoot && <Row label="Batch root" value={ind.batchRoot} />}
            {ind.proof && ind.proof.length > 0 && (
              <div className="py-2.5" data-testid="ind-proof">
                <dt className="text-xs text-muted">Merkle proof ({ind.proof.length} steps)</dt>
                <dd className="mt-1 flex items-start gap-2">
                  <ol className="min-w-0 flex-1 space-y-1">
                    {ind.proof.map((h, i) => (
                      <li key={`${h}-${i}`} className="flex gap-2">
                        <span className="w-5 shrink-0 text-right text-xs text-muted">{i + 1}.</span>
                        <Mono className="text-[0.75rem] leading-relaxed text-ink">{h}</Mono>
                      </li>
                    ))}
                  </ol>
                  <CopyButton value={JSON.stringify(ind.proof)} label="Merkle proof" />
                </dd>
              </div>
            )}
            {ind.txHint && <Row label="Issuance transaction" value={ind.txHint} href={explorerTx(ind.txHint)} />}
            <div className="py-2.5" data-testid="ind-providers">
              <dt className="text-xs text-muted">Independent RPC providers</dt>
              <dd className="mt-1 text-sm text-ink">
                {p ? (
                  <>
                    Asked {p.asked}, {p.agreed} agreed.
                    {p.agreed < 2 && (
                      <span className="ml-1 font-medium text-warn">Single source: treat this answer with extra care.</span>
                    )}
                  </>
                ) : (
                  "No provider answered."
                )}
              </dd>
            </div>
            <div className="py-2.5">
              <dt className="text-xs text-muted">Block explorer</dt>
              <dd className="mt-1 text-sm text-ink">
                {hasExplorer ? (
                  <a
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                    href={explorerAddr(ind.contract)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open the contract on the explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  "Local chain: there is no public explorer. Use the command below against your own node."
                )}
              </dd>
            </div>
          </dl>

          {cast && (
            <div className="mt-3" data-testid="ind-cast">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted">Check it yourself with Foundry</p>
                <CopyButton value={cast.replace(/ \\\n\s*/g, " ")} label="cast command" />
              </div>
              <pre className="max-w-full overflow-x-auto rounded-xl border border-line bg-raised p-3 font-mono text-[0.75rem] leading-relaxed text-ink">
                <code>{cast}</code>
              </pre>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                The first returned field is the state (0 not found, 1 active, 2 suspended, 3 revoked, 4 expired, 5 issuer revoked). It reads the
                contract directly, so it needs neither our website nor our servers.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
