import { describe, expect, it } from "vitest";

import { evaluateAmountExpression, formatAmountExpressionInput, formatAmountValue } from "./amount-calculator";

describe("amount calculator", () => {
  it.each([
    ["125000", "125.000"],
    ["125000 + 25000", "125.000 + 25.000"],
    ["3,5 + 1,5", "3,5 + 1,5"],
    ["1.250.000", "1.250.000"],
  ])("định dạng số tiền nhập %s thành %s", (input, expected) => {
    expect(formatAmountExpressionInput(input)).toBe(expected);
  });

  it("định dạng kết quả đã tính theo đơn vị Việt Nam", () => {
    expect(formatAmountValue(150000)).toBe("150.000");
  });

  it.each([
    ["500000", 500000],
    ["30.000", 30000],
    ["1,000,000 - 150,000 + 20,000", 870000],
    ["(500000 + 200000) ÷ 2 × 3", 1050000],
    ["500000 + 500000 × 10%", 550000],
    ["100 - 30%", 70],
    ["100 + 30%", 130],
    ["3,5+1,5+2,5+2,5", 10],
    ["0.1 + 0.2", 0.3],
  ])("tính đúng %s", (expression, expected) => {
    const result = evaluateAmountExpression(expression);
    expect(result.isValid).toBe(true);
    expect(result.value).toBe(expected);
  });

  it("lọc ký tự lạ nhưng giữ biểu thức hợp lệ", () => {
    const result = evaluateAmountExpression("abc500000xyz + @20000");
    expect(result.expression).toBe("500000+20000");
    expect(result.value).toBe(520000);
  });

  it.each([
    ["", "Vui lòng nhập số tiền."],
    ["500000 / 0", "Không thể chia cho 0."],
    ["(500000 + 200000", "Thiếu dấu ngoặc đóng."],
    ["500000 + * 2", "Biểu thức không hợp lệ."],
  ])("trả lỗi cho %s", (expression, message) => {
    const result = evaluateAmountExpression(expression);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe(message);
  });
});
