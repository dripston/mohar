import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "seal" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const buttonClass = ({ variant = "primary", size = "md" }: Pick<ButtonProps, "variant" | "size"> = {}) =>
  cn(
    "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" && "h-8 px-3 text-[0.8rem]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[0.95rem]",
    variant === "primary" &&
      "bg-ink text-bg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12),0_8px_24px_-10px_rgb(245_241_233/0.45)] hover:bg-white",
    variant === "seal" &&
      "bg-gradient-to-b from-[#ff6a52] to-[#d6331f] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_30px_-8px_rgb(240_74_56/0.65)] hover:brightness-110",
    variant === "secondary" && "border border-line bg-raised/70 text-ink hover:border-ink/25 hover:bg-raised",
    variant === "ghost" && "text-muted hover:bg-raised hover:text-ink",
    variant === "danger" &&
      "bg-bad text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_28px_-10px_rgb(248_96_86/0.7)] hover:brightness-110",
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonClass({ variant, size }), className)} {...props} />;
});

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "ok" | "bad" | "warn" | "neutral" | "seal" | "gold";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "ok" && "border-ok/25 bg-ok/10 text-ok",
        tone === "bad" && "border-bad/25 bg-bad/10 text-bad",
        tone === "warn" && "border-warn/25 bg-warn/10 text-warn",
        tone === "seal" && "border-seal/30 bg-seal/10 text-seal",
        tone === "gold" && "border-gold/30 bg-gold/10 text-gold",
        tone === "neutral" && "border-line bg-raised text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Mono({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("break-all font-mono text-[0.8em]", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-raised", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line bg-bg/60 text-sm text-ink shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] transition-colors placeholder:text-muted/50 hover:border-ink/20 focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10 disabled:opacity-50 aria-[invalid=true]:border-bad/70 aria-[invalid=true]:ring-bad/10";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-11 px-3.5", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(fieldBase, "h-11 cursor-pointer px-3", className)} {...props} />;
});

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
      {children}
    </label>
  );
}

/** Small uppercase kicker above a heading. */
export function Eyebrow({ children, className, tone = "gold" }: { children: ReactNode; className?: string; tone?: "gold" | "seal" | "muted" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em]",
        tone === "gold" && "text-gold",
        tone === "seal" && "text-seal",
        tone === "muted" && "text-muted",
        className,
      )}
    >
      <span className={cn("h-px w-6", tone === "seal" ? "bg-seal/60" : tone === "muted" ? "bg-muted/50" : "bg-gold/60")} aria-hidden />
      {children}
    </p>
  );
}

/** Page header used by every app screen (not the landing page). */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h1 className="font-serif text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Standard width + top offset for the floating nav. */
export function Page({ className, wide, ...props }: HTMLAttributes<HTMLDivElement> & { wide?: boolean }) {
  return <div className={cn("relative isolate mx-auto w-full px-4 pb-28 pt-28 sm:px-6 sm:pt-32 lg:px-8", wide ? "max-w-[1400px]" : "max-w-6xl", className)} {...props} />;
}

/** Soft coloured light behind a page; purely decorative. */
export function Ambient({ className, tone = "seal" }: { className?: string; tone?: "seal" | "gold" | "ok" }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute left-1/2 top-0 -z-10 h-[620px] w-screen -translate-x-1/2 overflow-hidden", className)}>
      <div
        className={cn(
          "absolute left-1/2 top-[-280px] h-[560px] w-[1100px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[110px]",
          tone === "seal" && "bg-seal",
          tone === "gold" && "bg-gold",
          tone === "ok" && "bg-ok",
        )}
      />
      <div className="grid-bg mask-fade-b absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
    </div>
  );
}
