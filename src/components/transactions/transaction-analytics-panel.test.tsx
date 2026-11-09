import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionAnalyticsPanel } from "@/components/transactions/transaction-analytics-panel";
import type { CategoryAnalytics, MemberAnalytics, TransactionAnalytics } from "@/lib/transactions/analytics";
import { DELETED_CATEGORY_ID } from "@/lib/transactions/filters";

function category(overrides: Partial<CategoryAnalytics> & Pick<CategoryAnalytics, "categoryId" | "name">): CategoryAnalytics {
  return {
    color: "#ef4444",
    icon: "utensils",
    count: 5,
    amount: 2000000,
    percent: 0.5,
    previousAmount: 1000000,
    deltaRatio: 1,
    deltaKind: "ratio",
    deltaLabel: "↑100%",
    ...overrides,
  };
}

function member(overrides: Partial<MemberAnalytics> & Pick<MemberAnalytics, "userId" | "name">): MemberAnalytics {
  return {
    count: 3,
    amount: 1500000,
    percent: 0.4,
    previousAmount: 1500000,
    deltaRatio: 0,
    deltaKind: "unchanged",
    deltaLabel: "không đổi",
    ...overrides,
  };
}

const BASE: TransactionAnalytics = {
  scopeLabel: "Ăn uống, Mua sắm · Minh Thư",
  scopeCount: 23,
  monthCount: 71,
  income: 0,
  expense: 3460000,
  incomeInScope: true,
  expenseInScope: true,
  filtered: true,
  previous: { income: 0, expense: 3000000 },
  comparable: true,
  categories: [
    category({ categoryId: "c1", name: "Ăn uống", amount: 2000000, percent: 0.58 }),
    category({ categoryId: "c2", name: "Mua sắm", amount: 1460000, percent: 0.42, deltaKind: "none", deltaLabel: null, previousAmount: null, deltaRatio: null }),
  ],
  members: [member({ userId: "u1", name: "Minh Thư" })],
  alerts: [],
};

type Props = Partial<React.ComponentProps<typeof TransactionAnalyticsPanel>>;

function renderPanel(analytics: Partial<TransactionAnalytics> = {}, props: Props = {}) {
  const onPanelTypeChange = vi.fn();
  const onToggleCategory = vi.fn();
  render(
    <TransactionAnalyticsPanel
      analytics={{ ...BASE, ...analytics }}
      onPanelTypeChange={onPanelTypeChange}
      onToggleCategory={onToggleCategory}
      panelType="expense"
      selectedCategoryIds={[]}
      {...props}
    />,
  );
  return { onPanelTypeChange, onToggleCategory };
}

