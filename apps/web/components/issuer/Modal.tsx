"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus moves in, Tab is trapped, Escape and the backdrop close it, focus returns on close. */
export function Modal({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return e.preventDefault();
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-card sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-muted hover:bg-raised hover:text-ink">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
