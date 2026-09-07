import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm, TransactionsManager } from "@/components/transactions/transaction-manager";
import { ToastProvider } from "@/components/ui/toast";
import { readTransactionDraft, writeTransactionDraft } from "@/lib/pwa/transaction-draft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
}));

const { recognizeReceiptImageMock } = vi.hoisted(() => ({
  recognizeReceiptImageMock: vi.fn(),
}));

vi.mock("@/lib/receipt-scan/ocr", () => ({
  MAX_RECEIPT_IMAGE_BYTES: 15_000_000,
  recognizeReceiptImage: recognizeReceiptImageMock,
}));

const categories = [
  { id: "food", name: "Ăn uống", type: "expense" as const, color: "#087a5b", icon: "food", sortOrder: 1 },
  { id: "salary", name: "Lương", type: "income" as const, color: "#087a5b", icon: "salary", sortOrder: 2 },
];
const members = [{ id: "user-1", name: "An", email: "an@example.com" }];

function renderForm(onClose = vi.fn(), categoryOptions = categories) {
  render(
    <ToastProvider>
      <TransactionForm
        categories={categoryOptions}
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
    expect(screen.getByLabelText("Số tiền hoặc biểu thức")).toHaveValue("150.000");
    expect(screen.getByRole("button", { name: "Đã chọn danh mục Ăn uống" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("Đi chợ");
  });

  it("lưu nháp cục bộ thay vì gọi server khi offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const onClose = renderForm();

    fireEvent.change(screen.getByLabelText("Số tiền hoặc biểu thức"), { target: { value: "99000" } });
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục Ăn uống" }));
    fireEvent.change(screen.getByLabelText("Ghi chú"), { target: { value: "Bữa trưa" } });
    fireEvent.click(await screen.findByRole("button", { name: "Lưu bản nháp" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(readTransactionDraft(window.localStorage, "user-1")).toMatchObject({
      amountExpression: "99.000",
      categoryId: "food",
      note: "Bữa trưa",
    });
  });

  it("định dạng số tiền theo nhóm ba chữ số khi nhập", () => {
    renderForm();

    const amountInput = screen.getByLabelText("Số tiền hoặc biểu thức");
    fireEvent.change(amountInput, { target: { value: "125000" } });

    expect(amountInput).toHaveValue("125.000");
  });

  it("đặt danh mục sau ghi chú và giữ footer thao tác ở cuối form", () => {
    renderForm();

    const note = screen.getByLabelText("Ghi chú");
    const categoryLegend = screen.getByText("Chọn danh mục chi tiêu");
    expect(note.compareDocumentPosition(categoryLegend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const saveButton = screen.getByRole("button", { name: "Lưu giao dịch" });
    expect(saveButton.parentElement).toHaveClass("sticky", "bottom-0");
  });

  it("chọn danh mục bằng lưới thay vì dropdown native", () => {
    renderForm();

    expect(screen.queryByRole("combobox", { name: "Danh mục" })).not.toBeInTheDocument();
    const categoryButton = screen.getByRole("button", { name: "Chọn danh mục Ăn uống" });
    fireEvent.click(categoryButton);

    expect(screen.getByRole("button", { name: "Đã chọn danh mục Ăn uống" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hiện 9 danh mục trước và cho phép xem thêm giống app cũ", () => {
    const manyCategories = Array.from({ length: 10 }, (_, index) => ({
      id: `expense-${index + 1}`,
      name: `Danh mục ${index + 1}`,
      type: "expense" as const,
      color: "#087a5b",
      icon: "food",
      sortOrder: index + 1,
    }));
    renderForm(vi.fn(), manyCategories);

    expect(screen.queryByRole("button", { name: "Chọn danh mục Danh mục 10" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 1 danh mục" }));

    expect(screen.getByRole("button", { name: "Chọn danh mục Danh mục 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu gọn" })).toBeInTheDocument();
  });

  it("ghi nháp ngay khi đóng form trước thời gian autosave", () => {
    const onClose = renderForm();

    fireEvent.change(screen.getByLabelText("Số tiền hoặc biểu thức"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(readTransactionDraft(window.localStorage, "user-1")).toMatchObject({
      amountExpression: "45.000",
    });
  });

  it("mở popup xác nhận khi bấm xóa giao dịch", async () => {
    render(
      <ToastProvider>
        <TransactionsManager
          categories={categories}
          currentMonth="2026-08"
          currentUserId="user-1"
          hasMore={false}
          memberIds={[]}
          members={members}
          nextCursor={null}
          search=""
          summary={{ count: 1, expense: 69999, income: 0 }}
          transactions={[{
            id: "transaction-1",
            householdId: "household-1",
            userId: "user-1",
            categoryId: "food",
            type: "expense",
            amount: 69999,
            title: "Ăn uống",
            note: null,
            transactionDate: "2026-08-03T00:00:00",
            createdAt: "2026-08-03T00:00:00",
            categoryName: "Ăn uống",
            categoryColor: "#087a5b",
            categoryIcon: "food",
            memberName: "Bạn",
            memberEmail: "an@example.com",
            canDelete: true,
          }]}
          view="month"
        />
      </ToastProvider>,
    );

    const deleteButton = screen.getByRole("button", { name: "Xóa giao dịch Ăn uống" });
    expect(deleteButton).toHaveAttribute("type", "button");
    fireEvent.click(deleteButton);

    expect(screen.getByRole("alertdialog", { name: "Xóa giao dịch này?" })).toBeInTheDocument();
    expect(screen.getByText(/69\.999.*Ăn uống.*không thể hoàn tác/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Hủy" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("điền số tiền và ngày vào form sau khi quét hóa đơn thành công", async () => {
    recognizeReceiptImageMock.mockResolvedValue(
      "SIEU THI\nNgay 05/09/2026\nTONG CONG 84.000",
    );
    renderForm();

    const fileInput = screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(1000)], "receipt.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Số tiền hoặc biểu thức")).toHaveValue("84.000"),
    );
    expect(screen.getByLabelText("Ngày giao dịch")).toHaveValue("2026-09-05");
  });

  it("hiện chú thích khi quét hóa đơn không đọc được số tiền nhưng đọc được ngày", async () => {
    recognizeReceiptImageMock.mockResolvedValue("Ngay 05/09/2026\nkhong co tong cong");
    renderForm();

    const fileInput = screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(1000)], "receipt.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByText("Không nhận được số tiền từ ảnh, vui lòng nhập tay.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày giao dịch")).toHaveValue("2026-09-05");
  });
});
