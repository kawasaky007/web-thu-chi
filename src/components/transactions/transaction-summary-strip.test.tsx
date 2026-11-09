import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { capBannerCopy, TransactionSummaryStrip } from "@/components/transactions/transaction-summary-strip";
import type { TransactionAnalytics } from "@/lib/transactions/analytics";
import { MONTH_ROW_CAP } from "@/lib/transactions/data";

// Dẫn ra từ chính MONTH_ROW_CAP để đổi trần là đổi cả kỳ vọng, không phải sửa hai chỗ bằng tay.
const CAP_COUNT = new Intl.NumberFormat("vi-VN").format(MONTH_ROW_CAP);
const CAP_COPY = `Tháng này có hơn ${CAP_COUNT} giao dịch. Số liệu tính trên ${CAP_COUNT} khoản gần nhất.`;

const BASE: TransactionAnalytics = {
  scopeLabel: "Toàn bộ tháng",
  scopeCount: 23,
  monthCount: 71,
  income: 10000000,
  expense: 4000000,
  incomeInScope: true,
  expenseInScope: true,
  filtered: false,
  previous: { income: 10000000, expense: 5000000 },
  comparable: true,
  categories: [],
  members: [],
  alerts: [],
};

function renderStrip(overrides: Partial<TransactionAnalytics> = {}, truncated = false) {
  return render(<TransactionSummaryStrip analytics={{ ...BASE, ...overrides }} truncated={truncated} />);
}

