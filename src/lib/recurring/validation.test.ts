import { describe, expect, it } from "vitest";

import { validateRecurringInput } from "./validation";

describe("validateRecurringInput", () => {
  it("chuẩn hóa rule theo tuần và suy ra thứ từ ngày bắt đầu", () => {
    const result = validateRecurringInput({
      categoryId: "cat-1",
      userId: "user-1",
      amountExpression: "100.000 + 50.000",
      frequency: "weekly",
      intervalCount: "2",
      nextDueDate: "2026-08-03",
      endDate: "",
      note: "  Tiền chợ   định kỳ ",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        amount: 150000,
        frequency: "weekly",
        intervalCount: 2,
        dayOfWeek: 1,
        dayOfMonth: null,
        note: "Tiền chợ định kỳ",
      }),
    });
  });

  it("từ chối ngày lịch không tồn tại và ngày kết thúc sớm", () => {
    const invalidDate = validateRecurringInput(validInput({ nextDueDate: "2026-02-31" }));
    const invalidEnd = validateRecurringInput(validInput({ endDate: "2026-07-31" }));

    expect(invalidDate.success && invalidDate.data).toBe(false);
    expect(!invalidDate.success && invalidDate.fieldErrors.nextDueDate).toBeDefined();
    expect(!invalidEnd.success && invalidEnd.fieldErrors.endDate).toBeDefined();
  });

  it("giới hạn khoảng lặp và số tiền", () => {
    const result = validateRecurringInput(validInput({
      intervalCount: "13",
      amountExpression: "1000000000001",
    }));

    expect(!result.success && result.fieldErrors.intervalCount).toBeDefined();
    expect(!result.success && result.fieldErrors.amountExpression).toBeDefined();
  });
});

function validInput(overrides: Partial<Parameters<typeof validateRecurringInput>[0]> = {}) {
  return {
    categoryId: "cat-1",
    userId: "user-1",
    amountExpression: "500000",
    frequency: "monthly",
    intervalCount: "1",
    nextDueDate: "2026-08-03",
    endDate: "",
    note: "",
    ...overrides,
  };
}
