"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, MessageCircle, PiggyBank, Plus, Sparkles } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Brand } from "@/components/brand";
import { DesktopNavigation, MobileNavigation } from "@/components/app/navigation";
import { TransactionForm } from "@/components/transactions/transaction-manager";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { RecurringReminderNotifier } from "@/components/recurring/recurring-reminder-notifier";

export function AppShell({
  children,
  email,
  householdName,
  initials,
  profileName,
  transactionCategories,
  transactionMembers,
  currentUserId,
  recurringDueCount,
  todayLabel,
}: {
  children: ReactNode;
  email: string;
  householdName: string;
  initials: string;
  profileName: string;
  transactionCategories: CategoryOption[];
  transactionMembers: MemberOption[];
  currentUserId: string;
  recurringDueCount: number;
  todayLabel: string;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17.5rem] flex-col border-r border-forest/10 bg-paper-raised/72 px-5 py-6 backdrop-blur-2xl lg:flex">
        <Brand />
        <DesktopNavigation />

        <div className="mt-auto rounded-[1.6rem] bg-forest p-4 text-paper shadow-[0_20px_60px_rgba(31,61,43,0.22)]">
          <div className="grid size-10 place-items-center rounded-2xl bg-paper/10 text-yellow">
            <Sparkles aria-hidden="true" className="size-5" />
          </div>
          <p className="mt-4 text-sm font-extrabold">Supabase đã kết nối</p>
          <p className="mt-1 text-xs font-medium leading-5 text-paper/58">
            Tài khoản, household và giao dịch đang dùng dữ liệu thật với RLS của Supabase.
          </p>
        </div>

        <LogoutButton
          email={email}
          initials={initials}
          profileName={profileName}
          variant="sidebar"
        />
      </aside>

      <div className="min-h-dvh lg:pl-[17.5rem]">
        <header className="sticky top-0 z-20 border-b border-forest/8 bg-paper/78 px-4 py-3 backdrop-blur-2xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <Brand className="lg:hidden" compact />
            <div className="hidden lg:block">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/44">
                {householdName}
              </p>
              <p className="mt-0.5 text-sm font-bold capitalize text-ink">{todayLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button aria-label="Mở trợ lý Thu Chi" className="hidden sm:inline-flex" onClick={() => setAssistantOpen(true)} size="icon" variant="secondary">
                <MessageCircle aria-hidden="true" className="size-5" />
              </Button>
              <Link
                aria-label="Mục tiêu và quỹ tiết kiệm"
                className="inline-flex size-11 items-center justify-center rounded-2xl border border-forest/14 bg-paper-raised/82 text-forest transition hover:bg-mist/70"
                href="/goals"
              >
                <PiggyBank aria-hidden="true" className="size-5" />
              </Link>
              <Link
                aria-label={recurringDueCount > 0 ? `${recurringDueCount} giao dịch định kỳ đến hạn` : "Giao dịch định kỳ"}
                className="relative inline-flex size-11 items-center justify-center rounded-2xl border border-forest/14 bg-paper-raised/82 text-forest transition hover:bg-mist/70"
                href="/recurring"
              >
                <Bell aria-hidden="true" className="size-5" />
                {recurringDueCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-expense px-1.5 py-0.5 text-[10px] font-extrabold leading-4 text-white shadow-sm">
                    {recurringDueCount > 99 ? "99+" : recurringDueCount}
                  </span>
                ) : null}
              </Link>
              <Button className="hidden sm:inline-flex" onClick={() => setQuickAddOpen(true)}>
                <Plus aria-hidden="true" className="size-5" /> Thêm giao dịch
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Button
        aria-label="Thêm giao dịch"
        className="fixed bottom-[calc(6.6rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full p-0 sm:hidden"
        onClick={() => setQuickAddOpen(true)}
      >
        <Plus aria-hidden="true" className="size-6" />
      </Button>
      <Button
        aria-label="Mở trợ lý Thu Chi"
        className="fixed bottom-[calc(6.6rem+env(safe-area-inset-bottom))] left-4 z-30 size-14 rounded-full bg-yellow p-0 text-ink shadow-[0_14px_32px_rgba(31,61,43,0.22)] hover:bg-yellow/86 sm:hidden"
        onClick={() => setAssistantOpen(true)}
      >
        <MessageCircle aria-hidden="true" className="size-6" />
      </Button>
      <MobileNavigation />
      <RecurringReminderNotifier dueCount={recurringDueCount} userId={currentUserId} />
      {assistantOpen ? (
        <AssistantChat
          categories={transactionCategories}
          currentUserId={currentUserId}
          onClose={() => setAssistantOpen(false)}
          profileName={profileName}
        />
      ) : null}
      {quickAddOpen ? (
        <TransactionForm
          categories={transactionCategories}
          currentUserId={currentUserId}
          members={transactionMembers}
          onClose={() => setQuickAddOpen(false)}
        />
      ) : null}
    </div>
  );
}
