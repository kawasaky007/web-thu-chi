import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

export function Input({
  className,
  label,
  hint,
  error,
  leading,
  ...props
}: InputProps) {
  return (
    <label className="block text-sm font-bold text-ink/76">
      {label ? <span className="mb-2 block">{label}</span> : null}
      <span className="relative block">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-forest/52">
            {leading}
          </span>
        ) : null}
        <input
          aria-label={props["aria-label"] ?? label}
          aria-invalid={error ? true : undefined}
          className={cn(
            "min-h-12 w-full rounded-2xl border border-forest/12 bg-paper-raised/86 px-4 text-base font-semibold text-ink shadow-[0_8px_24px_rgba(31,61,43,0.04)] outline-none transition placeholder:text-ink/34 focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10",
            Boolean(leading) && "pl-11",
            error && "border-expense/65 focus:border-expense focus:ring-expense/10",
            className,
          )}
          {...props}
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
