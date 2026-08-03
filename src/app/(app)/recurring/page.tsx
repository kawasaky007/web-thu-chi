import { RecurringManager } from "@/components/recurring/recurring-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { getRecurringPageData } from "@/lib/recurring/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RecurringPage() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;

  const data = await getRecurringPageData(
    await createServerSupabaseClient(),
    householdId,
  );
  return <RecurringManager currentUserId={membership.userId} data={data} />;
}
