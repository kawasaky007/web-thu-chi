import { redirect } from "next/navigation";

import { BackupManager } from "@/components/backup/backup-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { getBackupOverview } from "@/lib/backup/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function BackupPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login?error=session_expired&next=%2Fbackup");
  if (!membership.household || !membership.profile?.household_id) redirect("/onboarding");

  const overview = await getBackupOverview(
    await createServerSupabaseClient(),
    membership.profile.household_id,
  );

  return <BackupManager householdName={membership.household.name} overview={overview} />;
}
