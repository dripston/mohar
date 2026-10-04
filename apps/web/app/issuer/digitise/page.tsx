"use client";

import { IssuerGate } from "@/components/issuer/IssuerGate";
import { Digitise } from "@/components/issuer/Digitise";

export default function DigitisePage() {
  return (
    <IssuerGate>
      <Digitise />
    </IssuerGate>
  );
}
