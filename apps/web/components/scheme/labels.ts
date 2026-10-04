import type { Aggregate, ReasonCode } from "@mohar/core";

/** Human names for leaf paths. The raw path is always shown next to it, so nothing is hidden behind a label. */
const LABELS: Record<string, string> = {
  "credential.type": "Credential type",
  "recipient.applicantId": "Applicant ID",
  "recipient.name": "Full name",
  "flags.st_category": "ST category",
  "flags.enrolment_active": "Enrolment active",
  "flags.income_lte_250000": "Income at most ₹2.5 lakh",
  "flags.income_lte_600000": "Income at most ₹6 lakh",
  "credential.income": "Income figure",
  "credential.address": "Address",
  "credential.category": "Category",
  "credential.officerRank": "Issuing officer rank",
  "credential.instituteId": "Institute ID",
  "credential.course": "Course",
  "credential.year": "Year",
  "credential.title": "Title",
  "credential.issuedOn": "Issued on",
  "credential.expiresOn": "Expires on",
  "issuer.address": "Issuer address",
  "issuer.domain": "Issuer domain",
  "issuer.name": "Issuer name",
  version: "Format version",
};

export const labelOf = (path: string) => LABELS[path] ?? path.replace(/^.*\./, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
export const isFlag = (path: string) => path.startsWith("flags.");

export const TYPE_META = {
  enrolment: { label: "Enrolment", issuer: "Institute" },
  caste: { label: "Caste", issuer: "Revenue office" },
  income: { label: "Income", issuer: "Revenue office" },
} as const;

export const AGG: Record<Aggregate, { label: string; tone: "ok" | "bad" | "warn" | "neutral"; text: string }> = {
  ELIGIBLE: { label: "Eligible", tone: "ok", text: "Every requirement is met by a credential that checked out on chain, from the right kind of issuer." },
  NOT_ELIGIBLE: { label: "Not eligible", tone: "warn", text: "The credentials are genuine, but at least one requirement is not met." },
  INVALID: { label: "Invalid", tone: "bad", text: "A credential is tampered, revoked, from a revoked issuer, or not on chain. Treat this application as suspect." },
  INCOMPLETE: { label: "Incomplete", tone: "warn", text: "A required credential is missing from the bundle. Ask the student for it." },
  UNREACHABLE: { label: "No verdict", tone: "neutral", text: "The chain could not be read, or the providers disagreed. Nothing was decided. Retry in a moment." },
};

export const CODE_TEXT: Record<ReasonCode, string> = {
  OK: "Met",
  MISSING: "Credential missing",
  WRONG_ISSUER_TYPE: "Wrong kind of issuer",
  FLAG_FALSE: "Issuer says no",
  FLAG_NOT_DISCLOSED: "Required flag not shared",
  APPLICANT_MISMATCH: "Belongs to someone else",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  REVOKED: "Revoked",
  ISSUER_REVOKED: "Issuer revoked",
  TAMPERED: "Tampered",
  UNKNOWN_ISSUER: "Unknown issuer",
  NOT_FOUND: "Not on chain",
  MALFORMED: "Unreadable",
  WRONG_CHAIN: "Wrong network",
  CANNOT_REACH_CHAIN: "Chain unreachable",
};

export const TONE_CLASS = {
  ok: { text: "text-ok", bg: "bg-ok", soft: "bg-ok/10", border: "border-ok/35", glow: "from-ok/25" },
  bad: { text: "text-bad", bg: "bg-bad", soft: "bg-bad/10", border: "border-bad/35", glow: "from-bad/25" },
  warn: { text: "text-warn", bg: "bg-warn", soft: "bg-warn/10", border: "border-warn/35", glow: "from-warn/20" },
  neutral: { text: "text-muted", bg: "bg-muted", soft: "bg-raised", border: "border-line", glow: "from-muted/10" },
} as const;
