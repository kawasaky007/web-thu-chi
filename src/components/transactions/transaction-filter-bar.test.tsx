import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionFilterBar } from "@/components/transactions/transaction-filter-bar";
import type { CategoryChipEntry } from "@/lib/transactions/analytics";
import type { MemberOption } from "@/lib/transactions/data";
import { DELETED_CATEGORY_ID, EMPTY_TRANSACTION_FILTER, type TransactionFilter } from "@/lib/transactions/filters";

function makeChips(count: number): CategoryChipEntry[] {
  // Tên khác nhau hoàn toàn và giảm dần theo số tiền: chipOrder đã sắp sẵn, component không được sắp lại.
  const names = ["Ăn uống", "Nhà cửa", "Di chuyển", "Giải trí", "Sức khoẻ", "Học tập", "Mua sắm", "Quà tặng"];
  return names.slice(0, count).map((name, index) => ({
    categoryId: `cat-${index}`,
    name,
    color: "#2f6f4f",
    icon: "utensils",
    amount: (count - index) * 1000000,
  }));
}

// Thứ tự cố ý không giảm dần theo tiền và không theo bảng chữ cái: re-sort kiểu nào cũng làm test này đỏ.
const UNSORTED: CategoryChipEntry[] = [
  ["u-0", "Quà tặng", 200_000],
  ["u-1", "Nhà cửa", 5_000_000],
  ["u-2", "Ăn uống", 100_000],
  ["u-3", "Học tập", 9_000_000],
  ["u-4", "Di chuyển", 300_000],
  ["u-5", "Sức khoẻ", 1_000_000],
  ["u-6", "Mua sắm", 7_000_000],
  ["u-7", "Giải trí", 50_000],
].map(([categoryId, name, amount]) => ({ categoryId: categoryId as string, name: name as string, color: "#2f6f4f", icon: "utensils", amount: amount as number }));

const MEMBERS: MemberOption[] = [
  { id: "m1", name: "Ân", email: "an@example.com" },
  { id: "m2", name: "Linh", email: "linh@example.com" },
];

// hrefForFilter dựng URL giống orchestrator ở view "Tất cả" (view=all + param của filter).
function filterHref(filter: TransactionFilter) {
  const params = new URLSearchParams({ view: "all" });
  if (filter.search) params.set("q", filter.search);
  if (filter.categoryIds.length > 0) params.set("category", filter.categoryIds.join(","));
  if (filter.memberIds.length > 0) params.set("member", filter.memberIds.join(","));
  return `/transactions?${params.toString()}`;
}

function renderBar(
  overrides: {
    chips?: CategoryChipEntry[];
    filter?: TransactionFilter;
    view?: "month" | "all";
    navigating?: boolean;
  } = {},
) {
  const onFilterChange = vi.fn();
  const hrefForMonth = vi.fn((month: string) => `/transactions?month=${month}`);
  const hrefForView = vi.fn((view: "month" | "all") => `/transactions?view=${view}`);
  render(
    <TransactionFilterBar
      chipOrder={overrides.chips ?? makeChips(8)}
      filter={overrides.filter ?? EMPTY_TRANSACTION_FILTER}
      hrefForFilter={overrides.navigating ? filterHref : undefined}
      hrefForMonth={hrefForMonth}
      hrefForView={hrefForView}
      members={MEMBERS}
      month="2026-11"
      onFilterChange={onFilterChange}
      view={overrides.view ?? "month"}
    />,
  );
  return { onFilterChange, hrefForMonth, hrefForView };
}

