"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { formatTransactionNotificationText } from "@/lib/notifications/format";
import { sendTransactionPushNotifications } from "@/lib/notifications/push";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  readTransactionFormString,
  validateTransactionInput,
} from "@/lib/transactions/validation";
import type { TransactionActionState } from "@/lib/transactions/action-state";

export async function createTransactionAction(
  _previousState: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const input = readTransactionInput(formData);
  const validation = validateTransactionInput(input);
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };

  const context = await getTransactionContext();
  if (!context) return sessionError();

  const references = await validateReferences(context, validation.data.categoryId, validation.data.userId);
  if (!references.success) return references.state;

  const { data, error } = await context.supabase
    .from("transactions")
    .insert({
      household_id: context.householdId,
      category_id: references.category.id,
      user_id: references.member.id,
      created_by: context.userId,
      type: references.category.type,
      amount: validation.data.amount,
      title: references.category.name,
      note: validation.data.note,
      transaction_date: toTimestamp(validation.data.transactionDate),
    })
    .select("id")
    .single();

  if (error) return mapTransactionError(error);

  after(() => {
    const notification = formatTransactionNotificationText(
      context.actorName,
      references.category.type,
      validation.data.amount,
      references.category.name,
    );
    return sendTransactionPushNotifications(context.supabase, context.userId, {
      title: notification.title,
      body: notification.body,
      url: "/transactions",
    }).catch(() => {
      // Gửi push thất bại không được ảnh hưởng tới giao dịch đã lưu thành công.
    });
  });

  revalidateTransactions();
  return { status: "success", message: "Đã lưu giao dịch.", transactionId: data.id };
}

export async function updateTransactionAction(
  _previousState: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const transactionId = readTransactionFormString(formData, "transactionId").trim();
  if (!transactionId) return { status: "error", message: "Giao dịch không hợp lệ." };

  const validation = validateTransactionInput(readTransactionInput(formData));
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };

  const context = await getTransactionContext();
  if (!context) return sessionError();

  const references = await validateReferences(context, validation.data.categoryId, validation.data.userId);
  if (!references.success) return references.state;

  const { data, error } = await context.supabase
    .from("transactions")
    .update({
      category_id: references.category.id,
      user_id: references.member.id,
      type: references.category.type,
      amount: validation.data.amount,
      title: references.category.name,
      note: validation.data.note,
      transaction_date: toTimestamp(validation.data.transactionDate),
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapTransactionError(error);
  if (!data) return { status: "error", message: "Không tìm thấy giao dịch trong household hiện tại." };
  revalidateTransactions();
  return { status: "success", message: "Đã cập nhật giao dịch." };
}

export async function deleteTransactionAction(
  _previousState: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const transactionId = readTransactionFormString(formData, "transactionId").trim();
  if (!transactionId) return { status: "error", message: "Giao dịch không hợp lệ." };

  const context = await getTransactionContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapTransactionError(error);
  if (!data) {
    return {
      status: "error",
      message: "Chỉ người thực hiện giao dịch mới có thể xóa giao dịch này.",
    };
  }
  revalidateTransactions();
  return { status: "success", message: "Đã xóa giao dịch." };
}

function readTransactionInput(formData: FormData) {
  return {
    amountExpression: readTransactionFormString(formData, "amountExpression"),
    categoryId: readTransactionFormString(formData, "categoryId"),
    userId: readTransactionFormString(formData, "userId"),
    transactionDate: readTransactionFormString(formData, "transactionDate"),
    note: readTransactionFormString(formData, "note"),
  };
}

async function getTransactionContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return {
    householdId,
    userId: membership.userId,
    actorName: resolveProfileName(membership.profile, membership.metadataFullName || membership.email.split("@")[0]),
    supabase: await createServerSupabaseClient(),
  };
}

type TransactionContext = NonNullable<Awaited<ReturnType<typeof getTransactionContext>>>;

async function validateReferences(
  context: TransactionContext,
  categoryId: string,
  userId: string,
) {
  const [categoryResult, memberResult] = await Promise.all([
    context.supabase
      .from("categories")
      .select("id, household_id, name, type")
      .eq("id", categoryId)
      .eq("household_id", context.householdId)
      .maybeSingle(),
    context.supabase
      .from("profiles")
      .select("id, household_id")
      .eq("id", userId)
      .eq("household_id", context.householdId)
      .maybeSingle(),
  ]);

  if (categoryResult.error) return { success: false as const, state: mapTransactionError(categoryResult.error) };
  if (memberResult.error) return { success: false as const, state: mapTransactionError(memberResult.error) };
  if (!categoryResult.data) {
    return { success: false as const, state: { status: "error" as const, fieldErrors: { categoryId: "Danh mục không thuộc household hiện tại." } } };
  }
  if (!memberResult.data) {
    return { success: false as const, state: { status: "error" as const, fieldErrors: { userId: "Người thực hiện không thuộc household hiện tại." } } };
  }

  if (categoryResult.data.type !== "income" && categoryResult.data.type !== "expense") {
    return { success: false as const, state: { status: "error" as const, fieldErrors: { categoryId: "Loại danh mục không hợp lệ." } } };
  }

  return {
    success: true as const,
    category: categoryResult.data as { id: string; household_id: string; name: string; type: "income" | "expense" },
    member: memberResult.data,
  };
}

function toTimestamp(date: string) {
  return `${date}T00:00:00`;
}

function revalidateTransactions() {
  revalidatePath("/transactions");
  revalidatePath("/");
}

function sessionError(): TransactionActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function mapTransactionError(error: { code?: string; message?: string }): TransactionActionState {
  switch (error.code) {
    case "23503":
      return { status: "error", message: "Danh mục, household hoặc thành viên không hợp lệ." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền xử lý giao dịch này." };
    default:
      return { status: "error", message: error.message || "Không thể xử lý giao dịch. Vui lòng thử lại." };
  }
}
