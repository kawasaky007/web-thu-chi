"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import {
  readRecurringFormString,
  validateRecurringInput,
  type RecurringField,
} from "@/lib/recurring/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RecurringActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<RecurringField | "ruleId", string>>;
};

export const initialRecurringActionState: RecurringActionState = { status: "idle" };

export async function createRecurringRuleAction(
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const validation = validateRecurringInput(readRecurringInput(formData));
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };
  const context = await getRecurringContext();
  if (!context) return sessionError();
  const references = await validateReferences(
    context,
    validation.data.categoryId,
    validation.data.userId,
  );
  if (!references.success) return references.state;

  const { error } = await context.supabase.from("recurring_rules").insert({
    household_id: context.householdId,
    category_id: references.category.id,
    user_id: references.member.id,
    created_by: context.userId,
    type: references.category.type,
    amount: validation.data.amount,
    note: validation.data.note,
    frequency: validation.data.frequency,
    interval_count: validation.data.intervalCount,
    day_of_week: validation.data.dayOfWeek,
    day_of_month: validation.data.dayOfMonth,
    start_date: validation.data.nextDueDate,
    next_due_date: validation.data.nextDueDate,
    end_date: validation.data.endDate,
  });

  if (error) return mapRecurringError(error);
  revalidateRecurringPaths();
  return { status: "success", message: "Đã tạo giao dịch định kỳ." };
}

