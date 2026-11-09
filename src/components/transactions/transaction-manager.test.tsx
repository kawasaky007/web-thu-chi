import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionsManager } from "@/components/transactions/transaction-manager";
import { ToastProvider } from "@/components/ui/toast";
import type {
  CategoryOption,
  MemberOption,
  TransactionsAllData,
  TransactionsMonthData,
  TransactionView,
} from "@/lib/transactions/data";
import { EMPTY_TRANSACTION_FILTER, type TransactionFilter } from "@/lib/transactions/filters";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
}));

const CATEGORIES: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#0a7", icon: "food", sortOrder: 1 },
  { id: "shop", name: "Mua sắm", type: "expense", color: "#07a", icon: "other", sortOrder: 2 },
  { id: "salary", name: "Lương", type: "income", color: "#0aa", icon: "salary", sortOrder: 3 },
];

const MEMBERS: MemberOption[] = [
  { id: "user-1", name: "An", email: "an@example.com" },
  { id: "user-2", name: "Bình", email: "binh@example.com" },
];

// memberName cố ý khác tên trong chip thành viên để test ẩn/hiện tên trên dòng không bắt nhầm chip.
function makeRow(overrides: Partial<TransactionView> & { id: string }): TransactionView {
  return {
    householdId: "h1",
    userId: "user-1",
    categoryId: "food",
    type: "expense",
    amount: 10_000,
    title: "Ăn uống",
    note: null,
    transactionDate: "2026-11-05",
    createdAt: "2026-11-05T07:30:00Z",
    categoryName: "Ăn uống",
    categoryColor: "#0a7",
    categoryIcon: "food",
    memberName: "An nhà mình",
    memberEmail: "an@example.com",
    canDelete: true,
    ...overrides,
  };
}

const ROWS: TransactionView[] = [
  makeRow({ id: "t1" }),
  makeRow({ id: "t2", userId: "user-2", memberName: "Bình nhà mình" }),
  makeRow({ id: "t3", categoryId: "shop", categoryName: "Mua sắm", amount: 50_000 }),
];

function monthData(rows: TransactionView[], overrides: Partial<TransactionsMonthData> = {}): TransactionsMonthData {
  return {
    categories: CATEGORIES,
    members: MEMBERS,
    current: { rows, truncated: false },
    previous: null,
    budgetLimits: null,
    ...overrides,
  };
}

function renderMonth(options: {
  rows?: TransactionView[];
  filter?: TransactionFilter;
  panelType?: "income" | "expense";
  data?: TransactionsMonthData;
} = {}) {
  return render(
    <ToastProvider>
      <TransactionsManager
        allData={null}
        currentUserId="user-1"
        highlightId={null}
        initialFilter={options.filter ?? EMPTY_TRANSACTION_FILTER}
        initialPanelType={options.panelType ?? "expense"}
        month="2026-11"
        monthData={options.data ?? monthData(options.rows ?? ROWS)}
        openNew={false}
        view="month"
      />
    </ToastProvider>,
  );
}

function allTree(filter: TransactionFilter, overrides: Partial<TransactionsAllData> = {}) {
  return (
    <ToastProvider>
      <TransactionsManager
        allData={{
          categories: CATEGORIES,
          members: MEMBERS,
          rows: ROWS,
          nextCursor: null,
          hasMore: false,
          ...overrides,
        }}
        currentUserId="user-1"
        highlightId={null}
        initialFilter={filter}
        initialPanelType="expense"
        month="2026-11"
        monthData={null}
        openNew={false}
        view="all"
      />
    </ToastProvider>
  );
}

function renderAll(overrides: Partial<TransactionsAllData> = {}, filter = EMPTY_TRANSACTION_FILTER) {
  return render(allTree(filter, overrides));
}

// Panel và thanh chip đều có nút mang tên danh mục; lấy đúng panel rồi mới query bên trong.
function panelSection() {
  return screen.getByRole("group", { name: /^Phạm vi phân tích/ }).closest("section") as HTMLElement;
}

function rowCount() {
  return screen.queryAllByRole("button", { name: /^Sửa giao dịch/ }).length;
}

