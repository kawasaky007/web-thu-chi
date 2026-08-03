import type { SupabaseClient } from "@supabase/supabase-js";

import type { MemberOption } from "@/lib/transactions/data";
import type { Database } from "@/types/database";

export type SavingsGoalKind = "general" | "emergency";
export type SavingsGoalStatus = "active" | "paused" | "completed" | "archived";
export type SavingsEntryType = "deposit" | "withdrawal";

export type SavingsGoalEntryView = {
  id: string;
  entryType: SavingsEntryType;
  amount: number;
  note: string | null;
  entryDate: string;
  createdAt: string;
  userId: string;
  memberName: string;
};

export type SavingsGoalView = {
  id: string;
  name: string;
  kind: SavingsGoalKind;
  targetAmount: number;
  targetDate: string | null;
  color: string;
  icon: string;
  status: SavingsGoalStatus;
  createdAt: string;
  currentAmount: number;
  entryCount: number;
  recentEntries: SavingsGoalEntryView[];
  remainingAmount: number;
  progress: number;
};

export type SavingsPageData = {
  goals: SavingsGoalView[];
  members: MemberOption[];
  today: string;
  summary: {
    activeCount: number;
    completedCount: number;
    currentAmount: number;
    targetAmount: number;
    emergencyAmount: number;
  };
};

export async function getSavingsPageData(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<SavingsPageData> {
  const [reportResult, memberResult] = await Promise.all([
    supabase.rpc("get_savings_goals_report"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("household_id", householdId)
      .order("full_name", { ascending: true }),
  ]);
  if (reportResult.error) throw reportResult.error;
  if (memberResult.error) throw memberResult.error;

  const parsed = parseSavingsReport(reportResult.data);
  const goals = parsed.goals.map((goal) => ({
    ...goal,
    remainingAmount: Math.max(0, goal.targetAmount - goal.currentAmount),
    progress: goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0,
  }));
  const visibleGoals = goals.filter((goal) => goal.status !== "archived");
  return {
    goals,
    members: memberResult.data.map((member) => ({
      id: member.id,
      name: member.full_name?.trim() || member.email?.trim() || "Thành viên",
      email: member.email?.trim() || "",
    })),
    today: parsed.today,
    summary: {
      activeCount: visibleGoals.filter((goal) => goal.status === "active" || goal.status === "paused").length,
      completedCount: visibleGoals.filter((goal) => goal.status === "completed").length,
      currentAmount: visibleGoals.reduce((sum, goal) => sum + goal.currentAmount, 0),
      targetAmount: visibleGoals.reduce((sum, goal) => sum + goal.targetAmount, 0),
      emergencyAmount: visibleGoals.filter((goal) => goal.kind === "emergency").reduce((sum, goal) => sum + goal.currentAmount, 0),
    },
  };
}

export function parseSavingsReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyReport();
  const record = value as Record<string, unknown>;
  const today = typeof record.today === "string" ? record.today : "";
  const goals = Array.isArray(record.goals) ? record.goals.flatMap(parseGoal) : [];
  return { today, goals };
}

function parseGoal(value: unknown): SavingsGoalView[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const goal = value as Record<string, unknown>;
  if (
    typeof goal.id !== "string"
    || typeof goal.name !== "string"
    || (goal.kind !== "general" && goal.kind !== "emergency")
    || !isGoalStatus(goal.status)
  ) return [];
  const targetAmount = finiteNumber(goal.targetAmount);
  const currentAmount = finiteNumber(goal.currentAmount);
  return [{
    id: goal.id,
    name: goal.name,
    kind: goal.kind,
    targetAmount,
    targetDate: typeof goal.targetDate === "string" ? goal.targetDate : null,
    color: typeof goal.color === "string" ? goal.color : "#1F3D2B",
    icon: typeof goal.icon === "string" ? goal.icon : "saving",
    status: goal.status,
    createdAt: typeof goal.createdAt === "string" ? goal.createdAt : "",
    currentAmount,
    entryCount: finiteNumber(goal.entryCount),
    recentEntries: Array.isArray(goal.recentEntries) ? goal.recentEntries.flatMap(parseEntry) : [],
    remainingAmount: Math.max(0, targetAmount - currentAmount),
    progress: targetAmount > 0 ? currentAmount / targetAmount : 0,
  }];
}

function parseEntry(value: unknown): SavingsGoalEntryView[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string"
    || (entry.entryType !== "deposit" && entry.entryType !== "withdrawal")
    || typeof entry.entryDate !== "string"
    || typeof entry.userId !== "string"
  ) return [];
  return [{
    id: entry.id,
    entryType: entry.entryType,
    amount: finiteNumber(entry.amount),
    note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : null,
    entryDate: entry.entryDate,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
    userId: entry.userId,
    memberName: typeof entry.memberName === "string" ? entry.memberName : "Thành viên",
  }];
}

function isGoalStatus(value: unknown): value is SavingsGoalStatus {
  return value === "active" || value === "paused" || value === "completed" || value === "archived";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function emptyReport() {
  return { today: "", goals: [] as SavingsGoalView[] };
}