describe("TransactionAnalyticsPanel", () => {
  it("header hiện scopeCount và scopeLabel", () => {
    renderPanel();
    // Mỗi phần là một phần tử lá riêng nên getByText khớp được; cả hai cùng nằm trong một header.
    expect(screen.getByText("ĐANG TÍNH TRÊN 23 KHOẢN")).toBeInTheDocument();
    expect(screen.getByText("Ăn uống, Mua sắm · Minh Thư")).toBeInTheDocument();
  });

  it("header gắn nhãn phạm vi vào cùng nhóm với công tắc Chi/Thu", () => {
    renderPanel();
    const header = screen.getByRole("group", { name: "Phạm vi phân tích: ĐANG TÍNH TRÊN 23 KHOẢN, Ăn uống, Mua sắm · Minh Thư" });
    expect(within(header).getByRole("button", { name: "Thu" })).toBeInTheDocument();
  });

  it("bấm công tắc Thu gọi onPanelTypeChange với income", () => {
    const { onPanelTypeChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Thu" }));
    expect(onPanelTypeChange).toHaveBeenCalledWith("income");
  });

  it("bấm công tắc Chi gọi onPanelTypeChange với expense", () => {
    const { onPanelTypeChange } = renderPanel({}, { panelType: "income" });
    fireEvent.click(screen.getByRole("button", { name: "Chi" }));
    expect(onPanelTypeChange).toHaveBeenCalledWith("expense");
  });

  it("bấm thanh một danh mục gọi onToggleCategory với id đó", () => {
    const { onToggleCategory } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Ăn uống/ }));
    expect(onToggleCategory).toHaveBeenCalledWith("c1");
  });

  it("danh mục đã xoá truyền DELETED_CATEGORY_ID dạng string", () => {
    const { onToggleCategory } = renderPanel({
      categories: [category({ categoryId: DELETED_CATEGORY_ID, name: "Danh mục đã xoá" })],
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Danh mục đã xoá/ }));
    });
    expect(onToggleCategory).toHaveBeenCalledWith(DELETED_CATEGORY_ID);
  });

  it("thanh danh mục đang được chọn có trạng thái nhấn", () => {
    renderPanel({}, { selectedCategoryIds: ["c1"] });
    expect(screen.getByRole("button", { name: /^Ăn uống/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Mua sắm/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("hiện deltaLabel của từng danh mục khi có", () => {
    renderPanel();
    const row = screen.getByRole("button", { name: /^Ăn uống/ });
    expect(within(row).getByText("↑100%")).toBeInTheDocument();
    expect(within(row).getByText("2.000.000 đ")).toBeInTheDocument();
    // Danh mục không có deltaLabel thì không bịa nhãn.
    const plain = screen.getByRole("button", { name: /^Mua sắm/ });
    expect(within(plain).queryByText(/↑|↓|mới|hết|không đổi/)).not.toBeInTheDocument();
  });

  it("hiện bảng theo thành viên", () => {
    renderPanel();
    const section = screen.getByRole("region", { name: "Theo thành viên" });
    expect(within(section).getByText("Minh Thư")).toBeInTheDocument();
    expect(within(section).getByText("1.500.000 đ")).toBeInTheDocument();
    expect(within(section).getByText("không đổi")).toBeInTheDocument();
  });

  it("hiện các cảnh báo trong analytics.alerts", () => {
    renderPanel({
      alerts: [
        { kind: "budget-exceeded", categoryId: "c1", message: "Ăn uống vượt ngân sách", severity: "warning" },
        { kind: "biggest-increase", categoryId: "c2", message: "Mua sắm tăng nhiều nhất", severity: "info" },
      ],
    });
    expect(screen.getByText("Ăn uống vượt ngân sách")).toBeInTheDocument();
    expect(screen.getByText("Mua sắm tăng nhiều nhất")).toBeInTheDocument();
  });

  it("không hiện khối cảnh báo khi alerts rỗng", () => {
    renderPanel();
    expect(screen.queryByRole("region", { name: "Cảnh báo" })).not.toBeInTheDocument();
  });

  it("hiện empty state khi categories rỗng", () => {
    renderPanel({ categories: [], members: [] });
    expect(screen.getByText("Chưa có dữ liệu")).toBeInTheDocument();
  });

  it("gập được: bấm header ẩn phần thân, mặc định mở", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /^Ăn uống/ })).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /ĐANG TÍNH TRÊN 23 KHOẢN/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Ăn uống/ })).not.toBeInTheDocument();
    // Phạm vi vẫn hiện khi gập để con số không bao giờ mất ngữ cảnh.
    expect(screen.getByText("Ăn uống, Mua sắm · Minh Thư")).toBeInTheDocument();
  });

  describe("hàng bằng 0 (gone)", () => {
    const gone = (n: number) =>
      category({ categoryId: `g${n}`, name: `Cũ ${n}`, amount: 0, count: 0, percent: 0, previousAmount: 500000, deltaRatio: -1, deltaKind: "gone", deltaLabel: "hết" });

    it("chỉ hiện tối đa 3 hàng gone, nằm dưới dấu ngăn, không có thanh", () => {
      renderPanel({ categories: [...BASE.categories, gone(1), gone(2), gone(3), gone(4), gone(5)] });
      expect(screen.getByRole("button", { name: /Cũ 1/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cũ 3/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cũ 4/ })).not.toBeInTheDocument();
      expect(screen.getByRole("separator")).toBeInTheDocument();
      expect(screen.getAllByTestId("category-bar")).toHaveLength(2);
      expect(within(screen.getByRole("button", { name: /Cũ 1/ })).getByText("hết")).toBeInTheDocument();
    });

    it("không có dấu ngăn khi không có hàng gone", () => {
      renderPanel();
      expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    });

    it("chỉ toàn hàng gone vẫn hiển thị, không coi là rỗng", () => {
      renderPanel({ categories: [gone(1)] });
      expect(screen.getByRole("button", { name: /Cũ 1/ })).toBeInTheDocument();
      expect(screen.queryByText("Chưa có dữ liệu")).not.toBeInTheDocument();
    });
  });
});
