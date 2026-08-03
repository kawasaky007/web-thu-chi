"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/cn";

type ToastVariant = "success" | "error";
type ToastData = { id: number; message: string; variant: ToastVariant };
type ToastContextValue = {
  notify: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);

  const notify = useCallback((message: string, variant: ToastVariant = "success") => {
    const next = { id: Date.now(), message, variant };
    setToast(next);
    window.setTimeout(() => {
      setToast((current) => (current?.id === next.id ? null : current));
    }, 3600);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center md:bottom-6 md:left-auto md:right-6"
      >
        {toast ? (
          <div
            className={cn(
              "toast-enter pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-[0_20px_60px_rgba(14,14,14,0.2)]",
              toast.variant === "success"
                ? "border-income/14 bg-forest text-paper"
                : "border-expense/20 bg-paper-raised text-expense",
            )}
            role={toast.variant === "error" ? "alert" : "status"}
          >
            {toast.variant === "success" ? (
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-mint" />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              aria-label="Đóng thông báo"
              className="grid size-8 place-items-center rounded-full hover:bg-white/10"
              onClick={() => setToast(null)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast phải được dùng bên trong ToastProvider");
  return context;
}
