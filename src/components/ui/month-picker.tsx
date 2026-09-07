"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";

type MonthPickerProps = {
  month: string;
  hrefForMonth: (month: string) => string;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
  className?: string;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function MonthPicker({
  month,
  hrefForMonth,
  ariaLabel = "Chọn tháng",
  align = "center",
  className,
}: MonthPickerProps) {
  const parsedMonth = parseMonth(month);
  const selectedYear = parsedMonth?.year ?? currentVietnamMonth().year;
  const selectedMonth = parsedMonth?.month ?? currentVietnamMonth().month;
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(selectedYear);
  const dialogId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const togglePicker = () => {
    setVisibleYear(selectedYear);
    setOpen((current) => !current);
  };

  const closePicker = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="group inline-flex min-h-10 min-w-[9.5rem] items-center justify-center gap-2 rounded-xl border border-forest/10 bg-paper px-3 text-sm font-extrabold text-forest shadow-[0_7px_20px_rgba(31,61,43,0.06)] transition hover:border-forest/20 hover:bg-white"
        onClick={togglePicker}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="size-4 text-indigo" />
        <span className="whitespace-nowrap">Tháng {selectedMonth} · {selectedYear}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 text-forest/45 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <>
          <button
            aria-hidden="true"
            className="fixed inset-0 z-40 cursor-default bg-ink/38 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={closePicker}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-labelledby={titleId}
            className={cn(
              "month-picker-enter fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 rounded-[1.75rem] border border-white/60 bg-paper-raised p-4 shadow-[0_28px_90px_rgba(14,14,14,0.24)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-[calc(100%+0.75rem)] sm:w-[20rem] sm:rounded-[1.5rem]",
              align === "start" && "sm:left-0",
              align === "center" && "sm:left-1/2 sm:-translate-x-1/2",
              align === "end" && "sm:right-0",
            )}
            id={dialogId}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-indigo">Khoảng thời gian</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em] text-ink" id={titleId}>Chọn tháng</h2>
              </div>
              <button aria-label="Đóng bộ chọn tháng" className="grid size-9 place-items-center rounded-xl text-forest transition hover:bg-mist" onClick={closePicker} type="button">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-mist/62 p-1.5">
              <button aria-label={`Năm ${visibleYear - 1}`} className="grid size-9 place-items-center rounded-xl text-forest transition hover:bg-paper-raised" onClick={() => setVisibleYear((year) => year - 1)} type="button">
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <p aria-live="polite" className="text-base font-extrabold text-forest">{visibleYear}</p>
              <button aria-label={`Năm ${visibleYear + 1}`} className="grid size-9 place-items-center rounded-xl text-forest transition hover:bg-paper-raised" onClick={() => setVisibleYear((year) => year + 1)} type="button">
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {MONTHS.map((monthNumber) => {
                const value = formatMonthValue(visibleYear, monthNumber);
                const selected = visibleYear === selectedYear && monthNumber === selectedMonth;
                const current = value === formatCurrentVietnamMonth();
                return (
                  <Link
                    aria-current={selected ? "date" : undefined}
                    className={cn(
                      "relative grid min-h-12 place-items-center rounded-2xl border border-transparent text-xs font-extrabold text-ink/62 transition hover:border-forest/10 hover:bg-mist/72 hover:text-forest",
                      current && !selected && "bg-yellow/24 text-ink",
                      selected && "bg-forest text-paper shadow-[0_10px_24px_rgba(31,61,43,0.2)] hover:bg-forest hover:text-paper",
                    )}
                    href={hrefForMonth(value)}
                    key={value}
                    onClick={() => setOpen(false)}
                  >
                    Tháng {monthNumber}
                    {current ? <span aria-hidden="true" className={cn("absolute bottom-1.5 size-1 rounded-full bg-indigo", selected && "bg-yellow")} /> : null}
                    <LinkPendingOverlay />
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-forest/8 pt-3">
              <p className="text-xs font-semibold text-ink/42">Đang xem tháng {selectedMonth}/{selectedYear}</p>
              <Link className="relative rounded-xl bg-yellow px-3 py-2 text-xs font-extrabold text-ink transition hover:bg-yellow/78" href={hrefForMonth(formatCurrentVietnamMonth())} onClick={() => setOpen(false)}>
                Tháng này
                <LinkPendingOverlay />
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function currentVietnamMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function formatCurrentVietnamMonth() {
  const current = currentVietnamMonth();
  return formatMonthValue(current.year, current.month);
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
