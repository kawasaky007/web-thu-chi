import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatTransactionDayLabel,
  formatTransactionTime,
  TransactionList,
  VISIBLE_DAY_GROUPS,
} from "@/components/transactions/transaction-list";
import { ToastProvider } from "@/components/ui/toast";
import type { TransactionView } from "@/lib/transactions/data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/transactions/actions", () => ({
  deleteTransactionAction: vi.fn(),
}));

function makeRow(overrides: Partial<TransactionView> = {}): TransactionView {
  return {
    id: "t1",
    householdId: "h1",
    userId: "u1",
    categoryId: "c1",
    type: "expense",
    amount: 50000,
    title: "",
    note: "Phở bò",
    transactionDate: "2020-03-05",
    // Dạng thật của cột `timestamp without time zone`: giờ UTC, không có "Z".
    // 07:32 UTC = 14:32 giờ Việt Nam.
    createdAt: "2020-03-05T07:32:00.123456",
    categoryName: "Ăn uống",
    categoryColor: "#087a5b",
    categoryIcon: "food",
    memberName: "Bạn",
    memberEmail: "ban@example.com",
    canDelete: true,
    ...overrides,
  };
}

function renderList(rows: TransactionView[], props: { showMemberName?: boolean; highlightId?: string | null } = {}) {
  return render(
    <ToastProvider>
      <TransactionList
        highlightId={props.highlightId ?? null}
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        rows={rows}
        showMemberName={props.showMemberName ?? true}
      />
    </ToastProvider>,
  );
}

describe("formatTransactionDayLabel", () => {
  it("trả Hôm nay cho ngày hôm nay", () => {
    expect(formatTransactionDayLabel("2026-11-08", "2026-11-08")).toBe("Hôm nay");
  });

  it("trả Hôm qua cho ngày hôm qua", () => {
    expect(formatTransactionDayLabel("2026-11-07", "2026-11-08")).toBe("Hôm qua");
    expect(formatTransactionDayLabel("2026-02-28", "2026-03-01")).toBe("Hôm qua");
  });

  it("trả ngày dd/mm/yyyy cho ngày xa hơn", () => {
    expect(formatTransactionDayLabel("2026-11-05", "2026-11-08")).toBe("05/11/2026");
  });
});

