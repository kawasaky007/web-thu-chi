import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBudgetPageData } from "@/lib/budgets/data";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
  formatVietnameseMonth,
  getTransactionsAllData,
  getTransactionsMonthData,
  MONTH_ROW_CAP,
  shiftMonth,
} from "@/lib/transactions/data";
import { EMPTY_TRANSACTION_FILTER } from "@/lib/transactions/filters";

// Chỉ test tầng dữ liệu của giao dịch; getBudgetPageData tự chạy query + RPC riêng nên mock cả module.
vi.mock("@/lib/budgets/data", () => ({ getBudgetPageData: vi.fn() }));

type Row = {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string;
  type: string;
  amount: number;
  title: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
};

type Fixture = {
  transactions: Row[];
  failMonths: string[]; // lỗi theo mốc `gte` của query giao dịch
  selects: string[];
  gtes: string[];
  rejectMonths: string[]; // query giao dịch reject (ném lỗi) thay vì trả { error }
  ors: string[]; // chuỗi truyền vào .or() của query giao dịch
  ins: Array<[string, unknown[]]>; // .in() của query giao dịch
  lts: Array<[string, unknown]>; // .lt() của query giao dịch
  orders: Array<[string, { ascending?: boolean; nullsFirst?: boolean } | undefined]>;
  limits: number[];
  categories?: Array<{ id: string; name: string }>;
  members?: Array<{ id: string; full_name: string }>;
};

function row(id: string, date: string, over: Partial<Row> = {}): Row {
  return {
    id,
    household_id: "h1",
    user_id: "u1",
    category_id: "c1",
    type: "expense",
    amount: 1000,
    title: `t${id}`,
    note: null,
    transaction_date: date,
    created_at: "2026-11-05T00:00:00Z",
    ...over,
  };
}

