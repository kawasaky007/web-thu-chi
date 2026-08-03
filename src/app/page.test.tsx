import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardView } from "@/components/dashboard/dashboard-view";

const report = {
  month: "2026-07",
  range: { start: "2026-07-01T00:00:00+07:00", end: "2026-08-01T00:00:00+07:00" },
  summary: { count: 3, income: 32500000, expense: 7820000, balance: 24680000 },
  categoryBreakdown: [{ type: "expense" as const, categoryId: "food", name: "Ăn uống", color: "#0F8B6F", icon: "food", count: 1, amount: 7820000, percent: 1 }],
  memberTotals: [{ userId: "member-1", name: "An", type: "expense" as const, count: 3, amount: 7820000 }],
  recentTransactions: [{ id: "tx-1", amount: 485000, categoryId: "food", categoryName: "Ăn uống", categoryColor: "#0F8B6F", categoryIcon: "food", type: "expense" as const, title: "Đi chợ cuối tuần", note: null, transactionDate: "2026-07-31", createdAt: null, userId: "member-1", memberName: "An" }],
};

describe("Home", () => {
  it("hiển thị tổng quan tài chính", () => {
    render(<DashboardView monthlyBudget={13200000} profileName="An" report={report} />);

    expect(screen.getByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    expect(screen.getByText("+24.680.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Giao dịch mới")).toBeInTheDocument();
  });
});
