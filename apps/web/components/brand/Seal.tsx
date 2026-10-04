"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Irregular wax-blob outline: a circle whose radius wobbles deterministically. */
function blobPath(cx: number, cy: number, r: number, wobble: number, points = 44) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r + Math.sin(a * 7 + 1.3) * wobble + Math.sin(a * 13 + 0.4) * wobble * 0.55 + Math.cos(a * 3) * wobble * 0.4;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M ${pts[0]![0].toFixed(2)} ${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[(i + 1) % pts.length]!;
    const p2 = pts[(i + 2) % pts.length]!;
    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;
    d += ` Q ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  return `${d} Z`;
}

const BLOB = blobPath(100, 100, 88, 4.2);

/** The Mohar wax seal. Pure SVG, scales to any size. */
export function WaxSeal({ className, label = "MOHAR · ANCHORED ON CHAIN · VERIFIABLE FOREVER ·" }: { className?: string; label?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 200" className={cn("drop-shadow-[0_18px_30px_rgba(120,10,0,0.55)]", className)} aria-hidden>
      <defs>
        <radialGradient id={`wax-${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ff8a6c" />
          <stop offset="38%" stopColor="#e2402a" />
          <stop offset="78%" stopColor="#a61b0d" />
          <stop offset="100%" stopColor="#7a1206" />
        </radialGradient>
        <radialGradient id={`press-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id={`shine-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <path id={`ring-${id}`} d="M100,100 m-58,0 a58,58 0 1,1 116,0 a58,58 0 1,1 -116,0" />
      </defs>
      <path d={BLOB} fill={`url(#wax-${id})`} />
      <path d={BLOB} fill={`url(#shine-${id})`} opacity="0.5" />
      <circle cx="100" cy="100" r="70" fill={`url(#press-${id})`} />
      <circle cx="100" cy="100" r="70" fill="none" stroke="#5c0d04" strokeOpacity="0.55" strokeWidth="2.2" />
      <circle cx="100" cy="100" r="69" fill="none" stroke="#ffb39f" strokeOpacity="0.35" strokeWidth="0.8" transform="translate(-0.8 -0.8)" />
      <circle cx="100" cy="100" r="46" fill="none" stroke="#5c0d04" strokeOpacity="0.5" strokeWidth="1.6" />
      <text fontSize="10.5" letterSpacing="2.4" fontWeight="700" fill="#4d0a03" fillOpacity="0.75" fontFamily="var(--font-sans), sans-serif">
        <textPath href={`#ring-${id}`} startOffset="0">
          {label}
        </textPath>
      </text>
      {/* monogram, debossed: dark stroke + light offset highlight */}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path d="M78 122 V80 l22 24 l22 -24 v42" stroke="#ffc2b2" strokeOpacity="0.4" strokeWidth="7" transform="translate(-1 -1)" />
        <path d="M78 122 V80 l22 24 l22 -24 v42" stroke="#5a0b03" strokeOpacity="0.75" strokeWidth="7" />
      </g>
    </svg>
  );
}

/** Compact logo mark for the nav and favicon-sized places. */
export function SealMark({ size = 30, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <radialGradient id={`m-${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ff8a6c" />
          <stop offset="55%" stopColor="#e2402a" />
          <stop offset="100%" stopColor="#8f170a" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#m-${id})`} />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#5a0b03" strokeOpacity="0.45" strokeWidth="1" />
      <path d="M10.5 21V11.5l5.5 6l5.5-6V21" fill="none" stroke="#fff4ef" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
