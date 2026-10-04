import type { Metadata } from "next";
import { VerifyApp } from "@/components/verify/VerifyApp";

export const metadata: Metadata = {
  title: "Verify a certificate | Mohar",
  description: "Check any Mohar certificate against the blockchain. Scan, paste or drop a file. No account, no server.",
};

export default function Page() {
  return <VerifyApp />;
}
