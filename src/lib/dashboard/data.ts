import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type DashboardTransactionType = "income" | "expense";

export type DashboardSummary = {
  count: number;
  income: number;
  expense: number;
  balance: number;
};

export type DashboardCategoryTotal = {
  type: DashboardTransactionType;
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  count: number;
  amount: number;
  percent: number;
};

export type DashboardMemberTotal = {
  userId: string | null;
  name: string;
  type: DashboardTransactionType;
  count: number;
  amount: number;
};

export type DashboardRecentTransaction = {
  id: string;
  amount: number;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  type: DashboardTransactionType;
  title: string;
  note: string | null;
  transactionDate: string;
  createdAt: string | null;
  userId: string | null;
  memberName: string;
};

export type DashboardReport = {
  month: string;
  range: { start: string; end: string };
  summary: DashboardSummary;
  categoryBreakdown: DashboardCategoryTotal[];
  memberTotals: DashboardMemberTotal[];
  recentTransactions: DashboardRecentTransaction[];
};

export async function getDashboardReport(
  supabase: SupabaseClient<Database>,
  month: string,
): Promise<DashboardReport> {
  const range = vietnamMonthBounds(month) ?? vietnamMonthBounds(currentVietnamMonth())!;
  const { data, error } = await supabase.rpc("get_dashboard_report", {
    p_start: range.start,
    p_end: range.end,
  });

  if (error) throw error;
  return normalizeDashboardReport(data, month, range);
}

export function normalizeDashboardReport(
  payload: unknown,
  month: string,
  range = vietnamMonthBounds(month) ?? { start: "", end: "" },
): DashboardReport {
  const record = asRecord(payload);
  const rawSummary = asRecord(record?.summary);
  const income = finiteNumber(rawSummary?.income);
  const expense = finiteNumber(rawSummary?.expense);
  const categoryRows = asArray(record?.category_breakdown)
    .map(normalizeCategoryTotal)
    .filter((row): row is Omit<DashboardCategoryTotal, "percent"> => row !== null);
  const totalsByType = new Map<DashboardTransactionType, number>();

  for (const row of categoryRows) {
    totalsByType.set(row.type, (totalsByType.get(row.type) ?? 0) + row.amount);
  }

  const categoryBreakdown = categoryRows.map((row) => ({
    ...row,
    percent: percentage(row.amount, totalsByType.get(row.type) ?? 0),
  }));

  return {
    month,
    range,
    summary: {
      count: Math.max(0, Math.round(finiteNumber(rawSummary?.count))),
      income,
      expense,
      balance: income - expense,
    },
    categoryBreakdown,
    memberTotals: asArray(record?.member_totals)
      .map(normalizeMemberTotal)
      .filter((row): row is DashboardMemberTotal => row !== null),
    recentTransactions: asArray(record?.recent_transactions)
      .map(normalizeRecentTransaction)
      .filter((row): row is DashboardRecentTransaction => row !== null),
  };
}

export function vietnamMonthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;

  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01T00:00:00+07:00`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`,
  };
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

function normalizeCategoryTotal(value: unknown): Omit<DashboardCategoryTotal, "percent"> | null {
  const row = asRecord(value);
  const type = readTransactionType(row?.type);
  if (!row || !type) return null;
  return {
    type,
    categoryId: readNullableString(row.category_id),
    name: readString(row.category_name, "Danh mục đã xóa"),
    color: readString(row.category_color, type === "income" ? "#0F8B6F" : "#C2410C"),
    icon: readString(row.category_icon, "other"),
    count: Math.max(0, Math.round(finiteNumber(row.count))),
    amount: Math.max(0, finiteNumber(row.amount)),
  };
}

function normalizeMemberTotal(value: unknown): DashboardMemberTotal | null {
  const row = asRecord(value);
  const type = readTransactionType(row?.type);
  if (!row || !type) return null;
  return {
    userId: readNullableString(row.user_id),
    name: readString(row.member_name, "Thành viên"),
    type,
    count: Math.max(0, Math.round(finiteNumber(row.count))),
    amount: Math.max(0, finiteNumber(row.amount)),
  };
}

function normalizeRecentTransaction(value: unknown): DashboardRecentTransaction | null {
  const row = asRecord(value);
  const type = readTransactionType(row?.type);
  const id = readString(row?.id, "");
  if (!row || !type || !id) return null;
  return {
    id,
    amount: Math.max(0, finiteNumber(row.amount)),
    categoryId: readNullableString(row.category_id),
    categoryName: readString(row.category_name, "Danh mục đã xóa"),
    categoryColor: readString(row.category_color, type === "income" ? "#0F8B6F" : "#C2410C"),
    categoryIcon: readString(row.category_icon, "other"),
    type,
    title: readString(row.title, "Giao dịch"),
    note: readNullableString(row.note),
    transactionDate: readString(row.transaction_date, ""),
    createdAt: readNullableString(row.created_at),
    userId: readNullableString(row.user_id),
    memberName: readString(row.member_name, "Thành viên"),
  };
}

function readTransactionType(value: unknown): DashboardTransactionType | null {
  return value === "income" || value === "expense" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percentage(value: number, total: number) {
  return total > 0 ? value / total : 0;
}
