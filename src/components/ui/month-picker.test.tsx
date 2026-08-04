import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonthPicker } from "./month-picker";

describe("MonthPicker", () => {
  it("hiển thị lưới tháng và tạo đúng đường dẫn", () => {
    render(<MonthPicker hrefForMonth={(month) => `/transactions?month=${month}&q=coffee`} month="2026-08" />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn tháng" }));

    expect(screen.getByRole("heading", { name: "Chọn tháng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tháng 8" })).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("link", { name: "Tháng 10" })).toHaveAttribute("href", "/transactions?month=2026-10&q=coffee");
  });

  it("cho phép chuyển năm và đóng bằng phím Escape", () => {
    render(<MonthPicker hrefForMonth={(month) => `/?month=${month}`} month="2026-08" />);
    const trigger = screen.getByRole("button", { name: "Chọn tháng" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Năm 2027" }));
    expect(screen.getByRole("link", { name: "Tháng 1" })).toHaveAttribute("href", "/?month=2027-01");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Chọn tháng" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
