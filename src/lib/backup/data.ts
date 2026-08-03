import type { SupabaseClient } from "@supabase/supabase-js";

import type { BackupTransactionRow } from "@/lib/backup/format";
import type { Database, Transaction } from "@/types/database";

const PAGE_SIZE = 1000;

export type BackupOverview = {
  transactionCount: number;
  categoryCount: number;
  budgetCount: number;
};

export async function getBackupOverview(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<BackupOverview> {
  const [transactions, categories, budgets] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("household_id", householdId),
    supabase.from("categories").select("id", { count: "exact", head: true }).eq("household_id", householdId),
    supabase.from("budgets").select("id", { count: "exact", head: true }).eq("household_id", householdId),
  ]);

  const error = transactions.error ?? categories.error ?? budgets.error;
  if (error) throw error;

  return {
    transactionCount: transactions.count ?? 0,
    categoryCount: categories.count ?? 0,
    budgetCount: budgets.count ?? 0,
  };
}

export async function getTransactionBackupRows(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<BackupTransactionRow[]> {
  const [transactions, categoryResult, memberResult] = await Promise.all([
    loadAllTransactions(supabase, householdId),
    supabase
      .from("categories")
      .select("id, name, type")
      .eq("household_id", householdId),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("household_id", householdId),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (memberResult.error) throw memberResult.error;

  const categoryById = new Map(categoryResult.data.map((category) => [category.id, category]));
  const memberById = new Map(memberResult.data.map((member) => [member.id, member]));

  return transactions.flatMap((transaction) => {
    if (transaction.type !== "income" && transaction.type !== "expense") return [];
    const category = categoryById.get(transaction.category_id ?? "");
    const member = memberById.get(transaction.user_id ?? "");

    return [{
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      transactionDate: transaction.transaction_date.slice(0, 10),
      categoryId: transaction.category_id,
      categoryName: category?.name || transaction.title?.trim() || "Khác",
      memberId: transaction.user_id,
      memberEmail: member?.email?.trim().toLowerCase() || "",
      memberName: member?.full_name?.trim() || member?.email?.split("@")[0] || "Thành viên",
      note: transaction.note?.trim() || null,
      createdAt: transaction.created_at,
    } satisfies BackupTransactionRow];
  });
}

async function loadAllTransactions(
  supabase: SupabaseClient<Database>,
  householdId: string,
) {
  const rows: Transaction[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, transaction_date, category_id, user_id, title, note, created_at")
      .eq("household_id", householdId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data as Transaction[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}
