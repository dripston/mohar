"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/config";
import { SealMark } from "./brand/Seal";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/verify", label: "Verify" },
  { href: "/issuer", label: "Issuer" },
  { href: "/holder", label: "Holder" },
  { href: "/scheme", label: "Scheme" },
  { href: "/bulk", label: "Bulk" },
  { href: "/issuer/admin", label: "Authority" },
];

const active = (path: string, href: string) =>
  href === "/"
    ? path === "/"
    : href === "/issuer" ? path.startsWith("/issuer") && !path.startsWith("/issuer/admin") : path.startsWith(href);

export { SealMark };

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-2xl border pl-3 pr-2 transition-all duration-300 sm:pl-4",
          scrolled || open
            ? "border-line/90 bg-bg/75 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Mohar home">
          <SealMark size={30} className="transition-transform duration-500 group-hover:rotate-[20deg]" />
          <span className="font-serif text-[1.55rem] leading-none tracking-tight">Mohar</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-xl border border-line/70 bg-surface/60 p-1 md:flex" aria-label="Main">
          {LINKS.map((l) => {
            const on = active(path, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "text-ink" : "text-muted hover:text-ink")}
              >
                {on && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-line/80 bg-surface/60 px-3 py-1 text-xs text-muted lg:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-ok/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            {chain.name}
          </span>
          <Link
            href="/verify"
            className="hidden h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-medium text-bg transition hover:bg-white sm:inline-flex"
          >
            Verify now <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-raised md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl border border-line bg-bg/95 p-2 shadow-2xl backdrop-blur-xl md:hidden"
          >
            {LINKS.map((l, i) => (
              <motion.div key={l.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                <Link
                  href={l.href}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3.5 font-serif text-2xl",
                    active(path, l.href) ? "bg-raised text-ink" : "text-muted",
                  )}
                >
                  {l.label}
                  <ArrowUpRight className="h-5 w-5 opacity-50" aria-hidden />
                </Link>
              </motion.div>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-line px-4 pb-2 pt-3 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-ok" /> Reading {chain.name}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
