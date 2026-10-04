"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ban, Check, FlaskConical, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { concat, keccak256, stringToHex, type Hex } from "viem";
import { COUNT_PATH, fieldLeafHash } from "@mohar/core";
import { Eyebrow } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Field = { path: string; short: string; label: string; value: string; editable?: boolean };

const ORIGINAL: Field[] = [
  { path: "recipient.name", short: "name", label: "Recipient", value: "Ananya Rao", editable: true },
  { path: "credential.title", short: "title", label: "Credential", value: "Income Certificate" },
  { path: "credential.income", short: "income", label: "Income", value: "₹3,80,000", editable: true },
  { path: "flag.income_lte_250000", short: "< 2.5L", label: "Eligible (<2.5L)", value: "false", editable: true },
  { path: "credential.issuedOn", short: "date", label: "Issued on", value: "2026-06-01" },
  { path: "issuer.name", short: "issuer", label: "Issuer", value: "Revenue Dept, Karnataka" },
  { path: "issuer.domain", short: "domain", label: "Domain", value: "karnataka.gov.in" },
  { path: COUNT_PATH, short: "count", label: "Field count", value: "7" },
];

const PRESETS = [
  { label: "Forge eligibility", path: "flag.income_lte_250000", value: "true" },
  { label: "Lower the income", path: "credential.income", value: "₹1,80,000" },
  { label: "Swap the name", path: "recipient.name", value: "Rahul Verma" },
  { label: "Add one space", path: "recipient.name", value: "Ananya  Rao" },
];

const SALT: Record<string, Hex> = Object.fromEntries(ORIGINAL.map((f) => [f.path, keccak256(stringToHex(`mohar-demo-salt:${f.path}`))]));

/** Leaves use the exact Mohar leaf hash; parents hash the sorted pair, like OpenZeppelin's MerkleProof. */
function buildLevels(values: string[]): Hex[][] {
  const leaves = ORIGINAL.map((f, i) => fieldLeafHash(f.path, JSON.stringify(values[i]), SALT[f.path]!));
  const levels: Hex[][] = [leaves];
  while (levels[0]!.length > 1) {
    const prev = levels[0]!;
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const [a, b] = [prev[i]!, prev[i + 1]!].sort();
      next.push(keccak256(concat([a!, b!])));
    }
    levels.unshift(next);
  }
  return levels; // levels[0] = [root]
}

const ORIGINAL_LEVELS = buildLevels(ORIGINAL.map((f) => f.value));
const ANCHORED = ORIGINAL_LEVELS[0]![0]!;
const ROW_Y = [9, 36, 63, 88];
const xOf = (level: number, i: number) => ((i + 0.5) / 2 ** level) * 100;
const h4 = (h: string) => h.slice(2, 6);

