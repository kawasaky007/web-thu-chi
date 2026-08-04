"use server";

import { getCurrentMembership } from "@/lib/auth/session";
import { currentVietnamMonth, getDashboardReport } from "@/lib/dashboard/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAssistantMonthlySummaryAction() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) {
    return { status: "error" as const, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }

  try {
    const report = await getDashboardReport(
      await createServerSupabaseClient(),
      currentVietnamMonth(),
    );
    return {
      status: "success" as const,
      month: report.month,
      count: report.summary.count,
      income: report.summary.income,
      expense: report.summary.expense,
      balance: report.summary.balance,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Không thể đọc tổng quan tháng này.",
    };
  }
}

export async function getAssistantTodayExpensesAction() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) {
    return { status: "error" as const, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }

  const range = vietnamTodayBounds();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, title, note, transaction_date")
    .eq("household_id", householdId)
    .eq("type", "expense")
    .gte("transaction_date", range.start)
    .lt("transaction_date", range.end)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error" as const, message: error.message || "Không thể đọc các khoản chi hôm nay." };
  }

  const items = data.map((item) => ({
    id: item.id,
    amount: Number(item.amount),
    title: item.title?.trim() || "Khoản chi",
    note: item.note?.trim() || null,
  }));
  return {
    status: "success" as const,
    count: items.length,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

function vietnamTodayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const startDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const endDate = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`;
  return {
    start: `${startDate}T00:00:00+07:00`,
    end: `${endDate}T00:00:00+07:00`,
  };
}
