import { redirect } from "next/navigation";

import { ProfileManager } from "@/components/profile/profile-manager";
import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { getHouseholdMembers } from "@/lib/profile/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login?error=session_expired&next=%2Fprofile");
  if (!membership.profile || !membership.household) redirect("/onboarding");

  const profileName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );
  const members = await getHouseholdMembers(
    await createServerSupabaseClient(),
    membership.household.id,
    membership.household.owner_id,
    membership.userId,
  );

  return (
    <ProfileManager
      email={membership.profile.email || membership.email}
      household={{
        id: membership.household.id,
        name: membership.household.name,
        inviteCode: membership.household.invite_code,
        ownerId: membership.household.owner_id,
      }}
      members={members}
      profileName={profileName}
      userId={membership.userId}
    />
  );
}
