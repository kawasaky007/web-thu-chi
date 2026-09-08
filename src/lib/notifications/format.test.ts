import { describe, expect, it } from "vitest";

import { formatTransactionNotificationText } from "./format";

describe("formatTransactionNotificationText", () => {
  it("định dạng khoản chi với số tiền chẵn", () => {
    expect(formatTransactionNotificationText("An", "expense", 45000, "Ăn uống")).toEqual({
      title: "Có giao dịch mới",
      body: "An đã thêm khoản chi 45.000 đ · Ăn uống",
    });
  });

  it("định dạng khoản thu và làm tròn số tiền có phần thập phân", () => {
    expect(formatTransactionNotificationText("Bình", "income", 1000000.4, "Lương").body).toBe(
      "Bình đã thêm khoản thu 1.000.000 đ · Lương",
    );
  });
});
