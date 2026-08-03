import { describe, expect, it } from "vitest";

import { normalizeDashboardReport, vietnamMonthBounds } from "@/lib/dashboard/data";

describe("dashboard data", () => {
  it("creates an explicit Vietnam date range", () => {
    expect(vietnamMonthBounds("2026-12")).toEqual({
      start: "2026-12-01T00:00:00+07:00",
      end: "2027-01-01T00:00:00+07:00",
    });
  });

  it("handles an empty month without inventing totals", () => {
    const report = normalizeDashboardReport({
      summary: { count: 0, income: 0, expense: 0 },
      category_breakdown: [],
      member_totals: [],
      recent_transactions: [],
    }, "2026-08");

    expect(report.summary).toEqual({ count: 0, income: 0, expense: 0, balance: 0 });
    expect(report.categoryBreakdown).toEqual([]);
    expect(report.recentTransactions).toEqual([]);
  });

  it("calculates balance and category percentages for income-only data", () => {
    const report = normalizeDashboardReport({
      summary: { count: 2, income: 10000000, expense: 0 },
      category_breakdown: [
        { type: "income", category_id: "salary", category_name: "Lương", amount: 7500000, count: 1 },
        { type: "income", category_id: "bonus", category_name: "Thưởng", amount: 2500000, count: 1 },
      ],
      member_totals: [],
      recent_transactions: [],
    }, "2026-08");

    expect(report.summary.balance).toBe(10000000);
    expect(report.categoryBreakdown.map((item) => item.percent)).toEqual([0.75, 0.25]);
  });

  it("keeps expense-only data negative at summary level", () => {
    const report = normalizeDashboardReport({
      summary: { count: 1, income: 0, expense: 450000 },
      category_breakdown: [
        { type: "expense", category_id: "food", category_name: "Ăn uống", amount: 450000, count: 1 },
      ],
      member_totals: [],
      recent_transactions: [],
    }, "2026-08");

    expect(report.summary.balance).toBe(-450000);
    expect(report.categoryBreakdown[0]?.percent).toBe(1);
  });

  it("normalizes a large aggregate without iterating transaction rows", () => {
    const report = normalizeDashboardReport({
      summary: { count: 1000000, income: "9000000000", expense: "8000000000" },
      category_breakdown: [
        { type: "expense", category_id: "food", category_name: "Ăn uống", amount: "8000000000", count: 1000000 },
      ],
      member_totals: [],
      recent_transactions: [],
    }, "2026-08");

    expect(report.summary).toMatchObject({ count: 1000000, income: 9000000000, expense: 8000000000, balance: 1000000000 });
    expect(report.categoryBreakdown).toHaveLength(1);
  });
});
