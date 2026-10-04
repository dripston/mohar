"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";

type Problem = { title: string; body: string };

function explain(e: unknown): Problem {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      title: "Camera access was blocked",
      body: "Allow camera access for this site in your browser settings and try again, or paste the link or upload the certificate file instead.",
    };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return {
      title: "No camera found",
      body: "This device has no usable camera. Paste the link or code, or upload the certificate file instead.",
    };
  if (name === "NotReadableError")
    return {
      title: "The camera is busy",
      body: "Another app is using the camera. Close it and try again, or paste the link instead.",
    };
  return {
    title: "The camera is not available",
    body: "Scanning needs a camera and a secure (https) page. Paste the link or code, or upload the certificate file instead.",
  };
}

/** Full-screen camera scanner. Every track is stopped on close and on unmount. */
export function ScanDialog({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [ready, setReady] = useState(false);
  const cbs = useRef({ onResult, onClose });
  cbs.current = { onResult, onClose };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
        const scale = Math.min(1, 640 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (hit?.data) {
            stop();
            cbs.current.onResult(hit.data);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem(explain(null));
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
          setReady(true);
          raf = requestAnimationFrame(tick);
        }
      } catch (e) {
        setProblem(explain(e));
      }
    })();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cbs.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan a certificate QR code"
      data-testid="scan-dialog"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
    >
      <div className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-seal" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Scan the certificate QR</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close scanner"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {problem ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="scan-error">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-muted">
              <CameraOff className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-serif text-xl text-ink">{problem.title}</p>
            <p className="text-sm leading-relaxed text-muted">{problem.body}</p>
            <Button variant="secondary" onClick={onClose} className="mt-2">
              Back to other options
            </Button>
          </div>
        ) : (
          <div className="relative aspect-square w-full bg-black">
            <video ref={video} playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
            <canvas ref={canvas} className="hidden" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Starting camera
              </div>
            )}
            <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          </div>
        )}
        {!problem && (
          <p className="px-4 py-3 text-center text-xs text-muted" aria-live="polite">
            Hold the code inside the frame. Nothing leaves your device.
          </p>
        )}
      </div>
    </div>
  );
}
