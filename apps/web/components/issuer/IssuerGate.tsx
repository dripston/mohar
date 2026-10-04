"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Globe, KeyRound, Loader2, LogOut, RefreshCw, ShieldCheck, ShieldOff, Wallet } from "lucide-react";
import { expectedTxt, type DnsResult } from "@mohar/core";
import { Badge, Button, Card, Mono, Skeleton } from "@/components/ui/primitives";
import { DEV_WALLET_ENABLED, chain } from "@/lib/config";
import { dnsResolver } from "@/lib/verifier";
import { useWallet } from "@/lib/wallet";
import { formatDate, shortHex } from "@/lib/utils";
import { WaxSeal } from "@/components/brand/Seal";
import { useIssuer } from "./IssuerContext";

export function CopyButton({ text, label = "Copy", className, testId }: { text: string; label?: string; className?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </Button>
  );
}

function DnsCard() {
  const { issuer } = useIssuer();
  const [res, setRes] = useState<DnsResult>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!issuer) return null;
  const txt = expectedTxt(issuer.identity);
  const check = async () => {
    setBusy(true);
    try {
      setRes(await dnsResolver(issuer.domain, issuer.identity));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="overflow-hidden" data-testid="dns-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-raised/50"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-raised text-gold">
          <Globe className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">Domain proof for {issuer.domain}</span>
          <span className="block truncate text-xs text-muted">
            {issuer.domainCheckedAt > 0 ? `Attested on chain ${formatDate(issuer.domainCheckedAt)}` : "Not attested yet"} · DNS TXT record
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
      <div className="border-t border-line px-5 pb-5 pt-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl leading-tight">Prove you control {issuer.domain}</h2>
          <p className="mt-1 text-sm text-muted">
            Add this TXT record to the DNS of <strong className="text-ink">{issuer.domain}</strong>. Anyone verifying your certificates can then confirm, without
            trusting us, that the domain owner approved this issuer identity.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-line bg-bg/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <Mono className="text-sm" data-testid="dns-txt">
          {txt}
        </Mono>
        <CopyButton text={txt} label="Copy record" className="shrink-0 self-start sm:self-auto" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={check} disabled={busy} data-testid="dns-check">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Check now
        </Button>
        <p className="text-sm text-muted">
          {issuer.domainCheckedAt > 0 ? (
            <>
              Accreditation authority attested this domain on <strong className="text-ink">{formatDate(issuer.domainCheckedAt)}</strong> (on chain).
            </>
          ) : (
            "The accreditation authority has not attested this domain on chain yet."
          )}
        </p>
      </div>
      <div aria-live="polite" className="mt-3" data-testid="dns-result">
        {res?.status === "match" && (
          <p className="flex items-start gap-2 text-sm text-ok">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Record found and matches. Resolved by <Mono>{res.provider}</Mono>.
            </span>
          </p>
        )}
        {res?.status === "mismatch" && (
          <p className="flex items-start gap-2 text-sm text-bad">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {res.provider} answered, but there is no matching record.{" "}
              {res.found.length ? (
                <>
                  Found: <Mono>{res.found.join(", ")}</Mono>.
                </>
              ) : (
                "No mohar-issuer record exists yet."
              )}{" "}
              DNS changes can take a few minutes to spread.
            </span>
          </p>
        )}
        {res?.status === "unreachable" && (
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Could not reach any DNS-over-HTTPS provider ({res.errors[0]}). This is a connectivity problem, not a failed check.</span>
          </p>
        )}
        {res && res.status !== "unreachable" && res.provider === "local-demo-zone" && (
          <p className="mt-1 text-xs text-muted">Local network: answered by the built-in demo zone instead of public DNS.</p>
        )}
      </div>
      </div>
      )}
    </Card>
  );
}


