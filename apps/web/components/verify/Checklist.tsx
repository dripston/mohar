"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { Check as CheckT, CheckStatus } from "@mohar/core";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const STATUS: Record<CheckStatus, { icon: typeof Check; ring: string; word: string }> = {
  pass: { icon: Check, ring: "bg-ok text-bg", word: "Passed" },
  fail: { icon: X, ring: "bg-bad text-bg", word: "Failed" },
  warn: { icon: TriangleAlert, ring: "bg-warn text-bg", word: "Caution" },
  skip: { icon: Minus, ring: "bg-raised text-muted border border-line", word: "Not checked" },
};

export function ChecklistSkeleton() {
  return (
    <ol className="space-y-3" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="glass flex items-start gap-3 rounded-2xl p-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Checklist({ checks }: { checks: CheckT[] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="space-y-3">
      {checks.map((c, i) => {
        const s = STATUS[c.status];
        const Icon = s.icon;
        return (
          <motion.li
            key={c.id}
            data-testid={`check-${c.id}`}
            data-status={c.status}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.35, delay: reduce ? 0 : i * 0.25, ease: "easeOut" }}
            className={cn(
              "glass flex items-start gap-3.5 rounded-2xl p-4",
              c.status === "fail" ? "!border-bad/45" : c.status === "warn" ? "!border-warn/40" : "",
            )}
          >
            <motion.span
              initial={reduce ? false : { scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 18, delay: reduce ? 0 : i * 0.25 + 0.1 }}
              className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", s.ring)}
            >
              <Icon className="h-4 w-4" aria-hidden strokeWidth={3} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.95rem] font-medium leading-snug text-ink">
                <span className="sr-only">{`Check ${c.id}, ${s.word}: `}</span>
                {c.label}
              </p>
              <p className="mt-1 break-words text-sm leading-relaxed text-muted">{c.detail}</p>
            </div>
            <span
              className={cn(
                "hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline",
                c.status === "pass" && "bg-ok/12 text-ok",
                c.status === "fail" && "bg-bad/12 text-bad",
                c.status === "warn" && "bg-warn/15 text-warn",
                c.status === "skip" && "bg-raised text-muted",
              )}
              aria-hidden
            >
              {s.word}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}
