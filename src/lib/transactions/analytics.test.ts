import { describe, expect, it } from "vitest";

import { buildCategoryChipOrder, buildTransactionAnalytics, type AnalyticsInput } from "./analytics";
import type { CategoryOption, MemberOption, TransactionView } from "./data";
import { DELETED_CATEGORY_ID, EMPTY_TRANSACTION_FILTER, applyTransactionFilters } from "./filters";

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
    categoryColor: "#f00",
    categoryIcon: "food",
    memberName: "Bạn",
    memberEmail: "",
    canDelete: true,
    ...overrides,
  };
}

const categories: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#f00", icon: "food", sortOrder: 1 },
  { id: "move", name: "Đi lại", type: "expense", color: "#0f0", icon: "car", sortOrder: 2 },
  { id: "rent", name: "Nhà ở", type: "expense", color: "#00f", icon: "home", sortOrder: 3 },
  { id: "salary", name: "Lương", type: "income", color: "#ff0", icon: "cash", sortOrder: 4 },
];
const members: MemberOption[] = [
  { id: "u1", name: "Bạn", email: "" },
  { id: "u2", name: "Vợ", email: "" },
];

const rows = [
  row({ id: "1", categoryId: "food", amount: 300, userId: "u1" }),
  row({ id: "2", categoryId: "move", amount: 100, userId: "u2", categoryName: "Đi lại" }),
  row({ id: "3", categoryId: "food", amount: 100, userId: "u2" }),
  row({ id: "4", categoryId: "salary", type: "income", amount: 5000, userId: "u1", categoryName: "Lương" }),
];

function input(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    current: rows,
    currentAll: rows,
    previous: null,
    previousTruncated: false,
    filter: EMPTY_TRANSACTION_FILTER,
    categories,
    members,
    budgetLimits: null,
    panelType: "expense",
    ...overrides,
  };
}

