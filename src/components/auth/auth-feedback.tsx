import { CheckCircle2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/cn";

export function AuthFeedback({
  message,
  variant = "error",
}: {
  message?: string;
  variant?: "error" | "success";
}) {
  if (!message) return null;

  const Icon = variant === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6",
        variant === "success"
          ? "border-income/16 bg-mint-soft text-income"
          : "border-expense/16 bg-expense/6 text-expense",
      )}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
