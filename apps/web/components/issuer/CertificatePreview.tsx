"use client";

import { QrCode } from "lucide-react";

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
}

const fmt = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** A printed-paper certificate. Colours are fixed on purpose: it should look the same in light and dark mode. */
export function CertificatePreview({ issuerName, issuerDomain, recipient, title, grade, issuedOn, expiresOn, code, qr }: Props) {
  const placeholder = "text-[#b8ad98]";
  return (
    <figure
      aria-label="Certificate preview"
      data-testid="cert-preview"
      className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-md bg-[#fbf7ee] p-[3.5%] text-[#1c1814] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
    >
      <div className="relative border-[3px] border-double border-[#9e8040] px-5 py-7 text-center sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-1.5 border border-[#9e8040]/50" />
        <p className="font-serif text-sm font-semibold uppercase tracking-[0.22em] sm:text-base">{issuerName || "Issuing institution"}</p>
        <p className="mt-1 font-mono text-[10px] text-[#6b6458] sm:text-xs">{issuerDomain || "institution.example"}</p>
        <p className="mt-5 font-serif text-[10px] uppercase tracking-[0.3em] text-[#b0241c] sm:text-xs">Certificate of Achievement</p>
        <p className="mt-4 font-serif text-xs italic text-[#4d463c] sm:text-sm">This is to certify that</p>
        <p className={`mt-2 break-words font-serif text-2xl font-semibold leading-tight sm:text-4xl ${recipient ? "" : placeholder}`}>{recipient || "Recipient name"}</p>
        <p className="mt-3 font-serif text-xs italic text-[#4d463c] sm:text-sm">has been awarded</p>
        <p className={`mt-2 break-words font-serif text-lg leading-snug sm:text-2xl ${title ? "" : placeholder}`}>{title || "Credential title"}</p>
        {grade && <p className="mt-2 font-serif text-xs sm:text-sm">Grade: {grade}</p>}
        <p className={`mt-3 font-serif text-[11px] sm:text-sm ${issuedOn && fmt(issuedOn) ? "text-[#4d463c]" : placeholder}`}>
          Issued on {fmt(issuedOn) || "date of issue"}
        </p>
        {expiresOn && fmt(expiresOn) && <p className="font-serif text-[11px] text-[#4d463c] sm:text-xs">Valid until {fmt(expiresOn)}</p>}

        <div className="mt-6 flex items-end justify-between gap-3">
          <div className="min-w-0 text-left">
            <p className="break-all font-mono text-[9px] text-[#4d463c] sm:text-[11px]">{code ?? "MHR-XXXX-XXXX-XXXX-X"}</p>
            <p className="mt-1 max-w-[16ch] font-serif text-[9px] italic leading-tight text-[#6b6458] sm:max-w-[28ch] sm:text-[10px]">
              Anchored on chain. Verifiable without trusting the issuer&apos;s website.
            </p>
          </div>
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[#b0241c] text-[#b0241c] sm:h-16 sm:w-16" aria-hidden>
            <span className="grid h-11 w-11 place-items-center rounded-full border border-[#b0241c] font-serif text-[9px] font-bold tracking-widest sm:h-[52px] sm:w-[52px]">MOHAR</span>
          </div>
          <div className="shrink-0 text-center">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" className="h-14 w-14 sm:h-[72px] sm:w-[72px]" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-sm border border-dashed border-[#b8ad98] text-[#b8ad98] sm:h-[72px] sm:w-[72px]">
                <QrCode className="h-7 w-7" aria-hidden />
              </div>
            )}
            <p className="mt-0.5 font-serif text-[9px] italic text-[#6b6458]">Scan to verify</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
