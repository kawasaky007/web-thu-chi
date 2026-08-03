import { SavingsGoalsManager } from "@/components/goals/savings-goals-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { getSavingsPageData } from "@/lib/goals/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SavingsGoalsPage() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;

  const data = await getSavingsPageData(await createServerSupabaseClient(), householdId);
  return <SavingsGoalsManager currentUserId={membership.userId} data={data} />;
}
