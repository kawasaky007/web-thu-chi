import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionsManager } from "@/components/transactions/transaction-manager";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
}));

const categories = [
  { id: "food", name: "Ăn uống", type: "expense" as const, color: "#087a5b", icon: "food", sortOrder: 1 },
];
const members = [
  { id: "user-1", name: "An", email: "an@example.com" },
  { id: "user-2", name: "Bình", email: "binh@example.com" },
];

function renderManager(memberIds: string[] = []) {
  render(
    <ToastProvider>
      <TransactionsManager
        categories={categories}
        currentMonth="2026-08"
        currentUserId="user-1"
        hasMore={false}
        memberIds={memberIds}
        members={members}
        nextCursor={null}
        search=""
        summary={{ count: 0, expense: 0, income: 0 }}
        transactions={[]}
        view="month"
      />
    </ToastProvider>,
  );
}

describe("bộ lọc theo thành viên trên trang giao dịch", () => {
  it("mở danh sách thành viên và tạo link chọn thêm 1 người", () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Thành viên" }));

    const anLink = screen.getByRole("link", { name: /An/ });
    expect(anLink).toHaveAttribute("aria-pressed", "false");
    expect(anLink).toHaveAttribute("href", "/transactions?month=2026-08&member=user-1");

    const binhLink = screen.getByRole("link", { name: /Bình/ });
    expect(binhLink).toHaveAttribute("href", "/transactions?month=2026-08&member=user-2");
  });

  it("hiện số lượng đang chọn và cho phép chọn thêm người thứ hai", () => {
    renderManager(["user-1"]);

    expect(screen.getByRole("button", { name: "Thành viên (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thành viên (1)" }));

    const anLink = screen.getByRole("link", { name: /An/ });
    expect(anLink).toHaveAttribute("aria-pressed", "true");
    // Bấm lại người đã chọn sẽ bỏ chọn người đó khỏi bộ lọc.
    expect(anLink).toHaveAttribute("href", "/transactions?month=2026-08");

    const binhLink = screen.getByRole("link", { name: /Bình/ });
    expect(binhLink).toHaveAttribute("aria-pressed", "false");
    // Chọn thêm người thứ hai vẫn giữ người đã chọn trước đó.
    expect(binhLink).toHaveAttribute("href", "/transactions?month=2026-08&member=user-1%2Cuser-2");
  });

  it("chỉ hiện nút Bỏ lọc khi đang có thành viên được chọn", () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "Thành viên" }));
    expect(screen.queryByRole("link", { name: "Bỏ lọc" })).not.toBeInTheDocument();

    renderManager(["user-1", "user-2"]);
    fireEvent.click(screen.getByRole("button", { name: "Thành viên (2)" }));
    expect(screen.getByRole("link", { name: "Bỏ lọc" })).toHaveAttribute("href", "/transactions?month=2026-08");
  });
});
