import { currentVietnamDate } from "@/lib/recurring/data";

export type ReminderPermission = NotificationPermission | "unsupported";

export function getRecurringReminderPermission(): ReminderPermission {
  if (
    typeof window === "undefined"
    || !("Notification" in window)
    || !("serviceWorker" in navigator)
  ) return "unsupported";
  return Notification.permission;
}

export async function requestRecurringReminderPermission() {
  if (getRecurringReminderPermission() === "unsupported") return "unsupported" as const;
  return Notification.requestPermission();
}

export async function showRecurringDueReminder({
  dueCount,
  userId,
  force = false,
}: {
  dueCount: number;
  userId: string;
  force?: boolean;
}) {
  if (dueCount <= 0 || getRecurringReminderPermission() !== "granted") return false;
  const storageKey = `thu-chi-recurring-reminder:${userId}:${currentVietnamDate()}`;
  if (!force && window.localStorage.getItem(storageKey)) return false;

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return false;
  await registration.showNotification("Có giao dịch định kỳ đến hạn", {
    body: `${dueCount} lịch đang chờ bạn kiểm tra và ghi vào sổ.`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `recurring-due-${currentVietnamDate()}`,
    data: { url: "/recurring" },
  });
  window.localStorage.setItem(storageKey, new Date().toISOString());
  return true;
}
