import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markNotificationsReadActionMock } = vi.hoisted(() => ({
  markNotificationsReadActionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  markNotificationsReadAction: markNotificationsReadActionMock,
}));

const { onMock, subscribeMock, unsubscribeMock, removeChannelMock, channelMock, createBrowserSupabaseClientMock } = vi.hoisted(() => {
  const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  channel.unsubscribe.mockResolvedValue("ok");
  const removeChannelMock = vi.fn().mockResolvedValue("ok");
  const channelMock = vi.fn<(topic: string) => typeof channel>(() => channel);
  const createBrowserSupabaseClientMock = vi.fn(() => ({
    channel: channelMock,
    removeChannel: removeChannelMock,
  }));
  return { onMock: channel.on, subscribeMock: channel.subscribe, unsubscribeMock: channel.unsubscribe, removeChannelMock, channelMock, createBrowserSupabaseClientMock };
});
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: createBrowserSupabaseClientMock,
}));

import { NotificationBell } from "./notification-bell";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";

const categories: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#087a5b", icon: "food", sortOrder: 1 },
];
const members: MemberOption[] = [
  { id: "user-1", name: "Bạn", email: "an@example.com" },
  { id: "user-2", name: "Bình", email: "binh@example.com" },
];

function renderBell(overrides: Partial<React.ComponentProps<typeof NotificationBell>> = {}) {
  render(
    <NotificationBell
      categories={categories}
      currentUserId="user-1"
      householdId="household-1"
      initialItems={[]}
      initialUnreadCount={0}
      members={members}
      recurringDueCount={0}
      {...overrides}
    />,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onMock.mockReturnValue({ on: onMock, subscribe: subscribeMock, unsubscribe: unsubscribeMock });
    subscribeMock.mockReturnValue({ on: onMock, subscribe: subscribeMock, unsubscribe: unsubscribeMock });
    unsubscribeMock.mockResolvedValue("ok");
    removeChannelMock.mockResolvedValue("ok");
  });

  it("hiện tổng số lịch định kỳ đến hạn và giao dịch chưa xem", () => {
    renderBell({ recurringDueCount: 2, initialUnreadCount: 3 });
    expect(screen.getByRole("button", { name: "5 thông báo chưa xem" })).toBeInTheDocument();
  });

  it("thêm giao dịch mới từ Realtime vào danh sách và tăng số chưa xem", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    act(() => {
      handler({
        new: {
          id: "tx-new",
          type: "expense",
          amount: 45000,
          category_id: "food",
          user_id: "user-2",
          created_by: "user-2",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 thông báo chưa xem" }));
    expect(screen.getByText("Bình")).toBeInTheDocument();
    expect(screen.getByText(/đã thêm khoản chi 45.000 đ/)).toBeInTheDocument();
  });

  it("bỏ qua sự kiện Realtime do chính mình tạo", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    act(() => {
      handler({
        new: {
          id: "tx-self",
          type: "expense",
          amount: 10000,
          category_id: "food",
          user_id: "user-1",
          created_by: "user-1",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("mở popover thì đánh dấu đã đọc và badge chỉ còn số lịch định kỳ", () => {
    renderBell({ recurringDueCount: 1, initialUnreadCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "3 thông báo chưa xem" }));

    expect(markNotificationsReadActionMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
  });

  it("dùng người thực hiện (created_by) để loại trừ và hiển thị, không dùng người được ghi nhận (user_id)", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    act(() => {
      handler({
        new: {
          id: "tx-on-behalf",
          type: "expense",
          amount: 30000,
          category_id: "food",
          user_id: "user-1",
          created_by: "user-2",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 thông báo chưa xem" }));
    expect(screen.getByText("Bình")).toBeInTheDocument();
  });

  it("bỏ qua sự kiện Realtime của giao dịch cũ (ví dụ từ khôi phục sao lưu)", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    act(() => {
      handler({
        new: {
          id: "tx-old",
          type: "expense",
          amount: 20000,
          category_id: "food",
          user_id: "user-2",
          created_by: "user-2",
          created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
      });
    });

    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("bấm Xóa tất cả thì xóa cả danh sách lẫn số badge, kể cả khi có giao dịch mới đến lúc đang mở", () => {
    renderBell({ initialUnreadCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
    expect(markNotificationsReadActionMock).toHaveBeenCalledOnce();

    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;
    act(() => {
      handler({
        new: {
          id: "tx-while-open",
          type: "expense",
          amount: 15000,
          category_id: "food",
          user_id: "user-2",
          created_by: "user-2",
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa tất cả" }));

    expect(screen.getByText("Chưa có giao dịch mới nào.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("hủy đăng ký Realtime khi unmount", () => {
    const { unmount } = render(
      <NotificationBell
        categories={categories}
        currentUserId="user-1"
        householdId="household-1"
        initialItems={[]}
        initialUnreadCount={0}
        members={members}
        recurringDueCount={0}
      />,
    );

    unmount();

    // removeChannel() tự unsubscribe bên trong; gọi thêm unsubscribe() rồi mới
    // removeChannel() từng làm channel trùng tên của lần mount sau bị gỡ theo.
    expect(removeChannelMock).toHaveBeenCalledOnce();
  });

  it("dùng tên topic Realtime khác nhau cho mỗi lần subscribe", () => {
    renderBell();
    renderBell();

    const topics = channelMock.mock.calls.map(([topic]) => topic as string);
    expect(topics).toHaveLength(2);
    expect(new Set(topics).size).toBe(2);
    expect(topics.every((topic) => topic.startsWith("household-transactions-household-1-"))).toBe(true);
  });
});
