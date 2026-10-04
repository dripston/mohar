import {
  ShieldCheck,
  ShieldAlert,
  Ban,
  PauseCircle,
  Clock,
  FileWarning,
  UserX,
  KeyRound,
  SearchX,
  Network,
  WifiOff,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { Mode, Verdict } from "@mohar/core";

export type Tone = "ok" | "warn" | "bad" | "neutral";

export interface VerdictMeta {
  tone: Tone;
  icon: LucideIcon;
  /** short status word, readable without color */
  label: string;
  sub: string;
}

export const VERDICTS: Record<Verdict, VerdictMeta> = {
  VERIFIED: {
    tone: "ok",
    icon: ShieldCheck,
    label: "Authentic",
    sub: "Issued by an accredited issuer, anchored on chain, and still in good standing.",
  },
  VERIFIED_DOMAIN_UNCHECKED: {
    tone: "warn",
    icon: ShieldAlert,
    label: "Authentic, domain unchecked",
    sub: "Everything on chain checks out, but the issuer's domain could not be checked live right now. The accreditation authority's earlier confirmation is shown below.",
  },
  REVOKED: {
    tone: "bad",
    icon: Ban,
    label: "Revoked",
    sub: "The issuer withdrew this certificate. It was genuine once, but it is no longer valid.",
  },
  SUSPENDED: {
    tone: "warn",
    icon: PauseCircle,
    label: "Suspended",
    sub: "The issuer has put this certificate on hold. The hold can be lifted, so check again later.",
  },
  EXPIRED: {
    tone: "warn",
    icon: Clock,
    label: "Expired",
    sub: "This certificate was genuine, but its validity period has ended.",
  },
  TAMPERED: {
    tone: "bad",
    icon: FileWarning,
    label: "Do not trust",
    sub: "What you are looking at does not match what the issuer signed. Treat this document as forged or altered.",
  },
  UNKNOWN_ISSUER: {
    tone: "bad",
    icon: UserX,
    label: "Unknown issuer",
    sub: "The signer is not an accredited issuer, or its domain no longer vouches for it.",
  },
  ISSUER_REVOKED: {
    tone: "bad",
    icon: KeyRound,
    label: "Issuer key revoked",
    sub: "The key that signed this certificate was revoked as of a date before it was issued.",
  },
  NOT_FOUND: {
    tone: "bad",
    icon: SearchX,
    label: "No record found",
    sub: "Nothing on chain matches this certificate. It may be forged, or issued on a different network.",
  },
  WRONG_CHAIN: {
    tone: "warn",
    icon: Network,
    label: "Wrong network",
    sub: "This certificate lives on a different blockchain from the one this verifier reads.",
  },
  CANNOT_REACH_CHAIN: {
    tone: "neutral",
    icon: WifiOff,
    label: "No verdict",
    sub: "We could not reach enough independent blockchain providers to answer. This says nothing about the certificate being good or bad.",
  },
  MALFORMED: {
    tone: "neutral",
    icon: AlertTriangle,
    label: "Could not read",
    sub: "That input is not a Mohar certificate link, code or file.",
  },
};

export const MODES: Record<Mode, { label: string; hint: string }> = {
  link: { label: "Link check: issuer and status only", hint: "The printed text has not been compared with the signed record." },
  full: { label: "Full proof: every field checked", hint: "Each field was recomputed and matched against the signed root." },
  partial: { label: "Partial: holder hid some fields", hint: "Only the fields the holder chose to show were checked." },
  code: { label: "Code lookup", hint: "A short code points at a record but carries no document data." },
};

export const toneClasses: Record<Tone, { box: string; text: string; solid: string; glow: string }> = {
  ok: { box: "border-ok/35 bg-gradient-to-br from-ok/[0.12] via-surface/80 to-surface/60 text-ok", text: "text-ok", solid: "bg-ok text-bg", glow: "shadow-[0_0_50px_-6px_rgb(52_211_153/0.65)]" },
  warn: { box: "border-warn/35 bg-gradient-to-br from-warn/[0.10] via-surface/80 to-surface/60 text-warn", text: "text-warn", solid: "bg-warn text-bg", glow: "shadow-[0_0_50px_-6px_rgb(245_181_72/0.55)]" },
  bad: { box: "border-bad/40 bg-gradient-to-br from-bad/[0.13] via-surface/80 to-surface/60 text-bad", text: "text-bad", solid: "bg-bad text-bg", glow: "shadow-[0_0_50px_-6px_rgb(248_96_86/0.65)]" },
  neutral: { box: "border-line bg-surface/70 text-muted", text: "text-muted", solid: "bg-raised text-ink border border-line", glow: "" },
};
