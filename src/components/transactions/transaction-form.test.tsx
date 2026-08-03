import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm } from "@/components/transactions/transaction-manager";
import { ToastProvider } from "@/components/ui/toast";
import { readTransactionDraft, writeTransactionDraft } from "@/lib/pwa/transaction-draft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
  initialTransactionActionState: { status: "idle" },
}));

const categories = [
  { id: "food", name: "Ăn uống", type: "expense" as const, color: "#087a5b", icon: "food", sortOrder: 1 },
  { id: "salary", name: "Lương", type: "income" as const, color: "#087a5b", icon: "salary", sortOrder: 2 },
];
const members = [{ id: "user-1", name: "An", email: "an@example.com" }];

function renderForm(onClose = vi.fn()) {
  render(
    <ToastProvider>
      <TransactionForm
        categories={categories}
        currentUserId="user-1"
        members={members}
        onClose={onClose}
      />
    </ToastProvider>,
  );
  return onClose;
}

describe("TransactionForm offline draft", () => {
  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("khôi phục nháp hợp lệ của người dùng hiện tại", async () => {
    writeTransactionDraft(window.localStorage, "user-1", {
      type: "expense",
      categoryId: "food",
      userId: "user-1",
      amountExpression: "150000",
      transactionDate: "2026-08-03",
      note: "Đi chợ",
    });

    renderForm();

    expect(await screen.findByText("Đã khôi phục bản nháp")).toBeInTheDocument();
    expect(screen.getByLabelText("Số tiền hoặc biểu thức")).toHaveValue("150000");
    expect(screen.getByLabelText("Danh mục")).toHaveValue("food");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("Đi chợ");
  });

  it("lưu nháp cục bộ thay vì gọi server khi offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const onClose = renderForm();

    fireEvent.change(screen.getByLabelText("Số tiền hoặc biểu thức"), { target: { value: "99000" } });
    fireEvent.change(screen.getByLabelText("Danh mục"), { target: { value: "food" } });
    fireEvent.change(screen.getByLabelText("Ghi chú"), { target: { value: "Bữa trưa" } });
    fireEvent.click(await screen.findByRole("button", { name: "Lưu bản nháp" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(readTransactionDraft(window.localStorage, "user-1")).toMatchObject({
      amountExpression: "99000",
      categoryId: "food",
      note: "Bữa trưa",
    });
  });

  it("ghi nháp ngay khi đóng form trước thời gian autosave", () => {
    const onClose = renderForm();

    fireEvent.change(screen.getByLabelText("Số tiền hoặc biểu thức"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(readTransactionDraft(window.localStorage, "user-1")).toMatchObject({
      amountExpression: "45000",
    });
  });
});
