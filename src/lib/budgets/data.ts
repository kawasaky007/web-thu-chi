import type { SupabaseClient } from "@supabase/supabase-js";

import { getDashboardReport } from "@/lib/dashboard/data";
import type { Database } from "@/types/database";

export type BudgetCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type BudgetView = {
  id: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  categorySortOrder: number;
  amount: number;
  displayOrder: number;
  spent: number;
};

export type BudgetSummary = {
  totalBudget: number;
  totalExpense: number;
  remaining: number;
  usedPercent: number;
};

export type BudgetPageData = {
  month: string;
  categories: BudgetCategory[];
  budgets: BudgetView[];
  summary: BudgetSummary;
};

export async function getBudgetPageData(
  supabase: SupabaseClient<Database>,
  householdId: string,
  month: string,
): Promise<BudgetPageData> {
  const bounds = parseMonth(month) ?? parseMonth(currentVietnamMonth())!;
  const [categoryResult, budgetResult, report] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, icon, sort_order, type")
      .eq("household_id", householdId)
      .eq("type", "expense")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("budgets")
      .select("id, category_id, amount, display_order")
      .eq("household_id", householdId)
      .eq("month", bounds.month)
      .eq("year", bounds.year),
    getDashboardReport(supabase, bounds.key),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (budgetResult.error) throw budgetResult.error;

  const categories = categoryResult.data.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color ?? "#C2410C",
    icon: category.icon ?? "other",
    sortOrder: category.sort_order ?? 0,
  } satisfies BudgetCategory));
  const spentByCategoryId = new Map(
    report.categoryBreakdown
      .filter((item) => item.type === "expense")
      .map((item) => [item.categoryId ?? "", item.amount]),
  );
  const budgetByCategoryId = new Map(budgetResult.data.map((budget) => [budget.category_id, budget]));

  const budgets = categories
    .map((category, categoryIndex) => {
      const budget = budgetByCategoryId.get(category.id);
      return {
        id: budget?.id ?? null,
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        categoryIcon: category.icon,
        categorySortOrder: category.sortOrder,
        amount: finiteNumber(budget?.amount),
        displayOrder: budget?.display_order ?? categoryIndex,
        spent: finiteNumber(spentByCategoryId.get(category.id)),
      } satisfies BudgetView;
    })
    .sort(compareBudgetView);

  const totalBudget = budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const totalExpense = report.summary.expense;
  return {
    month: bounds.key,
    categories,
    budgets,
    summary: {
      totalBudget,
      totalExpense,
      remaining: totalBudget - totalExpense,
      usedPercent: totalBudget > 0 ? totalExpense / totalBudget : 0,
    },
  };
}

export function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || month < 1 || month > 12) return null;
  return { key: `${year}-${String(month).padStart(2, "0")}`, year, month };
}

export function currentVietnamMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function shiftMonth(month: string, delta: number) {
  const parsed = parseMonth(month) ?? parseMonth(currentVietnamMonth())!;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatVietnameseMonth(month: string) {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 5)));
}

export function summarizeBudgetRows(
  budgets: Array<Pick<BudgetView, "amount" | "spent">>,
  totalExpense = budgets.reduce((sum, budget) => sum + budget.spent, 0),
): BudgetSummary {
  const totalBudget = budgets.reduce((sum, budget) => sum + finiteNumber(budget.amount), 0);
  return {
    totalBudget,
    totalExpense,
    remaining: totalBudget - totalExpense,
    usedPercent: totalBudget > 0 ? totalExpense / totalBudget : 0,
  };
}

export function compareBudgetView(a: Pick<BudgetView, "displayOrder" | "categorySortOrder" | "categoryName">, b: Pick<BudgetView, "displayOrder" | "categorySortOrder" | "categoryName">) {
  return a.displayOrder - b.displayOrder || a.categorySortOrder - b.categorySortOrder || a.categoryName.localeCompare(b.categoryName, "vi");
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
