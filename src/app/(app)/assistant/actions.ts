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
