import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-forest text-paper shadow-[0_14px_32px_rgba(31,61,43,0.22)] hover:bg-forest/92",
  secondary:
    "border border-forest/14 bg-paper-raised/82 text-forest hover:bg-mist/70",
  accent: "bg-yellow text-ink hover:bg-yellow/86",
  danger: "bg-expense text-white hover:bg-expense/90",
  ghost: "text-forest hover:bg-forest/7",
} as const;

const sizes = {
  sm: "min-h-10 rounded-xl px-3.5 text-sm",
  md: "min-h-12 rounded-2xl px-5 text-sm",
  lg: "min-h-14 rounded-2xl px-6 text-base",
  icon: "size-11 rounded-2xl p-0",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 font-extrabold transition-[background-color,color,transform,box-shadow] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
