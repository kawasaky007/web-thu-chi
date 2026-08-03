import { describe, expect, it } from "vitest";

import { parseSavingsReport } from "./data";

describe("parseSavingsReport", () => {
  it("chuẩn hóa aggregate và ledger gần nhất", () => {
    const report = parseSavingsReport({
      today: "2026-08-03",
      goals: [{
        id: "goal-1",
        name: "Quỹ khẩn cấp",
        kind: "emergency",
        targetAmount: 100000000,
        targetDate: null,
        color: "#1F3D2B",
        icon: "shield",
        status: "active",
        createdAt: "2026-08-03T00:00:00Z",
        currentAmount: 25000000,
        entryCount: 2,
        recentEntries: [{ id: "entry-1", entryType: "deposit", amount: 25000000, entryDate: "2026-08-03", userId: "user-1", memberName: "An" }],
      }],
    });
    expect(report.goals[0]).toEqual(expect.objectContaining({ currentAmount: 25000000, remainingAmount: 75000000, progress: 0.25 }));
    expect(report.goals[0].recentEntries).toHaveLength(1);
  });

  it("fail closed với payload lạ", () => {
    expect(parseSavingsReport(null).goals).toEqual([]);
    expect(parseSavingsReport({ goals: [{ id: 1 }] }).goals).toEqual([]);
  });
});
