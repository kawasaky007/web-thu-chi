import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { TransactionType } from "@/lib/transactions/data";

export type NotificationTransactionItem = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  userId: string;
  actorId: string;
  transactionDate: string;
  createdAt: string;
};

export async function getUnreadTransactionNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  householdId: string,
): Promise<{ unreadCount: number; items: NotificationTransactionItem[] }> {
  const { data: cursor, error: cursorError } = await supabase
    .from("notification_reads")
    .select("last_read_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (cursorError) throw cursorError;

  if (!cursor) {
    const { error: insertError } = await supabase
      .from("notification_reads")
      .insert({ user_id: userId });
    // 23505 = hai request đồng thời cùng tạo cursor lần đầu, bỏ qua vì kết quả tương đương.
    if (insertError && insertError.code !== "23505") throw insertError;
    return { unreadCount: 0, items: [] };
  }

  const [countResult, itemsResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .neq("created_by", userId)
      .gt("created_at", cursor.last_read_at),
    supabase
      .from("transactions")
      .select("id, type, amount, category_id, user_id, created_by, transaction_date, created_at")
      .eq("household_id", householdId)
      .neq("created_by", userId)
      .gt("created_at", cursor.last_read_at)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (countResult.error) throw countResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const items = itemsResult.data.flatMap((row) => {
    if (row.type !== "income" && row.type !== "expense") return [];
    if (!row.created_at) return [];
    return [{
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      categoryId: row.category_id,
      userId: row.user_id ?? "",
      actorId: row.created_by ?? row.user_id ?? "",
      transactionDate: row.transaction_date,
      createdAt: row.created_at,
    } satisfies NotificationTransactionItem];
  });

  return { unreadCount: countResult.count ?? 0, items };
}
