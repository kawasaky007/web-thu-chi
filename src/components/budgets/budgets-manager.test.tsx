import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reorderBudgetsAction } from "@/app/(app)/budgets/actions";
import { BudgetsManager } from "@/components/budgets/budgets-manager";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/budgets/actions", () => ({
  cloneBudgetAction: vi.fn(),
  deleteBudgetAction: vi.fn(),
  reorderBudgetsAction: vi.fn(async () => ({ status: "success", message: "Đã cập nhật thứ tự ngân sách." })),
  upsertBudgetAction: vi.fn(),
}));

const data = {
  month: "2026-08",
  categories: [
    { id: "food", name: "Ăn uống", color: "#087a5b", icon: "food", sortOrder: 1 },
    { id: "transport", name: "Di chuyển", color: "#5b5bd6", icon: "transport", sortOrder: 2 },
    { id: "shopping", name: "Mua sắm", color: "#b4234d", icon: "shopping", sortOrder: 3 },
  ],
  budgets: [
    {
      id: "budget-food",
      categoryId: "food",
      categoryName: "Ăn uống",
      categoryColor: "#087a5b",
      categoryIcon: "food",
      categorySortOrder: 1,
      amount: 3000000,
      displayOrder: 0,
      spent: 1200000,
    },
    {
      id: "budget-transport",
      categoryId: "transport",
      categoryName: "Di chuyển",
      categoryColor: "#5b5bd6",
      categoryIcon: "transport",
      categorySortOrder: 2,
      amount: 1500000,
      displayOrder: 1,
      spent: 400000,
    },
    {
      id: null,
      categoryId: "shopping",
      categoryName: "Mua sắm",
      categoryColor: "#b4234d",
      categoryIcon: "shopping",
      categorySortOrder: 3,
      amount: 0,
      displayOrder: 2,
      spent: 0,
    },
  ],
  summary: {
    totalBudget: 4500000,
    totalExpense: 1600000,
    remaining: 2900000,
    usedPercent: 1600000 / 4500000,
  },
};

function renderManager() {
  render(
    <ToastProvider>
      <BudgetsManager data={data} />
    </ToastProvider>,
  );
}

describe("BudgetsManager reorder", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hiện tay nắm kéo cho các ngân sách đã thiết lập", () => {
    renderManager();

    expect(screen.getByRole("button", { name: "Kéo để sắp xếp ngân sách Ăn uống" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kéo để sắp xếp ngân sách Di chuyển" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kéo để sắp xếp ngân sách Mua sắm" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Danh mục chưa thiết lập ngân sách" })).toHaveTextContent("Mua sắm");
  });

  it("cập nhật giao diện và gửi toàn bộ thứ tự khi dùng nút dự phòng", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Đưa ngân sách Ăn uống xuống" }));

    const sortableList = screen.getByRole("list", { name: "Ngân sách đã thiết lập" });
    const rows = within(sortableList).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Di chuyển");
    expect(rows[1]).toHaveTextContent("Ăn uống");

    await waitFor(() => expect(reorderBudgetsAction).toHaveBeenCalledOnce());
    const formData = vi.mocked(reorderBudgetsAction).mock.calls[0][1];
    expect(JSON.parse(String(formData.get("orderedIds")))).toEqual(["budget-transport", "budget-food"]);
  });
});
