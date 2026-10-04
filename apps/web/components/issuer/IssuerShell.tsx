"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IssuerProvider } from "./IssuerContext";

const TABS = [
  { href: "/issuer", label: "Issue one" },
  { href: "/issuer/bulk", label: "Bulk issue" },
  { href: "/issuer/dashboard", label: "Registry" },
];

export function IssuerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const show = TABS.some((t) => t.href === path);
  return (
    <IssuerProvider>
      {show && (
        <nav aria-label="Issuer sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={path === t.href ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                path === t.href ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </IssuerProvider>
  );
}
