"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { Fingerprint, Link2, PenLine, ScanLine } from "lucide-react";
import { Eyebrow } from "@/components/ui/primitives";

const STEPS = [
  {
    icon: Fingerprint,
    title: "Hash",
    who: "In the issuer's browser",
    body: "Each field gets a random 32-byte salt and becomes a leaf. The leaves form a Merkle tree. Salts mean nobody can guess a hidden income by hashing candidates.",
    code: `leaf = keccak256(keccak256(
  abi.encode(path, value, salt)))
root = MerkleTree(leaves).root`,
  },
  {
    icon: PenLine,
    title: "Sign",
    who: "The issuer's wallet",
    body: "The accredited key signs the root as typed EIP-712 data, bound to this chain, this contract and a nonce. The signature cannot be replayed anywhere else.",
    code: `Issue(address issuer, bytes32 root,
      uint64 expiresAt, uint256 nonce)
domain: "Mohar" v1 · chainId · registry`,
  },
  {
    icon: Link2,
    title: "Anchor",
    who: "One transaction",
    body: "Only the 32-byte root lands on chain, with no names and no incomes. A batch of a thousand certificates is still one root and one transaction.",
    code: `CertificateRegistry.issue(root, exp, sig)
→ certId = keccak256(root)
→ MHR-7F3K-92QD-X4MP-C`,
  },
  {
    icon: ScanLine,
    title: "Verify",
    who: "Anyone, anywhere",
    body: "The verifier rebuilds the root from the document, checks it against the chain through independent providers, then checks the issuer, the DNS record and the live status.",
    code: `verify(file) → {
  verdict: "VERIFIED", checks: 5/5,
  providers: { asked: 2, agreed: 2 } }`,
  },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  return (
    <section id="how" className="relative scroll-mt-24 border-t border-line/60 py-24 sm:py-32" aria-labelledby="how-h">
      <div className="mx-auto grid max-w-[1400px] gap-14 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Eyebrow>How a seal is made</Eyebrow>
          <h2 id="how-h" className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Four steps.
            <br />
            <span className="italic text-muted">Zero trust required.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            The issuer does three. The whole world can do the fourth, forever, for free, with nothing but a browser or a terminal.
          </p>
        </div>

        <div ref={ref} className="relative">
          <div className="absolute bottom-0 left-[23px] top-0 w-px bg-line sm:left-[27px]" aria-hidden />
          <motion.div
            className="absolute left-[23px] top-0 h-full w-px origin-top bg-gradient-to-b from-gold via-seal to-seal sm:left-[27px]"
            style={reduce ? undefined : { scaleY }}
            aria-hidden
          />
          <ol className="space-y-10 sm:space-y-14">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={reduce ? false : { opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-120px" }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative grid grid-cols-[48px_1fr] gap-5 sm:grid-cols-[56px_1fr] sm:gap-7"
              >
                <span className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-bg text-gold shadow-[0_0_0_6px_rgb(var(--bg))] sm:h-14 sm:w-14">
                  <s.icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                </span>
                <div className="glass min-w-0 rounded-3xl p-6 sm:p-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-serif text-4xl tracking-tight">
                      <span className="mr-3 font-mono text-sm text-muted">0{i + 1}</span>
                      {s.title}
                    </h3>
                    <span className="text-xs uppercase tracking-[0.16em] text-gold">{s.who}</span>
                  </div>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{s.body}</p>
                  <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-[#050506] p-4 font-mono text-[0.72rem] leading-relaxed text-ink/85 sm:text-[0.78rem]">
                    <code>{s.code}</code>
                  </pre>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
