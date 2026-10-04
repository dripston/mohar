"use client";

import { IssuerGate } from "@/components/issuer/IssuerGate";
import { Dashboard } from "@/components/issuer/Dashboard";

export default function DashboardPage() {
  return (
    <IssuerGate>
      <Dashboard />
    </IssuerGate>
  );
}
