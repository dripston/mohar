import Link from "next/link";
import { ArrowRight, FileCheck2, ScanLine, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/primitives";

const PROOFS = [
  { icon: ShieldCheck, title: "Who issued it", body: "The issuer's key is accredited in an on-chain registry, and its domain publishes a matching DNS record." },
  { icon: FileCheck2, title: "Not one character changed", body: "Every field is a salted leaf in a Merkle tree. The root is anchored on chain. Edit anything and we show you which field." },
  { icon: ScanLine, title: "Still valid right now", body: "Revocation, suspension and expiry are read live from the chain, with a reason and a timestamp." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="pt-8 text-center sm:pt-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-seal">Blockchain-anchored certificates</p>
        <h1 className="mx-auto max-w-3xl font-serif text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Check any certificate in three seconds. Trust nobody.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Mohar proves who issued it, that not a character changed, and that it is valid right now. The check reads the chain directly, so it keeps working even if our servers are gone.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/verify" className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 font-medium text-bg hover:bg-ink/90">
            Verify a certificate <ArrowRight size={18} />
          </Link>
          <Link href="/issuer" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-6 font-medium hover:bg-raised">
            I issue certificates
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="What Mohar proves">
        {PROOFS.map((p) => (
          <Card key={p.title} className="p-6">
            <p.icon className="mb-4 text-seal" size={26} aria-hidden />
            <h2 className="font-serif text-xl font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-6 md:col-span-2">
          <h2 className="font-serif text-xl font-semibold">A thousand certificates, one transaction</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Issuers anchor a single Merkle root for a whole batch. Each certificate carries its own short proof, so the cost per certificate is about 580 gas and no personal data ever touches the chain.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="font-serif text-xl font-semibold">Share only what you choose</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Holders can hide their grade and still produce a certificate that verifies.</p>
        </Card>
      </section>
    </div>
  );
}
