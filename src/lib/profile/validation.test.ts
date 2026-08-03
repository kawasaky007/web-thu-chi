import { describe, expect, it } from "vitest";

import {
  matchesHouseholdConfirmation,
  validateDisplayName,
  validateHouseholdName,
} from "@/lib/profile/validation";

describe("profile validation", () => {
  it("normalizes display name whitespace", () => {
    expect(validateDisplayName("  Nguyễn   Văn An ")).toEqual({ success: true, fullName: "Nguyễn Văn An" });
  });

  it("limits profile and household names", () => {
    expect(validateDisplayName(" ")).toMatchObject({ success: false });
    expect(validateDisplayName("a".repeat(51))).toMatchObject({ success: false });
    expect(validateHouseholdName("A")).toMatchObject({ success: false });
    expect(validateHouseholdName("Nhà chúng mình")).toEqual({ success: true, name: "Nhà chúng mình" });
  });

  it("requires exact household name for destructive confirmation", () => {
    expect(matchesHouseholdConfirmation("Nhà An", "Nhà An")).toBe(true);
    expect(matchesHouseholdConfirmation("nhà an", "Nhà An")).toBe(false);
  });
});
