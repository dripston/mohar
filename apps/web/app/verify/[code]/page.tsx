import type { Metadata } from "next";
import { VerifyApp } from "@/components/verify/VerifyApp";

export const metadata: Metadata = {
  title: "Verifying certificate | Mohar",
  description: "Live blockchain check of a Mohar certificate.",
  robots: { index: false },
};

export default function Page({ params }: { params: { code: string } }) {
  return <VerifyApp initialCode={params.code} />;
}
