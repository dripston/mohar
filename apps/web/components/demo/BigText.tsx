"use client";

import { useEffect, useState } from "react";

const KEY = "mohar.bigText";

function apply(on: boolean) {
  document.documentElement.dataset.big = on ? "1" : "0";
}

/** Projector mode: everything scales up ~20%. Remembered per browser; Alt+B toggles it anywhere. */
export function BigTextSync() {
  useEffect(() => {
    try {
      apply(localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable: default size */
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "b" || e.key === "B")) {
        const on = document.documentElement.dataset.big !== "1";
        apply(on);
        try {
          localStorage.setItem(KEY, on ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export function useBigText(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(document.documentElement.dataset.big === "1"), []);
  return [
    on,
    (v: boolean) => {
      apply(v);
      setOn(v);
      try {
        localStorage.setItem(KEY, v ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
  ];
}
