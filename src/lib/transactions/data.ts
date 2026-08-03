import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { categoryTypeLabel } from "@/lib/categories/constants";

export type TransactionType = "income" | "expense";

export type CategoryOption = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  sortOrder: number;
};

export type MemberOption = {
  id: string;
  name: string;
  email: string;
};

export type TransactionView = {
  id: string;
  householdId: string;
  userId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  title: string;
  note: string | null;
  transactionDate: string;
  createdAt: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  memberName: string;
  memberEmail: string;
  canDelete: boolean;
};

export type TransactionSummary = {
  count: number;
  income: number;
  expense: number;
};

export type TransactionPageData = {
  transactions: TransactionView[];
  categories: CategoryOption[];
  members: MemberOption[];
  summary: TransactionSummary;
  nextCursor: string | null;
  hasMore: boolean;
};

export async function getTransactionFormOptions(
  supabase: SupabaseClient<Database>,
  householdId: string,
) {
  const [categoryResult, profileResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, type, color, icon, sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("household_id", householdId)
      .order("full_name", { ascending: true }),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (profileResult.error) throw profileResult.error;

  const categories = categoryResult.data.flatMap((category) => {
    if (category.type !== "income" && category.type !== "expense") return [];
    return [{
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color ?? (category.type === "income" ? "#0F8B6F" : "#C2410C"),
      icon: category.icon ?? "other",
      sortOrder: category.sort_order ?? 0,
    } satisfies CategoryOption];
  });
  const members = profileResult.data.map((profile) => ({
    id: profile.id,
    name: profile.full_name?.trim() || profile.email?.trim() || "Thành viên",
    email: profile.email?.trim() || "",
  } satisfies MemberOption));
  return { categories, members };
}

type TransactionQueryOptions = {
  householdId: string;
  currentUserId: string;
  month?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

export async function getTransactionPageData(
  supabase: SupabaseClient<Database>,
  options: TransactionQueryOptions,
): Promise<TransactionPageData> {
  const limit = options.limit ?? 30;
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("household_id", options.householdId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options.month) {
    const bounds = monthBounds(options.month);
    if (bounds) {
      query = query.gte("transaction_date", bounds.start).lt("transaction_date", bounds.end);
    }
  }

  if (options.cursor) {
    query = query.lt("created_at", options.cursor);
  }

  const [transactionResult, categoryResult, profileResult] = await Promise.all([
    query,
    supabase
      .from("categories")
      .select("id, name, type, color, icon, sort_order")
      .eq("household_id", options.householdId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("household_id", options.householdId)
      .order("full_name", { ascending: true }),
  ]);

  if (transactionResult.error) throw transactionResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (profileResult.error) throw profileResult.error;

  const categories = categoryResult.data.flatMap((category) => {
    if (category.type !== "income" && category.type !== "expense") return [];
    return [{
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color ?? (category.type === "income" ? "#0F8B6F" : "#C2410C"),
      icon: category.icon ?? "other",
      sortOrder: category.sort_order ?? 0,
    } satisfies CategoryOption];
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const members = profileResult.data.map((profile) => ({
    id: profile.id,
    name: profile.full_name?.trim() || profile.email?.trim() || "Thành viên",
    email: profile.email?.trim() || "",
  } satisfies MemberOption));
  const memberById = new Map(members.map((member) => [member.id, member]));

  const rows = transactionResult.data.slice(0, limit);
  let transactions = rows.flatMap((transaction) => {
    if (transaction.type !== "income" && transaction.type !== "expense") return [];
    const category = categoryById.get(transaction.category_id ?? "");
    const member = memberById.get(transaction.user_id ?? "");
    return [{
      id: transaction.id,
      householdId: transaction.household_id ?? options.householdId,
      userId: transaction.user_id ?? "",
      categoryId: transaction.category_id ?? "",
      type: transaction.type,
      amount: Number(transaction.amount),
      title: transaction.title?.trim() || category?.name || "Giao dịch",
      note: transaction.note?.trim() || null,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      categoryName: category?.name || transaction.title?.trim() || categoryTypeLabel(transaction.type),
      categoryColor: category?.color || (transaction.type === "income" ? "#0F8B6F" : "#C2410C"),
      categoryIcon: category?.icon || "other",
      memberName: transaction.user_id === options.currentUserId ? "Bạn" : member?.name || "Không rõ",
      memberEmail: member?.email || "",
      canDelete: transaction.user_id === options.currentUserId,
    } satisfies TransactionView];
  });

  if (options.search?.trim()) {
    const search = options.search.trim().toLocaleLowerCase("vi-VN");
    transactions = transactions.filter((transaction) =>
      [transaction.title, transaction.note, transaction.categoryName, transaction.memberName]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("vi-VN").includes(search)),
    );
  }

  const summary = transactions.reduce<TransactionSummary>(
    (result, transaction) => {
      result.count += 1;
      if (transaction.type === "income") result.income += transaction.amount;
      else result.expense += transaction.amount;
      return result;
    },
    { count: 0, income: 0, expense: 0 },
  );
  const lastRow = rows.at(-1);
  const nextCursor = transactionResult.data.length > limit ? lastRow?.created_at ?? null : null;

  return {
    transactions,
    categories,
    members,
    summary,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

export function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01T00:00:00`;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`;
  return { start, end };
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

export function formatVietnameseDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function formatVietnameseMonth(month: string) {
  const bounds = monthBounds(month);
  if (!bounds) return month;
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(bounds.start));
}

export function shiftMonth(month: string, delta: number) {
  const bounds = monthBounds(month);
  if (!bounds) return currentVietnamMonth();
  const start = new Date(bounds.start);
  start.setUTCMonth(start.getUTCMonth() + delta);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}
