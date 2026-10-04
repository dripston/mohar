"use client";

import { IssuerGate } from "@/components/issuer/IssuerGate";
import { Bulk } from "@/components/issuer/Bulk";

export default function BulkPage() {
  return (
    <IssuerGate>
      <Bulk />
    </IssuerGate>
  );
}