describe("TransactionSummaryStrip", () => {
  it("hiện ba ô Chi, Thu và Số khoản", () => {
    renderStrip();
    expect(screen.getByText("Chi")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Số khoản")).toBeInTheDocument();
    expect(screen.getByText("4.000.000 đ")).toBeInTheDocument();
    expect(screen.getByText("10.000.000 đ")).toBeInTheDocument();
  });

  it("ô Số khoản hiện scopeCount trên monthCount", () => {
    renderStrip();
    // Câu nằm trên nhiều span nên assert theo tên truy cập của ô và từng phần lá.
    const cell = screen.getByRole("group", { name: "Số khoản: 23 / 71 cả tháng" });
    expect(within(cell).getByText("23")).toBeInTheDocument();
    expect(within(cell).getByText("/ 71 cả tháng")).toBeInTheDocument();
  });

  it("hiện ngoài bộ lọc thay vì số 0 khi incomeInScope false", () => {
    renderStrip({ incomeInScope: false, income: 0, filtered: true });
    const cell = screen.getByRole("group", { name: /^Thu:/ });
    expect(within(cell).getByText("ngoài bộ lọc")).toBeInTheDocument();
    expect(within(cell).queryByText("0 đ")).not.toBeInTheDocument();
  });

  it("hiện ngoài bộ lọc cho Chi khi expenseInScope false", () => {
    renderStrip({ expenseInScope: false, expense: 0, filtered: true });
    const cell = screen.getByRole("group", { name: /^Chi:/ });
    expect(within(cell).getByText("ngoài bộ lọc")).toBeInTheDocument();
    expect(within(cell).queryByText("0 đ")).not.toBeInTheDocument();
  });

  it("hiện số 0 khi không lọc gì và tháng thật sự không có thu nhập", () => {
    renderStrip({ income: 0, filtered: false, previous: { income: 0, expense: 5000000 } });
    const cell = screen.getByRole("group", { name: /^Thu:/ });
    expect(within(cell).getByText("0 đ")).toBeInTheDocument();
    expect(within(cell).queryByText("ngoài bộ lọc")).not.toBeInTheDocument();
    expect(within(cell).queryByText("0 trong phạm vi")).not.toBeInTheDocument();
  });

  it("hiện 0 trong phạm vi khi đang lọc mà phạm vi không có khoản thu nào", () => {
    // Lọc đúng một thành viên không có thu nhập: "Thu 0 đ" dễ bị đọc thành "tháng này không có thu nhập",
    // hai chuyện khác nhau. incomeInScope vẫn true vì filter không loại loại thu nào.
    renderStrip({ income: 0, filtered: true, incomeInScope: true, previous: null, comparable: false });
    const cell = screen.getByRole("group", { name: "Thu: 0 trong phạm vi" });
    expect(within(cell).getByText("0 trong phạm vi")).toBeInTheDocument();
    expect(within(cell).queryByText("0 đ")).not.toBeInTheDocument();
    expect(within(cell).queryByText("ngoài bộ lọc")).not.toBeInTheDocument();
  });

  it("đang lọc mà vẫn có tiền thì hiện số thật, không hiện 0 trong phạm vi", () => {
    renderStrip({ filtered: true });
    expect(screen.getByRole("group", { name: /^Thu: 10\.000\.000 đ/ })).toBeInTheDocument();
    expect(screen.queryByText("0 trong phạm vi")).not.toBeInTheDocument();
  });

  it("hiện delta so tháng trước khi comparable true", () => {
    renderStrip();
    const expenseCell = screen.getByRole("group", { name: /^Chi:/ });
    expect(within(expenseCell).getByText("↓20% so tháng trước")).toBeInTheDocument();
    const incomeCell = screen.getByRole("group", { name: /^Thu:/ });
    expect(within(incomeCell).getByText("không đổi so tháng trước")).toBeInTheDocument();
    expect(screen.queryByText("không đủ dữ liệu so sánh")).not.toBeInTheDocument();
  });

  it("không chia cho 0 khi tháng trước bằng 0", () => {
    renderStrip({ previous: { income: 0, expense: 0 } });
    const expenseCell = screen.getByRole("group", { name: /^Chi:/ });
    expect(within(expenseCell).getByText("mới so tháng trước")).toBeInTheDocument();
  });

  it("hiện hết (khớp analytics) khi tháng này bằng 0 mà tháng trước có số", () => {
    renderStrip({ expense: 0, previous: { income: 10000000, expense: 5000000 } });
    const cell = screen.getByRole("group", { name: /^Chi:/ });
    expect(within(cell).getByText("hết so tháng trước")).toBeInTheDocument();
    expect(within(cell).queryByText(/100%/)).not.toBeInTheDocument();
  });

  it("ô ngoài bộ lọc không có delta dù comparable true", () => {
    renderStrip({ incomeInScope: false, income: 0, filtered: true });
    const cell = screen.getByRole("group", { name: /^Thu:/ });
    expect(within(cell).queryByText(/so tháng trước/)).not.toBeInTheDocument();
  });

  it("ẩn delta và ghi không đủ dữ liệu so sánh khi comparable false", () => {
    renderStrip({ comparable: false });
    expect(screen.getByText("không đủ dữ liệu so sánh")).toBeInTheDocument();
    expect(screen.queryByText(/so tháng trước/)).not.toBeInTheDocument();
  });

  it("ẩn delta khi comparable false dù previous còn dữ liệu một phần", () => {
    renderStrip({ comparable: false, previous: { income: 1, expense: 1 } });
    expect(screen.queryByText(/↑|↓|mới/)).not.toBeInTheDocument();
  });

  it("hiện banner cap khi truncated true", () => {
    renderStrip({}, true);
    expect(screen.getByRole("status")).toHaveTextContent(CAP_COPY);
    expect(screen.getByText(CAP_COPY)).toBeInTheDocument();
  });

  it("không hiện banner khi truncated false", () => {
    renderStrip({}, false);
    expect(screen.queryByText(CAP_COPY)).not.toBeInTheDocument();
  });

  it("câu banner dựng từ trần dòng nên đổi trần là đổi câu", () => {
    // Trước đây câu được viết tay "1.500": đổi MONTH_ROW_CAP thành 2000 thì banner vẫn nói 1.500
    // và không test nào đỏ. Kỳ vọng dưới đây là chữ thật, không dẫn từ hằng.
    expect(capBannerCopy(2000)).toBe("Tháng này có hơn 2.000 giao dịch. Số liệu tính trên 2.000 khoản gần nhất.");
    renderStrip({}, true);
    expect(screen.getByRole("status")).toHaveTextContent(capBannerCopy(MONTH_ROW_CAP));
  });
});
