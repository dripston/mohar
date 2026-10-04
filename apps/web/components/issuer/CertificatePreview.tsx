"use client";

import { motion, useReducedMotion } from "framer-motion";
import { QrCode } from "lucide-react";
import { WaxSeal } from "@/components/brand/Seal";
import { cn } from "@/lib/utils";

interface Props {
  issuerName: string;
  issuerDomain: string;
  recipient: string;
  title: string;
  grade: string;
  issuedOn: string;
  expiresOn: string;
  code?: string;
  qr?: string;
  /** "stamp" drops the wax seal onto the paper with a little impact; "static" just shows it. */
  seal?: "static" | "stamp" | "none";
  stampDelay?: number;
  className?: string;
}

const fmt = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** Concentric rotated ellipses: the guilloché watermark printed behind banknotes and degrees. */
function Guilloche({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden>
      <g fill="none" stroke="#9e7a35" strokeWidth="0.45">
        {Array.from({ length: 36 }, (_, i) => (
          <ellipse key={i} cx="200" cy="200" rx="190" ry="62" transform={`rotate(${i * 5} 200 200)`} />
        ))}
        {Array.from({ length: 24 }, (_, i) => (
          <ellipse key={`b${i}`} cx="200" cy="200" rx="110" ry="36" transform={`rotate(${i * 7.5} 200 200)`} />
        ))}
      </g>
    </svg>
  );
}

function Corner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("absolute h-7 w-7 text-[#a8843f] sm:h-9 sm:w-9", className)} aria-hidden>
      <path d="M2 38V8a6 6 0 0 1 6-6h30" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 38V13a6 6 0 0 1 6-6h25" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** A printed-paper certificate. Colours are fixed on purpose: paper is paper, whatever the theme. */
export function CertificatePreview({
  issuerName,
  issuerDomain,
  recipient,
  title,
  grade,
  issuedOn,
  expiresOn,
  code,
  qr,
  seal = "static",
  stampDelay = 0.6,
  className,
}: Props) {
  const reduce = useReducedMotion();
  const placeholder = "text-[#c4b9a3]";
  return (
    <figure
      aria-label="Certificate preview"
      data-testid="cert-preview"
      className={cn(
        "paper-texture relative mx-auto w-full max-w-[680px] overflow-hidden rounded-[6px] p-[3%] text-[#1c1814] shadow-paper ring-1 ring-black/10",
        className,
      )}
    >
      <Guilloche className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-[0.16]" />
      <div className="relative border border-[#a8843f]/70 p-[2.5%]">
        <div className="relative border-[2px] border-[#a8843f]/80 px-4 pb-5 pt-7 text-center sm:px-10 sm:pb-7 sm:pt-10">
          <Corner className="left-1.5 top-1.5" />
          <Corner className="right-1.5 top-1.5 rotate-90" />
          <Corner className="bottom-1.5 right-1.5 rotate-180" />
          <Corner className="bottom-1.5 left-1.5 -rotate-90" />

          <p className="font-cert text-[0.72rem] font-semibold uppercase tracking-[0.28em] sm:text-sm">{issuerName || "Issuing institution"}</p>
          <p className="mt-1 font-mono text-[9px] tracking-wide text-[#7a705f] sm:text-[11px]">{issuerDomain || "institution.example"}</p>

          <div className="mx-auto mt-4 flex items-center justify-center gap-3 sm:mt-6">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#a8843f] sm:w-16" />
            <p className="font-cert text-[0.6rem] font-semibold uppercase tracking-[0.42em] text-[#b0241c] sm:text-xs">Certificate of Achievement</p>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#a8843f] sm:w-16" />
          </div>

          <p className="mt-4 font-cert text-[0.7rem] italic text-[#5b5245] sm:mt-6 sm:text-sm">This is to certify that</p>
          <p
            className={cn(
              "mt-1.5 break-words font-cert text-[1.6rem] font-medium italic leading-tight tracking-tight sm:text-[2.6rem]",
              recipient ? "text-[#17130f]" : placeholder,
            )}
          >
            {recipient || "Recipient name"}
          </p>
          <div className="mx-auto mt-2 h-px w-2/3 bg-gradient-to-r from-transparent via-[#a8843f]/70 to-transparent" />
          <p className="mt-3 font-cert text-[0.7rem] italic text-[#5b5245] sm:text-sm">has been awarded</p>
          <p className={cn("mt-1 break-words font-cert text-base font-semibold leading-snug sm:text-2xl", title ? "" : placeholder)}>{title || "Credential title"}</p>
          {grade && <p className="mt-1.5 font-cert text-[0.7rem] text-[#3f382e] sm:text-sm">with {grade}</p>}

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:mt-7 sm:gap-4">
            <div className="min-w-0 text-left">
              <p className={cn("font-cert text-[0.62rem] sm:text-xs", issuedOn && fmt(issuedOn) ? "text-[#3f382e]" : placeholder)}>
                {fmt(issuedOn) || "Date of issue"}
              </p>
              {expiresOn && fmt(expiresOn) && <p className="font-cert text-[0.55rem] text-[#7a705f] sm:text-[0.65rem]">Valid until {fmt(expiresOn)}</p>}
              <div className="mt-1 h-px w-full bg-[#1c1814]/40" />
              <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.18em] text-[#7a705f] sm:text-[9px]">Issued on</p>
            </div>

            <div className="relative -mb-2 h-16 w-16 sm:h-24 sm:w-24">
              {seal === "stamp" && !reduce ? (
                <>
                  <motion.div
                    className="absolute inset-0"
                    initial={{ scale: 2.6, opacity: 0, rotate: -35, y: -30 }}
                    animate={{ scale: 1, opacity: 1, rotate: -8, y: 0 }}
                    transition={{ delay: stampDelay, type: "spring", stiffness: 260, damping: 17, mass: 1.1 }}
                  >
                    <WaxSeal className="h-full w-full" />
                  </motion.div>
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-[#e2402a]"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [0.8, 2.3], opacity: [0, 0.7, 0] }}
                    transition={{ delay: stampDelay + 0.32, duration: 0.9, ease: "easeOut" }}
                  />
                </>
              ) : seal !== "none" ? (
                <WaxSeal className="h-full w-full -rotate-[8deg]" />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col items-end">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="" className="h-12 w-12 mix-blend-multiply sm:h-[72px] sm:w-[72px]" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-sm border border-dashed border-[#bcae92] text-[#bcae92] sm:h-[72px] sm:w-[72px]">
                  <QrCode className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden />
                </div>
              )}
              <p className="mt-1 max-w-full truncate font-mono text-[7px] tracking-wide text-[#3f382e] sm:text-[9.5px]">{code ?? "MHR-XXXX-XXXX-XXXX-X"}</p>
            </div>
          </div>
          <p className="mt-4 font-cert text-[0.52rem] italic text-[#8a7f6c] sm:text-[0.68rem]">
            Sealed on a public blockchain. Verifiable by anyone, without trusting the issuer&apos;s website.
          </p>
        </div>
      </div>
    </figure>
  );
}
