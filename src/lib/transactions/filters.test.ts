import { describe, expect, it } from "vitest";

import type { TransactionView } from "./data";
import {
  applyTransactionFilters,
  DELETED_CATEGORY_ID,
  EMPTY_TRANSACTION_FILTER,
  isTransactionFilterEmpty,
  parseTransactionFilter,
  serializeTransactionFilter,
  toggleFilterId,
  type TransactionFilter,
} from "./filters";

function row(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: "x",
    householdId: "h1",
    userId: "u1",
    categoryId: "food",
    type: "expense",
    amount: 1000,
    title: "Giao dịch",
    note: null,
    transactionDate: "2026-08-01",
    createdAt: null,
    categoryName: "Ăn uống",
    categoryColor: "#000",
    categoryIcon: "food",
    memberName: "Bạn",
    memberEmail: "",
    canDelete: true,
    ...overrides,
  };
}

describe("bộ lọc giao dịch", () => {
  const rows = [
    row({ id: "a", categoryId: "food", userId: "u1", title: "Ăn uống", note: "Cơm trưa" }),
    row({ id: "b", categoryId: "shop", userId: "u2", title: "Mua sắm", note: null, categoryName: "Mua sắm", memberName: "Lan" }),
    row({ id: "c", categoryId: "food", userId: "u2", title: "Cà phê", note: null, memberName: "Lan" }),
  ];
  const ids = (list: TransactionView[]) => list.map((r) => r.id);
  const filter = (patch: Partial<TransactionFilter>): TransactionFilter => ({ ...EMPTY_TRANSACTION_FILTER, ...patch });

  it("không filter thì trả về nguyên danh sách", () => {
    expect(ids(applyTransactionFilters(rows, EMPTY_TRANSACTION_FILTER))).toEqual(["a", "b", "c"]);
  });

  it("lọc nhiều danh mục theo OR trong cùng chiều", () => {
    expect(ids(applyTransactionFilters(rows, filter({ categoryIds: ["food", "shop"] })))).toHaveLength(3);
    expect(ids(applyTransactionFilters(rows, filter({ categoryIds: ["shop"] })))).toEqual(["b"]);
  });

  it("kết hợp các chiều bằng AND", () => {
    expect(ids(applyTransactionFilters(rows, filter({ categoryIds: ["food"], memberIds: ["u2"] })))).toEqual(["c"]);
  });

  it("danh mục đã xoá (categoryId rỗng) khớp bằng DELETED_CATEGORY_ID", () => {
    const withDeleted = [...rows, row({ id: "d", categoryId: "" })];
    expect(ids(applyTransactionFilters(withDeleted, filter({ categoryIds: [DELETED_CATEGORY_ID] })))).toEqual(["d"]);
  });

  it("search khớp title, note, tên danh mục và tên thành viên", () => {
    expect(ids(applyTransactionFilters(rows, filter({ search: "cà phê" })))).toEqual(["c"]);
    expect(ids(applyTransactionFilters(rows, filter({ search: "cơm" })))).toEqual(["a"]);
    expect(ids(applyTransactionFilters(rows, filter({ search: "mua sắm" })))).toEqual(["b"]);
    expect(ids(applyTransactionFilters(rows, filter({ search: "lan" })))).toEqual(["b", "c"]);
  });

  it("search không phân biệt hoa thường và dấu tiếng Việt", () => {
    const expected = ids(applyTransactionFilters(rows, filter({ search: "ăn uống" })));
    expect(expected).toEqual(["a", "c"]);
    expect(ids(applyTransactionFilters(rows, filter({ search: "AN UONG" })))).toEqual(expected);
    expect(ids(applyTransactionFilters(rows, filter({ search: "Ăn Uống" })))).toEqual(expected);
  });

  it("parseTransactionFilter bỏ qua id không có trong known", () => {
    const params = new URLSearchParams({ category: "food,ghost", member: "u1,ghost", q: " cà " });
    const known = { categoryIds: new Set(["food", "shop"]), memberIds: new Set(["u1", "u2"]) };
    expect(parseTransactionFilter(params, known)).toEqual({ categoryIds: ["food"], memberIds: ["u1"], search: "cà" });
  });

  it.each([
    [" food , shop ", ["food", "shop"]],
    ["food,food,shop", ["food", "shop"]],
    ["food,,shop", ["food", "shop"]],
    ["", []],
  ])("parseTransactionFilter chuẩn hoá danh sách id %s thành %s", (value, expected) => {
    // URL viết tay có khoảng trắng, id lặp và dấu phẩy rỗng; cả ba phải ra danh sách sạch.
    const params = new URLSearchParams({ category: value });
    const known = { categoryIds: new Set(["food", "shop"]), memberIds: new Set<string>() };
    expect(parseTransactionFilter(params, known).categoryIds).toEqual(expected);
  });

  it("parseTransactionFilter đọc được param member cũ", () => {
    const params = new URLSearchParams("month=2026-08&member=u1,u2");
    const known = { categoryIds: new Set<string>(), memberIds: new Set(["u1", "u2"]) };
    expect(parseTransactionFilter(params, known).memberIds).toEqual(["u1", "u2"]);
  });

  it("serialize rồi parse lại cho ra filter y nguyên", () => {
    const original = filter({ categoryIds: ["food", DELETED_CATEGORY_ID], memberIds: ["u2"], search: "cà phê" });
    const known = {
      categoryIds: new Set(["food", "shop", DELETED_CATEGORY_ID]),
      memberIds: new Set(["u1", "u2"]),
    };
    expect(parseTransactionFilter(serializeTransactionFilter(original), known)).toEqual(original);
    expect(serializeTransactionFilter(EMPTY_TRANSACTION_FILTER).toString()).toBe("");
  });

  it("toggleFilterId thêm rồi bỏ cùng một id", () => {
    const added = toggleFilterId([], "food");
    expect(added).toEqual(["food"]);
    expect(toggleFilterId(added, "food")).toEqual([]);
  });

  it("isTransactionFilterEmpty đúng với filter rỗng và sai khi có search", () => {
    expect(isTransactionFilterEmpty(EMPTY_TRANSACTION_FILTER)).toBe(true);
    expect(isTransactionFilterEmpty(filter({ search: "a" }))).toBe(false);
    expect(isTransactionFilterEmpty(filter({ categoryIds: ["food"] }))).toBe(false);
  });
});
