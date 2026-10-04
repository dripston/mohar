"use client";

import { IssuerGate } from "@/components/issuer/IssuerGate";
import { IssueForm } from "@/components/issuer/IssueForm";

export default function IssuerPage() {
  return (
    <IssuerGate showDns>
      <IssueForm />
    </IssuerGate>
  );
}
