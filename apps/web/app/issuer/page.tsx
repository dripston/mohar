"use client";

import Link from "next/link";
import { ArrowRight, Layers, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { IssuerGate } from "@/components/issuer/IssuerGate";
import { IssueForm } from "@/components/issuer/IssueForm";

export default function IssuerPage() {
  return (
    <IssuerGate showDns>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/issuer/bulk" className="group">
          <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-raised">
            <Layers className="h-6 w-6 shrink-0 text-seal" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Bulk issuance from CSV</p>
              <p className="text-sm text-muted">Anchor hundreds of certificates in one transaction.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Card>
        </Link>
        <Link href="/issuer/dashboard" className="group">
          <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-raised">
            <ListChecks className="h-6 w-6 shrink-0 text-seal" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Registry dashboard</p>
              <p className="text-sm text-muted">Live status, revoke, suspend and reinstate.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Card>
        </Link>
      </div>
      <IssueForm />
    </IssuerGate>
  );
}
