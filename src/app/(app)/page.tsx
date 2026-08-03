import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getCurrentMembership } from "@/lib/auth/session";
import { resolveProfileName } from "@/lib/auth/profile";
import { currentVietnamMonth, getDashboardReport, vietnamMonthBounds } from "@/lib/dashboard/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!householdId || !membership) return null;

  const params = searchParams ? await searchParams : {};
  const requestedMonth = readParam(params.month);
  const month = requestedMonth && vietnamMonthBounds(requestedMonth) ? requestedMonth : currentVietnamMonth();
  const supabase = await createServerSupabaseClient();
  const report = await getDashboardReport(supabase, month);
  const profileName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );

  return (
    <DashboardView
      monthlyBudget={membership.household?.monthly_budget ?? null}
      profileName={profileName}
      report={report}
    />
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
