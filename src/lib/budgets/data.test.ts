import { describe, expect, it } from "vitest";

import {
  compareBudgetView,
  formatVietnameseMonth,
  parseMonth,
  shiftMonth,
  summarizeBudgetRows,
} from "@/lib/budgets/data";
import { parseBudgetAmount, parseOrderedIds, validateBudgetMonth } from "@/lib/budgets/validation";
import { resolveBudgetCloneSource } from "@/lib/budgets/clone";

describe("budget data", () => {
  it("validates month boundaries and moves across years", () => {
    expect(parseMonth("2026-00")).toBeNull();
    expect(validateBudgetMonth("2026-12")).toEqual({ key: "2026-12", month: 12, year: 2026 });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(formatVietnameseMonth("2026-07")).toMatch(/2026/);
  });

  it("parses Vietnamese whole-VND input", () => {
    expect(parseBudgetAmount("3.500.000")).toBe(3500000);
    expect(parseBudgetAmount("3,500,000")).toBe(3500000);
    expect(parseBudgetAmount("0")).toBe(0);
    expect(parseBudgetAmount("-1")).toBeNull();
  });

  it("summarizes no budget, under budget and over budget states", () => {
    expect(summarizeBudgetRows([])).toEqual({ totalBudget: 0, totalExpense: 0, remaining: 0, usedPercent: 0 });
    expect(summarizeBudgetRows([{ amount: 1000000, spent: 400000 }])).toEqual({ totalBudget: 1000000, totalExpense: 400000, remaining: 600000, usedPercent: 0.4 });
    expect(summarizeBudgetRows([{ amount: 1000000, spent: 1400000 }])).toMatchObject({ remaining: -400000, usedPercent: 1.4 });
  });

  it("keeps display order before category fallback", () => {
    expect(compareBudgetView({ displayOrder: 1, categorySortOrder: 99, categoryName: "B" }, { displayOrder: 2, categorySortOrder: 0, categoryName: "A" })).toBeLessThan(0);
  });

  it("rejects duplicate or malformed reorder ids", () => {
    expect(parseOrderedIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseOrderedIds('["a","a"]')).toBeNull();
    expect(parseOrderedIds("not-json")).toBeNull();
  });

  it("does not clone over an existing target month and finds the latest prior month", () => {
    expect(resolveBudgetCloneSource([{ month: 1, year: 2026 }, { month: 3, year: 2026 }], { month: 3, year: 2026 })).toEqual({ targetExists: true, source: null });
    expect(resolveBudgetCloneSource([{ month: 12, year: 2025 }, { month: 2, year: 2026 }, { month: 1, year: 2026 }], { month: 4, year: 2026 }).source).toEqual({ month: 2, year: 2026 });
  });
});
