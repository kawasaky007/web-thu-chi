"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";

import { markNotificationsReadAction } from "@/app/(app)/profile/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { NotificationTransactionItem } from "@/lib/notifications/data";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";

const REALTIME_MAX_AGE_MS = 5 * 60 * 1000;

export function NotificationBell({
  categories,
  currentUserId,
  householdId,
  initialItems,
  initialUnreadCount,
  members,
  recurringDueCount,
}: {
  categories: CategoryOption[];
  currentUserId: string;
  householdId: string;
  initialItems: NotificationTransactionItem[];
  initialUnreadCount: number;
  members: MemberOption[];
  recurringDueCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const dialogId = useId();
  const headingId = `${dialogId}-heading`;
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`household-transactions-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions", filter: `household_id=eq.${householdId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          const rowUserId = typeof row.user_id === "string" ? row.user_id : null;
          const rowActorId = typeof row.created_by === "string" ? row.created_by : rowUserId;
          const rowType = row.type;
          const rowCreatedAt = typeof row.created_at === "string" ? row.created_at : null;
          if (!rowActorId || rowActorId === currentUserId) return;
          if (rowType !== "income" && rowType !== "expense") return;
          if (!rowCreatedAt || Date.now() - new Date(rowCreatedAt).getTime() > REALTIME_MAX_AGE_MS) return;
          const item: NotificationTransactionItem = {
            id: String(row.id),
            type: rowType,
            amount: Number(row.amount),
            categoryId: typeof row.category_id === "string" ? row.category_id : null,
            userId: rowUserId ?? "",
            actorId: rowActorId,
            createdAt: rowCreatedAt,
          };
          setItems((current) => [item, ...current].slice(0, 20));
          setUnreadCount((current) => current + 1);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [currentUserId, householdId]);

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

  const totalCount = recurringDueCount + unreadCount;

  const openBell = () => {
    setOpen(true);
    setUnreadCount(0);
    markNotificationsReadAction().catch(() => {});
  };

  const closeBell = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="relative inline-block">
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={totalCount > 0 ? `${totalCount} thông báo chưa xem` : "Thông báo"}
        className="relative inline-flex size-11 items-center justify-center rounded-2xl border border-forest/14 bg-paper-raised/82 text-forest transition hover:bg-mist/70"
        onClick={() => (open ? closeBell() : openBell())}
        ref={triggerRef}
        type="button"
      >
        <Bell aria-hidden="true" className="size-5" />
        {totalCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-expense px-1.5 py-0.5 text-[10px] font-extrabold leading-4 text-white shadow-sm">
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            aria-hidden="true"
            className="fixed inset-0 z-40 cursor-default bg-ink/38 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={closeBell}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-labelledby={headingId}
            className="month-picker-enter fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 max-h-[70vh] overflow-y-auto rounded-[1.75rem] border border-white/60 bg-paper-raised p-4 shadow-[0_28px_90px_rgba(14,14,14,0.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-80 sm:rounded-[1.5rem]"
            id={dialogId}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo" id={headingId}>Thông báo</p>
              <button aria-label="Đóng thông báo" onClick={closeBell} type="button">
                <X aria-hidden="true" className="size-4 text-forest/45" />
              </button>
            </div>

            {recurringDueCount > 0 ? (
              <Link
                className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-yellow/35 px-3 text-sm font-bold text-ink transition hover:bg-yellow/50"
                href="/recurring"
                onClick={closeBell}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-yellow text-ink">
                  <Check aria-hidden="true" className="size-4" />
                </span>
                {recurringDueCount} lịch định kỳ đến hạn
              </Link>
            ) : null}

            <div className="mt-3 space-y-1">
              {items.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm font-medium text-ink/45">Chưa có giao dịch mới nào.</p>
              ) : (
                items.map((item) => <NotificationItemRow categories={categories} item={item} key={item.id} members={members} />)
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function NotificationItemRow({
  categories,
  item,
  members,
}: {
  categories: CategoryOption[];
  item: NotificationTransactionItem;
  members: MemberOption[];
}) {
  const category = categories.find((candidate) => candidate.id === item.categoryId);
  const member = members.find((candidate) => candidate.id === item.actorId);
  const amountLabel = new Intl.NumberFormat("vi-VN").format(Math.round(item.amount));
  const typeLabel = item.type === "income" ? "thu" : "chi";

  return (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm">
      <span
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
        style={{ backgroundColor: category?.color ?? "#6B7280" }}
      >
        {(member?.name ?? "?").slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          <span className="font-extrabold">{member?.name ?? "Thành viên"}</span> đã thêm khoản {typeLabel} {amountLabel} đ
        </p>
        <p className="mt-0.5 text-xs font-semibold text-ink/45">
          {category?.name ?? "Không rõ danh mục"} · {formatRelativeTime(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });

function formatRelativeTime(iso: string, now = new Date()) {
  const diffMinutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (diffMinutes > -1) return "Vừa xong";
  if (diffMinutes > -60) return relativeTimeFormatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours > -24) return relativeTimeFormatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return relativeTimeFormatter.format(diffDays, "day");
}
