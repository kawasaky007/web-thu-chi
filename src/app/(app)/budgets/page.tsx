import { BudgetsManager } from "@/components/budgets/budgets-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { currentVietnamMonth, getBudgetPageData, parseMonth } from "@/lib/budgets/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BudgetsPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;

  const params = searchParams ? await searchParams : {};
  const requestedMonth = readParam(params.month);
  const month = requestedMonth && parseMonth(requestedMonth) ? requestedMonth : currentVietnamMonth();
  const data = await getBudgetPageData(await createServerSupabaseClient(), householdId, month);

  return <BudgetsManager data={data} />;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