// created_at là `timestamp without time zone` với `default now()`: Postgres lưu giờ UTC nhưng
// PostgREST trả về chuỗi KHÔNG có offset ("2020-03-05T07:32:00.123456"), và theo spec thì chuỗi
// date-time không offset được parse theo múi giờ MÁY. Trên điện thoại UTC+7 mọi giờ sớm đi 7 tiếng,
// còn giao dịch nhập sau 17:00 UTC thì lệch hẳn sang ngày khác nên giờ bị ẩn mất.
// Vì thế fixture ở đây dùng ĐÚNG dạng cột trả về, không thêm "Z" — thêm "Z" là lý do bộ test cũ
// xanh trong khi sản phẩm sai. Và chạy ở nhiều TZ vì trên TZ=UTC hai cách parse cho cùng kết quả,
// nên một test chỉ chạy ở UTC sẽ không bao giờ phát hiện được lỗi này.
describe("formatTransactionTime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trả null khi createdAt null", () => {
    expect(formatTransactionTime(null, "2020-03-05")).toBeNull();
  });

  it("trả null khi chuỗi không phải thời điểm", () => {
    expect(formatTransactionTime("khong-phai-gio", "2020-03-05")).toBeNull();
  });

  for (const tz of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles", "Pacific/Auckland"]) {
    describe(`TZ=${tz}`, () => {
      beforeEach(() => {
        // Node đọc lại TZ khi gán process.env.TZ, nên stub này thật sự đổi cách Date parse.
        vi.stubEnv("TZ", tz);
      });

      it("đọc chuỗi không offset là UTC, không phải giờ máy", () => {
        expect(formatTransactionTime("2020-03-05T07:32:00", "2020-03-05")).toBe("14:32");
      });

      it("nhận microsecond 6 chữ số như Postgres trả về", () => {
        expect(formatTransactionTime("2020-03-05T07:32:00.123456", "2020-03-05")).toBe("14:32");
      });

      it("nửa đêm là 00:xx, không bao giờ là 24:xx", () => {
        // 17:05 UTC = 00:05 ngày hôm sau ở Việt Nam. hour12: false được một số bản ICU phân giải thành
        // h24 và in "24:05"; giờ trên dòng phụ chính là thứ tính năng này hứa nên không được đọc như vậy.
        expect(formatTransactionTime("2020-03-04T17:05:00", "2020-03-05")).toBe("00:05");
        expect(formatTransactionTime("2020-03-04T17:05:00", "2020-03-05")).not.toMatch(/^24:/);
      });

      it("ẩn giờ khi ngày nhập khác ngày của giao dịch", () => {
        // Nhập muộn cho ngày cũ: "22:10" nằm dưới header "05/03/2020" sẽ bị đọc thành "chi lúc 22:10
        // ngày 5/3", mà 22:10 là giờ NHẬP ngày 20/3. Thà không có giờ hơn là giờ của ngày khác.
        expect(formatTransactionTime("2020-03-20T15:10:00", "2020-03-05")).toBeNull();
      });

      it("so ngày nhập theo giờ Việt Nam, không theo UTC", () => {
        // 17:00 UTC ngày 05 đã là 00:00 ngày 06 ở Việt Nam: tính theo UTC sẽ coi là cùng ngày và hiện giờ.
        expect(formatTransactionTime("2020-03-05T17:00:00", "2020-03-05")).toBeNull();
        expect(formatTransactionTime("2020-03-05T16:59:00", "2020-03-05")).toBe("23:59");
      });

      it("cột transaction_date có phần giờ thì vẫn so theo phần ngày của nó", () => {
        expect(formatTransactionTime("2020-03-05T07:32:00", "2020-03-05T00:00:00")).toBe("14:32");
      });

      it("không phá chuỗi đã có offset sẵn", () => {
        // Nối "Z" vào chuỗi đã có offset cho ra Invalid Date, nên phải nhận ra offset rồi bỏ qua.
        expect(formatTransactionTime("2020-03-05T07:32:00.000Z", "2020-03-05")).toBe("14:32");
        expect(formatTransactionTime("2020-03-05T14:32:00+07:00", "2020-03-05")).toBe("14:32");
        expect(formatTransactionTime("2020-03-04T23:32:00-08:00", "2020-03-05")).toBe("14:32");
      });
    });
  }
});

