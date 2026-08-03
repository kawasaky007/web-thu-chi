"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Archive, ShieldAlert, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ConfirmTone = "danger" | "warning" | "neutral";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  eyebrow?: string;
  pending?: boolean;
  tone?: ConfirmTone;
};

const toneStyles = {
  danger: {
    eyebrow: "Cần xác nhận",
    icon: ShieldAlert,
    iconClassName: "bg-rose/28 text-expense ring-expense/10",
    accentClassName: "from-expense via-rose to-transparent",
    confirmVariant: "danger" as const,
  },
  warning: {
    eyebrow: "Xác nhận thay đổi",
    icon: Archive,
    iconClassName: "bg-yellow/38 text-ink ring-yellow/24",
    accentClassName: "from-yellow via-yellow to-transparent",
    confirmVariant: "accent" as const,
  },
  neutral: {
    eyebrow: "Xác nhận thao tác",
    icon: TriangleAlert,
    iconClassName: "bg-mint-soft text-forest ring-forest/8",
    accentClassName: "from-mint via-forest/30 to-transparent",
    confirmVariant: "primary" as const,
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  eyebrow,
  pending = false,
  tone = "danger",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelFromEffect = useEffectEvent(onCancel);
  const style = toneStyles[tone];
  const Icon = style.icon;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        cancelFromEffect();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("[data-confirm-cancel]")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default bg-ink/54 backdrop-blur-[6px]"
        onClick={pending ? undefined : onCancel}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-busy={pending}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="sheet-enter relative z-10 w-full overflow-hidden rounded-t-[2rem] border border-white/55 bg-paper-raised shadow-[0_-28px_90px_rgba(14,14,14,0.28)] sm:max-w-md sm:rounded-[2rem] sm:shadow-[0_30px_100px_rgba(14,14,14,0.3)]"
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", style.accentClassName)} />
        <div className="relative px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:p-6">
          <button
            aria-label="Đóng hộp xác nhận"
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink/38 transition hover:bg-mist hover:text-ink"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>

          <div className={cn("grid size-14 place-items-center rounded-2xl ring-8", style.iconClassName)}>
            <Icon aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </div>
          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo">
            {eyebrow ?? style.eyebrow}
          </p>
          <h2 className="mt-1.5 pr-8 text-2xl font-extrabold tracking-[-0.04em] text-ink" id={titleId}>
            {title}
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-ink/55" id={descriptionId}>
            {description}
          </p>

          <div className="mt-6 grid grid-cols-[0.82fr_1.18fr] gap-3">
            <Button data-confirm-cancel disabled={pending} onClick={onCancel} type="button" variant="secondary">
              {cancelLabel}
            </Button>
            <Button disabled={pending} onClick={onConfirm} type="button" variant={style.confirmVariant}>
              {pending ? "Đang xử lý..." : confirmLabel}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

type FormAction = NonNullable<ComponentPropsWithoutRef<"form">["action"]>;

type ConfirmActionProps = Omit<ConfirmDialogProps, "open" | "onCancel" | "onConfirm"> & {
  action: FormAction;
  children?: ReactNode;
  formClassName?: string;
  trigger: (openDialog: () => void) => ReactNode;
};

export function ConfirmAction({
  action,
  children,
  formClassName,
  trigger,
  ...dialogProps
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);
  const confirm = useCallback(() => {
    setOpen(false);
    formRef.current?.requestSubmit();
  }, []);

  return (
    <>
      <form action={action} className={formClassName} ref={formRef}>
        {children}
        {trigger(openDialog)}
      </form>
      <ConfirmDialog
        {...dialogProps}
        onCancel={closeDialog}
        onConfirm={confirm}
        open={open}
      />
    </>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}
