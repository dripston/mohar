import type { Metadata } from "next";
import { BulkApp } from "@/components/scheme/BulkApp";

export const metadata: Metadata = { title: "Bulk screening | Mohar", description: "Screen a ZIP of scholarship applications against the chain. Verdicts and reason codes only." };

export default function Page() {
  return <BulkApp />;
}