// Builder giả lập: lọc thật theo gte/lt (so sánh theo thời điểm tuyệt đối) và limit,
// để test múi giờ kiểm chứng hành vi thay vì chỉ kiểm chứng chuỗi truyền vào.
function createSupabase(fx: Fixture) {
  const from = (table: string) => {
    const state: { gte?: string; lt?: string; limit?: number } = {};
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = (cols: string) => {
      if (table === "transactions") fx.selects.push(cols);
      return chain;
    };
    chain.eq = self;
    chain.order = (c: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => {
      if (table === "transactions") fx.orders.push([c, o]);
      return chain;
    };
    chain.or = (v: string) => {
      if (table === "transactions") fx.ors.push(v);
      return chain;
    };
    chain.in = (c: string, v: unknown[]) => {
      if (table === "transactions") fx.ins.push([c, v]);
      return chain;
    };
    chain.gte = (_c: string, v: string) => {
      state.gte = v;
      if (table === "transactions") fx.gtes.push(v);
      return chain;
    };
    chain.lt = (c: string, v: string) => {
      state.lt = v;
      if (table === "transactions") fx.lts.push([c, v]);
      return chain;
    };
    chain.limit = (n: number) => {
      state.limit = n;
      if (table === "transactions") fx.limits.push(n);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let result: { data: unknown; error: unknown };
      if (table === "transactions") {
        if (fx.rejectMonths.includes(state.gte ?? "")) {
          return Promise.reject(new Error("network down")).then(resolve, reject);
        }
        if (fx.failMonths.includes(state.gte ?? "")) {
          result = { data: null, error: new Error("tx failed") };
        } else {
          // View "Tất cả" không có mốc tháng: bỏ qua lọc ngày khi không có gte/lt.
          const lo = state.gte ? new Date(state.gte).getTime() : -Infinity;
          const hi = state.lt ? new Date(state.lt).getTime() : Infinity;
          const data = fx.transactions
            .filter((r) => {
              const t = new Date(r.transaction_date).getTime();
              return t >= lo && t < hi;
            })
            .slice(0, state.limit);
          result = { data, error: null };
        }
      } else if (table === "categories") {
        result = {
          data: (fx.categories ?? [{ id: "c1", name: "Ăn uống" }]).map((c, i) => ({
            ...c, type: "expense", color: "#111111", icon: "food", sort_order: i,
          })),
          error: null,
        };
      } else {
        result = {
          data: (fx.members ?? [{ id: "u1", full_name: "An" }]).map((m) => ({ ...m, email: `${m.id}@x.vn` })),
          error: null,
        };
      }
      return Promise.resolve(result).then(resolve, reject);
    };
    return chain;
  };
  return { from } as never;
}

function emptyFixture(): Fixture {
  return {
    transactions: [], failMonths: [], selects: [], gtes: [], rejectMonths: [],
    ors: [], ins: [], lts: [], orders: [], limits: [],
  };
}

const CURRENT_START = "2026-11-01T00:00:00+07:00";
const PREVIOUS_START = "2026-10-01T00:00:00+07:00";
const opts = { householdId: "h1", currentUserId: "u1", month: "2026-11" };

function many(n: number, date = "2026-11-10T10:00:00+07:00") {
  return Array.from({ length: n }, (_, i) => row(String(i), date));
}

describe("getTransactionsMonthData", () => {
  let fx: Fixture;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    fx = emptyFixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getBudgetPageData).mockReset();
    vi.mocked(getBudgetPageData).mockResolvedValue({ budgets: [] } as never);
  });

  it("lấy toàn bộ giao dịch của tháng, không giới hạn 30 dòng", async () => {
    fx.transactions = many(45);
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.current.rows).toHaveLength(45);
    expect(data.current.truncated).toBe(false);
  });

  it("truncated true khi DB trả về nhiều hơn MONTH_ROW_CAP", async () => {
    fx.transactions = many(MONTH_ROW_CAP + 1);
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.current.rows).toHaveLength(MONTH_ROW_CAP);
    expect(data.current.truncated).toBe(true);
  });

  it("truncated false khi vừa đúng MONTH_ROW_CAP", async () => {
    fx.transactions = many(MONTH_ROW_CAP);
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.current.rows).toHaveLength(MONTH_ROW_CAP);
    expect(data.current.truncated).toBe(false);
  });

  it("giao dịch ngày 1 lúc 00:00+07 thuộc đúng tháng đó", async () => {
    fx.transactions = [
      row("first", "2026-11-01T00:00:00+07:00"), // = 2026-10-31T17:00Z, vẫn là tháng 11 giờ VN
      row("lastOct", "2026-10-31T23:59:59+07:00"),
    ];
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.current.rows.map((r) => r.id)).toEqual(["first"]);
    // Dòng tháng trước không còn cột id (xem test projection bên dưới); title đủ để nhận dạng.
    expect(data.previous?.rows.map((r) => r.title)).toEqual(["tlastOct"]);
    // Khẳng định thẳng chuỗi bound để không phụ thuộc cách mock parse chuỗi không offset theo TZ máy.
    expect(fx.gtes).toEqual([CURRENT_START, PREVIOUS_START]);
  });

  it("dòng tháng trước chỉ mang đúng các cột được đọc, không gửi id/createdAt qua mạng", async () => {
    // Tháng trước chỉ dùng để cộng dồn so sánh và để lọc lại; id, householdId, createdAt,
    // transactionDate, memberEmail, canDelete không chỗ nào đọc nên không được vượt ranh giới server.
    fx.transactions = [
      row("first", "2026-11-01T00:00:00+07:00"),
      row("lastOct", "2026-10-31T23:59:59+07:00"),
    ];
    const data = await getTransactionsMonthData(createSupabase(fx), opts);

    const previous = data.previous?.rows ?? [];
    expect(previous).toHaveLength(1);
    expect(new Set(Object.keys(previous[0]))).toEqual(new Set([
      "type", "amount", "categoryId", "userId",
      "title", "note", "categoryName", "memberName",
      "categoryColor", "categoryIcon",
    ]));
    for (const dropped of ["id", "householdId", "createdAt", "transactionDate", "memberEmail", "canDelete"]) {
      expect(previous[0]).not.toHaveProperty(dropped);
    }
    // Tháng hiện tại vẫn đầy đủ: danh sách cần id để xoá và transactionDate để nhóm theo ngày.
    expect(data.current.rows[0]).toHaveProperty("id", "first");
    expect(data.current.rows[0]).toHaveProperty("transactionDate");
  });

  it("previous null khi query tháng trước lỗi, current vẫn có dữ liệu", async () => {
    fx.transactions = many(3);
    fx.failMonths = [PREVIOUS_START];
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.previous).toBeNull();
    expect(data.current.rows).toHaveLength(3);
    expect(console.error).toHaveBeenCalled();
  });

  it("previous null khi query tháng trước reject, current vẫn có dữ liệu", async () => {
    fx.transactions = many(3);
    fx.rejectMonths = [PREVIOUS_START];
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.previous).toBeNull();
    expect(data.current.rows).toHaveLength(3);
    expect(console.error).toHaveBeenCalled();
  });

  it("budgetLimits null khi query ngân sách lỗi, current vẫn có dữ liệu", async () => {
    fx.transactions = many(3);
    vi.mocked(getBudgetPageData).mockRejectedValue(new Error("budget failed"));
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.budgetLimits).toBeNull();
    expect(data.current.rows).toHaveLength(3);
    expect(console.error).toHaveBeenCalled();
  });

  it("budgetLimits bỏ các danh mục chưa đặt ngân sách (amount 0)", async () => {
    vi.mocked(getBudgetPageData).mockResolvedValue({
      budgets: [
        { categoryId: "c1", amount: 500000, spent: 0 },
        { categoryId: "c2", amount: 0, spent: 90000 },
      ],
    } as never);
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.budgetLimits).toEqual([{ categoryId: "c1", amount: 500000 }]);
  });

  it("budgetLimits chỉ gồm categoryId và amount", async () => {
    vi.mocked(getBudgetPageData).mockResolvedValue({
      budgets: [{ id: "b1", categoryId: "c1", categoryName: "Ăn uống", amount: 500000, spent: 123, displayOrder: 1 }],
    } as never);
    const data = await getTransactionsMonthData(createSupabase(fx), opts);
    expect(data.budgetLimits).toEqual([{ categoryId: "c1", amount: 500000 }]);
  });

  it("throw khi query tháng hiện tại lỗi", async () => {
    fx.failMonths = [CURRENT_START];
    await expect(getTransactionsMonthData(createSupabase(fx), opts)).rejects.toThrow("tx failed");
  });

  it("dùng danh sách cột tường minh thay vì select(*)", async () => {
    await getTransactionsMonthData(createSupabase(fx), opts);
    expect(fx.selects.length).toBe(2);
    const required = ["id", "household_id", "user_id", "category_id", "type", "amount", "title", "note", "transaction_date", "created_at"];
    for (const cols of fx.selects) {
      expect(cols).not.toContain("*");
      const list = cols.split(",").map((c) => c.trim());
      for (const column of required) expect(list).toContain(column);
    }
  });
});

