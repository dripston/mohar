"use client";

import { EyeOff, FileCheck2, TriangleAlert } from "lucide-react";
import { COUNT_PATH, type FieldResult } from "@mohar/core";
import { Card } from "@/components/ui/primitives";
import { cn, hasUnsafe, stripUnsafe } from "@/lib/utils";

const SECTIONS: { key: string; title: string }[] = [
  { key: "recipient", title: "Recipient" },
  { key: "credential", title: "Credential" },
  { key: "issuer", title: "Issuer" },
];

const label = (path: string) => {
  const last = path.split(".").slice(1).join(" ") || path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Everything here is attacker-controlled text: React escapes it, and we also drop invisible / bidi-override characters. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "Not provided";
  if (typeof v === "string") return stripUnsafe(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function FieldsCard({ fields, hidden }: { fields: FieldResult[]; hidden?: boolean }) {
  const rows = fields.filter((f) => f.path !== COUNT_PATH);
  const groups = SECTIONS.map((s) => ({ ...s, rows: rows.filter((r) => r.path.startsWith(`${s.key}.`)) }));
  const other = rows.filter((r) => !SECTIONS.some((s) => r.path.startsWith(`${s.key}.`)));
  if (other.length) groups.push({ key: "other", title: "Other", rows: other });
  const bad = rows.filter((r) => !r.ok).length;

  return (
    <Card className="overflow-hidden" data-testid="fields-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-raised px-4 py-3">
        <FileCheck2 className="h-4 w-4 text-muted" aria-hidden />
        <h3 className="text-sm font-semibold text-ink">What the document says</h3>
        <span className={cn("ml-auto text-xs", bad ? "font-medium text-bad" : "text-muted")}>
          {bad ? `${bad} of ${rows.length} fields do not match` : `${rows.length} fields match the signed root`}
        </span>
      </div>
      <div className="divide-y divide-line">
        {groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.key} aria-label={g.title} className="px-4 py-4">
              <h4 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-seal">{g.title}</h4>
              <dl className="space-y-3">
                {g.rows.map((f) => (
                  <div
                    key={f.path}
                    data-testid={`field-${f.path}`}
                    data-ok={f.ok ? "true" : "false"}
                    className={cn("rounded-lg", !f.ok && "border border-bad/50 bg-bad/10 p-3")}
                  >
                    <dt className="flex items-center gap-1.5 text-xs text-muted">
                      {!f.ok && <TriangleAlert className="h-3.5 w-3.5 text-bad" aria-hidden />}
                      {label(f.path)}
                    </dt>
                    <dd className={cn("mt-0.5 max-h-56 overflow-auto break-words font-serif text-lg leading-snug", f.ok ? "text-ink" : "text-bad")} dir="auto">
                      {show(f.value)}
                    </dd>
                    {typeof f.value === "string" && hasUnsafe(f.value) && (
                      <p className="mt-1 text-xs text-warn" data-testid="hidden-chars">Contains hidden formatting characters, removed for display.</p>
                    )}
                    {!f.ok && (
                      <p className="mt-1.5 text-sm font-medium text-bad">This field does not match what the issuer signed</p>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        {hidden && (
          <div className="flex items-start gap-2.5 px-4 py-3.5 text-sm text-muted" data-testid="fields-hidden">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>Hidden by the holder. Other fields exist in this certificate but were not disclosed, and they were not checked.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