describe("TransactionFilterBar", () => {
  it("hiện tối đa 6 chip danh mục rồi nút cộng N", () => {
    renderBar();
    const names = ["Ăn uống", "Nhà cửa", "Di chuyển", "Giải trí", "Sức khoẻ", "Học tập"];
    const chips = names.map((name) => screen.getByRole("button", { name: new RegExp(`^${name}`) }));
    // Giữ nguyên thứ tự chipOrder.
    for (let i = 1; i < chips.length; i++) {
      expect(chips[i - 1].compareDocumentPosition(chips[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /^Mua sắm/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem thêm 2 danh mục" })).toHaveTextContent("+2");
  });

  it("không hiện nút cộng N khi danh mục ít hơn hoặc bằng 6", () => {
    renderBar({ chips: makeChips(6) });
    expect(screen.queryByRole("button", { name: /^Xem thêm/ })).not.toBeInTheDocument();
  });

  it("chip danh mục hiện tên và số tiền", () => {
    renderBar();
    const chip = screen.getByRole("button", { name: /^Ăn uống/ });
    expect(within(chip).getByText("Ăn uống")).toBeInTheDocument();
    expect(within(chip).getByText("8tr")).toBeInTheDocument();
  });

  it("bấm chip danh mục gọi onFilterChange với id được thêm vào", () => {
    const { onFilterChange } = renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["cat-1"] } });
    fireEvent.click(screen.getByRole("button", { name: /^Ăn uống/ }));
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: ["cat-1", "cat-0"], memberIds: [], search: "" });
  });

  it("bấm lại chip đang chọn gọi onFilterChange với id được bỏ ra", () => {
    const { onFilterChange } = renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["cat-0", "cat-1"] } });
    const chip = screen.getByRole("button", { name: /^Ăn uống/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: ["cat-1"], memberIds: [], search: "" });
  });

  it("bấm nút cộng N mở sheet có toàn bộ danh mục kèm số tiền", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 2 danh mục" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button", { name: /\d đ$/ })).toHaveLength(8);
    expect(within(dialog).getByRole("button", { name: /^Quà tặng/ })).toHaveTextContent("1.000.000 đ");
  });

  it("chọn danh mục trong sheet gọi onFilterChange", () => {
    const { onFilterChange } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 2 danh mục" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Quà tặng/ }));
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: ["cat-7"], memberIds: [], search: "" });
  });

  it("bấm chip thành viên gọi onFilterChange", () => {
    const { onFilterChange } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /^Linh/ }));
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: [], memberIds: ["m2"], search: "" });
  });

  it("hiện chip filter đang áp dụng, bấm x để bỏ từng cái", () => {
    const { onFilterChange } = renderBar({
      filter: { categoryIds: ["cat-0"], memberIds: ["m1"], search: "cơm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc danh mục Ăn uống" }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ categoryIds: [], memberIds: ["m1"], search: "cơm" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc thành viên Ân" }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ categoryIds: ["cat-0"], memberIds: [], search: "cơm" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc từ khoá cơm" }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ categoryIds: ["cat-0"], memberIds: ["m1"], search: "" });
  });

  it("hiện nút Xoá hết khi có filter và ẩn khi không", () => {
    const { onFilterChange } = renderBar({ filter: { categoryIds: ["cat-0"], memberIds: [], search: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_TRANSACTION_FILTER);
  });

  it("ẩn nút Xoá hết khi không có filter", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Xoá hết" })).not.toBeInTheDocument();
  });

  it("bấm icon search bung ô nhập inline", () => {
    renderBar();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(screen.getByRole("searchbox", { name: "Tìm giao dịch" })).toBeInTheDocument();
  });

  it("nhập search gọi onFilterChange với search mới", () => {
    const { onFilterChange } = renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, memberIds: ["m1"] } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cơm" } });
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: [], memberIds: ["m1"], search: "cơm" });
  });

  it("đang có search thì ô nhập hiện sẵn", () => {
    renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, search: "cơm" } });
    expect(screen.getByRole("searchbox")).toHaveValue("cơm");
  });

  it("điều hướng tháng dùng Link lấy từ hrefForMonth", () => {
    const { hrefForMonth } = renderBar();
    expect(screen.getByRole("link", { name: "Tháng trước" })).toHaveAttribute("href", "/transactions?month=2026-10");
    expect(screen.getByRole("link", { name: "Tháng sau" })).toHaveAttribute("href", "/transactions?month=2026-12");
    expect(hrefForMonth).toHaveBeenCalledWith("2026-10");
  });

  it("chuyển tháng/tất cả dùng Link lấy từ hrefForView", () => {
    renderBar();
    expect(screen.getByRole("link", { name: "Tất cả" })).toHaveAttribute("href", "/transactions?view=all");
    expect(screen.getByRole("link", { name: "Tháng" })).toHaveAttribute("href", "/transactions?view=month");
  });

  it("xem tất cả thì ẩn điều hướng tháng", () => {
    renderBar({ view: "all" });
    expect(screen.queryByRole("link", { name: "Tháng trước" })).not.toBeInTheDocument();
  });

  it("không có chip danh mục nào là link", () => {
    renderBar();
    expect(screen.queryByRole("link", { name: /^Ăn uống/ })).not.toBeInTheDocument();
  });

  it("giữ nguyên thứ tự chipOrder, cả chip lẫn sheet", () => {
    renderBar({ chips: UNSORTED });
    const bar = screen.getAllByRole("button", { pressed: false });
    const expectedNames = UNSORTED.map((c) => c.name);
    const namesOf = (buttons: HTMLElement[]) => buttons.map((b) => b.querySelector("span span:last-child")?.textContent);
    expect(namesOf(bar.slice(0, 6))).toEqual(expectedNames.slice(0, 6));
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 2 danh mục" }));
    const inSheet = within(screen.getByRole("dialog")).getAllByRole("button", { name: /\d đ$/ });
    expect(namesOf(inSheet)).toEqual(expectedNames);
  });

  it("bấm thành viên đang chọn thì bỏ ra", () => {
    const { onFilterChange } = renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, memberIds: ["m1", "m2"] } });
    const chip = screen.getByRole("button", { name: /^Ân/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: [], memberIds: ["m2"], search: "" });
  });

  it("Đóng tìm kiếm xoá từ khoá và ẩn ô nhập", () => {
    const { onFilterChange } = renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, search: "cơm" } });
    fireEvent.click(screen.getByRole("button", { name: "Đóng tìm kiếm" }));
    expect(onFilterChange).toHaveBeenCalledWith({ categoryIds: [], memberIds: [], search: "" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("Đóng tìm kiếm khi chưa có từ khoá thì chỉ ẩn ô nhập", () => {
    const { onFilterChange } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Đóng tìm kiếm" }));
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("mở sẵn từ ?q= thì không cướp focus", () => {
    renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, search: "cơm" } });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("thanh chip danh mục tự nói ra phạm vi mà số tiền của nó đo", () => {
    // Chip cộng cả tháng, cả thu lẫn chi, bỏ qua filter — khác hẳn panel ngay bên dưới. Trước đây chỉ
    // sheet mang câu này, nên "Ăn uống 8tr" nằm cạnh "Ăn uống 2.000.000 đ" mà không có gì giải thích.
    renderBar();
    const group = screen.getByRole("group", { name: "Lọc theo danh mục" });
    expect(within(group).getByText("Số tiền tính theo tháng đang xem.")).toBeInTheDocument();
    expect(group).toHaveAttribute("aria-describedby", within(group).getByText("Số tiền tính theo tháng đang xem.").id);
  });

  it("không có số tiền trên chip thì cũng không hứa phạm vi nào", () => {
    renderBar({ navigating: true, view: "all" });
    expect(screen.queryByText("Số tiền tính theo tháng đang xem.")).not.toBeInTheDocument();
  });

  it("hai chiều lọc là hai nhóm có nhãn riêng", () => {
    // Nghe "Ăn uống, toggle button" rồi "Linh, toggle button" thì không có gì nói cái nào là danh mục,
    // cái nào là người — trên đúng tính năng lọc theo cả hai chiều.
    renderBar();
    const categoryGroup = screen.getByRole("group", { name: "Lọc theo danh mục" });
    expect(within(categoryGroup).getByRole("button", { name: /^Ăn uống/ })).toBeInTheDocument();
    const memberGroup = screen.getByRole("group", { name: "Lọc theo thành viên" });
    expect(within(memberGroup).getByRole("button", { name: /^Linh/ })).toBeInTheDocument();
    expect(within(memberGroup).queryByRole("button", { name: /^Ăn uống/ })).not.toBeInTheDocument();
  });

  it("danh mục đã xoá hiện chip và chip filter bằng DELETED_CATEGORY_ID", () => {
    const deleted: CategoryChipEntry = { categoryId: DELETED_CATEGORY_ID, name: "Danh mục đã xoá", color: "#94a3b8", icon: "x", amount: 400_000 };
    const { onFilterChange } = renderBar({
      chips: [...makeChips(2), deleted],
      filter: { ...EMPTY_TRANSACTION_FILTER, categoryIds: [DELETED_CATEGORY_ID] },
    });
    expect(screen.getByRole("button", { name: /^Danh mục đã xoá/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc danh mục Danh mục đã xoá" }));
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_TRANSACTION_FILTER);
  });
});

describe("TransactionFilterBar — chế độ điều hướng (view Tất cả)", () => {
  const navAll = { navigating: true, view: "all" as const };

  it("chip danh mục và thành viên là Link kèm chỉ báo đang tải", () => {
    renderBar(navAll);

    const chip = screen.getByRole("link", { name: /^Ăn uống/ });
    expect(chip).toHaveAttribute("href", "/transactions?view=all&category=cat-0");
    // Mọi điều khiển gây round-trip trong app đều có overlay; thiếu nó là nút trông như chết.
    expect(chip.className).toContain("relative");
    expect(screen.getByRole("link", { name: /^Linh/ })).toHaveAttribute(
      "href",
      "/transactions?view=all&member=m2",
    );
    expect(screen.queryByRole("button", { name: /^Ăn uống/ })).not.toBeInTheDocument();
  });

  it("không hiện số tiền trên chip vì chỉ tính được trên trang đang tải", () => {
    renderBar(navAll);

    const chip = screen.getByRole("link", { name: /^Ăn uống/ });
    expect(chip).toHaveTextContent("Ăn uống");
    expect(chip).not.toHaveTextContent("8tr");
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 2 danh mục" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("link", { name: /\d đ$/ })).toHaveLength(0);
    expect(within(dialog).getAllByRole("link", { name: /^Quà tặng$/ })).toHaveLength(1);
  });

  it("gõ hai ký tự không gây lần điều hướng nào; submit mới là một lần", () => {
    const { onFilterChange } = renderBar({ ...navAll, filter: { ...EMPTY_TRANSACTION_FILTER, memberIds: ["m1"] } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    const input = screen.getByRole("searchbox", { name: "Tìm giao dịch" });
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.change(input, { target: { value: "cà" } });

    // Input không controlled theo prop nữa nên ký tự không bị revert, và không có callback/điều hướng nào.
    expect(input).toHaveValue("cà");
    expect(onFilterChange).not.toHaveBeenCalled();

    // Điều hướng duy nhất là submit của form GET: đúng một request mang đủ filter đang bật.
    const form = input.closest("form") as HTMLFormElement;
    expect(form).toHaveAttribute("action", "/transactions");
    expect(form).toHaveAttribute("method", "get");
    expect(input).toHaveAttribute("name", "q");
    const hidden = [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((i) => [i.name, i.value]);
    expect(hidden).toEqual([["view", "all"], ["member", "m1"]]);
  });

  it("link không dùng aria-pressed (chỉ hợp lệ với role=button) mà dùng aria-current", () => {
    renderBar({ ...navAll, filter: { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["cat-0"], memberIds: ["m2"] } });

    const activeCategory = screen.getByRole("link", { name: /^Ăn uống/ });
    expect(activeCategory).not.toHaveAttribute("aria-pressed");
    expect(activeCategory).toHaveAttribute("aria-current", "true");
    const idleCategory = screen.getByRole("link", { name: /^Nhà cửa/ });
    expect(idleCategory).not.toHaveAttribute("aria-pressed");
    expect(idleCategory).not.toHaveAttribute("aria-current");

    expect(screen.getByRole("link", { name: /^Linh/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: /^Ân/ })).not.toHaveAttribute("aria-current");
  });

  it("nút ở view tháng vẫn giữ aria-pressed", () => {
    renderBar({ filter: { ...EMPTY_TRANSACTION_FILTER, categoryIds: ["cat-0"] } });
    const chip = screen.getByRole("button", { name: /^Ăn uống/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).not.toHaveAttribute("aria-current");
  });

  it("bỏ từng filter và Xoá hết cũng là Link", () => {
    renderBar({ ...navAll, filter: { categoryIds: ["cat-0"], memberIds: ["m1"], search: "cơm" } });

    expect(screen.getByRole("link", { name: "Bỏ lọc danh mục Ăn uống" })).toHaveAttribute(
      "href",
      "/transactions?view=all&q=c%C6%A1m&member=m1",
    );
    expect(screen.getByRole("link", { name: "Bỏ lọc thành viên Ân" })).toHaveAttribute(
      "href",
      "/transactions?view=all&q=c%C6%A1m&category=cat-0",
    );
    expect(screen.getByRole("link", { name: "Đóng tìm kiếm" })).toHaveAttribute(
      "href",
      "/transactions?view=all&category=cat-0&member=m1",
    );
    expect(screen.getByRole("link", { name: "Xoá hết" })).toHaveAttribute("href", "/transactions?view=all");
    expect(screen.queryByRole("button", { name: "Xoá hết" })).not.toBeInTheDocument();
  });
});