describe("TransactionsManager — view theo tháng", () => {
  it("summary tính trên toàn bộ tháng kể cả khi có hơn 30 giao dịch", () => {
    // Lỗi #1: query cũ chỉ lấy 30 dòng rồi cộng dồn đúng 30 dòng đó thành "tổng tháng".
    const rows = Array.from({ length: 45 }, (_, index) => makeRow({ id: `t${index}` }));
    renderMonth({ rows });

    expect(screen.getByRole("group", { name: "Chi: 450.000 đ" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Số khoản: 45 / 45 cả tháng" })).toBeInTheDocument();
  });

  it("trần render không đụng tới số: tổng vẫn tính trên toàn bộ dòng của tháng", () => {
    // Nếu ai đó "tối ưu" bằng cách cắt DỮ LIỆU thay vì cắt RENDER thì chính test này đỏ.
    const rows = Array.from({ length: 120 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 10, 1 + (index % 30))).toISOString().slice(0, 10);
      return makeRow({ id: `t${index}`, transactionDate: day, amount: 1000 });
    });
    renderMonth({ rows });

    expect(screen.getByRole("group", { name: "Chi: 120.000 đ" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Số khoản: 120 / 120 cả tháng" })).toBeInTheDocument();
    // 30 ngày khác nhau nên dưới trần 50 nhóm: mọi dòng vẫn hiện, không nút Hiện thêm.
    expect(rowCount()).toBe(120);
    expect(screen.queryByRole("button", { name: /^Hiện thêm/ })).not.toBeInTheDocument();
  });

  it("nhiều nhóm ngày thì chỉ render lát đầu nhưng tổng vẫn là tổng cả tháng", () => {
    const rows = Array.from({ length: 120 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
      return makeRow({ id: `t${index}`, transactionDate: day, amount: 1000 });
    });
    renderMonth({ rows });

    expect(screen.getByRole("group", { name: "Chi: 120.000 đ" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Số khoản: 120 / 120 cả tháng" })).toBeInTheDocument();
    expect(rowCount()).toBe(50);
    fireEvent.click(screen.getByRole("button", { name: /^Hiện thêm/ }));
    expect(rowCount()).toBe(100);
    // Mở thêm dòng không được làm con số nhúc nhích.
    expect(screen.getByRole("group", { name: "Chi: 120.000 đ" })).toBeInTheDocument();
  });

  it("bấm sửa đúng dòng mở form của chính giao dịch đó", () => {
    // TransactionRow được bọc memo nên onEdit nhận cả giao dịch thay vì một closure dựng lại mỗi lần
    // render; test này giữ cho việc đổi chữ ký đó không âm thầm mở sai dòng.
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Sửa giao dịch Mua sắm" }));

    const form = screen.getByRole("dialog");
    expect(within(form).getByLabelText("Số tiền hoặc biểu thức")).toHaveValue("50.000");
  });

  it("view theo tháng không còn nút tải thêm", () => {
    // Lỗi #3: nút hiện ra nhưng page bỏ cursor ở view tháng nên bấm chỉ tải lại 30 dòng cũ.
    renderMonth();
    expect(screen.queryByText("Tải thêm giao dịch")).toBeNull();
  });

  it("bấm chip danh mục đổi cả danh sách và panel, không gọi router.push", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderMonth();
    expect(rowCount()).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống20k" }));

    expect(rowCount()).toBe(2);
    expect(screen.getByRole("group", { name: "Chi: 20.000 đ" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Số khoản: 2 / 3 cả tháng" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /ĐANG TÍNH TRÊN 2 KHOẢN, Ăn uống$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ăn uống20k" })).toHaveAttribute("aria-pressed", "true");
    // Lời hứa "tức thì": URL được chiếu lại bằng replaceState, không có điều hướng server nào.
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain("category=food");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("bấm thanh danh mục trong panel cho kết quả giống bấm chip", () => {
    renderMonth();

    fireEvent.click(within(panelSection()).getByRole("button", { name: /^Ăn uống/ }));

    expect(rowCount()).toBe(2);
    expect(screen.getByRole("group", { name: "Số khoản: 2 / 3 cả tháng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ăn uống20k" })).toHaveAttribute("aria-pressed", "true");
  });

  it("đổi công tắc Thu/Chi cập nhật param panel qua replaceState", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderMonth({
      rows: [...ROWS, makeRow({ id: "t4", type: "income", categoryId: "salary", categoryName: "Lương", amount: 30_000 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Thu" }));

    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain("panel=income");
    expect(within(panelSection()).getByRole("button", { name: /^Lương30\.000 đ/ })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("showMemberName false khi lọc đúng một thành viên", () => {
    const { unmount } = renderMonth();
    expect(screen.getAllByText("An nhà mình")).toHaveLength(2);
    unmount();

    renderMonth({ filter: { ...EMPTY_TRANSACTION_FILTER, memberIds: ["user-1"] } });
    expect(rowCount()).toBe(2);
    expect(screen.queryByText("An nhà mình")).toBeNull();
  });

  it("hiện empty state có nút Xoá bộ lọc khi filter cho 0 kết quả", () => {
    renderMonth({ filter: { ...EMPTY_TRANSACTION_FILTER, search: "không có khoản nào" } });

    expect(screen.getByText("Không tìm thấy giao dịch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá bộ lọc" }));

    expect(rowCount()).toBe(3);
  });

  it("ở view tháng, panel nằm trong cột sticky bên phải trên màn hình xl", () => {
    renderMonth();

    const panel = panelSection();
    const column = panel.parentElement as HTMLElement;
    expect(column.className).toContain("xl:sticky");
    expect((column.parentElement as HTMLElement).className).toContain("xl:grid-cols-[1fr_22rem]");

    // Thứ tự đọc của screen reader phải khớp thứ tự nhìn: filter → dải tổng → panel → danh sách.
    const viewLink = screen.getByRole("link", { name: "Tháng" });
    const strip = screen.getByRole("region", { name: "Tổng hợp giao dịch" });
    const firstRow = screen.getAllByRole("button", { name: /^Sửa giao dịch/ })[0];
    expect(viewLink.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("TransactionsManager — view tất cả", () => {
  it("giữ nút tải thêm giao dịch kèm cursor trang sau và không có panel", () => {
    renderAll({ hasMore: true, nextCursor: "cur-2" });

    expect(screen.getByRole("link", { name: "Tải thêm giao dịch" }).getAttribute("href")).toContain("cursor=cur-2");
    expect(screen.queryByRole("group", { name: /^Phạm vi phân tích/ })).toBeNull();
  });

  it("đổi filter ở view tất cả là <Link> điều hướng, không router.push và không có số tiền trên chip", () => {
    renderAll();

    // Dữ liệu ở view này được DB lọc, nên thay đổi filter phải là điều hướng có href (kèm overlay
    // chờ), không phải router.push ẩn sau một <button> trông như lọc tức thì.
    const chip = screen.getByRole("link", { name: "Ăn uống" });
    expect(chip.getAttribute("href")).toBe("/transactions?view=all&category=food");
    // Tên chính xác "Ăn uống" là chip (không còn số tiền); dòng giao dịch có tên dài hơn.
    expect(screen.queryByRole("button", { name: "Ăn uống" })).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("gõ hai ký tự ở view tất cả không gây lần điều hướng nào", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderAll();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    const input = screen.getByRole("searchbox", { name: "Tìm giao dịch" });
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.change(input, { target: { value: "cà" } });

    // Lỗi cũ: input controlled + push mỗi onChange = một điều hướng cho từng ký tự, mỗi lần dựng
    // trên filter cũ nên ký tự bị revert. Giờ điều hướng duy nhất là submit của form GET.
    expect(input).toHaveValue("cà");
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    const form = input.closest("form") as HTMLFormElement;
    expect(form).toHaveAttribute("action", "/transactions");
    expect(form).toHaveAttribute("method", "get");
  });

  it("đổi initialFilter từ server thì filter hiển thị đi theo prop", () => {
    const { rerender } = renderAll();
    // aria-pressed không hợp lệ trên <a>; chip ở view "Tất cả" dùng aria-current, bỏ hẳn khi không bật.
    expect(screen.getByRole("link", { name: "Ăn uống" })).not.toHaveAttribute("aria-current");

    rerender(allTree({ ...EMPTY_TRANSACTION_FILTER, categoryIds: ["shop"] }));

    // View "Tất cả" không giữ bản sao state nào, nên prop mới từ server luôn thắng.
    expect(screen.getByRole("link", { name: "Mua sắm" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Ăn uống" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Bỏ lọc danh mục Mua sắm" })).toBeInTheDocument();
  });
});

describe("TransactionsManager — view tất cả, search không im lặng", () => {
  const DIACRITIC_HINT = /phân biệt dấu/;

  it("empty state của view tất cả nói rõ search ở đây phân biệt dấu khi có từ khoá", () => {
    // View tháng gộp dấu (khớp "an uong" với "Ăn uống"), view "Tất cả" dùng ilike nên không gộp. Mang
    // q sang mà im lặng thì 0 kết quả bị đọc thành "không còn gì cũ hơn".
    renderAll({ rows: [] }, { ...EMPTY_TRANSACTION_FILTER, search: "an uong" });

    expect(screen.getByText("Không tìm thấy giao dịch")).toBeInTheDocument();
    // Gợi ý phải nhắc lại chính từ khoá đã gõ, không chỉ nói chung chung về dấu.
    expect(screen.getByText(DIACRITIC_HINT)).toHaveTextContent('thử gõ "an uong" có dấu đầy đủ');
  });

  it("empty state không có từ khoá thì không nhắc gì về dấu", () => {
    renderAll({ rows: [] }, { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["food"] });

    expect(screen.getByText("Không tìm thấy giao dịch")).toBeInTheDocument();
    expect(screen.queryByText(DIACRITIC_HINT)).not.toBeInTheDocument();
  });

  it("view tháng không nhắc chuyện dấu vì bên đó đã gộp dấu", () => {
    renderMonth({ filter: { ...EMPTY_TRANSACTION_FILTER, search: "không có khoản nào" } });

    expect(screen.getByText("Không tìm thấy giao dịch")).toBeInTheDocument();
    expect(screen.queryByText(DIACRITIC_HINT)).not.toBeInTheDocument();
  });
});

describe("TransactionsManager — chiếu URL an toàn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function openSearch() {
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    return screen.getByRole("searchbox", { name: "Tìm giao dịch" });
  }

  it("gõ nhiều ký tự chỉ chiếu URL một lần sau khi ngừng gõ", () => {
    // WebKit chỉ cho 100 lần replaceState / 30 giây rồi ném SecurityError: một lần ghi cho từng ký tự
    // là đủ để chạm trần ngay trong lúc gõ.
    vi.useFakeTimers();
    renderMonth();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const input = openSearch();
    const values = ["c", "cơ", "cơm", "cơm ", "cơm t", "cơm tấ", "cơm tấm"];
    for (const value of values) fireEvent.change(input, { target: { value } });

    expect(replaceState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls.length).toBeLessThan(values.length);
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain("q=c%C6%A1m+t%E1%BA%A5m");
  });

  it("bấm chip vẫn chiếu URL ngay, không chờ debounce", () => {
    vi.useFakeTimers();
    renderMonth();
    const replaceState = vi.spyOn(window.history, "replaceState");

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống20k" }));

    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain("category=food");
  });

  it("replaceState ném lỗi (throttle của WebKit) không làm vỡ màn hình", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("Attempt to use history.replaceState() more than 100 times per 30 seconds", "SecurityError");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderMonth()).not.toThrow();

    expect(replaceState).toHaveBeenCalled();
    expect(rowCount()).toBe(3);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("TransactionsManager — URL", () => {
  it("href điều hướng mang theo filter và panel đang bật", () => {
    renderMonth({
      filter: { categoryIds: ["food"], memberIds: ["user-1"], search: "cơm" },
      panelType: "income",
    });

    const toAll = screen.getByRole("link", { name: "Tất cả" }).getAttribute("href") ?? "";
    expect(toAll).toContain("view=all");
    expect(toAll).toContain("category=food");
    expect(toAll).toContain("member=user-1");
    // panel là chuyện của view tháng, không mang sang view "Tất cả".
    expect(toAll).not.toContain("panel=");

    const nextMonth = screen.getByRole("link", { name: "Tháng sau" }).getAttribute("href") ?? "";
    expect(nextMonth).toContain("month=2026-12");
    expect(nextMonth).toContain("q=c%C6%A1m");
    expect(nextMonth).toContain("category=food");
    expect(nextMonth).toContain("member=user-1");
    expect(nextMonth).toContain("panel=income");
  });

  it("lọc không làm mất deep link highlight của thông báo", () => {
    // Deep link ?month=&highlight= là tính năng đã ship: chiếu URL không được xoá param lạ.
    window.history.replaceState(null, "", "/transactions?month=2026-11&highlight=t3&new=1");
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Ăn uống20k" }));

    const url = String(replaceState.mock.calls.at(-1)?.[2]);
    expect(url).toContain("highlight=t3");
    expect(url).toContain("new=1");
    expect(url).toContain("category=food");
  });
});
