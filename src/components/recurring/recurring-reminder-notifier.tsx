"use client";

import { useEffect } from "react";

import { showRecurringDueReminder } from "@/lib/pwa/recurring-reminder";

export function RecurringReminderNotifier({
  dueCount,
  userId,
}: {
  dueCount: number;
  userId: string;
}) {
  useEffect(() => {
    void showRecurringDueReminder({ dueCount, userId }).catch(() => {
      // Notification failure must not affect the finance app shell.
    });
  }, [dueCount, userId]);
  return null;
}
