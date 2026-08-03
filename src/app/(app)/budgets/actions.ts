"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveBudgetCloneSource } from "@/lib/budgets/clone";
import {
  parseBudgetAmount,
  parseOrderedIds,
  readBudgetFormString,
  validateBudgetMonth,
} from "@/lib/budgets/validation";
import type { BudgetActionState } from "@/lib/budgets/action-state";

export async function upsertBudgetAction(
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const categoryId = readBudgetFormString(formData, "categoryId");
  const monthValue = readBudgetFormString(formData, "month");
  const amountValue = readBudgetFormString(formData, "amount");
  const month = validateBudgetMonth(monthValue);
  const amount = parseBudgetAmount(amountValue);
  if (!categoryId || !month || amount === null) {
    return {
      status: "error",
      fieldErrors: {
        categoryId: categoryId ? undefined : "Vui lòng chọn danh mục chi tiêu.",
        month: month ? undefined : "Tháng ngân sách không hợp lệ.",
        amount: amount === null ? "Nhập số tiền ngân sách hợp lệ (có thể là 0)." : undefined,
      },
    };
  }

  const context = await getBudgetContext();
  if (!context) return sessionError();

  const { data: category, error: categoryError } = await context.supabase
    .from("categories")
    .select("id, type")
    .eq("id", categoryId)
    .eq("household_id", context.householdId)
    .maybeSingle();
  if (categoryError) return mapBudgetError(categoryError);
  if (!category || category.type !== "expense") {
    return { status: "error", fieldErrors: { categoryId: "Chỉ danh mục chi tiêu mới được đặt ngân sách." } };
  }

  const { data: existing, error: existingError } = await context.supabase
    .from("budgets")
    .select("id")
    .eq("household_id", context.householdId)
    .eq("category_id", categoryId)
    .eq("month", month.month)
    .eq("year", month.year)
    .maybeSingle();
  if (existingError) return mapBudgetError(existingError);

  if (existing) {
    const { error } = await context.supabase
      .from("budgets")
      .update({ amount, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("household_id", context.householdId);
    if (error) return mapBudgetError(error);
  } else {
    const { data: lastBudget, error: orderError } = await context.supabase
      .from("budgets")
      .select("display_order")
      .eq("household_id", context.householdId)
      .eq("month", month.month)
      .eq("year", month.year)
      .order("display_order", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (orderError) return mapBudgetError(orderError);

    const { error } = await context.supabase.from("budgets").insert({
      household_id: context.householdId,
      category_id: categoryId,
      month: month.month,
      year: month.year,
      amount,
      display_order: (lastBudget?.display_order ?? -1) + 1,
      created_by: context.userId,
    });
    if (error) return mapBudgetError(error);
  }

  revalidateBudgetPaths();
  return { status: "success", message: "Đã lưu ngân sách." };
}

export async function deleteBudgetAction(
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetId = readBudgetFormString(formData, "budgetId");
  if (!budgetId) return { status: "error", message: "Ngân sách không hợp lệ." };
  const context = await getBudgetContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();
  if (error) return mapBudgetError(error);
  if (!data) return { status: "error", message: "Không tìm thấy ngân sách trong household hiện tại." };

  revalidateBudgetPaths();
  return { status: "success", message: "Đã xóa ngân sách." };
}

export async function reorderBudgetsAction(
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const orderedIds = parseOrderedIds(readBudgetFormString(formData, "orderedIds"));
  if (!orderedIds) return { status: "error", fieldErrors: { orderedIds: "Thứ tự ngân sách không hợp lệ." } };
  const context = await getBudgetContext();
  if (!context) return sessionError();

  const { error } = await context.supabase.rpc("reorder_budgets", { p_ordered_ids: orderedIds });
  if (error) return mapBudgetError(error);
  revalidateBudgetPaths();
  return { status: "success", message: "Đã cập nhật thứ tự ngân sách." };
}

export async function cloneBudgetAction(
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const monthValue = readBudgetFormString(formData, "month");
  const target = validateBudgetMonth(monthValue);
  if (!target) return { status: "error", fieldErrors: { month: "Tháng ngân sách không hợp lệ." } };
  const context = await getBudgetContext();
  if (!context) return sessionError();

  const { data: rows, error: rowsError } = await context.supabase
    .from("budgets")
    .select("month, year")
    .eq("household_id", context.householdId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (rowsError) return mapBudgetError(rowsError);

  const cloneSource = resolveBudgetCloneSource(rows, target);
  if (cloneSource.targetExists) {
    return { status: "success", message: "Tháng này đã có ngân sách, không cần sao chép." };
  }

  const source = cloneSource.source;
  if (!source) return { status: "error", message: "Chưa có tháng trước để sao chép ngân sách." };

  const { data: inserted, error } = await context.supabase.rpc("clone_budget_month", {
    p_source_month: source.month,
    p_source_year: source.year,
    p_target_month: target.month,
    p_target_year: target.year,
  });
  if (error) return mapBudgetError(error);

  revalidateBudgetPaths();
  return { status: "success", message: inserted ? `Đã sao chép ${inserted} ngân sách từ ${source.month}/${source.year}.` : "Tháng này đã có ngân sách, không thay đổi dữ liệu." };
}

async function getBudgetContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return { householdId, userId: membership.userId, supabase: await createServerSupabaseClient() };
}

function revalidateBudgetPaths() {
  revalidatePath("/budgets");
  revalidatePath("/");
}

function sessionError(): BudgetActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function mapBudgetError(error: { code?: string; message?: string }): BudgetActionState {
  switch (error.code) {
    case "23505":
      return { status: "error", message: "Ngân sách danh mục này đã tồn tại trong tháng đã chọn." };
    case "23503":
      return { status: "error", message: "Danh mục hoặc household của ngân sách không hợp lệ." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền xử lý ngân sách này." };
    case "22023":
      return { status: "error", message: "Khoảng tháng ngân sách không hợp lệ." };
    default:
      return { status: "error", message: error.message || "Không thể xử lý ngân sách. Vui lòng thử lại." };
  }
}
