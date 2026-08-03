import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackupManager } from "@/components/backup/backup-manager";
import { ToastProvider } from "@/components/ui/toast";
import { createTransactionBackup } from "@/lib/backup/format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/backup/actions", () => ({
  importTransactionsAction: vi.fn(),
  initialBackupActionState: { status: "idle" },
}));

function renderManager() {
  render(
    <ToastProvider>
      <BackupManager
        householdName="Gia đình An"
        overview={{ transactionCount: 286, categoryCount: 12, budgetCount: 4 }}
      />
    </ToastProvider>,
  );
}

describe("BackupManager", () => {
  it("hiển thị link export với route bảo mật", () => {
    renderManager();

    expect(screen.getByRole("link", { name: /Tải file JSON/i })).toHaveAttribute("href", "/api/backup/transactions?format=json");
    expect(screen.getByRole("link", { name: /Tải file CSV/i })).toHaveAttribute("href", "/api/backup/transactions?format=csv");
    expect(screen.getByText("286")).toBeInTheDocument();
  });

  it("đọc file trên thiết bị và hiển thị preview trước khi submit", async () => {
    renderManager();
    const backup = createTransactionBackup("Gia đình An", [{
      id: "11111111-1111-4111-8111-111111111111",
      type: "expense",
      amount: 125000,
      transactionDate: "2026-08-03",
      categoryId: "22222222-2222-4222-8222-222222222222",
      categoryName: "Ăn uống",
      memberId: "33333333-3333-4333-8333-333333333333",
      memberEmail: "an@example.com",
      memberName: "An",
      note: "Đi chợ",
      createdAt: "2026-08-03T01:00:00.000Z",
    }]);
    const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(JSON.stringify(backup)) });

    fireEvent.change(screen.getByLabelText(/Chọn file JSON hoặc CSV/i), { target: { files: [file] } });

    expect(await screen.findByText("1 dòng hợp lệ")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByRole("button", { name: "Nhập 1 giao dịch" })).toBeEnabled();
    await waitFor(() => expect(screen.getByDisplayValue(/thu-chi-transactions/)).toBeInTheDocument());
  });
});
