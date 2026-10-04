import type { Metadata } from "next";
import { SchemeApp } from "@/components/scheme/SchemeApp";

export const metadata: Metadata = { title: "Scholarship check | Mohar", description: "Demo scheme: build a minimal-disclosure application bundle, or check one against the chain." };

export default function Page() {
  return <SchemeApp />;
}
