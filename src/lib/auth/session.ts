import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Household, Profile } from "@/types/database";

export interface CurrentMembership {
  userId: string;
  email: string;
  metadataFullName: string;
  profile: Profile | null;
  household: Household | null;
}

export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (error || !userId) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  let household: Household | null = null;
  if (profile?.household_id) {
    const { data: householdRow, error: householdError } = await supabase
      .from("households")
      .select("*")
      .eq("id", profile.household_id)
      .maybeSingle();

    if (householdError) throw householdError;
    household = householdRow;
  }

  return {
    userId,
    email: readClaimString(data.claims.email),
    metadataFullName: readMetadataName(data.claims.user_metadata),
    profile,
    household,
  };
}

function readClaimString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readMetadataName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return readClaimString((value as Record<string, unknown>).full_name);
}
