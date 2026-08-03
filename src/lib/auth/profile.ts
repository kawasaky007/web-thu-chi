import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database, Profile } from "@/types/database";

export async function ensureUserProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  preferredFullName?: string,
) {
  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existingProfile) return existingProfile;

  const profile: Database["public"]["Tables"]["profiles"]["Insert"] = {
    id: user.id,
    email: user.email ?? null,
    full_name: resolveFullName(user, preferredFullName),
    role: "user",
  };

  const { data: createdProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(profile)
    .select("*")
    .single();

  if (!insertError) return createdProfile;

  // Hai request đăng nhập đồng thời có thể cùng thấy profile chưa tồn tại.
  if (insertError.code === "23505") {
    const { data: concurrentProfile, error: retryError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (retryError) throw retryError;
    return concurrentProfile;
  }

  throw insertError;
}

export function resolveProfileName(profile: Profile | null, fallback: string) {
  return profile?.full_name?.trim() || fallback.trim() || "Người dùng";
}

function resolveFullName(user: User, preferredFullName?: string) {
  const preferred = preferredFullName?.trim();
  if (preferred) return preferred;

  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return user.email?.split("@")[0] || "Người dùng";
}
