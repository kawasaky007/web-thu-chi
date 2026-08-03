import { describe, expect, it } from "vitest";

import { currentVietnamDate, describeRecurringSchedule, isRuleDue } from "./data";

describe("recurring data helpers", () => {
  it("lấy ngày hiện tại theo múi giờ Việt Nam", () => {
    expect(currentVietnamDate(new Date("2026-08-03T17:30:00Z"))).toBe("2026-08-04");
  });

  it("mô tả chu kỳ tuần và tháng bằng tiếng Việt", () => {
    expect(describeRecurringSchedule({ frequency: "weekly", intervalCount: 1, dayOfWeek: 1, dayOfMonth: null })).toBe("Hàng tuần vào thứ Hai");
    expect(describeRecurringSchedule({ frequency: "monthly", intervalCount: 3, dayOfWeek: null, dayOfMonth: 31 })).toBe("Mỗi 3 tháng vào ngày 31");
  });

  it("chỉ coi rule là đến hạn trước ngày kết thúc", () => {
    expect(isRuleDue({ nextDueDate: "2026-08-03", endDate: null }, "2026-08-03")).toBe(true);
    expect(isRuleDue({ nextDueDate: "2026-08-03", endDate: "2026-08-02" }, "2026-08-03")).toBe(false);
  });
});
