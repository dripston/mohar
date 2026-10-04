import { Download } from "lucide-react";
import { deployment } from "@/lib/config";

/** "No files of your own?" strip: links to the synthetic demo files published for this network. */
export function SampleFiles({ kind }: { kind: "student" | "officer" | "bulk" }) {
  const net = deployment.network ?? (deployment.chainId === 31337 ? "anvil" : "base-sepolia");
  const s = `/demo/${net}/scholarship`;
  const files =
    kind === "student"
      ? [
          ["Enrolment", "student-enrolment.json"],
          ["Caste", "student-caste.json"],
          ["Income", "student-income.json"],
        ]
      : kind === "officer"
        ? [
            ["Genuine application", "app-0001.mohar"],
            ["Forged income", "app-0003.mohar"],
            ["Fake institute", "app-0015.mohar"],
          ]
        : [["applications.zip (27)", "applications.zip"]];
  const hint =
    kind === "student"
      ? "Download all three, then drop them in together."
      : kind === "officer"
        ? "Or use the application.mohar you made on the student tab."
        : "Drop the ZIP below. Every seal is checked in your browser.";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-sm" data-testid={`samples-${kind}`}>
      <span className="text-muted">No files of your own? Demo samples:</span>
      {files.map(([label, f]) => (
        <a key={f} href={`${s}/${f}`} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface/70 px-2.5 font-medium transition hover:border-ink/25 hover:bg-raised">
          <Download className="h-3.5 w-3.5" aria-hidden /> {label}
        </a>
      ))}
      <span className="text-xs text-muted">{hint}</span>
    </div>
  );
}
