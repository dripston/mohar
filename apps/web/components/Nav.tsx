"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/config";
import { Badge } from "./ui/primitives";

const LINKS = [
  { href: "/verify", label: "Verify" },
  { href: "/issuer", label: "Issuer" },
  { href: "/holder", label: "Holder" },
];

export function SealMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="rgb(var(--seal))" strokeWidth="2" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="rgb(var(--seal))" strokeWidth="0.8" />
      <path d="M9.5 21V11l6.5 6.5L22.5 11v10" fill="none" stroke="rgb(var(--seal))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <SealMark />
          <span className="font-serif text-xl font-semibold tracking-tight">Mohar</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink",
                path.startsWith(l.href) && "bg-raised text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Badge tone="neutral" className="hidden sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> {chain.name}
        </Badge>
      </div>
    </header>
  );
}
