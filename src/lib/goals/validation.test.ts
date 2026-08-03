import { describe, expect, it } from "vitest";

import { validateSavingsEntryInput, validateSavingsGoalInput } from "./validation";

describe("savings validation", () => {
  it("chuẩn hóa mục tiêu quỹ khẩn cấp", () => {
    const result = validateSavingsGoalInput({
      name: "  Quỹ   khẩn cấp ",
      kind: "emergency",
      targetAmount: "100.000.000",
      targetDate: "2027-08-03",
      color: "#6fe0b7",
      icon: "shield",
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ name: "Quỹ khẩn cấp", targetAmount: 100000000, color: "#6FE0B7" }),
    });
  });

  it("từ chối target và ngày không hợp lệ", () => {
    const result = validateSavingsGoalInput({ name: "", kind: "bad", targetAmount: "0", targetDate: "2026-02-31", color: "red", icon: "bad" });
    expect(!result.success && result.fieldErrors.name).toBeDefined();
    expect(!result.success && result.fieldErrors.targetDate).toBeDefined();
  });

  it("không cho ghi quỹ ở tương lai", () => {
    const result = validateSavingsEntryInput({
      goalId: "goal-1",
      requestId: "5d3daef4-7bde-4c2e-88f5-5f8b7fd8bc66",
      entryType: "deposit",
      amount: "500.000",
      entryDate: "2026-08-04",
      userId: "user-1",
      note: "Lương tháng này",
    }, "2026-08-03");
    expect(!result.success && result.fieldErrors.entryDate).toBeDefined();
  });
});
