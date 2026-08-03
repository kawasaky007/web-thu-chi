import type { SupabaseClient } from "@supabase/supabase-js";

import { getTransactionFormOptions, type CategoryOption, type MemberOption, type TransactionType } from "@/lib/transactions/data";
import type { Database } from "@/types/database";

export type RecurringFrequency = "weekly" | "monthly";

export type RecurringRuleView = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  userId: string;
  memberName: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  nextDueDate: string;
  endDate: string | null;
  isActive: boolean;
};

export type RecurringPageData = {
  rules: RecurringRuleView[];
  categories: CategoryOption[];
  members: MemberOption[];
  today: string;
  dueCount: number;
  activeCount: number;
  estimatedMonthlyAmount: number;
};

export async function getRecurringPageData(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<RecurringPageData> {
  const today = currentVietnamDate();
  const [ruleResult, options] = await Promise.all([
    supabase
      .from("recurring_rules")
      .select("*")
      .eq("household_id", householdId)
      .order("is_active", { ascending: false })
      .order("next_due_date", { ascending: true })
      .order("created_at", { ascending: false }),
    getTransactionFormOptions(supabase, householdId),
  ]);

  if (ruleResult.error) throw ruleResult.error;
  const categoryById = new Map(options.categories.map((category) => [category.id, category]));
  const memberById = new Map(options.members.map((member) => [member.id, member]));
  const rules = ruleResult.data.flatMap((rule) => {
    if (
      (rule.type !== "income" && rule.type !== "expense")
      || (rule.frequency !== "weekly" && rule.frequency !== "monthly")
    ) return [];
    const category = categoryById.get(rule.category_id);
    const member = memberById.get(rule.user_id);
    return [{
      id: rule.id,
      categoryId: rule.category_id,
      categoryName: category?.name ?? "Danh mục không còn tồn tại",
      categoryColor: category?.color ?? (rule.type === "income" ? "#087A5B" : "#B4234D"),
      categoryIcon: category?.icon ?? "other",
      userId: rule.user_id,
      memberName: member?.name ?? "Thành viên không còn trong household",
      type: rule.type,
      amount: finiteNumber(rule.amount),
      note: rule.note?.trim() || null,
      frequency: rule.frequency,
      intervalCount: rule.interval_count,
      dayOfWeek: rule.day_of_week,
      dayOfMonth: rule.day_of_month,
      startDate: rule.start_date,
      nextDueDate: rule.next_due_date,
      endDate: rule.end_date,
      isActive: rule.is_active,
    } satisfies RecurringRuleView];
  });
  const activeRules = rules.filter((rule) => rule.isActive);

  return {
    rules,
    categories: options.categories,
    members: options.members,
    today,
    dueCount: activeRules.filter((rule) => isRuleDue(rule, today)).length,
    activeCount: activeRules.length,
    estimatedMonthlyAmount: activeRules.reduce((sum, rule) => {
      const monthlyAmount = rule.frequency === "weekly"
        ? (rule.amount * 52) / 12 / rule.intervalCount
        : rule.amount / rule.intervalCount;
      return sum + (rule.type === "income" ? monthlyAmount : -monthlyAmount);
    }, 0),
  };
}

export async function getRecurringDueCount(
  supabase: SupabaseClient<Database>,
  householdId: string,
  today = currentVietnamDate(),
) {
  const { count, error } = await supabase
    .from("recurring_rules")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("is_active", true)
    .lte("next_due_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw error;
  return count ?? 0;
}

export function currentVietnamDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isRuleDue(rule: Pick<RecurringRuleView, "nextDueDate" | "endDate">, today: string) {
  return rule.nextDueDate <= today && (!rule.endDate || rule.nextDueDate <= rule.endDate);
}

export function describeRecurringSchedule(rule: Pick<RecurringRuleView, "frequency" | "intervalCount" | "dayOfWeek" | "dayOfMonth">) {
  if (rule.frequency === "weekly") {
    const weekdays = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];
    const day = weekdays[rule.dayOfWeek ?? 0];
    return rule.intervalCount === 1 ? `Hàng tuần vào ${day}` : `Mỗi ${rule.intervalCount} tuần vào ${day}`;
  }
  return rule.intervalCount === 1
    ? `Hàng tháng vào ngày ${rule.dayOfMonth}`
    : `Mỗi ${rule.intervalCount} tháng vào ngày ${rule.dayOfMonth}`;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