describe("shiftMonth / formatVietnameseMonth độc lập múi giờ", () => {
  const cases: Array<[string, number, string]> = [
    ["2026-03", 1, "2026-04"],
    ["2026-12", 1, "2027-01"],
    ["2026-03", -1, "2026-02"],
    ["2026-01", -1, "2025-12"],
    ["2026-05", -1, "2026-04"],
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Node đọc lại TZ khi gán process.env.TZ, nên stub này thật sự đổi múi giờ của Date.
  for (const tz of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles", "Pacific/Auckland"]) {
    it(`shiftMonth đúng ở TZ=${tz}`, () => {
      vi.stubEnv("TZ", tz);
      for (const [month, delta, expected] of cases) {
        expect(shiftMonth(month, delta)).toBe(expected);
      }
    });

    it(`formatVietnameseMonth ra đúng tháng ở TZ=${tz}`, () => {
      vi.stubEnv("TZ", tz);
      // So khớp nguyên văn đầu ra Intl: regex lỏng từng để lọt cả bản cài đặt sai múi giờ.
      expect(formatVietnameseMonth("2026-03")).toBe("tháng 3 năm 2026");
      expect(formatVietnameseMonth("2026-12")).toBe("tháng 12 năm 2026");
    });
  }
});

describe("getTransactionsAllData", () => {
  let fx: Fixture;
  const allOpts = { householdId: "h1", currentUserId: "u1", filter: EMPTY_TRANSACTION_FILTER };

  beforeEach(() => {
    fx = emptyFixture();
  });

  const cursorOf = (transactionDate: string, createdAt: string | null, id: string) =>
    encodeTransactionCursor({ transactionDate, createdAt, id });

  // transactions.id là uuid; cursor mang id không phải uuid làm Postgres ném lỗi cast (HTTP 500),
  // nên fixture dùng uuid thật giống dữ liệu production.
  const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

  it("encode rồi decode cursor cho ra giá trị y nguyên", () => {
    const cursor = { transactionDate: "2026-10-20T10:00:00+07:00", createdAt: "2026-10-20T01:00:00.123456+00:00", id: uuid(1) };
    const encoded = encodeTransactionCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeTransactionCursor(encoded)).toEqual(cursor);
  });

  it("decode trả null với chuỗi rác", () => {
    expect(decodeTransactionCursor("%%%không-phải-base64")).toBeNull();
    expect(decodeTransactionCursor(Buffer.from("not json").toString("base64url"))).toBeNull();
    expect(decodeTransactionCursor(Buffer.from(JSON.stringify({ id: 1 })).toString("base64url"))).toBeNull();
    expect(decodeTransactionCursor(Buffer.from(JSON.stringify({ transactionDate: "d", createdAt: 5, id: "x" })).toString("base64url"))).toBeNull();
    expect(decodeTransactionCursor("")).toBeNull();
  });

  it("decode trả null khi cursor bị sửa tay: ngày không parse được hoặc id không phải uuid", () => {
    const good = { transactionDate: "2026-10-20T10:00:00+07:00", createdAt: "2026-10-20T01:00:00Z", id: uuid(7) };
    expect(decodeTransactionCursor(encodeTransactionCursor(good))).toEqual(good);
    // Các giá trị này qua được kiểm tra kiểu cũ rồi mới nổ ở Postgres — tức 500 thay vì rơi về trang đầu.
    expect(decodeTransactionCursor(encodeTransactionCursor({ ...good, transactionDate: "hôm qua" }))).toBeNull();
    expect(decodeTransactionCursor(encodeTransactionCursor({ ...good, createdAt: "không-phải-ngày" }))).toBeNull();
    expect(decodeTransactionCursor(encodeTransactionCursor({ ...good, id: "29" }))).toBeNull();
    // "5" là thứ new Date() nhận (thành 2001-05-01) nhưng cột thì không: phải chặn ở đây.
    expect(decodeTransactionCursor(encodeTransactionCursor({ ...good, transactionDate: "5" }))).toBeNull();
    expect(decodeTransactionCursor(encodeTransactionCursor({ ...good, transactionDate: "2026-13-99" }))).toBeNull();
  });

  it("cursor xử lý được created_at null", () => {
    const cursor = { transactionDate: "2026-10-20T10:00:00+07:00", createdAt: null, id: uuid(1) };
    expect(decodeTransactionCursor(encodeTransactionCursor(cursor))).toEqual(cursor);
  });

  it("keyset giữ được giao dịch nhập muộn cho ngày cũ", async () => {
    // Trang 1 kết thúc ở 20/10; dòng 19/10 nhập muộn (created_at tháng 11) phải còn ở trang 2.
    // Lỗi cũ: lọc created_at < cursor.created_at làm dòng này (created_at mới hơn) biến mất.
    await getTransactionsAllData(createSupabase(fx), {
      ...allOpts,
      cursor: cursorOf("2026-10-20", "2026-10-20T01:00:00Z", uuid(9)),
    });
    expect(fx.lts.filter(([c]) => c === "created_at")).toEqual([]);
    expect(fx.ors).toEqual([
      'transaction_date.lt."2026-10-20",and(transaction_date.eq."2026-10-20",or(created_at.is.null,' +
        `created_at.lt."2026-10-20T01:00:00Z",and(created_at.eq."2026-10-20T01:00:00Z",id.lt."${uuid(9)}")))`,
    ]);
  });

  it("keyset khi cursor có created_at null chỉ xét các dòng null còn lại cùng ngày", async () => {
    await getTransactionsAllData(createSupabase(fx), { ...allOpts, cursor: cursorOf("2026-10-20", null, uuid(9)) });
    expect(fx.ors).toEqual([
      `transaction_date.lt."2026-10-20",and(transaction_date.eq."2026-10-20",created_at.is.null,id.lt."${uuid(9)}")`,
    ]);
  });

  it("nhận formOptions có sẵn thì không query lại danh mục/thành viên", async () => {
    const supabase = createSupabase(fx);
    const froms: string[] = [];
    const spied = { from: (table: string) => { froms.push(table); return (supabase as unknown as { from: (t: string) => unknown }).from(table); } } as never;

    await getTransactionsAllData(spied, {
      ...allOpts,
      formOptions: { categories: [], members: [] },
    });

    expect(froms).toEqual(["transactions"]);
  });

  it("sắp xếp created_at nulls last, khớp điều kiện keyset", async () => {
    await getTransactionsAllData(createSupabase(fx), allOpts);
    expect(fx.orders).toEqual([
      ["transaction_date", { ascending: false }],
      ["created_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
    expect(fx.ors).toEqual([]);
  });

  it("cursor hỏng bị bỏ qua thay vì làm hỏng query", async () => {
    await getTransactionsAllData(createSupabase(fx), { ...allOpts, cursor: "rác" });
    expect(fx.ors).toEqual([]);
  });

  it("search tìm được giao dịch nằm ngoài 30 dòng đầu", async () => {
    fx.transactions = Array.from({ length: 45 }, (_, i) => row(String(i), "2026-11-10T10:00:00+07:00"));
    await getTransactionsAllData(createSupabase(fx), { ...allOpts, filter: { ...EMPTY_TRANSACTION_FILTER, search: "cơm" } });
    // Lọc nằm trong query (quét cả bảng), không phải lọc JS sau khi đã cắt 30 dòng.
    expect(fx.ors).toHaveLength(1);
    expect(fx.ors[0]).toContain('title.ilike."%cơm%"');
    expect(fx.ors[0]).toContain('note.ilike."%cơm%"');
  });

  it("search resolve tên danh mục và tên thành viên thành id trước khi query", async () => {
    fx.categories = [{ id: "c1", name: "Ăn uống" }, { id: "c2", name: "Cơm trưa" }, { id: "c3", name: "Xăng" }];
    fx.members = [{ id: "u1", full_name: "An" }, { id: "u2", full_name: "Cơm Bình" }];
    await getTransactionsAllData(createSupabase(fx), { ...allOpts, filter: { ...EMPTY_TRANSACTION_FILTER, search: "Cơm" } });
    expect(fx.ors[0]).toBe(
      'title.ilike."%Cơm%",note.ilike."%Cơm%",category_id.in.("c2"),user_id.in.("u2")',
    );
  });

  it("search 'bạn' khớp thành viên hiện tại vì giao diện hiển thị họ là 'Bạn'", async () => {
    await getTransactionsAllData(createSupabase(fx), { ...allOpts, filter: { ...EMPTY_TRANSACTION_FILTER, search: "bạn" } });
    expect(fx.ors[0]).toContain('user_id.in.("u1")');
  });

  it("search chứa dấu phẩy, ngoặc, chấm, %, _, *, dấu nháy vẫn dựng filter đúng và khớp nguyên văn", async () => {
    await getTransactionsAllData(createSupabase(fx), {
      ...allOpts,
      filter: { ...EMPTY_TRANSACTION_FILTER, search: 'cơm, nước chi (tạm) 1.5 100% a_b *x" \\' },
    });
    const filter = fx.ors[0];
    // Term nằm trong ngoặc kép nên dấu phẩy, ngoặc, chấm không còn là cú pháp. Backslash/%/_ được escape cho LIKE,
    // rồi backslash và nháy kép được escape lần nữa cho PostgREST (nên 1 backslash thành 4); dấu * thành _ để không thành wildcard.
    expect(filter).toBe(
      'title.ilike."%cơm, nước chi (tạm) 1.5 100\\\\% a\\\\_b _x\\" \\\\\\\\%",' +
        'note.ilike."%cơm, nước chi (tạm) 1.5 100\\\\% a\\\\_b _x\\" \\\\\\\\%"',
    );
    // Tách theo dấu phẩy cấp cao nhất (bỏ qua nội dung trong ngoặc kép): phải ra đúng 2 điều kiện.
    const parts: string[] = [];
    let depth = false;
    let current = "";
    for (let i = 0; i < filter.length; i++) {
      const ch = filter[i];
      if (depth && ch === "\\") { current += ch + filter[++i]; continue; }
      if (ch === '"') depth = !depth;
      if (ch === "," && !depth) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    parts.push(current);
    expect(parts).toHaveLength(2);
    expect(depth).toBe(false);
  });

  it("áp bộ lọc danh mục và thành viên ngay trong query", async () => {
    await getTransactionsAllData(createSupabase(fx), {
      ...allOpts,
      filter: { categoryIds: ["c1", "c2"], memberIds: ["u1"], search: "" },
    });
    expect(fx.ins).toEqual([["category_id", ["c1", "c2"]], ["user_id", ["u1"]]]);
  });

  it("danh mục đã xoá (DELETED_CATEGORY_ID) khớp category_id null", async () => {
    await getTransactionsAllData(createSupabase(fx), {
      ...allOpts,
      filter: { categoryIds: ["c1", "__deleted__"], memberIds: [], search: "" },
    });
    expect(fx.ins).toEqual([]);
    expect(fx.ors).toEqual(['category_id.in.("c1"),category_id.is.null']);
  });

  it("nextCursor trỏ vào dòng cuối của trang khi còn trang sau", async () => {
    fx.transactions = Array.from({ length: 31 }, (_, i) =>
      row(uuid(i), "2026-11-10T10:00:00+07:00", { created_at: `2026-11-10T10:00:${String(59 - i).padStart(2, "0")}Z` }),
    );
    const data = await getTransactionsAllData(createSupabase(fx), allOpts);
    expect(fx.limits).toEqual([31]);
    expect(data.rows).toHaveLength(30);
    expect(data.hasMore).toBe(true);
    expect(decodeTransactionCursor(data.nextCursor!)).toEqual({
      transactionDate: "2026-11-10T10:00:00+07:00",
      createdAt: "2026-11-10T10:00:30Z",
      id: uuid(29),
    });
  });

  it("nextCursor null khi không còn trang sau", async () => {
    fx.transactions = Array.from({ length: 30 }, (_, i) => row(String(i), "2026-11-10T10:00:00+07:00"));
    const data = await getTransactionsAllData(createSupabase(fx), allOpts);
    expect(data.rows).toHaveLength(30);
    expect(data.nextCursor).toBeNull();
    expect(data.hasMore).toBe(false);
  });
});
