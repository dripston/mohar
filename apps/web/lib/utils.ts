import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Invisible controls and bidi overrides: they can make attacker text read differently from what was signed. */
export const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
export const stripUnsafe = (s: string) => s.replace(UNSAFE_CHARS, "");
export const hasUnsafe = (s: string) => new RegExp(UNSAFE_CHARS.source).test(s);

export const shortHex = (h: string, head = 6, tail = 4) => (h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

export function downloadFile(name: string, data: BlobPart | Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
