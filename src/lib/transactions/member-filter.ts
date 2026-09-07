export type TransactionsFilterState = {
  view: "month" | "all";
  month: string;
  search: string;
  memberIds: string[];
};

export function toggleMemberFilter(selected: string[], memberId: string) {
  return selected.includes(memberId)
    ? selected.filter((id) => id !== memberId)
    : [...selected, memberId];
}

export function parseMemberFilterParam(value: string | null | undefined) {
  if (!value) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function buildTransactionsHref({ view, month, search, memberIds }: TransactionsFilterState) {
  const params = new URLSearchParams();
  if (view === "all") params.set("view", "all");
  else params.set("month", month);
  if (search) params.set("q", search);
  if (memberIds.length > 0) params.set("member", memberIds.join(","));
  return `/transactions?${params.toString()}`;
}
