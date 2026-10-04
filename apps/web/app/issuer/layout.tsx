import type { ReactNode } from "react";
import { IssuerShell } from "@/components/issuer/IssuerShell";

export default function IssuerLayout({ children }: { children: ReactNode }) {
  return <IssuerShell>{children}</IssuerShell>;
}