export function TamperLab() {
  const reduce = useReducedMotion();
  const [values, setValues] = useState(ORIGINAL.map((f) => f.value));
  const levels = useMemo(() => buildLevels(values), [values]);
  const changed = (l: number, i: number) => levels[l]![i] !== ORIGINAL_LEVELS[l]![i];
  const root = levels[0]![0]!;
  const ok = root === ANCHORED;
  const dirty = ORIGINAL.map((f, i) => values[i] !== f.value);
  const firstDirty = dirty.indexOf(true);

  const set = (path: string, v: string) => setValues((vs) => vs.map((x, i) => (ORIGINAL[i]!.path === path ? v : x)));
  const reset = () => setValues(ORIGINAL.map((f) => f.value));

  return (
    <section id="lab" className="relative scroll-mt-24 py-24 sm:py-32" aria-labelledby="lab-h">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Tamper lab · live
          </Eyebrow>
          <h2 id="lab-h" className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Go on. <span className="italic text-seal">Forge it.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Every field is a salted leaf in a Merkle tree, and only the root goes on chain. Change one character and its hash changes, every
            hash above it changes, and the root no longer matches. These are real keccak256 hashes, computed in your browser as you type.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          {/* the document */}
          <div className="glass rounded-3xl p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">The certificate you were handed</p>
              <button
                type="button"
                onClick={reset}
                disabled={!dirty.some(Boolean)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted transition hover:bg-raised hover:text-ink disabled:opacity-30"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {ORIGINAL.slice(0, 7).map((f, i) => (
                <label
                  key={f.path}
                  className={cn(
                    "grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-xl border px-3 py-2 transition-colors sm:grid-cols-[7.5rem_1fr]",
                    dirty[i] ? "border-bad/60 bg-bad/[0.07]" : "border-line/80 bg-bg/40",
                    f.editable && !dirty[i] && "hover:border-gold/40",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {!f.editable && <Lock className="h-3 w-3 opacity-60" aria-hidden />}
                    {f.label}
                  </span>
                  {f.editable ? (
                    <input
                      value={values[i]}
                      onChange={(e) => set(f.path, e.target.value)}
                      spellCheck={false}
                      aria-label={`Edit ${f.label}`}
                      className={cn("w-full min-w-0 bg-transparent font-cert text-[0.95rem] outline-none", dirty[i] ? "text-bad" : "text-ink")}
                    />
                  ) : (
                    <span className="truncate font-cert text-[0.95rem] text-ink/70">{values[i]}</span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">Try an attack</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      reset();
                      setValues(ORIGINAL.map((f) => (f.path === p.path ? p.value : f.value)));
                    }}
                    className="rounded-full border border-line bg-raised/60 px-3 py-1.5 text-xs text-ink/90 transition hover:border-seal/50 hover:text-seal"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* the tree */}
          <div className="glass relative overflow-hidden rounded-3xl p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">Its Merkle tree</p>
              <p className="font-mono text-[0.68rem] text-muted">keccak256 · salted leaves</p>
            </div>

            <div className="relative mt-4 h-[300px] sm:h-[340px]">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {levels.slice(1).map((row, l) =>
                  row.map((_, i) => {
                    const bad = changed(l + 1, i);
                    return (
                      <line
                        key={`${l}-${i}`}
                        x1={xOf(l + 1, i)}
                        y1={ROW_Y[l + 1]}
                        x2={xOf(l, Math.floor(i / 2))}
                        y2={ROW_Y[l]}
                        vectorEffect="non-scaling-stroke"
                        stroke={bad ? "rgb(248 96 86)" : "rgb(var(--line))"}
                        strokeWidth={bad ? 2 : 1.2}
                        style={{ transition: "stroke 0.3s" }}
                      />
                    );
                  }),
                )}
              </svg>
              {levels.map((row, l) =>
                row.map((h, i) => {
                  const bad = changed(l, i);
                  const isRoot = l === 0;
                  const isLeaf = l === levels.length - 1;
                  return (
                    <div
                      key={`${l}-${i}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                      style={{ left: `${xOf(l, i)}%`, top: `${ROW_Y[l]}%` }}
                    >
                      <motion.div
                        key={h}
                        initial={reduce || !bad ? false : { scale: 1.35 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        className={cn(
                          "rounded-md border font-mono transition-colors",
                          isRoot ? "px-3 py-1.5 text-xs sm:text-sm" : isLeaf ? "px-1 py-0.5 text-[8.5px] sm:px-1.5 sm:text-[10px]" : "px-1.5 py-0.5 text-[10px] sm:text-xs",
                          bad ? "border-bad/70 bg-bad/15 text-bad shadow-[0_0_24px_-4px_rgb(248_96_86/0.7)]" : isRoot ? "border-ok/50 bg-ok/10 text-ok" : "border-line bg-raised text-ink/75",
                        )}
                      >
                        {isRoot ? `root ${h.slice(0, 8)}` : h4(h)}
                      </motion.div>
                      {isLeaf && <p className={cn("mt-1 text-[8.5px] sm:text-[10px]", dirty[i] ? "text-bad" : "text-muted")}>{ORIGINAL[i]!.short}</p>}
                    </div>
                  );
                }),
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-bg/50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">Root of this document</p>
                <p className={cn("mt-1 break-all font-mono text-[0.7rem]", ok ? "text-ok" : "text-bad")}>{root}</p>
              </div>
              <div className="rounded-xl border border-line bg-bg/50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">Root anchored on chain</p>
                <p className="mt-1 break-all font-mono text-[0.7rem] text-ink/80">{ANCHORED}</p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={ok ? "ok" : `bad-${firstDirty}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "mt-3 flex items-center gap-3 rounded-2xl border p-4",
                  ok ? "border-ok/40 bg-ok/[0.08]" : "border-bad/50 bg-bad/[0.09]",
                )}
                role="status"
              >
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", ok ? "bg-ok text-bg" : "bg-bad text-bg")}>
                  {ok ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <Ban className="h-5 w-5" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-xs font-bold uppercase tracking-[0.18em]", ok ? "text-ok" : "text-bad")}>{ok ? "Verified" : "Tampered"}</p>
                  <p className="text-sm text-ink/90">
                    {ok ? (
                      <>
                        Roots match. Every field is exactly what the issuer signed <Check className="inline h-3.5 w-3.5 text-ok" aria-hidden />
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-bad">{ORIGINAL[firstDirty]?.path}</span> does not match what the issuer signed. The forgery
                        is caught, and so is the exact field.
                      </>
                    )}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              Leaf = keccak256(keccak256(abi.encode(path, value, salt))), the same encoding the contracts check. The tree is drawn in a fixed order
              for clarity; the protocol orders leaves by hash.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
