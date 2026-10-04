"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FilePlus2, Layers, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import { Ambient, Page } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { IssuerProvider } from "./IssuerContext";

const TABS = [
  { href: "/issuer", label: "Issue one", icon: FilePlus2 },
  { href: "/issuer/bulk", label: "Bulk issue", icon: Layers },
  { href: "/issuer/dashboard", label: "Registry", icon: ListChecks },
];

export function IssuerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const show = TABS.some((t) => t.href === path);
  if (!show) return <IssuerProvider>{children}</IssuerProvider>;

  return (
    <IssuerProvider>
      <Page wide>
        <Ambient tone="gold" />
        <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-3 hidden text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted lg:block">Issuer console</p>
            <nav aria-label="Issuer sections" className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5 lg:flex-col">
              {TABS.map((t) => {
                const on = path === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex shrink-0 flex-1 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors lg:flex-none lg:justify-start",
                      on ? "text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="issuer-tab"
                        className="absolute inset-0 -z-10 rounded-xl border border-line bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <t.icon className={cn("h-4 w-4", on && "text-gold")} aria-hidden />
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4 hidden rounded-2xl border border-dashed border-line p-4 text-xs leading-relaxed text-muted lg:block">
              Fields are salted and hashed in this browser. Only a 32-byte Merkle root ever reaches the chain.
            </div>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </Page>
    </IssuerProvider>
  );
}
