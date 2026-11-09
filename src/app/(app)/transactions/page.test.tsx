import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TransactionsPage from "@/app/(app)/transactions/page";
import type { TransactionsManager } from "@/components/transactions/transaction-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  currentVietnamMonth,
  getTransactionFormOptions,
  getTransactionsAllData,
  getTransactionsMonthData,
  type CategoryOption,
  type MemberOption,
} from "@/lib/transactions/data";
import { DELETED_CATEGORY_ID } from "@/lib/transactions/filters";

vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
}));

// Chỉ thay 3 hàm truy vấn; currentVietnamMonth phải là bản thật vì test so với tháng hiện tại.
vi.mock("@/lib/transactions/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transactions/data")>();
  return {
    ...actual,
    getTransactionFormOptions: vi.fn(),
    getTransactionsMonthData: vi.fn(),
    getTransactionsAllData: vi.fn(),
  };
});

const CATEGORIES: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#0a7", icon: "food", sortOrder: 1 },
];
const MEMBERS: MemberOption[] = [{ id: "user-1", name: "An", email: "an@example.com" }];
// Client thật không được dùng ở đây: chỉ cần một vật thể để kiểm chứng page truyền nó xuống đúng hàm.
const SUPABASE = {} as Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ManagerProps = ComponentProps<typeof TransactionsManager>;

async function renderPage(params: Record<string, string>) {
  const element = await TransactionsPage({ searchParams: Promise.resolve(params) });
  return element as ReactElement<ManagerProps>;
}

beforeEach(() => {
  // restoreMocks của vitest chỉ phục hồi spy; mock dựng bằng vi.fn() vẫn giữ lịch sử gọi.
  vi.clearAllMocks();
  vi.mocked(createServerSupabaseClient).mockResolvedValue(SUPABASE);
  vi.mocked(getCurrentMembership).mockResolvedValue({
    userId: "user-1",
    profile: { household_id: "h1" },
  } as unknown as Awaited<ReturnType<typeof getCurrentMembership>>);
  vi.mocked(getTransactionFormOptions).mockResolvedValue({ categories: CATEGORIES, members: MEMBERS });
  vi.mocked(getTransactionsMonthData).mockResolvedValue({
    categories: CATEGORIES,
    members: MEMBERS,
    current: { rows: [], truncated: false },
    previous: null,
    budgetLimits: null,
  });
  vi.mocked(getTransactionsAllData).mockResolvedValue({
    categories: CATEGORIES,
    members: MEMBERS,
    rows: [],
    nextCursor: null,
    hasMore: false,
  });
});

describe("TransactionsPage", () => {
  it("page truyền filter xuống getTransactionsAllData thay vì lọc sau", async () => {
    // Lỗi #2/#4: trước đây search và phân trang chạy sau khi đã cắt 30 dòng ở client.
    await renderPage({ view: "all", q: "cà phê", category: "food", member: "user-1", cursor: "c1" });

    expect(getTransactionsAllData).toHaveBeenCalledWith(expect.anything(), {
      householdId: "h1",
      currentUserId: "user-1",
      cursor: "c1",
      filter: { categoryIds: ["food"], memberIds: ["user-1"], search: "cà phê" },
      // Danh mục/thành viên đã fetch để làm sạch id được truyền lại, không query lần hai.
      formOptions: { categories: CATEGORIES, members: MEMBERS },
    });
    expect(getTransactionFormOptions).toHaveBeenCalledTimes(1);
  });

  it("bỏ qua id danh mục không tồn tại trong URL", async () => {
    const element = await renderPage({ month: "2026-11", category: "food,ghost", member: "user-1,ghost" });

    expect(element.props.initialFilter).toEqual({ categoryIds: ["food"], memberIds: ["user-1"], search: "" });
  });

  it("giữ được filter danh mục đã xoá từ URL", async () => {
    const element = await renderPage({ month: "2026-11", category: DELETED_CATEGORY_ID });

    expect(element.props.initialFilter.categoryIds).toEqual([DELETED_CATEGORY_ID]);
  });

  it("tháng sai định dạng rơi về tháng hiện tại thay vì trang lỗi", async () => {
    const element = await renderPage({ month: "rác" });

    expect(getTransactionsMonthData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ month: currentVietnamMonth() }),
    );
    expect(element.props.month).toBe(currentVietnamMonth());
  });

  it("giữ deep link highlight, new=1 và panel=income", async () => {
    const element = await renderPage({ month: "2026-11", highlight: "tx-9", new: "1", panel: "income" });

    expect(element.props.highlightId).toBe("tx-9");
    expect(element.props.openNew).toBe(true);
    expect(element.props.initialPanelType).toBe("income");
  });

  it("key của manager đổi khi filter từ server đổi, để state filter cũ không sống sót", async () => {
    // Lỗi đã gặp: chuyển "Tất cả" → "Tháng" mang category trong URL, nhưng state filter cũ của
    // manager vẫn sống nên danh sách hiện như không lọc gì, rồi effect chiếu URL xoá luôn param.
    const all = await renderPage({ view: "all", category: "food" });
    const month = await renderPage({ month: "2026-11", category: "food" });
    const monthNoFilter = await renderPage({ month: "2026-11" });

    expect(all.key).not.toBe(month.key);
    expect(month.key).not.toBe(monthNoFilter.key);
    // Cùng filter thì cùng key: lọc trong view tháng không được làm manager remount.
    expect((await renderPage({ month: "2026-11" })).key).toBe(monthNoFilter.key);
  });
});
