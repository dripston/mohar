import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ambient, Page } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <Page className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Ambient />
      <p className="font-mono text-sm text-seal">NOT_FOUND</p>
      <h1 className="mt-4 font-serif text-6xl tracking-tight sm:text-8xl">
        Nothing is <span className="italic text-muted">anchored here.</span>
      </h1>
      <p className="mt-5 max-w-md text-muted">This page has no record. Unlike a forged certificate, that is an honest mistake.</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 font-medium text-bg hover:bg-white">
        Back to safety <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </Page>
  );
}
