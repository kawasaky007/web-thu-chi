import { describe, expect, it } from "vitest";

import { validateTransactionInput } from "./validation";

describe("transaction validation", () => {
  it("chuẩn hóa ghi chú và trả số tiền đã tính", () => {
    const result = validateTransactionInput({
      amountExpression: "125.000 + 25.000",
      categoryId: "cat-1",
      userId: "user-1",
      transactionDate: "2026-08-03",
      note: "  Đi   chợ  ",
    });

    expect(result).toEqual({
      success: true,
      data: {
        amount: 150000,
        categoryId: "cat-1",
        userId: "user-1",
        transactionDate: "2026-08-03",
        note: "Đi chợ",
      },
    });
  });

  it("báo lỗi form khi thiếu liên kết household hoặc ngày sai", () => {
    const result = validateTransactionInput({
      amountExpression: "0",
      categoryId: "",
      userId: "",
      transactionDate: "03/08/2026",
      note: "x".repeat(241),
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        amountExpression: "Số tiền phải lớn hơn 0.",
        categoryId: "Vui lòng chọn danh mục.",
        userId: "Vui lòng chọn người thực hiện.",
        transactionDate: "Ngày giao dịch không hợp lệ.",
        note: "Ghi chú tối đa 240 ký tự.",
      },
    });
  });
});