describe("TransactionList", () => {
  it("dòng chính là tên danh mục, không phải tên thành viên", () => {
    renderList([makeRow()], { showMemberName: false });
    const primary = screen.getByText("Ăn uống");
    expect(primary.className).toContain("font-extrabold");
    expect(screen.queryByText("Bạn")).not.toBeInTheDocument();
  });

  it("dòng phụ hiện giờ và ghi chú, không lặp lại ngày của header nhóm", () => {
    renderList([makeRow()]);
    expect(screen.getByText("14:32 · Phở bò")).toBeInTheDocument();
    // "05/03/2020" chỉ xuất hiện đúng 1 lần: ở header nhóm.
    expect(screen.getAllByText(/05\/03\/2020/)).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "05/03/2020" })).toBeInTheDocument();
  });

  it("dòng nhập muộn cho ngày cũ chỉ còn ghi chú, không có giờ của ngày khác", () => {
    renderList([makeRow({ createdAt: "2020-03-20T15:10:00" })]);
    expect(screen.getByText("Phở bò")).toBeInTheDocument();
    expect(screen.queryByText(/22:10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("ẩn tên thành viên khi showMemberName false", () => {
    renderList([makeRow()], { showMemberName: false });
    expect(screen.queryByText("Bạn")).not.toBeInTheDocument();
  });

  it("hiện tên thành viên khi showMemberName true", () => {
    renderList([makeRow()], { showMemberName: true });
    expect(screen.getByText("Bạn")).toBeInTheDocument();
  });

  it("nhóm theo ngày và hiện tổng chênh lệch của ngày đó", () => {
    renderList([
      makeRow({ id: "a", amount: 100000, type: "income", categoryName: "Lương" }),
      makeRow({ id: "b", amount: 30000, type: "expense" }),
      makeRow({ id: "c", transactionDate: "2020-03-04", amount: 20000 }),
    ]);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["05/03/2020", "04/03/2020"]);
    const firstCard = screen.getByRole("heading", { name: "05/03/2020" }).closest("div")!.parentElement!;
    expect(within(firstCard).getByText("+70.000 đ")).toBeInTheDocument();
    // Nhóm 04/03 chỉ có 1 khoản chi: tổng nhóm và số tiền của dòng đều là -20.000 đ.
    expect(screen.getAllByText("-20.000 đ")).toHaveLength(2);
  });

  it("dùng nhãn Hôm nay theo giờ Việt Nam, không theo múi giờ máy chạy", () => {
    // Test cũ tính "today" bằng CHÍNH biểu thức của implementation rồi so hai bên với nhau: đổi sai
    // múi giờ thì cả hai sai cùng nhau và test vẫn xanh. Ở đây mốc thời gian và nhãn đều là chữ thật.
    // 17:30 UTC ngày 08 đã là 00:30 ngày 09 ở Việt Nam.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T17:30:00.000Z"));
    try {
      renderList([
        makeRow({ id: "n", transactionDate: "2026-11-09" }),
        makeRow({ id: "p", transactionDate: "2026-11-08" }),
      ]);
      expect(screen.getByRole("heading", { name: "Hôm nay" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Hôm qua" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "09/11/2026" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TransactionList — render từng phần", () => {
  // 120 ngày, mỗi ngày một khoản: mỗi dòng mang theo một <form> + ConfirmDialog + ~10 hook, nên render
  // hết ngay là hàng nghìn hook phải đối chiếu lại mỗi lần gõ một ký tự.
  function manyDays(count: number) {
    return Array.from({ length: count }, (_, index) => {
      const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
      return makeRow({ id: `d${index}`, transactionDate: day, createdAt: `${day}T07:00:00`, amount: 1000 });
    });
  }

  it("chỉ render lát đầu tiên khi có nhiều nhóm ngày", () => {
    renderList(manyDays(120));
    expect(screen.getAllByRole("heading")).toHaveLength(VISIBLE_DAY_GROUPS);
    expect(screen.getByRole("button", { name: /^Hiện thêm/ })).toBeInTheDocument();
  });

  it("Hiện thêm mở thêm nhóm ngày, không cần round-trip", () => {
    renderList(manyDays(120));
    fireEvent.click(screen.getByRole("button", { name: /^Hiện thêm/ }));
    expect(screen.getAllByRole("heading")).toHaveLength(VISIBLE_DAY_GROUPS * 2);

    fireEvent.click(screen.getByRole("button", { name: /^Hiện thêm/ }));
    expect(screen.getAllByRole("heading")).toHaveLength(120);
    expect(screen.queryByRole("button", { name: /^Hiện thêm/ })).not.toBeInTheDocument();
  });

  it("ít nhóm hơn một lát thì không có nút Hiện thêm", () => {
    renderList(manyDays(3));
    expect(screen.getAllByRole("heading")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^Hiện thêm/ })).not.toBeInTheDocument();
  });
});

describe("TransactionList highlight", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuộn tới và tô sáng dòng khớp highlightId", () => {
    const { container } = renderList([makeRow({ id: "a" }), makeRow({ id: "b", categoryName: "Đi lại" })], {
      highlightId: "b",
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".bg-yellow\\/25")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelectorAll(".bg-yellow\\/25")).toHaveLength(0);
  });
});
