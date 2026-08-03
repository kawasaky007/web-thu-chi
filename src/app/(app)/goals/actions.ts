"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import { parseSavingsReport } from "@/lib/goals/data";
import {
  readSavingsFormString,
  validateSavingsEntryInput,
  validateSavingsGoalInput,
  type SavingsEntryField,
  type SavingsGoalField,
} from "@/lib/goals/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SavingsActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<SavingsGoalField | SavingsEntryField, string>>;
};

export const initialSavingsActionState: SavingsActionState = { status: "idle" };

export async function createSavingsGoalAction(
  _previousState: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const validation = validateSavingsGoalInput(readGoalInput(formData));
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };
  const context = await getSavingsContext();
  if (!context) return sessionError();

  const { error } = await context.supabase.from("savings_goals").insert({
    household_id: context.householdId,
    created_by: context.userId,
    name: validation.data.name,
    kind: validation.data.kind,
    target_amount: validation.data.targetAmount,
    target_date: validation.data.targetDate,
    color: validation.data.color,
    icon: validation.data.icon,
  });
  if (error) return mapSavingsError(error);
  revalidateSavingsPaths();
  return { status: "success", message: `Đã tạo mục tiêu “${validation.data.name}”.` };
}

export async function updateSavingsGoalAction(
  _previousState: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const goalId = readSavingsFormString(formData, "goalId").trim();
  if (!goalId) return { status: "error", fieldErrors: { goalId: "Mục tiêu không hợp lệ." } };
  const validation = validateSavingsGoalInput(readGoalInput(formData));
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };
  const context = await getSavingsContext();
  if (!context) return sessionError();

  const report = await getGoalReport(context);
  if (!report.success) return report.state;
  const current = report.goals.find((goal) => goal.id === goalId);
  if (!current || current.status === "archived") {
    return { status: "error", message: "Không tìm thấy mục tiêu đang hoạt động trong household hiện tại." };
  }
  const nextStatus = current.currentAmount >= validation.data.targetAmount
    ? "completed"
    : current.status === "completed" ? "active" : current.status;

  const { data, error } = await context.supabase
    .from("savings_goals")
    .update({
      name: validation.data.name,
      kind: validation.data.kind,
      target_amount: validation.data.targetAmount,
      target_date: validation.data.targetDate,
      color: validation.data.color,
      icon: validation.data.icon,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();
  if (error) return mapSavingsError(error);
  if (!data) return { status: "error", message: "Không tìm thấy mục tiêu trong household hiện tại." };
  revalidateSavingsPaths();
  return { status: "success", message: "Đã cập nhật mục tiêu tiết kiệm." };
}

export async function setSavingsGoalStatusAction(
  _previousState: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const goalId = readSavingsFormString(formData, "goalId").trim();
  const requestedStatus = readSavingsFormString(formData, "status");
  if (!goalId || (requestedStatus !== "active" && requestedStatus !== "paused" && requestedStatus !== "archived")) {
    return { status: "error", message: "Trạng thái mục tiêu không hợp lệ." };
  }
  const context = await getSavingsContext();
  if (!context) return sessionError();

  let nextStatus = requestedStatus;
  if (requestedStatus === "active") {
    const report = await getGoalReport(context);
    if (!report.success) return report.state;
    const goal = report.goals.find((item) => item.id === goalId);
    if (!goal) return { status: "error", message: "Không tìm thấy mục tiêu trong household hiện tại." };
    if (goal.currentAmount >= goal.targetAmount) nextStatus = "completed";
  }

  const { data, error } = await context.supabase
    .from("savings_goals")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();
  if (error) return mapSavingsError(error);
  if (!data) return { status: "error", message: "Không tìm thấy mục tiêu trong household hiện tại." };
  revalidateSavingsPaths();
  return {
    status: "success",
    message: requestedStatus === "archived"
      ? "Đã lưu trữ mục tiêu và giữ nguyên lịch sử quỹ."
      : requestedStatus === "paused" ? "Đã tạm dừng mục tiêu." : "Đã tiếp tục mục tiêu.",
  };
}

export async function deleteEmptySavingsGoalAction(
  _previousState: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const goalId = readSavingsFormString(formData, "goalId").trim();
  if (!goalId) return { status: "error", message: "Mục tiêu không hợp lệ." };
  const context = await getSavingsContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("savings_goals")
    .delete()
    .eq("id", goalId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();
  if (error) return mapSavingsError(error);
  if (!data) return { status: "error", message: "Chỉ có thể xóa vĩnh viễn mục tiêu chưa có biến động quỹ." };
  revalidateSavingsPaths();
  return { status: "success", message: "Đã xóa mục tiêu trống." };
}

export async function recordSavingsGoalEntryAction(
  _previousState: SavingsActionState,
  formData: FormData,
): Promise<SavingsActionState> {
  const validation = validateSavingsEntryInput({
    goalId: readSavingsFormString(formData, "goalId"),
    requestId: readSavingsFormString(formData, "requestId"),
    entryType: readSavingsFormString(formData, "entryType"),
    amount: readSavingsFormString(formData, "amount"),
    entryDate: readSavingsFormString(formData, "entryDate"),
    userId: readSavingsFormString(formData, "userId"),
    note: readSavingsFormString(formData, "note"),
  });
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };
  const context = await getSavingsContext();
  if (!context) return sessionError();

  const { data: member, error: memberError } = await context.supabase
    .from("profiles")
    .select("id")
    .eq("id", validation.data.userId)
    .eq("household_id", context.householdId)
    .maybeSingle();
  if (memberError) return mapSavingsError(memberError);
  if (!member) return { status: "error", fieldErrors: { userId: "Người đóng góp không thuộc household hiện tại." } };

  const { data, error } = await context.supabase.rpc("record_savings_goal_entry", {
    p_goal_id: validation.data.goalId,
    p_entry_type: validation.data.entryType,
    p_amount: validation.data.amount,
    p_entry_date: validation.data.entryDate,
    p_request_id: validation.data.requestId,
    p_note: validation.data.note ?? undefined,
    p_user_id: validation.data.userId,
  });
  if (error) return mapSavingsError(error);

  const balance = readCurrentAmount(data);
  revalidateSavingsPaths();
  return {
    status: "success",
    message: validation.data.entryType === "deposit"
      ? `Đã thêm vào quỹ${balance === null ? "." : `, hiện có ${formatMoney(balance)}.`}`
      : `Đã ghi khoản rút${balance === null ? "." : `, quỹ còn ${formatMoney(balance)}.`}`,
  };
}

function readGoalInput(formData: FormData) {
  return {
    name: readSavingsFormString(formData, "name"),
    kind: readSavingsFormString(formData, "kind"),
    targetAmount: readSavingsFormString(formData, "targetAmount"),
    targetDate: readSavingsFormString(formData, "targetDate"),
    color: readSavingsFormString(formData, "color"),
    icon: readSavingsFormString(formData, "icon"),
  };
}

async function getSavingsContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return { householdId, userId: membership.userId, supabase: await createServerSupabaseClient() };
}

