import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const shortHex = (h: string, head = 6, tail = 4) => (h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

export function downloadFile(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
