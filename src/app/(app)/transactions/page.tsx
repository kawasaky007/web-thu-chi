import { TransactionsManager } from "@/components/transactions/transaction-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentVietnamMonth, getTransactionPageData } from "@/lib/transactions/data";
import { parseMemberFilterParam } from "@/lib/transactions/member-filter";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!householdId || !membership) return null;

  const params = await searchParams;
  const currentMonth = readParam(params.month) ?? currentVietnamMonth();
  const view = readParam(params.view) === "all" ? "all" : "month";
  const search = readParam(params.q) ?? "";
  const cursor = readParam(params.cursor);
  const openNew = readParam(params.new) === "1";
  const memberIds = parseMemberFilterParam(readParam(params.member));
  const supabase = await createServerSupabaseClient();
  const data = await getTransactionPageData(supabase, {
    householdId,
    currentUserId: membership.userId,
    month: view === "month" ? currentMonth : undefined,
    search,
    memberIds,
    cursor: view === "all" ? cursor : undefined,
  });

  return (
    <TransactionsManager
      categories={data.categories}
      currentMonth={currentMonth}
      currentUserId={membership.userId}
      hasMore={data.hasMore}
      memberIds={memberIds}
      members={data.members}
      nextCursor={data.nextCursor}
      openNew={openNew}
      search={search}
      summary={data.summary}
      transactions={data.transactions}
      view={view}
    />
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
