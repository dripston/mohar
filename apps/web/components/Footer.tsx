"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { deployment, chain } from "@/lib/config";
import { SealMark } from "./brand/Seal";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "/verify", label: "Verify a certificate" },
      { href: "/issuer", label: "Issue certificates" },
      { href: "/holder", label: "Share selectively" },
      { href: "/issuer/admin", label: "Accreditation authority" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { href: "/#lab", label: "Tamper lab" },
      { href: "/#how", label: "How it works" },
      { href: "/#verdicts", label: "Every verdict" },
    ],
  },
];

/** App screens get a single quiet line; the full footer belongs to the landing page only. */
function SlimFooter() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-ink/80 hover:text-ink">
          <SealMark size={18} />
          <span className="font-serif text-base">Mohar</span>
        </Link>
        <p>
          {chain.name} · chain {deployment.chainId} · verification never touches our servers
        </p>
      </div>
    </footer>
  );
}

export function Footer() {
  const path = usePathname();
  if (path !== "/") return <SlimFooter />;
  return (
    <footer className="relative overflow-hidden border-t border-line/70">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <SealMark size={34} />
              <span className="font-serif text-3xl tracking-tight">Mohar</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              <span className="font-serif italic text-ink">Mohar</span> (मोहर) is the seal pressed into wax to prove a document is real.
              This one is pressed into a blockchain.
            </p>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink/80 transition-colors hover:text-gold">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted">On chain</p>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-muted">Network</dt>
                <dd className="mt-0.5 text-ink/90">
                  {chain.name} · chain {deployment.chainId}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Certificate registry</dt>
                <dd className="mt-0.5 break-all font-mono text-ink/80">{deployment.certificateRegistry}</dd>
              </div>
              <div>
                <dt className="text-muted">Issuer registry</dt>
                <dd className="mt-0.5 break-all font-mono text-ink/80">{deployment.issuerRegistry}</dd>
              </div>
            </dl>
          </div>
        </div>

        <p
          aria-hidden
          className="text-foil pointer-events-none mt-16 select-none text-center font-serif text-[22vw] leading-[0.8] tracking-tighter opacity-90 lg:text-[16rem]"
        >
          Mohar
        </p>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-line/70 pt-6 text-xs text-muted sm:flex-row sm:items-center">
          <p>Algothon&apos;26 · ALG-BC-01 · Verification never touches our servers.</p>
          <p className="font-mono">keccak256(trust) = math</p>
        </div>
      </div>
    </footer>
  );
}
