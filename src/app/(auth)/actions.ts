"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AuthActionState } from "@/lib/auth/action-state";
import { friendlyAuthError, friendlyMembershipError } from "@/lib/auth/errors";
import { ensureUserProfile } from "@/lib/auth/profile";
import {
  readFormString,
  validateHouseholdName,
  validateInviteCode,
  validateLoginInput,
  validateRegisterInput,
} from "@/lib/auth/validation";
import { sanitizeNextPath } from "@/lib/supabase/route-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateLoginInput({
    email: readFormString(formData, "email"),
    password: readFormString(formData, "password"),
  });

  if (!validation.success) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(validation.data);

  if (error || !data.user) {
    return { status: "error", message: friendlyAuthError(error) };
  }

  let profile;
  try {
    profile = await ensureUserProfile(supabase, data.user);
  } catch (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: friendlyMembershipError(profileError) };
  }

  const nextPath = sanitizeNextPath(readFormString(formData, "next"));
  revalidatePath("/", "layout");

  if (!profile.household_id) {
    redirect(buildOnboardingLocation(nextPath));
  }

  redirect(nextPath);
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateRegisterInput({
    fullName: readFormString(formData, "fullName"),
    email: readFormString(formData, "email"),
    password: readFormString(formData, "password"),
  });

  if (!validation.success) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  const { fullName, email, password } = validation.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    return { status: "error", message: friendlyAuthError(error) };
  }

  if (data.user && data.user.identities?.length === 0) {
    return { status: "error", message: "Email này đã được đăng ký." };
  }

  if (!data.user || !data.session) {
    return {
      status: "success",
      message: "Tài khoản đã được tạo. Vui lòng xác nhận email rồi đăng nhập.",
    };
  }

  try {
    await ensureUserProfile(supabase, data.user, fullName);
  } catch (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: friendlyMembershipError(profileError) };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function createHouseholdAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateHouseholdName(readFormString(formData, "householdName"));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  const user = await getActionUser(supabase, readFormString(formData, "next"));

  try {
    await ensureUserProfile(supabase, user);
    const { error } = await supabase.rpc("create_household_for_current_user", {
      household_name: validation.data.householdName,
    });
    if (error) throw error;
  } catch (membershipError) {
    return { status: "error", message: friendlyMembershipError(membershipError) };
  }

  revalidatePath("/", "layout");
  redirect(sanitizeNextPath(readFormString(formData, "next")));
}

export async function joinHouseholdAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateInviteCode(readFormString(formData, "inviteCode"));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  const user = await getActionUser(supabase, readFormString(formData, "next"));

  try {
    await ensureUserProfile(supabase, user);
    const { error } = await supabase.rpc("join_household_by_invite_code", {
      invite_code_input: validation.data.inviteCode,
    });
    if (error) throw error;
  } catch (membershipError) {
    return { status: "error", message: friendlyMembershipError(membershipError) };
  }

  revalidatePath("/", "layout");
  redirect(sanitizeNextPath(readFormString(formData, "next")));
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login");
}

async function getActionUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  nextValue: string,
) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const loginUrl = new URL("http://thu-chi.local/login");
    loginUrl.searchParams.set("error", "session_expired");
    loginUrl.searchParams.set("next", sanitizeNextPath(nextValue, "/onboarding"));
    redirect(`${loginUrl.pathname}${loginUrl.search}`);
  }
  return data.user;
}

function buildOnboardingLocation(nextPath: string) {
  if (nextPath === "/") return "/onboarding";
  return `/onboarding?next=${encodeURIComponent(nextPath)}`;
}
