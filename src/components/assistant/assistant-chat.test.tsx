import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantChat } from "./assistant-chat";
import { createTransactionAction } from "@/app/(app)/transactions/actions";
import {
  getAssistantMonthlySummaryAction,
  getAssistantTodayExpensesAction,
} from "@/app/(app)/assistant/actions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
}));

vi.mock("@/app/(app)/assistant/actions", () => ({
  getAssistantMonthlySummaryAction: vi.fn(),
  getAssistantTodayExpensesAction: vi.fn(),
}));

const createTransaction = vi.mocked(createTransactionAction);
const getMonthlySummary = vi.mocked(getAssistantMonthlySummaryAction);
const getTodayExpenses = vi.mocked(getAssistantTodayExpensesAction);
const categories = [
  { id: "food", name: "Ăn uống", type: "expense" as const, color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "coffee", name: "Cà phê", type: "expense" as const, color: "#CA8A04", icon: "coffee", sortOrder: 2 },
  { id: "salary", name: "Lương", type: "income" as const, color: "#0F8B6F", icon: "salary", sortOrder: 3 },
];

function renderAssistant() {
  render(
    <AssistantChat
      categories={categories}
      currentUserId="user-1"
      onClose={vi.fn()}
      profileName="An"
    />,
  );
}

describe("AssistantChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tự tạo giao dịch từ câu tiếng Việt rõ ràng", async () => {
    createTransaction.mockResolvedValue({ status: "success", transactionId: "tx-agent" });
    renderAssistant();

    fireEvent.click(screen.getByRole("button", { name: "Mua cà phê 18k" }));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledOnce());
    const formData = createTransaction.mock.calls[0][1];
    expect(formData.get("amountExpression")).toBe("18000");
    expect(formData.get("categoryId")).toBe("coffee");
    expect(formData.get("userId")).toBe("user-1");
    expect(await screen.findByText(/Đã thêm khoản chi 18.000 đ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn tác" })).toBeInTheDocument();
  });

  it("đọc tổng quan tháng từ dữ liệu thật", async () => {
    getMonthlySummary.mockResolvedValue({
      status: "success",
      month: "2026-08",
      count: 4,
      income: 10_000_000,
      expense: 2_500_000,
      balance: 7_500_000,
    });
    renderAssistant();

    fireEvent.click(screen.getByRole("button", { name: "Tháng này chi bao nhiêu?" }));

    expect(await screen.findByText(/thu 10.000.000 đ, chi 2.500.000 đ/)).toBeInTheDocument();
    expect(getMonthlySummary).toHaveBeenCalledOnce();
  });

  it("liệt kê các khoản đã chi hôm nay", async () => {
    getTodayExpenses.mockResolvedValue({
      status: "success",
      count: 2,
      total: 68_000,
      items: [
        { id: "tx-1", amount: 18_000, title: "Cà phê", note: null },
        { id: "tx-2", amount: 50_000, title: "Ăn uống", note: null },
      ],
    });
    renderAssistant();

    fireEvent.change(screen.getByRole("textbox", { name: "Nhắn cho trợ lý Thu Chi" }), {
      target: { value: "Hôm nay tôi đã chi những gì?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi lệnh" }));

    expect(await screen.findByText(/Cà phê: 18.000 đ; Ăn uống: 50.000 đ/)).toBeInTheDocument();
    expect(getTodayExpenses).toHaveBeenCalledOnce();
  });
});
