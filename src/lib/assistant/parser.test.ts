import { describe, expect, it } from "vitest";

import { parseAssistantCommand, parseVietnameseAmount } from "./parser";
import type { CategoryOption } from "@/lib/transactions/data";

const categories: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "coffee", name: "Cà phê", type: "expense", color: "#CA8A04", icon: "coffee", sortOrder: 2 },
  { id: "transport", name: "Di chuyển", type: "expense", color: "#2563EB", icon: "transport", sortOrder: 3 },
  { id: "salary", name: "Lương", type: "income", color: "#0F8B6F", icon: "salary", sortOrder: 4 },
];

describe("assistant parser", () => {
  it.each([
    ["18k", 18_000],
    ["1,5 triệu", 1_500_000],
    ["1tr2", 1_200_000],
    ["125.000", 125_000],
  ])("đọc số tiền Việt Nam %s", (input, expected) => {
    expect(parseVietnameseAmount(input)).toBe(expected);
  });

  it("hiểu câu mua cà phê và tự chọn đúng danh mục", () => {
    expect(parseAssistantCommand("Tôi mới mua cafe 18k", categories, new Date("2026-08-04T03:00:00Z"))).toMatchObject({
      kind: "create_transaction",
      amount: 18_000,
      category: { id: "coffee" },
      transactionDate: "2026-08-04",
    });
  });

  it("hiểu khoản thu nhập và ngày hôm qua", () => {
    expect(parseAssistantCommand("Hôm qua nhận lương 12 triệu", categories, new Date("2026-08-04T03:00:00Z"))).toMatchObject({
      kind: "create_transaction",
      amount: 12_000_000,
      category: { id: "salary" },
      transactionDate: "2026-08-03",
    });
  });

  it("hỏi lại khi chưa xác định được danh mục", () => {
    expect(parseAssistantCommand("Tôi chi 45k", categories)).toMatchObject({ kind: "clarification" });
  });

  it("nhận dạng câu hỏi báo cáo và điều hướng", () => {
    expect(parseAssistantCommand("Tháng này tôi chi bao nhiêu?", categories)).toEqual({ kind: "monthly_summary" });
    expect(parseAssistantCommand("Hôm nay tôi đã chi những gì?", categories)).toEqual({ kind: "today_expenses" });
    expect(parseAssistantCommand("Từ sáng đến giờ tiền của tôi đi đâu?", categories)).toEqual({ kind: "today_expenses" });
    expect(parseAssistantCommand("Trong ngày có những khoản chi nào?", categories)).toEqual({ kind: "today_expenses" });
    expect(parseAssistantCommand("Mở ngân sách", categories)).toEqual({ kind: "navigate", href: "/budgets", label: "Ngân sách" });
  });
});
