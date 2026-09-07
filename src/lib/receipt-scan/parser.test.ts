import { describe, expect, it } from "vitest";

import { parseReceiptText } from "./parser";
import type { CategoryOption } from "@/lib/transactions/data";

const TODAY = "2026-12-31";

const expenseCategories: CategoryOption[] = [
  { id: "cat-food", name: "Ăn uống", type: "expense", color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "cat-grocery", name: "Đi chợ", type: "expense", color: "#16A34A", icon: "grocery", sortOrder: 2 },
  { id: "cat-transport", name: "Di chuyển", type: "expense", color: "#2563EB", icon: "transport", sortOrder: 3 },
  { id: "cat-shopping", name: "Mua sắm", type: "expense", color: "#7C3AED", icon: "shopping", sortOrder: 4 },
];

describe("parseReceiptText", () => {
  it("đọc đúng số tiền, ngày và gợi ý danh mục từ hóa đơn siêu thị đầy đủ", () => {
    const rawText = [
      "SIEU THI COOP MART",
      "Dia chi: 123 Nguyen Trai, Q5",
      "Ngay: 05/09/2026  14:32",
      "------------------------",
      "Trung ga          2 x 3.500       7.000",
      "Sua tuoi Vinamilk 1 x 32.000     32.000",
      "Banh mi           3 x 15.000     45.000",
      "------------------------",
      "TONG CONG                        84.000",
      "Tien khach dua                  100.000",
      "Tien thoi                        16.000",
      "Cam on quy khach",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toEqual({
      amount: 84000,
      transactionDate: "2026-09-05",
      categoryId: "cat-grocery",
    });
  });

  it("lấy số tiền ở dòng kế tiếp khi nhãn tổng tiền không có số ngay trên dòng đó", () => {
    const rawText = [
      "QUAN CAFE HIGHLAND",
      "NGAY: 06/09/2026",
      "Ca phe sua           1        29.000",
      "------",
      "TONG THANH TOAN",
      "29.000",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ amount: 29000 });
  });

  it("dùng số tiền lớn nhất khi hóa đơn không có dòng tổng cộng", () => {
    const rawText = [
      "QUAN COM BINH DAN",
      "Com suon           35.000",
      "Canh rau            8.000",
      "Tra da               3.000",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ amount: 35000 });
  });

  it("bỏ qua ngày ở tương lai so với hôm nay", () => {
    const rawText = "Hoa don ngay 20/01/2027\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: null });
  });

  it("bỏ qua ngày trước năm 2000", () => {
    const rawText = "Hoa don ngay 05/09/1998\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: null });
  });

  it.each([
    ["05/09/2026", "2026-09-05"],
    ["05-09-2026", "2026-09-05"],
    ["05.09.2026", "2026-09-05"],
    ["2026-09-05", "2026-09-05"],
  ])("nhận diện định dạng ngày %s", (dateText, expected) => {
    const rawText = `Hoa don ngay ${dateText}`;
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: expected });
  });

  it("trả về null cho tất cả khi văn bản toàn nhiễu", () => {
    const rawText = "asdkj qwoie xcv zzz";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toEqual({
      amount: null,
      transactionDate: null,
      categoryId: null,
    });
  });

  it("không gợi ý danh mục khi hóa đơn không khớp từ khóa nào dù có số tiền", () => {
    const rawText = "CUA HANG XYZ 123\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({
      amount: 50000,
      categoryId: null,
    });
  });
});
