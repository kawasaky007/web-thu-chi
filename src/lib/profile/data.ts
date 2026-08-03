import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type HouseholdMemberView = {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  isCurrentUser: boolean;
};

export async function getHouseholdMembers(
  supabase: SupabaseClient<Database>,
  householdId: string,
  ownerId: string | null,
  currentUserId: string,
): Promise<HouseholdMemberView[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("household_id", householdId)
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data.map((member) => ({
    id: member.id,
    name: member.full_name?.trim() || member.email?.split("@")[0] || "Thành viên",
    email: member.email?.trim() || "",
    isOwner: member.id === ownerId,
    isCurrentUser: member.id === currentUserId,
  }));
}
