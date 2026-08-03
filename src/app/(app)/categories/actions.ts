"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  readCategoryFormString,
  validateCategoryInput,
} from "@/lib/categories/validation";
import type { CategoryActionState } from "@/lib/categories/action-state";

export async function createCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const validation = validateCategoryInput({
    name: readCategoryFormString(formData, "name"),
    type: readCategoryFormString(formData, "type"),
    color: readCategoryFormString(formData, "color"),
    icon: readCategoryFormString(formData, "icon"),
  });
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };

  const context = await getCategoryContext();
  if (!context) return sessionError();

  const { data: lastCategory, error: orderError } = await context.supabase
    .from("categories")
    .select("sort_order")
    .eq("household_id", context.householdId)
    .eq("type", validation.data.type)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) return mapCategoryError(orderError);

  const { error } = await context.supabase.from("categories").insert({
    household_id: context.householdId,
    created_by: context.userId,
    name: validation.data.name,
    type: validation.data.type,
    color: validation.data.color,
    icon: validation.data.icon,
    sort_order: (lastCategory?.sort_order ?? -1) + 1,
  });

  if (error) return mapCategoryError(error);

  revalidatePath("/categories");
  return { status: "success", message: `Đã thêm danh mục "${validation.data.name}".` };
}

export async function updateCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const categoryId = readCategoryFormString(formData, "categoryId");
  if (!categoryId) {
    return { status: "error", fieldErrors: { categoryId: "Danh mục không hợp lệ." } };
  }

  const validation = validateCategoryInput({
    name: readCategoryFormString(formData, "name"),
    type: readCategoryFormString(formData, "type"),
    color: readCategoryFormString(formData, "color"),
    icon: readCategoryFormString(formData, "icon"),
  });
  if (!validation.success) return { status: "error", fieldErrors: validation.fieldErrors };

  const context = await getCategoryContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("categories")
    .update({
      name: validation.data.name,
      type: validation.data.type,
      color: validation.data.color,
      icon: validation.data.icon,
    })
    .eq("id", categoryId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapCategoryError(error);
  if (!data) return { status: "error", message: "Không tìm thấy danh mục trong household hiện tại." };

  revalidatePath("/categories");
  return { status: "success", message: `Đã cập nhật danh mục "${validation.data.name}".` };
}

export async function deleteCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const categoryId = readCategoryFormString(formData, "categoryId");
  if (!categoryId) {
    return { status: "error", fieldErrors: { categoryId: "Danh mục không hợp lệ." } };
  }

  const context = await getCategoryContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) return mapCategoryError(error);
  if (!data) return { status: "error", message: "Không tìm thấy danh mục trong household hiện tại." };

  revalidatePath("/categories");
  return { status: "success", message: "Đã xóa danh mục." };
}

export async function moveCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const categoryId = readCategoryFormString(formData, "categoryId");
  const direction = readCategoryFormString(formData, "direction");
  if (!categoryId || (direction !== "up" && direction !== "down")) {
    return { status: "error", message: "Không thể thay đổi thứ tự danh mục." };
  }

  const context = await getCategoryContext();
  if (!context) return sessionError();

  const { data: categories, error: fetchError } = await context.supabase
    .from("categories")
    .select("id, type, sort_order")
    .eq("household_id", context.householdId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (fetchError) return mapCategoryError(fetchError);

  const currentIndex = categories.findIndex((category) => category.id === categoryId);
  if (currentIndex < 0) return { status: "error", message: "Không tìm thấy danh mục trong household hiện tại." };

  const current = categories[currentIndex];
  const sameType = categories.filter((category) => category.type === current.type);
  const typeIndex = sameType.findIndex((category) => category.id === categoryId);
  const neighbor = sameType[typeIndex + (direction === "up" ? -1 : 1)];
  if (!neighbor) return { status: "success" };

  const { error: currentError } = await context.supabase
    .from("categories")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id)
    .eq("household_id", context.householdId);
  if (currentError) return mapCategoryError(currentError);

  const { error: neighborError } = await context.supabase
    .from("categories")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id)
    .eq("household_id", context.householdId);
  if (neighborError) return mapCategoryError(neighborError);

  revalidatePath("/categories");
  return { status: "success" };
}

async function getCategoryContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;

  return {
    householdId,
    supabase: await createServerSupabaseClient(),
    userId: membership.userId,
  };
}

function sessionError(): CategoryActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function mapCategoryError(error: { code?: string; message?: string }): CategoryActionState {
  switch (error.code) {
    case "23505":
      return { status: "error", fieldErrors: { name: "Tên danh mục này đã tồn tại trong cùng loại thu/chi." } };
    case "23503":
      return { status: "error", message: "Danh mục đang được dùng bởi dữ liệu khác nên chưa thể xóa." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền xử lý danh mục này." };
    default:
      return { status: "error", message: error.message || "Không thể xử lý danh mục. Vui lòng thử lại." };
  }
}
