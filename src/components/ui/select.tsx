import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Select({
  className,
  label,
  hint,
  error,
  children,
  ...props
}: SelectProps) {
  return (
    <label className="block text-sm font-bold text-ink/76">
      {label ? <span className="mb-2 block">{label}</span> : null}
      <span className="relative block">
        <select
          aria-label={props["aria-label"] ?? label}
          aria-invalid={error ? true : undefined}
          className={cn(
            "min-h-12 w-full appearance-none rounded-2xl border border-forest/12 bg-paper-raised/86 px-4 pr-11 text-base font-semibold text-ink shadow-[0_8px_24px_rgba(31,61,43,0.04)] outline-none transition focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10",
            error && "border-expense/65 focus:border-expense focus:ring-expense/10",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-forest/52"
        />
      </span>
      {error ? (
        <span className="mt-2 block text-xs font-semibold text-expense">{error}</span>
      ) : hint ? (
        <span className="mt-2 block text-xs font-medium text-ink/46">{hint}</span>
      ) : null}
    </label>
  );
}