describe("buildTransactionAnalytics", () => {
  it("tổng thu và chi tính trên toàn bộ danh sách truyền vào", () => {
    const result = buildTransactionAnalytics(input());
    expect(result.income).toBe(5000);
    expect(result.expense).toBe(500);
  });

  it("scopeCount là số khoản sau filter, monthCount là số khoản cả tháng", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["food"] };
    const result = buildTransactionAnalytics(
      input({ current: applyTransactionFilters(rows, filter), filter }),
    );
    expect(result.scopeCount).toBe(2);
    expect(result.monthCount).toBe(4);
  });

  it("categories chỉ gồm panelType đang chọn và sắp theo amount giảm dần", () => {
    const result = buildTransactionAnalytics(input());
    expect(result.categories.map((c) => [c.categoryId, c.amount, c.count])).toEqual([
      ["food", 400, 2],
      ["move", 100, 1],
    ]);
    const income = buildTransactionAnalytics(input({ panelType: "income" }));
    expect(income.categories.map((c) => c.categoryId)).toEqual(["salary"]);
  });

  it("percent của categories cộng lại bằng 1", () => {
    const result = buildTransactionAnalytics(input());
    expect(result.categories.reduce((sum, c) => sum + c.percent, 0)).toBeCloseTo(1);
    expect(result.categories[0].percent).toBeCloseTo(0.8);
  });

  it("tháng chỉ có một danh mục thì percent bằng 1", () => {
    const only = [rows[0]];
    const result = buildTransactionAnalytics(input({ current: only, currentAll: only }));
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].percent).toBe(1);
  });

  it("tháng không có giao dịch nào trả về số 0, không NaN", () => {
    const result = buildTransactionAnalytics(input({ current: [], currentAll: [] }));
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.members).toEqual([]);
    expect(result.scopeCount).toBe(0);
    expect(Number.isNaN(result.income + result.expense)).toBe(false);
  });

  it("gom giao dịch có categoryId rỗng thành mục Danh mục đã xoá", () => {
    const orphan = [
      row({ id: "a", categoryId: "", amount: 200, categoryName: "" }),
      row({ id: "b", categoryId: "", amount: 100, categoryName: "" }),
    ];
    const result = buildTransactionAnalytics(input({ current: orphan, currentAll: orphan }));
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({
      categoryId: DELETED_CATEGORY_ID,
      name: "Danh mục đã xoá",
      count: 2,
      amount: 300,
      percent: 1,
    });
  });

  it("members sắp theo amount giảm dần và percent theo tổng panelType", () => {
    const result = buildTransactionAnalytics(input());
    expect(result.members.map((m) => [m.userId, m.name, m.amount, m.count])).toEqual([
      ["u1", "Bạn", 300, 1],
      ["u2", "Vợ", 200, 2],
    ]);
    expect(result.members[0].percent).toBeCloseTo(0.6);
    expect(result.members[1].percent).toBeCloseTo(0.4);
  });

  it("incomeInScope false khi filter chỉ gồm danh mục chi", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["food", "move"] };
    const result = buildTransactionAnalytics(input({ filter, current: applyTransactionFilters(rows, filter) }));
    expect(result.incomeInScope).toBe(false);
    expect(result.expenseInScope).toBe(true);
  });

  it("incomeInScope true khi không filter danh mục", () => {
    const result = buildTransactionAnalytics(input());
    expect(result.incomeInScope).toBe(true);
    expect(result.expenseInScope).toBe(true);
  });

  it("filtered nói có đang lọc hay không, để UI phân biệt 0 thật với 0 trong phạm vi", () => {
    expect(buildTransactionAnalytics(input()).filtered).toBe(false);
    const byMember = { ...EMPTY_TRANSACTION_FILTER, memberIds: ["u2"] };
    expect(buildTransactionAnalytics(input({ filter: byMember })).filtered).toBe(true);
    const bySearch = { ...EMPTY_TRANSACTION_FILTER, search: "cơm" };
    expect(buildTransactionAnalytics(input({ filter: bySearch })).filtered).toBe(true);
  });

  it("scopeLabel là Toàn bộ tháng khi không filter", () => {
    expect(buildTransactionAnalytics(input()).scopeLabel).toBe("Toàn bộ tháng");
  });

  it("scopeLabel ghép tối đa 2 tên danh mục rồi +N", () => {
    const two = { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["food", "move"] };
    expect(buildTransactionAnalytics(input({ filter: two })).scopeLabel).toBe("Ăn uống, Đi lại");
    const three = { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["food", "move", "rent"] };
    expect(buildTransactionAnalytics(input({ filter: three })).scopeLabel).toBe("Ăn uống, Đi lại +1");
  });

  it("không có ngân sách và không danh mục nào tăng thì alerts rỗng", () => {
    expect(buildTransactionAnalytics(input({ previous: rows })).alerts).toEqual([]);
  });

  it("filter chỉ gồm DELETED_CATEGORY_ID thì cả hai scope flag vẫn true", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, categoryIds: [DELETED_CATEGORY_ID] };
    const result = buildTransactionAnalytics(input({ filter }));
    expect(result.incomeInScope).toBe(true);
    expect(result.expenseInScope).toBe(true);
  });

  it("filter có id không tồn tại trong registry thì không khẳng định loại nào bị loại", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["ghost"] };
    const result = buildTransactionAnalytics(input({ filter }));
    expect(result.incomeInScope).toBe(true);
    expect(result.expenseInScope).toBe(true);
  });

  it("percent bằng 0 và không NaN khi tổng panel bằng 0", () => {
    const zero = [row({ id: "z", categoryId: "food", amount: 0, userId: "u1" })];
    const result = buildTransactionAnalytics(input({ current: zero, currentAll: zero }));
    expect(result.categories[0].percent).toBe(0);
    expect(Number.isNaN(result.categories[0].percent)).toBe(false);
    expect(result.members[0].percent).toBe(0);
    expect(Number.isNaN(result.members[0].percent)).toBe(false);
  });

  it("scopeLabel gồm từ khoá tìm kiếm", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, search: "  cà phê " };
    expect(buildTransactionAnalytics(input({ filter })).scopeLabel).toBe("“cà phê”");
  });

  it("scopeLabel gồm tên thành viên đang lọc", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, memberIds: ["u2"] };
    expect(buildTransactionAnalytics(input({ filter })).scopeLabel).toBe("Vợ");
  });
});

