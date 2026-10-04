"use client";

import { useRef, useState, type ReactNode } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Click or drop. The hidden input keeps its test id so automated tests can set files directly. */
export function DropZone({
  onFiles,
  accept,
  multiple,
  testId,
  title,
  hint,
  icon,
  disabled,
  compact,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  testId: string;
  title: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-all",
        compact ? "px-5 py-6" : "px-6 py-10 sm:py-12",
        over ? "border-gold bg-gold/[0.07] scale-[1.01]" : "border-line bg-bg/40 hover:border-ink/30 hover:bg-raised/40",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        data-testid={testId}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <span className={cn("grid place-items-center rounded-2xl border border-line bg-raised text-gold transition-transform group-hover:-translate-y-0.5", compact ? "h-10 w-10" : "h-14 w-14")}>
        {icon ?? <FileUp className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden />}
      </span>
      <p className={cn("font-medium text-ink", compact ? "mt-3 text-sm" : "mt-4")}>{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}
