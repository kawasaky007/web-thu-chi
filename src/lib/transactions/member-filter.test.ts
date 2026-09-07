import { describe, expect, it } from "vitest";

import { buildTransactionsHref, parseMemberFilterParam, toggleMemberFilter } from "./member-filter";

describe("toggleMemberFilter", () => {
  it("thêm thành viên chưa được chọn vào danh sách lọc", () => {
    expect(toggleMemberFilter([], "member-1")).toEqual(["member-1"]);
    expect(toggleMemberFilter(["member-1"], "member-2")).toEqual(["member-1", "member-2"]);
  });

  it("bỏ chọn thành viên đã có trong danh sách lọc", () => {
    expect(toggleMemberFilter(["member-1", "member-2"], "member-1")).toEqual(["member-2"]);
  });
});

describe("parseMemberFilterParam", () => {
  it.each([
    [undefined, []],
    [null, []],
    ["", []],
    ["member-1", ["member-1"]],
    ["member-1,member-2", ["member-1", "member-2"]],
    [" member-1 , member-2 ", ["member-1", "member-2"]],
    ["member-1,member-1,member-2", ["member-1", "member-2"]],
    ["member-1,,member-2", ["member-1", "member-2"]],
  ])("phân tích tham số member=%s thành %s", (value, expected) => {
    expect(parseMemberFilterParam(value)).toEqual(expected);
  });
});

describe("buildTransactionsHref", () => {
  it("dựng href theo tháng, không kèm tham số member khi chưa chọn ai", () => {
    const href = buildTransactionsHref({ view: "month", month: "2026-08", search: "", memberIds: [] });
    expect(href).toBe("/transactions?month=2026-08");
    expect(href).not.toContain("member=");
  });

  it("dựng href giữ view=all khi đang xem tất cả", () => {
    const href = buildTransactionsHref({ view: "all", month: "2026-08", search: "", memberIds: [] });
    expect(href).toBe("/transactions?view=all");
  });

  it("dựng href kèm từ khóa tìm kiếm", () => {
    const href = buildTransactionsHref({ view: "month", month: "2026-08", search: "cà phê", memberIds: [] });
    expect(href).toBe(`/transactions?${new URLSearchParams({ month: "2026-08", q: "cà phê" }).toString()}`);
  });

  it("dựng href kèm danh sách thành viên đã chọn", () => {
    const href = buildTransactionsHref({
      view: "month",
      month: "2026-08",
      search: "",
      memberIds: ["member-1", "member-2"],
    });
    expect(href).toBe(
      `/transactions?${new URLSearchParams({ month: "2026-08", member: "member-1,member-2" }).toString()}`,
    );
  });

  it("kết hợp cả tìm kiếm và thành viên cùng lúc", () => {
    const href = buildTransactionsHref({
      view: "all",
      month: "2026-08",
      search: "chợ",
      memberIds: ["member-1"],
    });
    expect(href).toBe(
      `/transactions?${new URLSearchParams({ view: "all", q: "chợ", member: "member-1" }).toString()}`,
    );
  });
});
