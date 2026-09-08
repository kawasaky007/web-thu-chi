import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pwa/recurring-reminder", () => ({
  getRecurringReminderPermission: vi.fn(),
  requestRecurringReminderPermission: vi.fn(),
}));
vi.mock("@/lib/notifications/push-client", () => ({
  subscribeToPushNotifications: vi.fn(),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  savePushSubscriptionAction: vi.fn(),
}));

import { NotificationSettings } from "@/components/profile/notification-settings";
import { ToastProvider } from "@/components/ui/toast";
import { savePushSubscriptionAction } from "@/app/(app)/profile/actions";
import { getRecurringReminderPermission, requestRecurringReminderPermission } from "@/lib/pwa/recurring-reminder";
import { subscribeToPushNotifications } from "@/lib/notifications/push-client";

const getPermission = vi.mocked(getRecurringReminderPermission);
const requestPermission = vi.mocked(requestRecurringReminderPermission);
const subscribeToPush = vi.mocked(subscribeToPushNotifications);
const saveSubscription = vi.mocked(savePushSubscriptionAction);

function renderSettings() {
  render(
    <ToastProvider>
      <NotificationSettings />
    </ToastProvider>,
  );
}

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    getPermission.mockReturnValue("default");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("đăng ký push và báo đã bật khi được cấp quyền", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "key", auth: "secret" } }),
    } as never);
    saveSubscription.mockResolvedValue({ status: "success" });

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    await waitFor(() => expect(saveSubscription).toHaveBeenCalledOnce());
    expect(await screen.findByText("Đã bật")).toBeInTheDocument();
  });

  it("báo thiết bị chưa hỗ trợ push khi subscribe trả về null", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockResolvedValue(null);

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    await waitFor(() => expect(saveSubscription).not.toHaveBeenCalled());
    expect(await screen.findByText("Đã bật")).toBeInTheDocument();
  });

  it("báo lỗi khi trình duyệt chặn quyền thông báo", async () => {
    requestPermission.mockResolvedValue("denied");

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    expect(await screen.findByText("Quyền thông báo đã bị chặn trong cài đặt trình duyệt.")).toBeInTheDocument();
  });

  it("báo lỗi và cho bật lại khi subscribe push bị từ chối bất ngờ", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockRejectedValue(new Error("push service unreachable"));

    renderSettings();
    const button = await screen.findByRole("button", { name: "Bật thông báo" });
    fireEvent.click(button);

    expect(await screen.findByText("Có lỗi khi bật thông báo, vui lòng thử lại.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Đang bật...")).not.toBeInTheDocument();
    });
  });

  it("vẫn hiện nút để đăng ký thiết bị khi quyền đã granted từ trước", async () => {
    getPermission.mockReturnValue("granted");
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://push.example/2", keys: { p256dh: "key2", auth: "secret2" } }),
    } as never);
    saveSubscription.mockResolvedValue({ status: "success" });

    renderSettings();
    const button = await screen.findByRole("button", { name: "Đăng ký thiết bị này" });
    fireEvent.click(button);

    await waitFor(() => expect(saveSubscription).toHaveBeenCalledOnce());
  });
});