type SavingsContext = NonNullable<Awaited<ReturnType<typeof getSavingsContext>>>;

async function getGoalReport(context: SavingsContext) {
  const { data, error } = await context.supabase.rpc("get_savings_goals_report");
  if (error) return { success: false as const, state: mapSavingsError(error) };
  return { success: true as const, goals: parseSavingsReport(data).goals };
}

function readCurrentAmount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const amount = Number((value as Record<string, unknown>).currentAmount);
  return Number.isFinite(amount) ? amount : null;
}

function revalidateSavingsPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} đ`;
}

function sessionError(): SavingsActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function mapSavingsError(error: { code?: string; message?: string }): SavingsActionState {
  if (error.message?.includes("SAVINGS_WITHDRAWAL_EXCEEDS_BALANCE")) {
    return { status: "error", fieldErrors: { amount: "Số tiền rút vượt quá số dư hiện tại của mục tiêu." } };
  }
  if (error.message?.includes("SAVINGS_GOAL_ARCHIVED")) {
    return { status: "error", message: "Mục tiêu đã lưu trữ nên không thể ghi thêm biến động." };
  }
  switch (error.code) {
    case "23503":
      return { status: "error", message: "Household, thành viên hoặc mục tiêu không hợp lệ." };
    case "23514":
    case "22023":
      return { status: "error", message: "Số tiền, ngày hoặc dữ liệu mục tiêu không hợp lệ." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền xử lý mục tiêu này." };
    case "P0002":
      return { status: "error", message: "Không tìm thấy mục tiêu trong household hiện tại." };
    default:
      return { status: "error", message: error.message || "Không thể xử lý mục tiêu tiết kiệm. Vui lòng thử lại." };
  }
}
