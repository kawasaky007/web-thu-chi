import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRecurringReminderPermission,
  showRecurringDueReminder,
} from "./recurring-reminder";

describe("recurring reminder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("không gửi thông báo nếu không có kỳ đến hạn", async () => {
    expect(await showRecurringDueReminder({ dueCount: 0, userId: "user-1" })).toBe(false);
  });

  it("nhận biết môi trường không hỗ trợ Notification", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "Notification");
    Object.defineProperty(window, "Notification", { configurable: true, value: undefined });
    expect(getRecurringReminderPermission()).toBe("unsupported");
    if (descriptor) Object.defineProperty(window, "Notification", descriptor);
  });
});
