"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import { MAX_BACKUP_BYTES, parseTransactionBackup } from "@/lib/backup/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TransactionInsert } from "@/types/database";
import type { BackupActionState } from "@/lib/backup/action-state";

export async function importTransactionsAction(
  _previousState: BackupActionState,
  formData: FormData,
): Promise<BackupActionState> {
  if (formData.get("confirmation") !== "confirmed") {
    return { status: "error", message: "Hãy xác nhận đã xem trước dữ liệu trước khi nhập." };
  }

  const payload = readString(formData, "payload");
  if (!payload || new TextEncoder().encode(payload).byteLength > MAX_BACKUP_BYTES) {
    return { status: "error", message: "Dữ liệu import trống hoặc vượt quá 1,5 MB." };
  }

  const parsed = parseTransactionBackup(payload, "import.json");
  if (!parsed.success) return { status: "error", message: "File backup không hợp lệ.", errors: parsed.errors };

  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) {
    return { status: "error", message: "Phiên đăng nhập hoặc household hiện tại không còn hợp lệ." };
  }

  const supabase = await createServerSupabaseClient();
  const [categoryResult, memberResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, type")
      .eq("household_id", householdId),
    supabase
      .from("profiles")
      .select("id, email")
      .eq("household_id", householdId),
  ]);

  if (categoryResult.error) return mapImportError(categoryResult.error);
  if (memberResult.error) return mapImportError(memberResult.error);

  const categoryById = new Map(categoryResult.data.map((category) => [category.id, category]));
  const categoryByName = new Map(
    categoryResult.data.map((category) => [`${category.type}:${lookupKey(category.name)}`, category]),
  );
  const memberById = new Map(memberResult.data.map((member) => [member.id, member]));
  const memberByEmail = new Map(
    memberResult.data.flatMap((member) => member.email ? [[lookupKey(member.email), member] as const] : []),
  );

  const errors: string[] = [];
  const inserts: TransactionInsert[] = [];

  for (const row of parsed.rows) {
    const categoryBySourceId = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    const category = categoryBySourceId?.type === row.type
      ? categoryBySourceId
      : categoryByName.get(`${row.type}:${lookupKey(row.categoryName)}`);
    const member = (row.memberId ? memberById.get(row.memberId) : undefined)
      ?? memberByEmail.get(lookupKey(row.memberEmail));

    if (!category && errors.length < 12) {
      errors.push(`Dòng ${row.sourceRow}: không tìm thấy danh mục ${row.categoryName} (${row.type}).`);
    }
    if (!member && errors.length < 12) {
      errors.push(`Dòng ${row.sourceRow}: không tìm thấy thành viên ${row.memberEmail || row.memberName}.`);
    }
    if (!category || !member) continue;

    inserts.push({
      id: row.id,
      household_id: householdId,
      category_id: category.id,
      user_id: member.id,
      created_by: membership.userId,
      type: row.type,
      amount: row.amount,
      title: category.name,
      note: row.note,
      transaction_date: `${row.transactionDate}T00:00:00`,
      created_at: row.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (errors.length > 0) {
    return {
      status: "error",
      message: "Chưa thể nhập vì category hoặc member không khớp household hiện tại.",
      errors,
    };
  }

  const { data, error } = await supabase
    .from("transactions")
    .upsert(inserts, { onConflict: "id", ignoreDuplicates: true })
    .select("id");

  if (error) return mapImportError(error);

  const imported = data?.length ?? 0;
  const skipped = inserts.length - imported;
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/backup");

  return {
    status: "success",
    message: skipped
      ? `Đã nhập ${imported} giao dịch, bỏ qua ${skipped} giao dịch đã tồn tại.`
      : `Đã nhập ${imported} giao dịch.`,
    imported,
    skipped,
  };
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function lookupKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function mapImportError(error: { code?: string; message?: string }): BackupActionState {
  if (error.code === "42501") return { status: "error", message: "Bạn không có quyền nhập giao dịch vào household này." };
  if (error.code === "23503") return { status: "error", message: "Category hoặc member trong file không còn hợp lệ." };
  return { status: "error", message: error.message || "Không thể nhập backup. Vui lòng thử lại." };
}