describe("buildTransactionAnalytics - so sánh tháng trước", () => {
  const food = (amount: number, extra: Partial<TransactionView> = {}) =>
    row({ id: `f${amount}`, categoryId: "food", amount, userId: "u1", ...extra });

  function compare(currentAmount: number, previousAmount: number) {
    const current = currentAmount > 0 ? [food(currentAmount)] : [];
    const previous = previousAmount > 0 ? [food(previousAmount)] : [];
    return buildTransactionAnalytics(input({ current, currentAll: current, previous }));
  }

  it("deltaKind ratio và deltaRatio đúng khi tháng trước lớn hơn 0", () => {
    const result = compare(122, 100);
    expect(result.comparable).toBe(true);
    expect(result.categories[0]).toMatchObject({
      previousAmount: 100, deltaKind: "ratio", deltaLabel: "↑22%",
    });
    expect(result.categories[0].deltaRatio).toBeCloseTo(0.22);
  });

  it("giảm thì nhãn dùng mũi tên xuống và làm tròn phần trăm nguyên", () => {
    const result = compare(92, 100);
    expect(result.categories[0].deltaKind).toBe("ratio");
    expect(result.categories[0].deltaLabel).toBe("↓8%");
    expect(result.categories[0].deltaRatio).toBeCloseTo(-0.08);
  });

  it("deltaKind new khi tháng trước bằng 0 và deltaRatio là null", () => {
    const current = [food(100)];
    const previous = [row({ id: "p", categoryId: "move", amount: 50, userId: "u2" })];
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous }));
    const foodEntry = result.categories.find((c) => c.categoryId === "food")!;
    expect(foodEntry).toMatchObject({
      previousAmount: 0, deltaRatio: null, deltaKind: "new", deltaLabel: "mới",
    });
  });

  it("deltaKind gone khi tháng này bằng 0 và tháng trước lớn hơn 0", () => {
    const current = [food(100)];
    const previous = [food(100), row({ id: "p", categoryId: "move", amount: 50, userId: "u2" })];
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous }));
    const move = result.categories.find((c) => c.categoryId === "move")!;
    expect(move).toMatchObject({
      amount: 0, count: 0, previousAmount: 50, deltaKind: "gone", deltaLabel: "hết",
    });
    expect(move.deltaRatio).toBeCloseTo(-1);
    // Mục "hết" có amount 0 phải nằm ngoài mẫu số percent, nếu không danh mục thật sẽ < 1.
    expect(move.percent).toBe(0);
    expect(result.categories.find((c) => c.categoryId === "food")!.percent).toBe(1);
    expect(result.members.find((m) => m.userId === "u2")).toMatchObject({
      amount: 0, deltaKind: "gone", deltaLabel: "hết",
    });
  });

  it("deltaKind unchanged khi lệch dưới 0.5 phần trăm", () => {
    const result = compare(1004, 1000);
    expect(result.categories[0]).toMatchObject({ deltaKind: "unchanged", deltaLabel: "không đổi" });
  });

  it("lệch vừa trên ngưỡng 0.5 phần trăm thì là ratio", () => {
    const result = compare(1005, 1000);
    expect(result.categories[0]).toMatchObject({ deltaKind: "ratio", deltaLabel: "↑1%" });
  });

  it("cùng bằng 0 ở hai tháng thì unchanged, deltaRatio 0 và không NaN", () => {
    const zero = [food(0)];
    const result = buildTransactionAnalytics(input({ current: zero, currentAll: zero, previous: zero }));
    const entry = result.categories[0];
    expect(entry).toMatchObject({ deltaKind: "unchanged", deltaRatio: 0, deltaLabel: "không đổi" });
    for (const value of Object.values(entry)) {
      if (typeof value === "number") expect(Number.isNaN(value)).toBe(false);
    }
  });

  it("previous null thì comparable false và mọi deltaLabel là null", () => {
    const result = buildTransactionAnalytics(input({ previous: null }));
    expect(result.previous).toBeNull();
    expect(result.comparable).toBe(false);
    expect(result.categories.length).toBeGreaterThan(0);
    for (const entry of [...result.categories, ...result.members]) {
      expect(entry).toMatchObject({
        previousAmount: null, deltaRatio: null, deltaKind: "none", deltaLabel: null,
      });
    }
  });

  it("previousTruncated true thì comparable false", () => {
    const result = buildTransactionAnalytics(input({ previous: rows, previousTruncated: true }));
    expect(result.comparable).toBe(false);
    expect(result.categories[0]).toMatchObject({ deltaKind: "none", deltaLabel: null, deltaRatio: null });
    expect(result.members[0]).toMatchObject({ deltaKind: "none", deltaLabel: null });
  });

  it("previous là mảng rỗng vẫn so sánh được và mọi mục hiện tại là mới", () => {
    const result = buildTransactionAnalytics(input({ previous: [] }));
    expect(result.comparable).toBe(true);
    expect(result.previous).toEqual({ income: 0, expense: 0 });
    expect(result.categories.every((c) => c.deltaKind === "new" && c.deltaRatio === null)).toBe(true);
  });

  it("previous tổng thu chi lấy từ toàn bộ rows tháng trước", () => {
    const previous = [
      food(200),
      row({ id: "s", categoryId: "salary", type: "income", amount: 4000, userId: "u1" }),
    ];
    const result = buildTransactionAnalytics(input({ previous }));
    expect(result.previous).toEqual({ income: 4000, expense: 200 });
  });

  it("delta của members tính cùng quy tắc với categories", () => {
    const current = [food(122, { userId: "u1" }), food(10, { id: "g", userId: "u2" })];
    const previous = [food(100, { userId: "u1" })];
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous }));
    const u1 = result.members.find((m) => m.userId === "u1")!;
    const u2 = result.members.find((m) => m.userId === "u2")!;
    expect(u1).toMatchObject({ previousAmount: 100, deltaKind: "ratio", deltaLabel: "↑22%" });
    expect(u2).toMatchObject({ previousAmount: 0, deltaRatio: null, deltaKind: "new", deltaLabel: "mới" });
  });
});

