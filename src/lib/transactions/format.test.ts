import { describe, expect, it } from "vitest";

import { formatCompactMoney } from "@/lib/transactions/format";

describe("formatCompactMoney", () => {
  it("dưới 1.000 giữ nguyên số", () => {
    expect(formatCompactMoney(0)).toBe("0");
    expect(formatCompactMoney(999)).toBe("999");
  });

  it("từ 1.000 dùng k", () => {
    expect(formatCompactMoney(1000)).toBe("1k");
    expect(formatCompactMoney(850_000)).toBe("850k");
  });

  it("từ 1.000.000 dùng tr với một số lẻ, dấu phẩy", () => {
    expect(formatCompactMoney(1_000_000)).toBe("1tr");
    expect(formatCompactMoney(3_400_000)).toBe("3,4tr");
  });

  it("bỏ ,0 thừa", () => {
    expect(formatCompactMoney(8_000_000)).toBe("8tr");
    expect(formatCompactMoney(1_000_000_000)).toBe("1 tỷ");
  });

  it("từ 1.000.000.000 dùng tỷ", () => {
    expect(formatCompactMoney(1_200_000_000)).toBe("1,2 tỷ");
  });

  it("làm tròn chứ không cắt", () => {
    expect(formatCompactMoney(3_460_000)).toBe("3,5tr");
    expect(formatCompactMoney(850_600)).toBe("851k");
    expect(formatCompactMoney(999_999_999)).toBe("1 tỷ");
    expect(formatCompactMoney(999_600)).toBe("1tr");
  });

  it("số âm giữ dấu trừ", () => {
    expect(formatCompactMoney(-3_400_000)).toBe("-3,4tr");
    expect(formatCompactMoney(-500)).toBe("-500");
  });

  it("ranh giới tỷ: ngay dưới vẫn là tr, tới ngưỡng làm tròn mới là tỷ", () => {
    expect(formatCompactMoney(950_000_000)).toBe("950tr");
    expect(formatCompactMoney(960_000_000)).toBe("960tr");
    expect(formatCompactMoney(999_949_999)).toBe("999,9tr");
    expect(formatCompactMoney(999_950_000)).toBe("1 tỷ");
    expect(formatCompactMoney(999_999_999)).toBe("1 tỷ");
  });

  it("số âm ở thang tỷ", () => {
    expect(formatCompactMoney(-1_200_000_000)).toBe("-1,2 tỷ");
    expect(formatCompactMoney(-960_000_000)).toBe("-960tr");
  });
});
