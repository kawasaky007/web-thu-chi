"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import {
  matchesHouseholdConfirmation,
  readProfileFormString,
  validateDisplayName,
  validateHouseholdName,
} from "@/lib/profile/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"fullName" | "householdName" | "newOwnerId" | "confirmation", string>>;
};

export const initialProfileActionState: ProfileActionState = { status: "idle" };

export async function updateProfileNameAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const validation = validateDisplayName(readProfileFormString(formData, "fullName"));
  if (!validation.success) return { status: "error", fieldErrors: { fullName: validation.message } };
  const context = await getProfileContext();
  if (!context) return sessionError();

  const { data, error } = await context.supabase
    .from("profiles")
    .update({ full_name: validation.fullName, updated_at: new Date().toISOString() })
    .eq("id", context.userId)
    .select("id")
    .maybeSingle();
  if (error) return mapProfileError(error);
  if (!data) return { status: "error", message: "Không tìm thấy hồ sơ hiện tại." };

  revalidateProfilePaths();
  return { status: "success", message: "Đã cập nhật tên hiển thị." };
}

export async function renameHouseholdAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const validation = validateHouseholdName(readProfileFormString(formData, "householdName"));
  if (!validation.success) return { status: "error", fieldErrors: { householdName: validation.message } };
  const context = await getProfileContext();
  if (!context) return sessionError();
  if (!context.isOwner) return ownerError();

  const { data, error } = await context.supabase
    .from("households")
    .update({ name: validation.name, updated_at: new Date().toISOString() })
    .eq("id", context.householdId)
    .eq("owner_id", context.userId)
    .select("id")
    .maybeSingle();
  if (error) return mapProfileError(error);
  if (!data) return ownerError();

  revalidateProfilePaths();
  return { status: "success", message: "Đã đổi tên household." };
}

export async function transferOwnershipAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const newOwnerId = readProfileFormString(formData, "newOwnerId");
  if (!newOwnerId) return { status: "error", fieldErrors: { newOwnerId: "Vui lòng chọn chủ household mới." } };
  const context = await getProfileContext();
  if (!context) return sessionError();
  if (!context.isOwner) return ownerError();

  const { error } = await context.supabase.rpc("transfer_household_ownership", { new_owner_id: newOwnerId });
  if (error) return mapProfileError(error);
  revalidateProfilePaths();
  return { status: "success", message: "Đã chuyển quyền chủ household." };
}

export async function leaveHouseholdAction(
  _previousState: ProfileActionState,
  _formData: FormData,
): Promise<ProfileActionState> {
  void _previousState;
  void _formData;
  const context = await getProfileContext();
  if (!context) return sessionError();
  if (context.isOwner) return { status: "error", message: "Chủ household phải chuyển quyền hoặc xóa household trước." };

  const { error } = await context.supabase.rpc("leave_current_household");
  if (error) return mapProfileError(error);
  revalidateProfilePaths();
  return { status: "success", message: "Đã rời household." };
}

export async function deleteHouseholdAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const confirmation = readProfileFormString(formData, "confirmation");
  const context = await getProfileContext();
  if (!context) return sessionError();
  if (!context.isOwner) return ownerError();
  if (!matchesHouseholdConfirmation(confirmation, context.householdName)) {
    return { status: "error", fieldErrors: { confirmation: `Nhập chính xác "${context.householdName}" để xác nhận.` } };
  }

  const { error } = await context.supabase.rpc("delete_current_household", { confirmation_name: confirmation });
  if (error) return mapProfileError(error);
  revalidateProfilePaths();
  return { status: "success", message: "Đã xóa household và dữ liệu tài chính chung." };
}

async function getProfileContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId || !membership.household) return null;
  return {
    householdId,
    householdName: membership.household.name,
    isOwner: membership.household.owner_id === membership.userId,
    userId: membership.userId,
    supabase: await createServerSupabaseClient(),
  };
}

function revalidateProfilePaths() {
  revalidatePath("/profile");
  revalidatePath("/");
}

function sessionError(): ProfileActionState {
  return { status: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
}

function ownerError(): ProfileActionState {
  return { status: "error", message: "Chỉ chủ household hiện tại mới có quyền thực hiện thao tác này." };
}

function mapProfileError(error: { code?: string; message?: string }): ProfileActionState {
  const message = error.message ?? "";
  if (message.includes("OWNER_MUST_TRANSFER_OR_DELETE")) return { status: "error", message: "Chủ household phải chuyển quyền hoặc xóa household trước." };
  if (message.includes("NEW_OWNER_NOT_MEMBER")) return { status: "error", fieldErrors: { newOwnerId: "Thành viên được chọn không còn thuộc household." } };
  if (message.includes("HOUSEHOLD_NAME_CONFIRMATION_MISMATCH")) return { status: "error", fieldErrors: { confirmation: "Tên xác nhận không khớp household hiện tại." } };

  switch (error.code) {
    case "22023":
      return { status: "error", message: "Dữ liệu xác nhận không hợp lệ." };
    case "42501":
      return { status: "error", message: "Bạn không có quyền thực hiện thao tác này." };
    case "P0002":
      return { status: "error", message: "Household hoặc hồ sơ hiện tại không còn tồn tại." };
    default:
      return { status: "error", message: message || "Không thể cập nhật hồ sơ hoặc household. Vui lòng thử lại." };
  }
}