describe("buildTransactionAnalytics - cảnh báo", () => {
  const spend = (id: string, categoryId: string, amount: number, userId: string, extra: Partial<TransactionView> = {}) =>
    row({ id, categoryId, amount, userId, ...extra });
  const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

  // Hai người cùng chi "food" 1.320.000; u1 chỉ chiếm 600.000.
  const shared = [
    spend("a", "food", 600_000, "u1"),
    spend("b", "food", 720_000, "u2"),
  ];
  const foodLimit = [{ categoryId: "food", amount: 1_000_000 }];

  it("cảnh báo vượt ngân sách tính trên currentAll chứ không trên current đã lọc", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, memberIds: ["u1"] };
    const result = buildTransactionAnalytics(input({
      current: applyTransactionFilters(shared, filter),
      currentAll: shared,
      filter,
      budgetLimits: foodLimit,
    }));
    expect(result.alerts).toEqual([{
      kind: "budget-exceeded",
      categoryId: "food",
      severity: "warning",
      message: `Ăn uống vượt ngân sách ${vnd(320_000)} đ (tính cả household)`,
    }]);
  });

  it("message có hậu tố tính cả household khi filter đang bật", () => {
    const filter = { ...EMPTY_TRANSACTION_FILTER, search: "x" };
    const result = buildTransactionAnalytics(input({ currentAll: shared, current: shared, filter, budgetLimits: foodLimit }));
    expect(result.alerts[0].message.endsWith(" (tính cả household)")).toBe(true);
  });

  it("message không có hậu tố đó khi không filter", () => {
    const result = buildTransactionAnalytics(input({ currentAll: shared, current: shared, budgetLimits: foodLimit }));
    expect(result.alerts[0].message).toBe(`Ăn uống vượt ngân sách ${vnd(320_000)} đ`);
  });

  it("không cảnh báo ngân sách khi panelType là income", () => {
    const result = buildTransactionAnalytics(input({
      currentAll: shared, current: shared, panelType: "income", budgetLimits: foodLimit,
    }));
    expect(result.alerts).toEqual([]);
  });

  it("budgetLimits null thì không có cảnh báo ngân sách", () => {
    const result = buildTransactionAnalytics(input({ currentAll: shared, current: shared, budgetLimits: null }));
    expect(result.alerts).toEqual([]);
  });

  it("không cảnh báo khi chi đúng bằng hạn mức", () => {
    const result = buildTransactionAnalytics(input({
      currentAll: shared, current: shared, budgetLimits: [{ categoryId: "food", amount: 1_320_000 }],
    }));
    expect(result.alerts).toEqual([]);
  });

  it("biggest-increase chọn danh mục tăng tuyệt đối nhiều nhất", () => {
    // food tăng 100 (tỷ lệ nhỏ), move tăng 50 (tỷ lệ lớn): phải chọn food theo số tuyệt đối.
    const current = [spend("c1", "food", 1100, "u1"), spend("c2", "move", 100, "u1", { categoryName: "Đi lại" })];
    const previous = [spend("p1", "food", 1000, "u1"), spend("p2", "move", 50, "u1", { categoryName: "Đi lại" })];
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous }));
    expect(result.alerts).toEqual([{
      kind: "biggest-increase",
      categoryId: "food",
      severity: "info",
      message: `Ăn uống tăng mạnh nhất, +${vnd(100)} đ so với tháng trước`,
    }]);
  });

  it("không có biggest-increase khi comparable false", () => {
    const result = buildTransactionAnalytics(input({ previous: [spend("p", "food", 1, "u1")], previousTruncated: true }));
    expect(result.alerts).toEqual([]);
  });

  it("không có biggest-increase khi không danh mục nào tăng", () => {
    const current = [spend("c", "food", 100, "u1")];
    const previous = [spend("p", "food", 500, "u1")];
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous }));
    expect(result.alerts).toEqual([]);
  });

  const blown = (n: number) => {
    const ids = ["food", "move", "rent"].slice(0, n);
    const current = ids.map((id, i) => spend(String(i), id, 5000 - i * 1000, "u1", { categoryName: id }));
    return {
      current,
      budgetLimits: ids.map((categoryId) => ({ categoryId, amount: 100 })),
      previous: [spend("p", "food", 1000, "u1")],
    };
  };

  it("ba ngân sách cùng vượt thì đủ 3 warning và biggest-increase bị bỏ", () => {
    const { current, budgetLimits, previous } = blown(3);
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous, budgetLimits }));
    expect(result.alerts.map((a) => a.kind)).toEqual(["budget-exceeded", "budget-exceeded", "budget-exceeded"]);
  });

  it("hai ngân sách vượt cộng biggest-increase thì increase có mặt và đứng cuối", () => {
    const { current, budgetLimits, previous } = blown(2);
    const result = buildTransactionAnalytics(input({ current, currentAll: current, previous, budgetLimits }));
    expect(result.alerts.map((a) => a.kind)).toEqual(["budget-exceeded", "budget-exceeded", "biggest-increase"]);
  });

  it("bốn ngân sách vượt thì bỏ cái vượt ít nhất", () => {
    const current = [
      spend("1", "food", 5000, "u1"),
      spend("2", "move", 4000, "u1", { categoryName: "Đi lại" }),
      spend("3", "rent", 3000, "u1", { categoryName: "Nhà ở" }),
      spend("4", "other", 100, "u1", { categoryName: "Khác" }),
    ];
    const result = buildTransactionAnalytics(input({
      current,
      currentAll: current,
      budgetLimits: [
        // "other" phải là một hạn mức THẬT mới chứng minh được "bỏ cái vượt ít nhất": hạn mức 0 giờ
        // bị buildBudgetAlerts bỏ hẳn (0 = chưa đặt ngân sách), nên nó sẽ chỉ còn ba cái và test
        // xanh vì lý do khác. Vượt 50 là nhỏ nhất so với 4900 / 3900 / 2900.
        { categoryId: "other", amount: 50 },
        { categoryId: "food", amount: 100 },
        { categoryId: "move", amount: 100 },
        { categoryId: "rent", amount: 100 },
      ],
    }));
    expect(result.alerts.map((a) => a.categoryId)).toEqual(["food", "move", "rent"]);
  });

  it("hạn mức 0 nghĩa là chưa đặt ngân sách nên không bao giờ thành cảnh báo vượt", () => {
    // Bất biến này từng chỉ có ở tầng dữ liệu (data.ts lọc amount > 0); mọi caller khác của
    // buildBudgetAlerts sẽ nhận "vượt ngân sách" cho đúng từng danh mục có chi tiêu.
    const current = [spend("1", "food", 5000, "u1")];
    const result = buildTransactionAnalytics(input({
      current,
      currentAll: current,
      budgetLimits: [{ categoryId: "food", amount: 0 }],
    }));
    expect(result.alerts.filter((a) => a.kind === "budget-exceeded")).toEqual([]);
  });

  it("số tiền vượt làm tròn như mọi số tiền khác trên màn hình (2 số thập phân)", () => {
    // Trước đây analytics tự dựng formatter riêng (mặc định 3 số thập phân) rồi tự nối " đ".
    const current = [spend("1", "food", 1000.129, "u1")];
    const result = buildTransactionAnalytics(input({
      current,
      currentAll: current,
      budgetLimits: [{ categoryId: "food", amount: 100 }],
    }));
    expect(result.alerts[0].message).toBe("Ăn uống vượt ngân sách 900,13 đ");
  });

  it("cảnh báo ngân sách sắp theo số tiền vượt giảm dần", () => {
    const current = [
      spend("1", "food", 1500, "u1"),
      spend("2", "move", 5000, "u1", { categoryName: "Đi lại" }),
      spend("3", "rent", 3000, "u1", { categoryName: "Nhà ở" }),
    ];
    const result = buildTransactionAnalytics(input({
      current,
      currentAll: current,
      budgetLimits: [
        { categoryId: "food", amount: 1000 },
        { categoryId: "move", amount: 1000 },
        { categoryId: "rent", amount: 1000 },
      ],
    }));
    expect(result.alerts.map((a) => a.categoryId)).toEqual(["move", "rent", "food"]);
  });
});

describe("buildCategoryChipOrder", () => {
  it("sắp theo tổng tuyệt đối cả tháng, không phân biệt thu chi", () => {
    const orphan = row({ id: "o", categoryId: "", amount: 700, categoryName: "" });
    const chips = buildCategoryChipOrder(categories, [...rows, orphan]);
    expect(chips.map((c) => [c.categoryId, c.amount])).toEqual([
      ["salary", 5000],
      [DELETED_CATEGORY_ID, 700],
      ["food", 400],
      ["move", 100],
      ["rent", 0],
    ]);
    expect(chips[1].name).toBe("Danh mục đã xoá");
  });
});