function ConnectCard() {
  const { connect, error } = useWallet();
  const [busy, setBusy] = useState<string>();
  const go = async (k: "injected" | "dev-issuer") => {
    setBusy(k);
    await connect(k);
    setBusy(undefined);
  };
  return (
    <Card className="relative overflow-hidden rounded-3xl">
      <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-6 sm:p-10">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-raised text-gold">
            <KeyRound className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-6 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            Issuer <span className="italic text-gold">console</span>
          </h1>
          <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-muted">
            Connect your institution&apos;s wallet. Mohar reads the issuer registry on {chain.name} to check that this key is accredited. Nothing is stored on our servers.
          </p>
          <div className="mt-8 flex max-w-md flex-col gap-3">
            <Button size="lg" onClick={() => go("injected")} disabled={!!busy} data-testid="connect-injected">
              {busy === "injected" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Wallet className="h-5 w-5" aria-hidden />}
              Connect browser wallet
            </Button>
            {DEV_WALLET_ENABLED && (
              <Button size="lg" variant="secondary" onClick={() => go("dev-issuer")} disabled={!!busy} data-testid="connect-dev-issuer">
                {busy === "dev-issuer" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <KeyRound className="h-5 w-5" aria-hidden />}
                Use demo issuer wallet (local network)
              </Button>
            )}
          </div>
          <div aria-live="assertive">
            {error && (
              <p role="alert" className="mt-4 flex max-w-md items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="relative hidden border-l border-line bg-bg/40 p-10 lg:block">
          <div aria-hidden className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="relative">
            <WaxSeal className="mx-auto h-36 w-36 animate-float" />
            <ol className="mt-10 space-y-4 text-sm">
              {[
                ["Connect", "Your key, your wallet. We never see it."],
                ["Accreditation check", "Read live from IssuerRegistry."],
                ["Issue", "Sign a root. Anchor it. Hand out PDFs."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/40 font-mono text-[0.65rem] text-gold">{i + 1}</span>
                  <span>
                    <span className="block font-medium text-ink">{t}</span>
                    <span className="block text-xs text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Connect, detect the role from the registry, and only render `children` for an accredited, non-revoked key. */
export function IssuerGate({ children, showDns = false }: { children: ReactNode; showDns?: boolean }) {
  const { address, kind, disconnect } = useWallet();
  const s = useIssuer();

  if (!address) return <ConnectCard />;
  const initials = (s.issuer?.name ?? "?")
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ff7a5f] to-[#a61b0d] font-serif text-xl text-white shadow-[0_8px_24px_-8px_rgb(240_74_56/0.7)]">
              {s.status === "ready" && s.issuer ? initials || "M" : <KeyRound className="h-5 w-5" aria-hidden />}
            </span>
            <div className="min-w-0 space-y-1.5">
              {s.status === "loading" && (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-6 w-64 max-w-full" />
                  <span className="sr-only" role="status">
                    Reading the issuer registry
                  </span>
                </div>
              )}
              {s.status === "error" && (
                <p role="alert" className="flex items-start gap-2 text-sm text-bad">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {s.error}
                </p>
              )}
              {s.status === "ready" && (
                <div data-testid="role-badge" role="status" className="flex flex-wrap items-center gap-2">
                  {s.accredited && s.issuer ? (
                    <>
                      <span className="font-serif text-2xl leading-none text-ink">{s.issuer.name}</span>
                      <Badge tone="ok">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Accredited issuer · {s.issuer.domain}
                      </Badge>
                    </>
                  ) : s.keyRevoked && s.issuer ? (
                    <Badge tone="bad" className="!whitespace-normal !text-sm">
                      <ShieldOff className="h-4 w-4 shrink-0" aria-hidden />
                      Key revoked from {formatDate(s.issuer.keyRevokedFrom)}
                    </Badge>
                  ) : (
                    <Badge tone="warn" className="!whitespace-normal !text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      Not accredited
                    </Badge>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{kind === "injected" ? "Browser wallet" : "Demo wallet"}</span>
                <span aria-hidden>·</span>
                <Mono data-testid="wallet-address" title={address}>
                  {shortHex(address, 8, 6)}
                </Mono>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <CopyButton text={address} label="Copy address" />
            {s.status === "error" && (
              <Button variant="secondary" size="sm" onClick={s.refresh}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Disconnect
            </Button>
          </div>
        </div>
      </Card>

      {s.status === "ready" && !s.issuer && (
        <Card className="p-6 sm:p-8" data-testid="not-accredited">
          <h2 className="font-serif text-3xl leading-tight">This wallet is not an accredited issuer yet</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Only keys registered by the accreditation authority can issue certificates. Send them this address, together with the domain you will publish your DNS record on. Once they
            register it on chain, check again and the issuing tools unlock.
          </p>
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-line bg-bg/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <Mono className="text-sm">{address}</Mono>
            <CopyButton text={address} label="Copy address" className="shrink-0 self-start sm:self-auto" />
          </div>
          <Button variant="secondary" className="mt-4" onClick={s.refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Check again
          </Button>
        </Card>
      )}

      {s.status === "ready" && s.keyRevoked && s.issuer && (
        <Card className="border-bad/30 p-6 sm:p-8" data-testid="key-revoked">
          <h2 className="font-serif text-3xl leading-tight">Issuing is switched off for this key</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            The accreditation authority revoked this key from {formatDate(s.issuer.keyRevokedFrom)}. Certificates issued before that date stay valid; nothing new can be issued with it.
            Ask them to rotate your issuer identity to a new key, then connect that wallet.
          </p>
        </Card>
      )}

      {s.status === "ready" && s.issuer && showDns && <DnsCard />}
      {s.accredited && children}
    </div>
  );
}