export async function updateRecurringRuleAction(
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const ruleId = readRecurringFormString(formData, "ruleId").trim();
  if (!ruleId) return { status: "error", fieldErrors: { ruleId: "Giao dịch định kỳ không hợp lệ." } };
  const validation = validateRecurringInput(readRecurringInput(formData));
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };
  const context = await getRecurringContext();
  if (!context) return sessionError();
  const references = await validateReferences(
    context,
    validation.data.categoryId,
    validation.data.userId,
  );
  if (!references.success) return references.state;

  const { data, error } = await context.supabase
    .from("recurring_rules")
    .update({
      category_id: references.category.id,
      user_id: references.member.id,
      type: references.category.type,
      amount: validation.data.amount,
      note: validation.data.note,
      frequency: validation.data.frequency,
      interval_count: validation.data.intervalCount,
      day_of_week: validation.data.dayOfWeek,
      day_of_month: validation.data.dayOfMonth,
      start_date: validation.data.nextDueDate,
      next_due_date: validation.data.nextDueDate,
      end_date: validation.data.endDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapRecurringError(error);
  if (!data) return { status: "error", message: "Không tìm thấy giao dịch định kỳ trong household hiện tại." };
  revalidateRecurringPaths();
  return { status: "success", message: "Đã cập nhật giao dịch định kỳ." };
}

export async function toggleRecurringRuleAction(
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const ruleId = readRecurringFormString(formData, "ruleId").trim();
  const isActive = readRecurringFormString(formData, "isActive") === "true";
  if (!ruleId) return { status: "error", message: "Giao dịch định kỳ không hợp lệ." };
  const context = await getRecurringContext();
  if (!context) return sessionError();

  if (isActive) {
    const { data: rule, error: ruleError } = await context.supabase
      .from("recurring_rules")
      .select("next_due_date, end_date")
      .eq("id", ruleId)
      .eq("household_id", context.householdId)
      .maybeSingle();
    if (ruleError) return mapRecurringError(ruleError);
    if (!rule) return { status: "error", message: "Không tìm thấy giao dịch định kỳ trong household hiện tại." };
    if (rule.end_date && rule.next_due_date > rule.end_date) {
      return { status: "error", message: "Lịch này đã qua ngày kết thúc. Hãy sửa ngày trước khi tiếp tục." };
    }
  }

  const { data, error } = await context.supabase
    .from("recurring_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapRecurringError(error);
  if (!data) return { status: "error", message: "Không tìm thấy giao dịch định kỳ trong household hiện tại." };
  revalidateRecurringPaths();
  return { status: "success", message: isActive ? "Đã tiếp tục lịch định kỳ." : "Đã tạm dừng lịch định kỳ." };
}

export async function deleteRecurringRuleAction(
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const ruleId = readRecurringFormString(formData, "ruleId").trim();
  if (!ruleId) return { status: "error", message: "Giao dịch định kỳ không hợp lệ." };
  const context = await getRecurringContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("recurring_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapRecurringError(error);
  if (!data) return { status: "error", message: "Không tìm thấy giao dịch định kỳ trong household hiện tại." };
  revalidateRecurringPaths();
  return { status: "success", message: "Đã xóa lịch định kỳ; các giao dịch đã ghi vẫn được giữ lại." };
}

export async function materializeRecurringTransactionsAction(
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const ruleId = readRecurringFormString(formData, "ruleId").trim() || undefined;
  const context = await getRecurringContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase.rpc("materialize_due_recurring_transactions", {
    p_rule_id: ruleId,
    p_max_occurrences: 48,
  });
  if (error) return mapRecurringError(error);

  const report = readMaterializeReport(data);
  revalidateRecurringPaths();
  if (!report || report.generatedCount === 0) {
    return { status: "success", message: "Không có kỳ mới cần ghi." };
  }
  const remaining = report.remainingDueCount > 0
    ? ` Còn ${report.remainingDueCount} lịch quá hạn, bạn có thể ghi tiếp.`
    : "";
  return {
    status: "success",
    message: `Đã ghi ${report.generatedCount} giao dịch đến hạn.${remaining}`,
  };
}

function readRecurringInput(formData: FormData) {
  return {
    categoryId: readRecurringFormString(formData, "categoryId"),
    userId: readRecurringFormString(formData, "userId"),
    amountExpression: readRecurringFormString(formData, "amountExpression"),
    frequency: readRecurringFormString(formData, "frequency"),
    intervalCount: readRecurringFormString(formData, "intervalCount"),
    nextDueDate: readRecurringFormString(formData, "nextDueDate"),
    endDate: readRecurringFormString(formData, "endDate"),
    note: readRecurringFormString(formData, "note"),
  };
}

async function getRecurringContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return {
    householdId,
    userId: membership.userId,
    supabase: await createServerSupabaseClient(),
  };
}

type RecurringContext = NonNullable<Awaited<ReturnType<typeof getRecurringContext>>>;

async function validateReferences(
  context: RecurringContext,
  categoryId: string,
  userId: string,
) {
  const [categoryResult, memberResult] = await Promise.all([
    context.supabase
      .from("categories")
      .select("id, type")
      .eq("id", categoryId)
      .eq("household_id", context.householdId)
      .maybeSingle(),
    context.supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .eq("household_id", context.householdId)
      .maybeSingle(),
  ]);
  if (categoryResult.error) return { success: false as const, state: mapRecurringError(categoryResult.error) };
  if (memberResult.error) return { success: false as const, state: mapRecurringError(memberResult.error) };
  if (!categoryResult.data || (categoryResult.data.type !== "income" && categoryResult.data.type !== "expense")) {
    return { success: false as const, state: { status: "error" as const, fieldErrors: { categoryId: "Danh mục không thuộc household hiện tại." } } };
  }
  if (!memberResult.data) {
    return { success: false as const, state: { status: "error" as const, fieldErrors: { userId: "Người thực hiện không thuộc household hiện tại." } } };
  }
  return {
    success: true as const,
    category: categoryResult.data as { id: string; type: "income" | "expense" },
    member: memberResult.data,
  };
}

function readMaterializeReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  const generatedCount = Number(report.generatedCount);
  const remainingDueCount = Number(report.remainingDueCount);
  if (!Number.isFinite(generatedCount) || !Number.isFinite(remainingDueCount)) return null;
  return { generatedCount, remainingDueCount };
}

function revalidateRecurringPaths() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/");
}

function sessionError(): RecurringActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function mapRecurringError(error: { code?: string; message?: string }): RecurringActionState {
  switch (error.code) {
    case "23503":
      return { status: "error", message: "Danh mục, thành viên hoặc household không hợp lệ." };
    case "23514":
    case "22023":
      return { status: "error", message: "Chu kỳ, ngày hoặc số tiền định kỳ không hợp lệ." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền xử lý giao dịch định kỳ này." };
    default:
      return { status: "error", message: error.message || "Không thể xử lý giao dịch định kỳ. Vui lòng thử lại." };
  }
}
