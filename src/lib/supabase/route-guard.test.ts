import { describe, expect, it } from "vitest";

import { decideRoute, sanitizeNextPath } from "./route-guard";

describe("decideRoute", () => {
  it("chuyển khách chưa đăng nhập về login và giữ đường dẫn đích", () => {
    expect(
      decideRoute({
        pathname: "/transactions",
        search: "?month=7&year=2026",
        isAuthenticated: false,
      }),
    ).toEqual({
      type: "redirect",
      location: "/login?next=%2Ftransactions%3Fmonth%3D7%26year%3D2026",
    });
  });

  it("cho phép callback auth đi qua khi chưa có session", () => {
    expect(
      decideRoute({ pathname: "/auth/callback", isAuthenticated: false }),
    ).toEqual({ type: "allow" });
  });

  it("bảo vệ route onboarding khi session đã mất", () => {
    expect(
      decideRoute({ pathname: "/onboarding", isAuthenticated: false }),
    ).toEqual({
      type: "redirect",
      location: "/login?next=%2Fonboarding",
    });
  });

  it("bảo vệ trang sao lưu và giữ đường dẫn quay lại", () => {
    expect(decideRoute({ pathname: "/backup", isAuthenticated: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Fbackup",
    });
  });

  it("bảo vệ trang giao dịch định kỳ", () => {
    expect(decideRoute({ pathname: "/recurring", isAuthenticated: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Frecurring",
    });
  });

  it("bảo vệ trang mục tiêu tiết kiệm", () => {
    expect(decideRoute({ pathname: "/goals", isAuthenticated: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Fgoals",
    });
  });

  it("chuyển người đã đăng nhập khỏi trang login", () => {
    expect(decideRoute({ pathname: "/login", isAuthenticated: true })).toEqual({
      type: "redirect",
      location: "/",
    });
  });
});

describe("sanitizeNextPath", () => {
  it("giữ đường dẫn nội bộ hợp lệ", () => {
    expect(sanitizeNextPath("/budgets?month=7")).toBe("/budgets?month=7");
  });

  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "javascript:alert(1)",
  ])("từ chối redirect ra ngoài: %s", (value) => {
    expect(sanitizeNextPath(value)).toBe("/");
  });
});
