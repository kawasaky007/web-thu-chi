import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppLoading } from "./app-loading";

describe("AppLoading", () => {
  it("hiển thị trạng thái tải có thể đọc được", () => {
    render(<AppLoading label="Đang tải giao dịch" />);

    expect(screen.getByRole("main", { name: "Đang tải ứng dụng" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải giao dịch");
    expect(screen.getByRole("heading", { name: "Thu Chi Gia Đình" })).toBeInTheDocument();
  });
});
