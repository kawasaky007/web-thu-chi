import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { getInitials } from "@/lib/auth/display";
import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { getRecurringDueCount } from "@/lib/recurring/data";
import { getTransactionFormOptions } from "@/lib/transactions/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MainAppLayout({ children }: { children: ReactNode }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login?error=session_expired");
  if (!membership.profile?.household_id || !membership.household) {
    redirect("/onboarding");
  }

  const profileName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );
  const supabase = await createServerSupabaseClient();
  const [options, recurringDueCount] = await Promise.all([
    getTransactionFormOptions(supabase, membership.profile.household_id),
    getRecurringDueCount(supabase, membership.profile.household_id),
  ]);

  return (
    <AppShell
      email={membership.profile.email || membership.email}
      householdName={membership.household.name}
      initials={getInitials(profileName)}
      profileName={profileName}
      transactionCategories={options.categories}
      transactionMembers={options.members}
      currentUserId={membership.userId}
      recurringDueCount={recurringDueCount}
      todayLabel={formatVietnameseDate(new Date())}
    >
      {children}
    </AppShell>
  );
}

function formatVietnameseDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}
